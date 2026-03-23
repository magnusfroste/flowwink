import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

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

      let status = "success";
      let lastError: string | null = null;

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
              agent_type: "flowpilot",
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
                agent_type: "flowpilot",
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

  // Weekly: M H * * D
  if (
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek !== "*" &&
    !minute.includes("*") &&
    !hour.includes("*")
  ) {
    const targetDay = parseInt(dayOfWeek, 10);
    const nextDate = new Date(now);
    nextDate.setUTCHours(parseInt(hour, 10), parseInt(minute, 10), 0, 0);
    let daysAhead = targetDay - now.getUTCDay();
    if (daysAhead < 0 || (daysAhead === 0 && nextDate <= now)) daysAhead += 7;
    nextDate.setUTCDate(nextDate.getUTCDate() + daysAhead);
    return nextDate.toISOString();
  }

  // Fallback: 1 hour
  return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
}
