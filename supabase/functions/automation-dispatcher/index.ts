import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { isModuleEnabled } from '../_shared/modules.ts';
import { calculateNextRun } from '../_shared/cron/next-run.ts';

/**
 * Automation Dispatcher
 *
 * Called by pg_cron every minute. Finds cron-based automations that are due,
 * executes them via agent-execute, and updates run metadata.
 *
 * Flow:
 *   1. Query enabled cron automations where next_run_at <= now
 *   2. For each: invoke agent-execute with the skill + arguments
 *   3. Update last_triggered_at, next_run_at, run_count, last_error
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = getServiceClient();

  // Push the project URL down into the database vault. dispatch_automation_event
  // builds its pg_net calls from it, and the DB has no other way to learn it —
  // an empty vault is why every trigger-born event on the fleet was silently
  // dropped. This runs on the per-minute cron, so a fresh install heals itself
  // instead of waiting for someone to remember a runbook step. Idempotent:
  // writes only when the value is missing or has changed.
  try {
    await supabase.rpc("ensure_platform_secret", {
      p_name: "SUPABASE_URL",
      p_value: supabaseUrl,
    });
  } catch (e) {
    console.warn("ensure_platform_secret(SUPABASE_URL) failed:", (e as Error).message);
  }

  try {
    // 1. Find due cron automations (including ones with NULL next_run_at that need initialization)
    const now = new Date().toISOString();
    const { data: dueAutomations, error: queryError } = await supabase
      .from("agent_automations")
      .select("*")
      .eq("enabled", true)
      .eq("trigger_type", "cron")
      .or(`next_run_at.lte.${now},next_run_at.is.null`);

    if (queryError) throw queryError;

    const results: Array<{
      id: string;
      name: string;
      status: string;
      type: string;
      error?: string;
    }> = [];

    // 2. Execute each automation (skip NULL next_run_at — just initialize them)
    for (const auto of (dueAutomations || [])) {
      // If next_run_at was NULL, just initialize it and skip execution
      if (!auto.next_run_at) {
        const cronExpr = (auto.trigger_config as any)?.expression || (auto.trigger_config as any)?.cron;
        const nextRun = calculateNextRun(cronExpr);
        await supabase
          .from("agent_automations")
          .update({ next_run_at: nextRun })
          .eq("id", auto.id);
        results.push({ id: auto.id, name: auto.name, status: "initialized", type: "automation" });
        continue;
      }

      const executor = (auto.executor || "platform") as
        | "platform"
        | "flowpilot"
        | "openclaw"
        | "external";

      // Skip externally-driven automations — those operators poll/listen themselves
      if (executor === "openclaw" || executor === "external") {
        results.push({ id: auto.id, name: auto.name, status: "skipped_external", type: "automation" });
        continue;
      }

      // executor='flowpilot' work runs only while the FlowPilot module is on.
      // (Module-enabled lookup centralised in isModuleEnabled — a column-vs-row
      // mistake here previously skipped every flowpilot automation forever.)
      if (executor === "flowpilot") {
        const flowpilotOn = await isModuleEnabled(supabase, "flowpilot");
        if (!flowpilotOn) {
          results.push({ id: auto.id, name: auto.name, status: "skipped_module_off", type: "automation" });
          // Still advance the schedule so it doesn't fire continuously when re-enabled
          const cronExpr = (auto.trigger_config as any)?.expression || (auto.trigger_config as any)?.cron;
          await supabase
            .from("agent_automations")
            .update({ next_run_at: calculateNextRun(cronExpr) })
            .eq("id", auto.id);
          continue;
        }
      }

      let status = "success";
      let lastError: string | null = null;

      // Tag activity by who actually executes it — never label platform/cron work as flowpilot
      const agentTag = executor === "flowpilot"
        ? "flowpilot"
        : auto.trigger_type === "cron" ? "cron" : "automation";

      try {
        const executeResponse = await fetch(
          `${supabaseUrl}/functions/v1/agent-execute`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              skill_id: auto.skill_id,
              skill_name: auto.skill_name,
              arguments: auto.skill_arguments || {},
              agent_type: agentTag,
              conversation_id: null,
            }),
          }
        );

        const executeResult = await executeResponse.json();

        if (!executeResponse.ok || executeResult.error) {
          status = "failed";
          lastError =
            executeResult.error || `HTTP ${executeResponse.status}`;
        }
      } catch (err) {
        status = "failed";
        lastError = (err as Error).message || "Execution error";
      }

      // 3. Calculate next_run_at from cron expression (support both field names)
      const cronExpr = (auto.trigger_config as any)?.expression || (auto.trigger_config as any)?.cron;
      const nextRun = calculateNextRun(cronExpr);

      // 4. Update automation metadata
      await supabase
        .from("agent_automations")
        .update({
          last_triggered_at: now,
          next_run_at: nextRun,
          run_count: (auto.run_count || 0) + 1,
          last_error: lastError,
        })
        .eq("id", auto.id);

      results.push({ id: auto.id, name: auto.name, status, type: "automation", error: lastError ?? undefined });
    }

    // ─── 5. Execute due cron workflows ─────────────────────────────────
    const { data: dueWorkflows } = await supabase
      .from("agent_workflows")
      .select("*")
      .eq("enabled", true)
      .eq("trigger_type", "cron");

    for (const wf of (dueWorkflows || [])) {
      const cronExpr = (wf.trigger_config as any)?.expression || (wf.trigger_config as any)?.cron;
      if (!cronExpr) continue;

      // Check if workflow is due based on last_run_at + cron interval
      const nextRun = wf.last_run_at
        ? calculateNextRun(cronExpr, new Date(wf.last_run_at))
        : new Date(0).toISOString(); // Never run → overdue

      if (new Date(nextRun) > new Date(now)) {
        // Not due yet. Record when it IS due so the pulse guard (lane_has_work)
        // can let the tick sleep until then instead of waking us every minute.
        if (wf.next_run_at !== nextRun) {
          await supabase.from("agent_workflows").update({ next_run_at: nextRun }).eq("id", wf.id);
        }
        continue;
      }

      let status = "success";
      let lastError: string | null = null;

      try {
        // Execute each workflow step sequentially via agent-execute
        const steps = (wf.steps as any[]) || [];
        let stepContext: Record<string, unknown> = {};

        for (const step of steps) {
          const stepResponse = await fetch(
            `${supabaseUrl}/functions/v1/agent-execute`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({
                skill_name: step.skill_name,
                arguments: { ...step.arguments, ...stepContext },
                agent_type: "automation",
              }),
            }
          );

          const stepResult = await stepResponse.json();
          if (!stepResponse.ok || stepResult.error) {
            if (step.on_failure === "stop") {
              throw new Error(`Step '${step.name}' failed: ${stepResult.error || `HTTP ${stepResponse.status}`}`);
            }
            // on_failure: continue — log and keep going
            console.warn(`Workflow step '${step.name}' failed, continuing:`, stepResult.error);
          } else {
            // Pass step output as context for subsequent steps
            stepContext[step.id] = stepResult;
          }
        }

      } catch (err) {
        status = "failed";
        lastError = (err as Error).message || "Workflow execution error";
      }

      await supabase
        .from("agent_workflows")
        .update({
          last_run_at: now,
          next_run_at: calculateNextRun(cronExpr, new Date(now)),
          run_count: (wf.run_count || 0) + 1,
          last_error: lastError,
        })
        .eq("id", wf.id);

      results.push({ id: wf.id, name: wf.name, status, type: "workflow", error: lastError ?? undefined });
    }

    // ─── 6. Drain the work queue ───────────────────────────────────────
    // The second lane. It decides NOTHING: no business logic, no per-feature
    // branches. What to do lives in the skill, when to do it lives in due_at.
    // See docs/architecture/work-queue.md.
    //
    // Ships inert — agent_tasks is empty until a family is migrated, so this
    // block is two no-op RPCs per tick until then.
    try {
      // Reap first: a run that died mid-flight left its row 'running' with an
      // expired lease. Without this it would sit there forever looking busy.
      const { data: reaped, error: reapError } = await supabase.rpc("reap_stale_task_leases");
      if (reapError) {
        // Pre-migration instances have no queue yet — that is not an error worth
        // failing the whole tick over. Everything else is.
        console.warn("[dispatcher] reap_stale_task_leases unavailable:", reapError.message);
      } else if (reaped?.requeued || reaped?.failed) {
        console.log(`[dispatcher] reaped ${reaped.requeued} requeued, ${reaped.failed} gave up`);
        results.push({ id: "reaper", name: "stale task leases", status: "success", type: "task_reaper" });
      }

      // FOR UPDATE SKIP LOCKED inside claim_due_tasks makes overlapping ticks
      // take disjoint rows — no lock needed here.
      const { data: claimed, error: claimError } = await supabase.rpc("claim_due_tasks", {
        p_limit: 10,
        p_lease_seconds: 300,
      });
      if (claimError) {
        console.warn("[dispatcher] claim_due_tasks unavailable:", claimError.message);
      } else {
        for (const task of (claimed || [])) {
          let taskError: string | null = null;
          let outcome = "";

          try {
            const res = await fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({
                skill_name: task.skill_name,
                arguments: task.skill_arguments || {},
                agent_type: "task",
                conversation_id: null,
              }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || body?.error) {
              taskError = body?.error || `HTTP ${res.status}`;
            } else {
              // The outcome sentence is the receipt. Prefer whatever the skill
              // reported; fall back to naming the skill so the row is never
              // "done" with nothing to show for it.
              outcome = typeof body?.result?.message === "string"
                ? body.result.message
                : `${task.skill_name} completed.`;
            }
          } catch (err) {
            taskError = (err as Error).message || "Task execution error";
          }

          if (taskError) {
            await supabase.rpc("fail_task", {
              p_task_id: task.id,
              p_error: taskError,
              p_retry_in_seconds: 60,
            });
          } else {
            await supabase.rpc("complete_task", {
              p_task_id: task.id,
              p_outcome: outcome.slice(0, 500),
            });
          }

          results.push({
            id: task.id,
            name: `${task.skill_name}${task.subject_id ? ` (${task.subject_type})` : ""}`,
            status: taskError ? "failed" : "success",
            type: "task",
            error: taskError ?? undefined,
          });
        }
      }
    } catch (err) {
      // The queue lane must never take the automation lane down with it.
      console.error("[dispatcher] task lane error:", (err as Error).message);
    }

    console.log(`Dispatcher: executed ${results.length} items`, results);

    return new Response(
      JSON.stringify({ dispatched: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("automation-dispatcher error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

