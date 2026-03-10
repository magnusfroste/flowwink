import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  resolveAiConfig,
  loadSoulIdentity,
  buildSoulPrompt,
  loadMemories,
  loadObjectives,
  loadSkillTools,
  getBuiltInTools,
  executeBuiltInTool,
  runSelfHealing,
} from "../agent-reason/index.ts";

/**
 * FlowPilot Heartbeat — Enhanced Autonomous Loop
 *
 * Ported from ClawCMS magnet-heartbeat with:
 * - Self-healing (auto-disable failing skills)
 * - Plan decomposition + advance_plan chaining
 * - Priority-scored objectives
 * - Proactive objective proposals
 * - Automation execution with next_run_at tracking
 * - Enhanced system prompt with full heartbeat protocol
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_ITERATIONS = 8;

// ─── Context loaders (heartbeat-specific) ─────────────────────────────────────

async function loadRecentActivity(supabase: any): Promise<string> {
  const since = new Date();
  since.setDate(since.getDate() - 1);
  const { data } = await supabase
    .from("agent_activity")
    .select("skill_name, status, error_message, created_at")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(20);
  if (!data?.length) return "\nNo activity in the last 24 hours.";
  return (
    "\n\nRecent activity (24h):\n" +
    data
      .map((a: any) => `- ${a.skill_name || "unknown"}: ${a.status}${a.error_message ? ` (${a.error_message})` : ""}`)
      .join("\n")
  );
}

async function loadSiteStats(supabase: any): Promise<string> {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [views, leads, posts, subscribers] = await Promise.all([
    supabase.from("page_views").select("id", { count: "exact", head: true }).gte("created_at", weekAgo.toISOString()),
    supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", weekAgo.toISOString()),
    supabase.from("blog_posts").select("id", { count: "exact", head: true }).eq("status", "published").gte("published_at", weekAgo.toISOString()),
    supabase.from("newsletter_subscribers").select("id", { count: "exact", head: true }).eq("status", "confirmed"),
  ]);

  return `\n\nSite stats (7 days):
- Page views: ${views.count ?? 0}
- New leads: ${leads.count ?? 0}
- Blog posts published: ${posts.count ?? 0}
- Total confirmed subscribers: ${subscribers.count ?? 0}`;
}

async function loadLinkedAutomations(supabase: any): Promise<string> {
  const { data } = await supabase
    .from('agent_automations')
    .select('id, name, skill_name, trigger_type, trigger_config, skill_arguments, enabled, last_triggered_at, next_run_at, run_count, last_error')
    .eq('enabled', true)
    .order('created_at', { ascending: false });
  if (!data?.length) return '\nNo enabled automations.';

  const now = new Date();
  let out = '\n\nEnabled automations:';
  for (const a of data) {
    const due = a.next_run_at && new Date(a.next_run_at) <= now ? ' ⏰ DUE' : '';
    out += `\n-${due} [${a.id.slice(0, 8)}] "${a.name}" → skill: ${a.skill_name} | runs: ${a.run_count} | last_error: ${a.last_error || 'none'}`;
  }
  return out;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const startTime = Date.now();

  try {
    // 1. Gather context + run self-healing in parallel
    const [{ soul, identity }, memoryCtx, objectiveCtx, activityCtx, statsCtx, automationCtx, healingReport] = await Promise.all([
      loadSoulIdentity(supabase),
      loadMemories(supabase),
      loadObjectives(supabase),
      loadRecentActivity(supabase),
      loadSiteStats(supabase),
      loadLinkedAutomations(supabase),
      runSelfHealing(supabase),
    ]);

    const soulPrompt = buildSoulPrompt(soul, identity);

    // 2. Resolve AI config
    const { apiKey, apiUrl, model } = await resolveAiConfig(supabase);

    // 3. Load tools — include planning + automation execution
    const builtInTools = getBuiltInTools(['memory', 'objectives', 'reflect', 'planning', 'automations-exec']);
    const skillTools = await loadSkillTools(supabase, 'internal');
    const allTools = [...builtInTools, ...skillTools];

    // 4. Build enhanced heartbeat system prompt
    const systemPrompt = `You are FlowPilot running in AUTONOMOUS HEARTBEAT mode. No human is watching.
${soulPrompt}

Your mission: Review system state, advance objectives via multi-step plans, proactively identify opportunities, and self-heal.

CONTEXT:
${memoryCtx}
${objectiveCtx}
${automationCtx}
${activityCtx}
${statsCtx}
${healingReport}

HEARTBEAT PROTOCOL:
1. PROACTIVE REASONING — Analyze site stats + activity patterns. If you spot a trend, gap, or opportunity NOT covered by existing objectives, use propose_objective to create one. Max 1 new objective per heartbeat.
2. PLAN — For each active objective WITHOUT a plan (no progress.plan), call decompose_objective to create a step-by-step plan.
3. ADVANCE — Objectives are pre-sorted by priority score. Advance them IN ORDER (highest score first). Use advance_plan with chain=true to execute multiple steps per objective.
4. AUTOMATIONS — Check DUE (⏰) automations. Execute them via execute_automation.
5. REFLECT — Use 'reflect' to analyze the past 7 days.
6. REMEMBER — Save learnings to memory.
7. SUMMARIZE — Brief heartbeat report including plan progress and any new proposals.

PRIORITY SCORING (automatic, shown as [score:N]):
- Deadline proximity: overdue +50, <1 day +40, <3 days +25, <7 days +10
- Priority field: critical +35, high +20, medium +10
- Momentum: in-progress plans +15, near completion (>70%) +10
- Staleness: no update >3 days +8, >7 days +12
- Failures: plan has failed steps +10
Advance the HIGHEST scored objectives first.

MULTI-STEP PLANNING RULES:
- Each objective should have a plan (3-7 steps). Use decompose_objective to create one.
- advance_plan auto-chains up to 4 steps per call. Use it — don't call advance_plan repeatedly for the same objective.
- If a step fails, note it but continue to the next objective.
- If ALL steps are done, mark the objective as completed via objective_complete.
- Plans persist between heartbeats. FlowPilot picks up where it left off.

PROACTIVE REASONING RULES:
- Only propose objectives when stats or activity clearly warrant action
- Never duplicate existing active objectives (checked automatically)
- Include a clear "reason" explaining what data drove the proposal
- Keep goals specific and actionable
- When proposing, set constraints.priority ('critical'|'high'|'medium'|'low')

CONSTRAINTS:
- Max ${MAX_ITERATIONS} tool iterations per heartbeat
- Skills marked requires_approval will be BLOCKED and logged for admin review
- PRIORITIZE: high-score objectives > DUE automations > proposals
- Self-healing auto-disables skills with 3+ consecutive failures
- Be efficient: use chaining, focus on top 2-3 objectives per heartbeat`;

    // 5. Run the reasoning loop
    const messages: any[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Heartbeat triggered at ${new Date().toISOString()}. Review objectives, advance plans, execute due automations, and report system health.` },
    ];

    let finalResponse = "";
    const actionsExecuted: string[] = [];

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const aiResponse = await fetch(apiUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          tools: allTools.length > 0 ? allTools : undefined,
          tool_choice: allTools.length > 0 ? "auto" : undefined,
        }),
      });

      if (!aiResponse.ok) {
        const err = await aiResponse.text();
        console.error("[heartbeat] AI error:", aiResponse.status, err);
        throw new Error(`AI provider error: ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json();
      const choice = aiData.choices?.[0];
      if (!choice) throw new Error("No AI response");

      const msg = choice.message;

      if (!msg.tool_calls?.length) {
        finalResponse = msg.content || "Heartbeat complete.";
        break;
      }

      messages.push(msg);

      for (const tc of msg.tool_calls) {
        const fnName = tc.function.name;
        let fnArgs: any;
        try { fnArgs = JSON.parse(tc.function.arguments || "{}"); } catch { fnArgs = {}; }

        console.log(`[heartbeat] Executing: ${fnName}`, JSON.stringify(fnArgs).slice(0, 200));
        actionsExecuted.push(fnName);

        let result: any;
        try {
          result = await executeBuiltInTool(supabase, supabaseUrl, serviceKey, fnName, fnArgs);
        } catch (err: any) {
          result = { error: err.message };
        }

        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
      }
    }

    const duration = Date.now() - startTime;

    // 6. Log heartbeat
    await supabase.from("agent_activity").insert({
      agent: "flowpilot",
      skill_name: "heartbeat",
      input: { trigger: "scheduled", actions: actionsExecuted },
      output: { summary: finalResponse.slice(0, 2000) },
      status: "success",
      duration_ms: duration,
    });

    console.log(`[heartbeat] Complete in ${duration}ms, ${actionsExecuted.length} actions: ${actionsExecuted.join(", ")}`);

    return new Response(
      JSON.stringify({ status: "ok", duration_ms: duration, actions: actionsExecuted, summary: finalResponse.slice(0, 500) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    const duration = Date.now() - startTime;
    console.error("[heartbeat] Error:", err);

    await supabase.from("agent_activity").insert({
      agent: "flowpilot",
      skill_name: "heartbeat",
      input: { trigger: "scheduled" },
      output: {},
      status: "failed",
      error_message: err.message || "Unknown error",
      duration_ms: duration,
    });

    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
