import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient } from '../_shared/supabase-clients.ts';

/**
 * FlowPilot Distill — Skill Synthesis Loop (Hermes-style)
 *
 * Reads agent_activity over a window, finds skill-call N-grams that repeat
 * ≥ MIN_REPEATS, and writes proposals to agent_memory + an objective so a
 * human (or FlowPilot itself) can promote them into a real chained skill.
 *
 * Designed to run on a daily cron. Module-gated on flowpilot.enabled.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WINDOW_DAYS = 30;
const NGRAM_MIN = 2;
const NGRAM_MAX = 4;
const MIN_REPEATS = 3;
const MAX_PROPOSALS = 10;

// Skills that are noisy / structural — skip them in n-gram detection.
const SKIP_SKILLS = new Set([
  "heartbeat",
  "system_integrity_check",
  "memory_write",
  "memory_read",
  "memory_delete",
  "objective_update_progress",
  "advance_plan",
  "reflect",
  "record_outcome",
  "evaluate_outcomes",
  "skill_list",
  "skill_read",
  "automation_list",
  "chain_skills",
  "decompose_objective",
]);

function groupKey(row: any): string {
  // Group by trace_id when available (heartbeat / agent-operate set it),
  // fall back to conversation_id, then to a per-day bucket so unrelated
  // activity doesn't bleed into one big sequence.
  const traceId = row?.input?.trace_id;
  if (traceId) return `trace:${traceId}`;
  if (row.conversation_id) return `conv:${row.conversation_id}`;
  const day = new Date(row.created_at).toISOString().slice(0, 10);
  return `day:${day}`;
}

/**
 * Heuristic: did this row originate from an automation/cron/event vs a
 * real user/agent reasoning turn? We use this to drop ping-pong patterns
 * where two skills just trigger each other in the background.
 */
function isAutomationRow(row: any): boolean {
  if (row.conversation_id) return false; // user/agent conversation
  const inp = row?.input ?? {};
  const src = String(inp.source ?? inp.trigger_source ?? inp.trigger_type ?? "").toLowerCase();
  if (src.includes("automation") || src.includes("cron") || src.includes("event") || src.includes("schedule")) {
    return true;
  }
  // No conversation + no trace → almost certainly background work
  if (!inp.trace_id) return true;
  const trace = String(inp.trace_id).toLowerCase();
  return trace.startsWith("auto") || trace.startsWith("cron") || trace.startsWith("event") || trace.startsWith("sched");
}

/** Detects oscillation like A→B→A or A→B→A→B (only 2 distinct skills, length ≥ 3). */
function isPingPong(seq: string[]): boolean {
  if (seq.length < 3) return false;
  return new Set(seq).size <= 2;
}

function suggestSkillName(seq: string[]): string {
  // pick the verb of the last skill + a domain hint from the first
  const last = seq[seq.length - 1].split("_").pop() || "do";
  const first = seq[0].split("_")[0] || "auto";
  return `${first}_to_${last}_chain`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = getServiceClient();

  const startedAt = Date.now();

  try {
    // Module gate — Distill is part of the FlowPilot operator surface.
    // Source of truth: site_settings.modules.flowpilot.enabled (default: false).
    const { data: modSettings } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "modules")
      .maybeSingle();
    const fpEnabled = (modSettings?.value as any)?.flowpilot?.enabled === true;
    if (!fpEnabled) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "flowpilot_disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Pull recent successful skill activity
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: activity, error } = await supabase
      .from("agent_activity")
      .select("skill_name, conversation_id, created_at, input, status")
      .eq("status", "success")
      .gte("created_at", since)
      .not("skill_name", "is", null)
      .order("created_at", { ascending: true })
      .limit(5000);
    if (error) throw error;

    if (!activity?.length) {
      return new Response(
        JSON.stringify({ ok: true, proposals: 0, reason: "no_activity" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Group into ordered sequences
    const groups = new Map<string, string[]>();
    for (const row of activity) {
      const name = row.skill_name as string;
      if (!name || SKIP_SKILLS.has(name)) continue;
      const key = groupKey(row);
      const arr = groups.get(key) ?? [];
      // collapse immediate duplicates (skill called twice in a row counts once)
      if (arr[arr.length - 1] !== name) arr.push(name);
      groups.set(key, arr);
    }

    // Track per-group whether it was an automation-only sequence
    const groupAutomation = new Map<string, { auto: number; total: number }>();
    for (const row of activity) {
      const key = groupKey(row);
      const cur = groupAutomation.get(key) ?? { auto: 0, total: 0 };
      cur.total += 1;
      if (isAutomationRow(row)) cur.auto += 1;
      groupAutomation.set(key, cur);
    }

    // 3. Build N-gram counter
    type NgramStat = {
      sequence: string[];
      count: number;
      groups: Set<string>;
      automation_only_groups: number;
      first_seen: string;
      last_seen: string;
    };
    const ngrams = new Map<string, NgramStat>();
    const groupTimes = new Map<string, { first: string; last: string }>();

    for (const row of activity) {
      const key = groupKey(row);
      const t = row.created_at as string;
      const cur = groupTimes.get(key);
      groupTimes.set(key, {
        first: cur ? (cur.first < t ? cur.first : t) : t,
        last: cur ? (cur.last > t ? cur.last : t) : t,
      });
    }

    for (const [gKey, seq] of groups.entries()) {
      if (seq.length < NGRAM_MIN) continue;
      const times = groupTimes.get(gKey)!;
      const autoStat = groupAutomation.get(gKey);
      const isAutoGroup = autoStat ? autoStat.auto / Math.max(1, autoStat.total) >= 0.7 : false;
      for (let n = NGRAM_MIN; n <= NGRAM_MAX; n++) {
        for (let i = 0; i + n <= seq.length; i++) {
          const window = seq.slice(i, i + n);
          if (new Set(window).size === 1) continue;
          if (isPingPong(window)) continue; // drop A→B→A oscillations
          const k = window.join("→");
          const existing = ngrams.get(k);
          if (existing) {
            existing.count += 1;
            existing.groups.add(gKey);
            if (isAutoGroup) existing.automation_only_groups += 1;
            if (times.last > existing.last_seen) existing.last_seen = times.last;
            if (times.first < existing.first_seen) existing.first_seen = times.first;
          } else {
            ngrams.set(k, {
              sequence: window,
              count: 1,
              groups: new Set([gKey]),
              automation_only_groups: isAutoGroup ? 1 : 0,
              first_seen: times.first,
              last_seen: times.last,
            });
          }
        }
      }
    }

    // 4. Filter — must repeat ≥ MIN_REPEATS across ≥2 distinct groups,
    //    and at least one group must be a real human/agent conversation
    //    (i.e. not 100% automation-driven).
    const proposals = Array.from(ngrams.values())
      .filter((s) => s.count >= MIN_REPEATS && s.groups.size >= 2)
      .filter((s) => s.automation_only_groups < s.groups.size) // ≥1 non-auto group
      .sort((a, b) => b.count * b.sequence.length - a.count * a.sequence.length)
      .slice(0, MAX_PROPOSALS)
      .map((s) => ({
        suggested_name: suggestSkillName(s.sequence),
        sequence: s.sequence,
        observed_count: s.count,
        distinct_sessions: s.groups.size,
        automation_only_sessions: s.automation_only_groups,
        first_seen: s.first_seen,
        last_seen: s.last_seen,
        rationale: `Sequence "${s.sequence.join(" → ")}" observed ${s.count}× across ${s.groups.size} sessions (${s.groups.size - s.automation_only_groups} human-driven) in last ${WINDOW_DAYS}d. Candidate for a chained skill.`,
      }));

    // 5. De-duplicate against existing skills (don't propose what already exists)
    const { data: existingSkills } = await supabase
      .from("agent_skills")
      .select("name");
    const existingNames = new Set((existingSkills || []).map((s: any) => s.name));
    const filtered = proposals.filter((p) => !existingNames.has(p.suggested_name));

    // 6. Persist proposals into agent_memory
    const memoryValue = {
      generated_at: new Date().toISOString(),
      window_days: WINDOW_DAYS,
      activity_rows_scanned: activity.length,
      ngrams_considered: ngrams.size,
      proposals: filtered,
    };

    const { data: existing } = await supabase
      .from("agent_memory")
      .select("id")
      .eq("key", "skill_distillation_proposals")
      .limit(1);

    if (existing?.length) {
      await supabase
        .from("agent_memory")
        .update({ value: memoryValue, updated_at: new Date().toISOString() })
        .eq("id", existing[0].id);
    } else {
      await supabase.from("agent_memory").insert({
        key: "skill_distillation_proposals",
        value: memoryValue,
        category: "context",
        created_by: "flowpilot",
      });
    }

    // 7. If we have proposals, create one objective summarising them so FlowPilot
    //    sees them on next heartbeat (gated: human approves before skill_create).
    if (filtered.length > 0) {
      const goal = `Review ${filtered.length} distilled skill proposal(s) from the last ${WINDOW_DAYS} days. See agent_memory key 'skill_distillation_proposals'. Highest-value: ${filtered[0].suggested_name} (${filtered[0].observed_count}×).`;

      // Avoid spamming — only insert if no open distill objective exists
      const { data: openObjs } = await supabase
        .from("agent_objectives")
        .select("id, goal")
        .eq("status", "active")
        .ilike("goal", "%distilled skill proposal%")
        .limit(1);

      if (!openObjs?.length) {
        await supabase.from("agent_objectives").insert({
          goal,
          status: "active",
          constraints: { source: "flowpilot-distill", requires_approval: true },
          success_criteria: { criteria: "Approve, edit, or dismiss each proposal." },
          progress: { proposed_at: new Date().toISOString(), proposal_count: filtered.length },
        });
      }
    }

    // 8. Log
    await supabase.from("agent_activity").insert({
      agent: "flowpilot",
      skill_name: "skill_distillation",
      input: { window_days: WINDOW_DAYS, activity_rows: activity.length },
      output: {
        proposals: filtered.length,
        top: filtered.slice(0, 3).map((p) => ({ name: p.suggested_name, count: p.observed_count })),
      },
      status: "success",
      duration_ms: Date.now() - startedAt,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        scanned: activity.length,
        ngrams_considered: ngrams.size,
        proposals: filtered.length,
        top: filtered.slice(0, 5),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[distill] Error:", err);
    await supabase.from("agent_activity").insert({
      agent: "flowpilot",
      skill_name: "skill_distillation",
      input: {},
      output: {},
      status: "failed",
      error_message: (err.message || "Unknown").slice(0, 500),
      duration_ms: Date.now() - startedAt,
    }).catch(() => {});
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
