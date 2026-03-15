import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  resolveAiConfig,
  loadSoulIdentity,
  buildSoulPrompt,
  loadMemories,
  loadObjectives,
  buildSystemPrompt,
  pruneConversationHistory,
  loadSkillTools,
  getBuiltInTools,
  executeBuiltInTool,
  runSelfHealing,
  loadCMSSchema,
  loadHeartbeatState,
  saveHeartbeatState,
  extractTokenUsage,
  accumulateTokens,
  isOverBudget,
} from "../_shared/agent-reason.ts";
import type { TokenUsage, HeartbeatState } from "../_shared/agent-reason.ts";

/**
 * FlowPilot Heartbeat — Enhanced Autonomous Loop
 * Uses the shared prompt compiler + context pruning from agent-reason.
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
    const [{ soul, identity }, memoryCtx, objectiveCtx, activityCtx, statsCtx, automationCtx, healingReport, cmsSchemaCtx, heartbeatStateCtx] = await Promise.all([
      loadSoulIdentity(supabase),
      loadMemories(supabase),
      loadObjectives(supabase),
      loadRecentActivity(supabase),
      loadSiteStats(supabase),
      loadLinkedAutomations(supabase),
      runSelfHealing(supabase),
      loadCMSSchema(supabase),
      loadHeartbeatState(supabase),
    ]);

    // 2. Resolve AI config
    const { apiKey, apiUrl, model } = await resolveAiConfig(supabase);

    // 3. Load tools — include planning + automation execution
    const builtInTools = getBuiltInTools(['memory', 'objectives', 'self-mod', 'reflect', 'soul', 'planning', 'automations-exec', 'workflows', 'a2a', 'skill-packs']);
    const skillTools = await loadSkillTools(supabase, 'internal');
    const allTools = [...builtInTools, ...skillTools];

    // 4. Token budget
    const TOKEN_BUDGET = 50_000;

    // 5. Build system prompt via prompt compiler (OpenClaw Layer 1)
    const systemPrompt = buildSystemPrompt({
      mode: 'heartbeat',
      soulPrompt: buildSoulPrompt(soul, identity),
      memoryContext: memoryCtx,
      objectiveContext: objectiveCtx,
      activityContext: activityCtx,
      statsContext: statsCtx,
      automationContext: automationCtx,
      healingReport: healingReport,
      cmsSchemaContext: cmsSchemaCtx,
      heartbeatState: heartbeatStateCtx,
      tokenBudget: TOKEN_BUDGET,
      maxIterations: MAX_ITERATIONS,
    });

    // 6. Run the reasoning loop with context pruning + token tracking
    const rawMessages: any[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Heartbeat triggered at ${new Date().toISOString()}. Review objectives, advance plans, execute due automations, and report system health.` },
    ];

    const messages = await pruneConversationHistory(rawMessages, supabase);

    let finalResponse = "";
    const actionsExecuted: string[] = [];
    let totalTokenUsage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      // Token budget check
      if (isOverBudget(totalTokenUsage, TOKEN_BUDGET)) {
        console.log(`[heartbeat] Token budget exceeded (${totalTokenUsage.total_tokens}/${TOKEN_BUDGET}), stopping.`);
        finalResponse = finalResponse || `Heartbeat stopped: token budget reached (${totalTokenUsage.total_tokens} tokens used).`;
        break;
      }

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
      
      // Track tokens
      const iterationTokens = extractTokenUsage(aiData);
      totalTokenUsage = accumulateTokens(totalTokenUsage, iterationTokens);

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
