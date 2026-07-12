import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isModuleEnabled } from "../_shared/modules.ts";

/**
 * FlowPilot 2.0 — Approval follow-through.
 *
 * Engine plumbing, NOT a user-chosen automation and NOT the résumé/CV module. This is the
 * missing half of the trust-approve loop: when FlowPilot (cron heartbeat) stages a gated
 * skill it returns pending_approval and logs an agent_activity row; when a human approves it
 * in /admin/approvals, sync_agent_activity_on_approval flips the row to 'approved' — but
 * NOTHING executed it (24 such rows were stranded on dev). The operator never followed
 * through on the human's decision.
 *
 * This closes it: pull the fresh approved-but-unexecuted activities via the
 * flowpilot_approved_pending selector and re-invoke each through agent-execute with the exact
 * double-gate handshake (_approved=true, plus _approved_operation_id when a staged
 * pending_operation exists). Safe because the money core is idempotent (payment p_reference,
 * status guards) — a follow-through that races the UI can't double-act. Runs on a short cron
 * (fixed cadence — an engine constant) or as a heartbeat pre-pass.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Sentinel skill_name for the single engine-state row the Operator Health card reads.
// One row, updated in place — a 5-minute cadence must not write 288 audit rows/day.
const PULSE_SKILL = "followthrough_sweep";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const body = await req.json().catch(() => ({}));
  const windowHours = Number(body?.window_hours) || 48;
  const limit = Math.min(Number(body?.limit) || 25, 100);

  // Gate on the FlowPilot module — via the shared helper (the module value is an
  // OBJECT {enabled,...}; a hand-rolled `modules.flowpilot === false` check passes
  // when it shouldn't and this sweep would act for a disabled operator).
  if (!(await isModuleEnabled(supabase, "flowpilot"))) {
    return new Response(JSON.stringify({ skipped: true, reason: "flowpilot_disabled" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { data: pending, error: selErr } = await supabase.rpc("flowpilot_approved_pending", { p_window_hours: windowHours });
  if (selErr) {
    await recordPulse(supabase, false, `selector failed: ${selErr.message}`, { candidates: 0, resumed: 0, failed: 0 });
    return new Response(JSON.stringify({ error: `selector failed: ${selErr.message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const rows = (pending || []).slice(0, limit);
  const results: any[] = [];

  for (const row of rows) {
    const args = { ...(row.input || {}), _approved: true };
    if (row.pending_operation_id) (args as any)._approved_operation_id = row.pending_operation_id;

    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({
          skill_id: row.skill_id,
          skill_name: row.skill_name,
          arguments: args,
          agent_type: "flowpilot",
          conversation_id: null,
        }),
      });
      const out = await resp.json().catch(() => ({}));
      const ok = resp.ok && !out?.error && out?.status !== "failed";

      // Terminal-state the activity so it never follows through twice. success → completed run;
      // failure → 'failed' with the reason, left for review (the sweep never retries a failed
      // one — no infinite loop).
      await supabase.from("agent_activity")
        .update({
          status: ok ? "success" : "failed",
          output: out,
          error_message: ok ? null : (out?.error || `HTTP ${resp.status}`),
        })
        .eq("id", row.activity_id);

      results.push({ activity_id: row.activity_id, skill: row.skill_name, resumed: ok, error: ok ? null : (out?.error || `HTTP ${resp.status}`) });
    } catch (e) {
      await supabase.from("agent_activity")
        .update({ status: "failed", error_message: `follow-through threw: ${(e as Error).message}` })
        .eq("id", row.activity_id);
      results.push({ activity_id: row.activity_id, skill: row.skill_name, resumed: false, error: (e as Error).message });
    }
  }

  const resumed = results.filter((r) => r.resumed).length;
  const failed = results.length - resumed;

  await recordPulse(supabase, failed === 0, failed === 0 ? null : `${failed} follow-through(s) failed`, {
    candidates: rows.length,
    resumed,
    failed,
  });

  return new Response(JSON.stringify({ candidates: rows.length, resumed, failed, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});

/**
 * Update the single engine-state pulse row the Operator Health card reads. One row per
 * install (matched by the sentinel skill_name), updated in place — never an audit row per
 * run. agent='cron' tags it as engine cadence, not a human-facing operator action.
 * agent_activity has no updated_at, so created_at carries the last-run timestamp the card
 * renders as "X min ago".
 */
async function recordPulse(
  supabase: ReturnType<typeof createClient>,
  ok: boolean,
  error: string | null,
  summary: Record<string, number>,
) {
  const nowIso = new Date().toISOString();
  const patch = {
    status: ok ? "success" : "failed",
    output: summary as never,
    error_message: error,
    created_at: nowIso,
  };
  const { data: existing } = await supabase
    .from("agent_activity")
    .select("id")
    .eq("skill_name", PULSE_SKILL)
    .eq("agent", "cron")
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    await supabase.from("agent_activity").update(patch).eq("id", existing.id);
  } else {
    await supabase.from("agent_activity").insert({
      skill_name: PULSE_SKILL,
      agent: "cron",
      ...patch,
    } as never);
  }
}
