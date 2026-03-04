import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Signal Dispatcher
 *
 * Evaluates signal-type automations against incoming data conditions.
 * Unlike events (which match by name), signals evaluate dynamic conditions
 * against the payload data.
 *
 * Signal types supported:
 *   - score_threshold:  { min_score: N } → fires when entity score >= N
 *   - count_threshold:  { min_count: N, entity: "leads"|"bookings"|... } → fires when count >= N
 *   - status_change:    { from?: string, to: string } → fires on status transitions
 *   - field_match:      { field: string, operator: "eq"|"gt"|"lt"|"contains", value: any }
 *   - compound:         { all: [...conditions] } → fires when ALL sub-conditions match
 *
 * Call with: { signal: "signal_name", data: { ...payload }, context: { entity_type, entity_id } }
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SignalPayload {
  signal: string;
  data: Record<string, unknown>;
  context?: {
    entity_type?: string;
    entity_id?: string;
  };
}

// ─── Condition evaluator ──────────────────────────────────────────────────────

function evaluateCondition(
  condition: Record<string, unknown>,
  data: Record<string, unknown>
): boolean {
  // score_threshold: { min_score: N }
  if (condition.min_score !== undefined) {
    const score = (data.score as number) || 0;
    return score >= (condition.min_score as number);
  }

  // count_threshold: { min_count: N }
  if (condition.min_count !== undefined) {
    const count = (data.count as number) || 0;
    return count >= (condition.min_count as number);
  }

  // status_change: { from?: string, to: string }
  if (condition.to !== undefined) {
    const matches_to = data.new_status === condition.to || data.status === condition.to;
    if (condition.from) {
      return matches_to && (data.old_status === condition.from || data.previous_status === condition.from);
    }
    return matches_to;
  }

  // field_match: { field, operator, value }
  if (condition.field && condition.operator) {
    const fieldValue = data[condition.field as string];
    const targetValue = condition.value;
    
    switch (condition.operator) {
      case 'eq': return fieldValue === targetValue;
      case 'neq': return fieldValue !== targetValue;
      case 'gt': return (fieldValue as number) > (targetValue as number);
      case 'gte': return (fieldValue as number) >= (targetValue as number);
      case 'lt': return (fieldValue as number) < (targetValue as number);
      case 'lte': return (fieldValue as number) <= (targetValue as number);
      case 'contains':
        return typeof fieldValue === 'string' && fieldValue.includes(targetValue as string);
      case 'in':
        return Array.isArray(targetValue) && targetValue.includes(fieldValue);
      default:
        return false;
    }
  }

  // compound: { all: [...conditions] }
  if (Array.isArray(condition.all)) {
    return condition.all.every((c: Record<string, unknown>) => evaluateCondition(c, data));
  }

  // compound: { any: [...conditions] }
  if (Array.isArray(condition.any)) {
    return condition.any.some((c: Record<string, unknown>) => evaluateCondition(c, data));
  }

  // No recognized condition pattern
  console.warn('[signal-dispatcher] Unrecognized condition:', condition);
  return false;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { signal, data, context }: SignalPayload = await req.json();

    if (!signal || !data) {
      return new Response(
        JSON.stringify({ error: "signal and data are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[signal-dispatcher] Evaluating signal: ${signal}`, { context });

    // Find enabled signal automations matching this signal name
    const { data: signalAutomations, error: queryError } = await supabase
      .from("agent_automations")
      .select("*")
      .eq("enabled", true)
      .eq("trigger_type", "signal");

    if (queryError) throw queryError;

    // Filter automations that match this signal
    const matching = (signalAutomations || []).filter((auto: any) => {
      const config = auto.trigger_config || {};
      // Match by signal name
      if (config.signal !== signal) return false;
      // Evaluate condition against data
      const condition = config.condition || {};
      return evaluateCondition(condition, data);
    });

    if (matching.length === 0) {
      console.log(`[signal-dispatcher] No matching automations for signal: ${signal}`);
      return new Response(
        JSON.stringify({ signal, matched: 0, dispatched: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[signal-dispatcher] ${matching.length} automation(s) matched for signal: ${signal}`);

    // Execute matching automations
    const results: Array<{ id: string; name: string; status: string; error?: string }> = [];

    await Promise.all(
      matching.map(async (auto: any) => {
        let status = "success";
        let lastError: string | null = null;

        try {
          // Merge signal data and context into skill arguments
          const mergedArgs = {
            ...auto.skill_arguments,
            signal_data: data,
            signal_context: context || {},
            signal_name: signal,
          };

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
                arguments: mergedArgs,
                agent_type: "flowpilot",
              }),
            }
          );

          const execResult = await executeResponse.json();

          if (!executeResponse.ok || execResult.error) {
            status = "failed";
            lastError = execResult.error || `HTTP ${executeResponse.status}`;
          }
        } catch (err: any) {
          status = "failed";
          lastError = err.message || "Execution error";
        }

        // Update automation metadata
        const { data: current } = await supabase
          .from("agent_automations")
          .select("run_count")
          .eq("id", auto.id)
          .single();

        await supabase
          .from("agent_automations")
          .update({
            last_triggered_at: new Date().toISOString(),
            run_count: (current?.run_count || 0) + 1,
            last_error: lastError,
          })
          .eq("id", auto.id);

        results.push({
          id: auto.id,
          name: auto.name,
          status,
          error: lastError ?? undefined,
        });
      })
    );

    console.log(`[signal-dispatcher] Dispatched ${results.length} automations`, results);

    return new Response(
      JSON.stringify({ signal, matched: matching.length, dispatched: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[signal-dispatcher] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
