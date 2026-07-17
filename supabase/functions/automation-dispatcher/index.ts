import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { isModuleEnabled } from '../_shared/modules.ts';

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

      if (new Date(nextRun) > new Date(now)) continue; // Not due yet

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
          run_count: (wf.run_count || 0) + 1,
          last_error: lastError,
        })
        .eq("id", wf.id);

      results.push({ id: wf.id, name: wf.name, status, type: "workflow", error: lastError ?? undefined });
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

// =============================================================================
// Cron expression → next run time (simple parser for common patterns)
// =============================================================================

function calculateNextRun(cronExpr?: string, from?: Date): string {
  if (!cronExpr) {
    // Default: 1 hour from now
    return new Date(Date.now() + 60 * 60 * 1000).toISOString();
  }

  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 5) {
    return new Date(Date.now() + 60 * 60 * 1000).toISOString();
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const now = from || new Date();

  // Simple common patterns
  // Every N minutes: */N * * * *
  if (minute.startsWith("*/") && hour === "*") {
    const interval = parseInt(minute.replace("*/", ""), 10) || 5;
    return new Date(now.getTime() + interval * 60 * 1000).toISOString();
  }

  // Every N hours: 0 */N * * *
  if (hour.startsWith("*/")) {
    const interval = parseInt(hour.replace("*/", ""), 10) || 1;
    return new Date(now.getTime() + interval * 60 * 60 * 1000).toISOString();
  }

  // Daily at specific time: M H * * *
  if (
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*" &&
    !minute.includes("*") &&
    !hour.includes("*")
  ) {
    const nextDate = new Date(now);
    nextDate.setUTCHours(parseInt(hour, 10), parseInt(minute, 10), 0, 0);
    if (nextDate <= now) nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    return nextDate.toISOString();
  }

  // Weekly: M H * * D — where D may be a single day, a range ('1-5') or a
  // list ('1,3,5'). parseInt('1-5') silently gave 1 (= Mondays only), which
  // made a weekday cron skip Tue–Fri on a live instance — parse the full set.
  if (
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek !== "*" &&
    !minute.includes("*") &&
    !hour.includes("*")
  ) {
    const dowSet = parseDayOfWeekSet(dayOfWeek);
    if (dowSet.size > 0) {
      for (let offset = 0; offset <= 7; offset++) {
        const cand = new Date(now);
        cand.setUTCDate(cand.getUTCDate() + offset);
        cand.setUTCHours(parseInt(hour, 10), parseInt(minute, 10), 0, 0);
        if (cand > now && dowSet.has(cand.getUTCDay())) return cand.toISOString();
      }
    }
  }

  // Monthly: M H DOM * * (e.g. '0 5 1 * *' = 05:00 on the 1st). Previously fell
  // through to the hourly fallback — a month-end billing run fired 24×/day on a
  // live instance. Next occurrence of that day-of-month at H:M UTC.
  if (
    /^\d+$/.test(dayOfMonth) &&
    month === "*" &&
    dayOfWeek === "*" &&
    !minute.includes("*") &&
    !hour.includes("*")
  ) {
    // Walk months forward and take the first future slot that lands on the
    // exact DOM (months without that day — e.g. DOM=31 in September — are
    // skipped by the getUTCDate check, never silently shifted).
    const dom = parseInt(dayOfMonth, 10);
    for (let k = 0; k < 24; k++) {
      const cand = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth() + k, dom,
        parseInt(hour, 10), parseInt(minute, 10), 0, 0,
      ));
      if (cand > now && cand.getUTCDate() === dom) return cand.toISOString();
    }
  }

  // Fallback: 1 hour — for expressions this parser doesn't understand. Log it:
  // a silent hourly fallback burned 100+ runs of a monthly automation before
  // anyone noticed. If this shows up in logs, extend the parser.
  console.warn(`calculateNextRun: unsupported cron "${cronExpr}" — falling back to +1h`);
  return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
}

// Parse a cron day-of-week field into the set of matching JS getUTCDay()
// values: '1', '1-5', '1,3,5', '5-6' (cron 0/7 = Sunday both map to 0).
function parseDayOfWeekSet(field: string): Set<number> {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const range = part.trim().match(/^(\d+)-(\d+)$/);
    if (range) {
      const lo = parseInt(range[1], 10), hi = parseInt(range[2], 10);
      for (let d = lo; d <= hi; d++) out.add(d % 7);
    } else if (/^\d+$/.test(part.trim())) {
      out.add(parseInt(part.trim(), 10) % 7);
    }
  }
  return out;
}
