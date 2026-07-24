import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isModuleEnabled } from "../_shared/modules.ts";
import { buildResumeDirective } from "./resume-logic.ts";

/**
 * Resumption Phase 2 — the resumer (agent-resumption.md §2.3).
 *
 * Two safe mechanisms, both additive — no surgery in the reasoning hot loop:
 *
 *  1. RECONCILE interrupted runs. Phase 1 checkpoints a run 'running' at start
 *     and its terminal status in finally. A run whose process DIED mid-way
 *     (heartbeat window killed the function, a crash, a rate-limit abort) never
 *     reached the terminal checkpoint, so it sits in status='running' forever —
 *     a zombie. We detect it (running + stale updated_at) and mark it 'paused'
 *     with paused_reason='interrupted'. Honest: no run is stuck 'running'.
 *
 *  2. BUILD a resume directive. For a paused run tied to an objective whose plan
 *     is partly done, we produce a context string listing the completed steps
 *     and the next one — injected into THIS heartbeat exactly like the approval
 *     follow-through's context (see flowpilot-heartbeat). The operator then
 *     CONTINUES from the cursor instead of re-deriving "where am I". Completed
 *     steps are named as done so they are not repeated; the money core's
 *     idempotency is the backstop if the model errs.
 *
 * Bounded, idempotent, never-retry — same contract as followthrough.ts. The
 * deterministic cursor + sim proof of no-double-fire is the acceptance gate.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Sentinel skill_name for the single engine-state row the Operator Health card reads.
const PULSE_SKILL = "resume_sweep";

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const body = await req.json().catch(() => ({}));
  const staleMinutes = Math.min(Math.max(Number(body?.stale_minutes) || 15, 2), 24 * 60);
  const limit = Math.min(Number(body?.limit) || 10, 50);

  if (!(await isModuleEnabled(supabase, "flowpilot"))) {
    return new Response(JSON.stringify({ skipped: true, reason: "flowpilot_disabled" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const nowMs = Date.now();
  const staleMs = staleMinutes * 60_000;
  const staleBefore = new Date(nowMs - staleMs).toISOString();

  // 1. Reconcile interrupted runs: running + stale → paused/interrupted.
  const { data: reconciled } = await supabase
    .from("agent_runs")
    .update({ status: "paused", paused_reason: "interrupted", resume_after: new Date(nowMs).toISOString(), updated_at: new Date(nowMs).toISOString() })
    .eq("status", "running")
    .lt("updated_at", staleBefore)
    .select("trace_id, objective_id");
  const reconciledCount = (reconciled ?? []).length;

  // 2. Build resume directives — GATED OFF BY DEFAULT.
  //
  // Phase 4 acceptance-gate finding (2026-07-23): a soft directive ("do NOT
  // repeat completed steps") is NOT enough. A live heartbeat, handed the
  // directive for a 2/4-done plan, RE-RAN both completed write_blog_post steps
  // (0 → 2 posts) instead of continuing from step 3. For an idempotent skill
  // (money core: p_reference, status guards) a double-fire is harmless; for a
  // non-idempotent generative skill it duplicates real work. So directive-
  // driven resume must not run unattended until a HARD no-repeat guard exists
  // (Phase 2.5). The reconcile above is always safe and stays on; directives
  // require an explicit opt-in (site_settings.resumption.directives = true).
  const { data: flag } = await supabase
    .from('site_settings').select('value').eq('key', 'resumption').maybeSingle();
  const directivesEnabled = (flag?.value as any)?.directives === true;
  if (!directivesEnabled) {
    await recordPulse(supabase, true, null, { reconciled: reconciledCount, resuming: 0 });
    return new Response(JSON.stringify({ reconciled: reconciledCount, resuming: 0, context: "", directives_gated: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { data: paused } = await supabase
    .from("agent_runs")
    .select("trace_id, objective_id")
    .eq("status", "paused")
    .not("objective_id", "is", null)
    .lte("resume_after", new Date(nowMs).toISOString())
    .limit(limit);

  const directives: string[] = [];
  const resumingTraceIds: string[] = [];
  for (const run of paused ?? []) {
    const { data: obj } = await supabase
      .from("agent_objectives")
      .select("id, goal, progress, status")
      .eq("id", run.objective_id)
      .maybeSingle();
    if (!obj || obj.status !== "active") continue;
    const built = buildResumeDirective(obj as any);
    if (!built) continue;
    directives.push(built.directive);
    resumingTraceIds.push(run.trace_id);
  }

  // Mark the runs we are handing to this cycle as 'running' again (resumed), so
  // the same paused run is not surfaced twice in one window. Idempotent.
  if (resumingTraceIds.length) {
    await supabase.from("agent_runs")
      .update({ status: "running", updated_at: new Date(nowMs).toISOString() })
      .in("trace_id", resumingTraceIds);
  }

  await recordPulse(supabase, true, null, { reconciled: reconciledCount, resuming: directives.length });

  const context = directives.length
    ? `RESUMPTION (${directives.length} interrupted run(s) picked up this cycle):\n${directives.join("\n\n")}`
    : "";

  return new Response(JSON.stringify({ reconciled: reconciledCount, resuming: directives.length, context }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function recordPulse(supabase: any, ok: boolean, err: string | null, counts: Record<string, number>) {
  try {
    const { data: existing } = await supabase.from("agent_activity")
      .select("id").eq("skill_name", PULSE_SKILL).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const row = {
      agent: "cron", skill_name: PULSE_SKILL,
      input: { source: "resume_sweep" }, output: { ok, ...counts, error: err },
      status: ok ? "success" : "failed", error_message: err,
    };
    if (existing?.id) await supabase.from("agent_activity").update(row).eq("id", existing.id);
    else await supabase.from("agent_activity").insert(row);
  } catch (_) { /* pulse is best-effort */ }
}
