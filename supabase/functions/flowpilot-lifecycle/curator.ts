import { getServiceClient } from "../_shared/supabase-clients.ts";
import { resolveAiConfig } from "../_shared/ai-config.ts";
import { callAi } from "../_shared/ai-call.ts";
import { isModuleEnabled } from "../_shared/modules.ts";

/**
 * Skill Curator — FlowPilot 2.0 Phase 3 (the Hermes learning loop).
 *
 * Platform primitive (better skill metadata serves EVERY agent — FlowPilot,
 * chat, external MCP operators), named for what it does, not for FlowPilot.
 *
 * Observes how skills actually FAIL in this business, drafts an instruction
 * improvement, and STAGES it for human review — it never edits a skill
 * directly. The whole loop reuses existing machinery:
 *
 *   evidence (agent_activity failures, rejected approvals, negative outcomes)
 *     → AI drafts better instructions for the worst offenders
 *     → agent-execute { update_skill_instructions } — trust 'approve' stages it
 *     → human decides in /admin/approvals
 *     → flowpilot-followthrough applies it after approval
 *
 * Law 2 in motion: "if a skill isn't being picked up / keeps failing, the fix
 * is ALWAYS better metadata" — the Curator automates drafting that metadata,
 * the human stays the editor-in-chief. An agent_trust_policies row pins
 * update_skill_instructions to 'approve' even in proving posture: skill
 * self-modification is the one dial that never opens implicitly.
 *
 * Deterministic + bounded: cooldown per skill (no re-proposal within 14 days),
 * max 3 proposals per run, evidence threshold (≥3 failures or ≥1 human
 * rejection). Cron: daily 04:00 (after distill 03:15) — an engine constant.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EVIDENCE_WINDOW_DAYS = 7;
const COOLDOWN_DAYS = 14;
const MAX_PROPOSALS_PER_RUN = 3;
const MIN_FAILURES = 3;

// Moved VERBATIM from supabase/functions/skill-curator/index.ts (edge-surface B5).
export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = getServiceClient();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    // The Curator improves the shared skill catalog; it is part of the
    // FlowPilot learning loop and respects the same module gate.
    if (!(await isModuleEnabled(supabase, "flowpilot"))) {
      return json({ skipped: true, reason: "flowpilot_disabled" });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;
    const since = new Date(Date.now() - EVIDENCE_WINDOW_DAYS * 864e5).toISOString();
    const cooldownSince = new Date(Date.now() - COOLDOWN_DAYS * 864e5).toISOString();

    // ── 1. Evidence: how are skills failing? ─────────────────────────────────
    const { data: failures } = await supabase
      .from("agent_activity")
      .select("skill_name, error_message, input")
      .eq("status", "failed")
      .gte("created_at", since)
      .not("skill_name", "is", null)
      .limit(500);

    // Rejected skill approvals — the strongest correction signal a human gives.
    // Skill name lives in context->>'skill_name'; the reviewer's note in
    // approval_decisions.comment (fetched separately — no FK join needed).
    const { data: rejectedReqs } = await supabase
      .from("approval_requests")
      .select("id, context")
      .eq("status", "rejected")
      .eq("entity_type", "agent_skill")
      .gte("created_at", since)
      .limit(100);
    const rejIds = (rejectedReqs || []).map((r: any) => r.id);
    const { data: rejDecisions } = rejIds.length
      ? await supabase.from("approval_decisions").select("request_id, comment").in("request_id", rejIds)
      : { data: [] as any[] };
    const commentByReq = new Map((rejDecisions || []).map((d: any) => [d.request_id, d.comment]));
    const rejections = (rejectedReqs || []).map((r: any) => ({
      skill_name: r.context?.skill_name ?? null,
      note: commentByReq.get(r.id) ?? null,
    }));

    const { data: negatives } = await supabase
      .from("agent_activity")
      .select("skill_name, outcome_data")
      .eq("outcome_status", "negative")
      .gte("created_at", since)
      .not("skill_name", "is", null)
      .limit(100);

    // Aggregate per skill. Engine plumbing (heartbeat, sweeps) is excluded —
    // the Curator improves BUSINESS skill contracts, not the engine.
    const ENGINE = new Set(["heartbeat", "followthrough_sweep", "curator_sweep", "system_integrity_check"]);
    const evidence = new Map<string, { failures: string[]; rejections: string[]; negatives: number }>();
    const bump = (name: string) => {
      if (!evidence.has(name)) evidence.set(name, { failures: [], rejections: [], negatives: 0 });
      return evidence.get(name)!;
    };
    for (const f of failures || []) {
      if (!f.skill_name || ENGINE.has(f.skill_name)) continue;
      const e = bump(f.skill_name);
      if (f.error_message && e.failures.length < 8 && !e.failures.includes(f.error_message)) {
        e.failures.push(String(f.error_message).slice(0, 200));
      } else if (f.error_message) {
        e.failures.push("(repeat)");
      }
    }
    for (const r of rejections || []) {
      const name = (r as any).skill_name;
      if (!name || ENGINE.has(name)) continue;
      bump(name).rejections.push(String((r as any).note || "rejected without note").slice(0, 200));
    }
    for (const n of negatives || []) {
      if (!n.skill_name || ENGINE.has(n.skill_name)) continue;
      bump(n.skill_name).negatives++;
    }

    // ── 2. Candidates: enough signal + not in cooldown ───────────────────────
    const { data: recentProposals } = await supabase
      .from("agent_activity")
      .select("input")
      .eq("skill_name", "update_skill_instructions")
      .gte("created_at", cooldownSince)
      .limit(100);
    const inCooldown = new Set(
      (recentProposals || []).map((p: any) => p.input?.skill_name).filter(Boolean),
    );

    const candidates = [...evidence.entries()]
      .filter(([name, e]) =>
        !inCooldown.has(name) &&
        (e.failures.filter((x) => x !== "(repeat)").length + e.failures.filter((x) => x === "(repeat)").length >= MIN_FAILURES ||
          e.rejections.length >= 1))
      .sort((a, b) =>
        (b[1].failures.length + b[1].rejections.length * 3) -
        (a[1].failures.length + a[1].rejections.length * 3))
      .slice(0, MAX_PROPOSALS_PER_RUN);

    if (!candidates.length) {
      await recordPulse(supabase, true, null, { observed: evidence.size, proposed: 0 });
      return json({ observed_skills: evidence.size, proposals: 0, note: "no skill met the evidence threshold" });
    }

    // ── 3. Draft + stage a proposal per candidate ────────────────────────────
    const ai = await resolveAiConfig(supabase, "reasoning");
    const proposals: any[] = [];

    for (const [name, e] of candidates) {
      const { data: skill } = await supabase
        .from("agent_skills")
        .select("name, description, instructions, tool_definition")
        .eq("name", name)
        .maybeSingle();
      if (!skill) continue;

      const prompt = `You are the Skill Curator for an agent platform. A skill keeps failing in production. Improve its INSTRUCTIONS so agents stop making these mistakes. Do not invent capabilities — only clarify parameter names, workflows, preconditions and pitfalls that the evidence exposes.

SKILL: ${skill.name}
CURRENT DESCRIPTION: ${skill.description || "(none)"}
CURRENT INSTRUCTIONS: ${skill.instructions || "(none)"}
TOOL PARAMETERS: ${JSON.stringify((skill.tool_definition as any)?.function?.parameters?.properties || {}).slice(0, 1500)}

EVIDENCE (last ${EVIDENCE_WINDOW_DAYS} days):
- Failures: ${e.failures.join(" | ") || "none"}
- Human rejections (with notes): ${e.rejections.join(" | ") || "none"}
- Negative outcomes: ${e.negatives}

Reply with ONLY a JSON object: {"instructions": "<the full improved instructions text>", "rationale": "<1-2 sentences: what the evidence showed and what you changed>"} — keep everything that is still correct, add what the failures prove is missing. No markdown fences.`;

      let draft: { instructions?: string; rationale?: string } | null = null;
      try {
        const resp = await callAi({
          apiKey: ai.apiKey, apiUrl: ai.apiUrl, model: ai.model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 1500,
        });
        const out = await resp.json();
        const text: string = out?.choices?.[0]?.message?.content || "";
        draft = JSON.parse(text.replace(/^```json?\s*|\s*```$/g, ""));
      } catch (aiErr) {
        proposals.push({ skill: name, staged: false, error: `draft failed: ${(aiErr as Error).message}` });
        continue;
      }
      if (!draft?.instructions || draft.instructions.length < 40) {
        proposals.push({ skill: name, staged: false, error: "draft empty/too short" });
        continue;
      }

      if (dryRun) {
        proposals.push({ skill: name, staged: false, dry_run: true, rationale: draft.rationale, instructions_preview: draft.instructions.slice(0, 300) });
        continue;
      }

      // Stage through the NORMAL trust machinery: update_skill_instructions is
      // trust 'approve' (policy-pinned), so this call returns pending_approval
      // + an /admin/approvals card; followthrough applies it after approval.
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({
            skill_name: "update_skill_instructions",
            arguments: {
              skill_name: name,
              instructions: draft.instructions,
              reason: `Curator: ${draft.rationale || "repeated production failures"} [evidence: ${e.failures.length} failures, ${e.rejections.length} rejections, ${e.negatives} negative outcomes / ${EVIDENCE_WINDOW_DAYS}d]`,
            },
            agent_type: "flowpilot",
            conversation_id: null,
          }),
        });
        const out = await resp.json().catch(() => ({}));
        proposals.push({
          skill: name,
          staged: out?.status === "pending_approval",
          status: out?.status,
          approval_request_id: out?.approval_request_id ?? null,
          rationale: draft.rationale,
        });
      } catch (stageErr) {
        proposals.push({ skill: name, staged: false, error: `stage failed: ${(stageErr as Error).message}` });
      }
    }

    const staged = proposals.filter((p) => p.staged).length;
    await recordPulse(supabase, true, null, { observed: evidence.size, candidates: candidates.length, proposed: staged });
    return json({ observed_skills: evidence.size, candidates: candidates.length, proposals });
  } catch (err) {
    await recordPulse(supabase, false, (err as Error).message, {});
    return json({ error: (err as Error).message }, 500);
  }
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Single in-place engine-state pulse row (same pattern as followthrough_sweep). */
async function recordPulse(supabase: any, ok: boolean, error: string | null, summary: Record<string, unknown>) {
  const patch = {
    status: ok ? "success" : "failed",
    output: summary,
    error_message: error,
    created_at: new Date().toISOString(),
  };
  const { data: existing } = await supabase
    .from("agent_activity").select("id")
    .eq("skill_name", "curator_sweep").eq("agent", "cron")
    .limit(1).maybeSingle();
  if (existing?.id) await supabase.from("agent_activity").update(patch).eq("id", existing.id);
  else await supabase.from("agent_activity").insert({ skill_name: "curator_sweep", agent: "cron", ...patch });
}
