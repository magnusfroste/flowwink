import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * FlowPilot 2.0 — Resumption executor.
 *
 * The missing half of the trust-approve loop. When FlowPilot (cron heartbeat) stages a
 * gated skill it returns pending_approval and logs an agent_activity row; when a human
 * approves it in /admin/approvals, sync_agent_activity_on_approval flips the row to
 * 'approved' but NOTHING executed it — 24 such rows were stranded on dev.
 *
 * This function closes it: pull the fresh approved-but-unexecuted activities via the
 * flowpilot_approved_pending selector and re-invoke each through agent-execute with the
 * exact double-gate handshake verified in the money-integrity round (_approved=true, plus
 * _approved_operation_id when a staged pending_operation exists). Safe because the money
 * core is idempotent (payment p_reference, status guards) — a resume that races the UI
 * can't double-act. Runnable on a short cron OR as a heartbeat pre-pass.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const body = await req.json().catch(() => ({}));
  const windowHours = Number(body?.window_hours) || 48;
  const limit = Math.min(Number(body?.limit) || 25, 100);

  // Gate on the FlowPilot module being enabled (row-shaped site_settings.modules).
  const { data: mod } = await supabase.from("site_settings").select("value").eq("key", "modules").maybeSingle();
  const modules = (mod?.value as Record<string, boolean> | null) || null;
  if (modules && modules.flowpilot === false) {
    return new Response(JSON.stringify({ skipped: true, reason: "flowpilot_disabled" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { data: pending, error: selErr } = await supabase.rpc("flowpilot_approved_pending", { p_window_hours: windowHours });
  if (selErr) {
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

      // Terminal-state the activity so it never resumes twice. success → completed run;
      // failure → 'failed' with the reason, left for review (the sweep never retries a
      // failed one — no infinite loop).
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
        .update({ status: "failed", error_message: `resume threw: ${(e as Error).message}` })
        .eq("id", row.activity_id);
      results.push({ activity_id: row.activity_id, skill: row.skill_name, resumed: false, error: (e as Error).message });
    }
  }

  const resumed = results.filter((r) => r.resumed).length;
  return new Response(JSON.stringify({
    ok: true,
    candidates: rows.length,
    resumed,
    failed: results.length - resumed,
    results,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
