import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  resolveAiConfig,
  loadWorkspaceFiles,
  buildWorkspacePrompt,
  loadMemories,
  loadObjectives,
  buildSystemPrompt,
  loadSkillTools,
  getBuiltInTools,
  runSelfHealing,
  loadCMSSchema,
  loadHeartbeatState,
  saveHeartbeatState,
  detectSiteMaturity,
  loadCrossModuleInsights,
  loadHeartbeatProtocol,
  reason,
  parseReplyDirectives,
} from "../_shared/agent-reason.ts";
import { tryAcquireLock, releaseLock } from "../_shared/concurrency.ts";
import { generateTraceId } from "../_shared/trace.ts";
import type { TokenUsage } from "../_shared/types.ts";

/**
 * FlowPilot Heartbeat — Autonomous Loop
 * 
 * Thin orchestration wrapper that:
 *   1. Gathers heartbeat-specific context (activity, stats, automations)
 *   2. Builds the system prompt via the prompt compiler
 *   3. Delegates to the shared reason() loop (no duplicated tool loop)
 *   4. Logs results and saves heartbeat state
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_ITERATIONS = 12;
const MAX_WALL_CLOCK_MS = 120_000; // 2 minutes — hard stop to prevent runaway (OpenClaw #3181)

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

// ─── Integrity gate ───────────────────────────────────────────────────────────

async function runIntegrityGate(supabase: any): Promise<string> {
  try {
    const { data: enabledSkills } = await supabase
      .from('agent_skills')
      .select('name, instructions, tool_definition, description')
      .eq('enabled', true);

    const skills = enabledSkills || [];
    const integrityIssues: string[] = [];

    const noInstr = skills.filter((s: any) => !s.instructions || s.instructions.trim() === '');
    if (noInstr.length > 0) integrityIssues.push(`${noInstr.length} skills missing instructions`);

    const badTd = skills.filter((s: any) => {
      const td = typeof s.tool_definition === 'string' ? JSON.parse(s.tool_definition) : s.tool_definition;
      return !td?.function?.name;
    });
    if (badTd.length > 0) integrityIssues.push(`${badTd.length} skills with invalid tool definitions`);

    const { data: memKeys } = await supabase
      .from('agent_memory')
      .select('key')
      .in('key', ['soul', 'identity', 'agents']);
    const missing = ['soul', 'identity', 'agents'].filter(k => !(memKeys || []).some((m: any) => m.key === k));
    if (missing.length > 0) integrityIssues.push(`Missing memory keys: ${missing.join(', ')}`);

    const { data: autos } = await supabase
      .from('agent_automations')
      .select('name, skill_name')
      .eq('enabled', true);
    const skillNames = new Set(skills.map((s: any) => s.name));
    const broken = (autos || []).filter((a: any) => a.skill_name && !skillNames.has(a.skill_name));
    if (broken.length > 0) integrityIssues.push(`${broken.length} automations reference missing skills`);

    if (integrityIssues.length > 0) {
      await supabase.from('agent_activity').insert({
        agent: 'flowpilot',
        skill_name: 'system_integrity_check',
        input: { source: 'heartbeat_gate' },
        output: { issues: integrityIssues, issue_count: integrityIssues.length },
        status: integrityIssues.length > 2 ? 'failed' : 'success',
      });
      console.log(`[heartbeat] Integrity gate: ${integrityIssues.length} issues found`);
      return `\n\n⚠️ SYSTEM INTEGRITY ISSUES DETECTED:\n${integrityIssues.map(i => `- ${i}`).join('\n')}\nConsider creating an objective to fix these if none exists.`;
    }
    console.log('[heartbeat] Integrity gate: all checks passed ✓');
    return '';
  } catch (intErr) {
    console.warn('[heartbeat] Integrity gate failed (non-fatal):', intErr);
    return '';
  }
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
  const traceId = generateTraceId('hb');

  try {
    // Concurrency guard — only one heartbeat at a time (TTL: 10 minutes)
    const lockAcquired = await tryAcquireLock(supabase, 'heartbeat', 'heartbeat', 600);
    if (!lockAcquired) {
      console.log(`[heartbeat] trace=${traceId} Another heartbeat is already running — skipping`);
      return new Response(
        JSON.stringify({ skipped: true, reason: 'concurrent_heartbeat', trace_id: traceId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 0. Integrity gate + context gathering in parallel
    const [integrityContext, { soul, identity, agents }, memoryCtx, objectiveCtx, activityCtx, statsCtx, automationCtx, healingReport, cmsSchemaCtx, heartbeatStateCtx, siteMaturity, crossModuleCtx, customProtocol] = await Promise.all([
      runIntegrityGate(supabase),
      loadWorkspaceFiles(supabase),
      loadMemories(supabase),
      loadObjectives(supabase, { unlockedOnly: true }),
      loadRecentActivity(supabase),
      loadSiteStats(supabase),
      loadLinkedAutomations(supabase),
      runSelfHealing(supabase),
      loadCMSSchema(supabase),
      loadHeartbeatState(supabase),
      detectSiteMaturity(supabase),
      loadCrossModuleInsights(supabase),
      loadHeartbeatProtocol(supabase),
    ]);

    // 1. Token budget — give fresh sites more room to work
    const TOKEN_BUDGET = siteMaturity.isFresh ? 120_000 : 80_000;
    const maxIter = siteMaturity.isFresh ? 15 : 12;

    console.log(`[heartbeat] trace=${traceId} Site maturity: ${siteMaturity.isFresh ? 'FRESH' : 'mature'}, budget: ${TOKEN_BUDGET}${customProtocol ? ', custom protocol' : ''}`);

    // 2. Build system prompt via prompt compiler
    const systemPrompt = buildSystemPrompt({
      mode: 'heartbeat',
      soulPrompt: buildWorkspacePrompt(soul, identity, agents),
      agents,
      memoryContext: memoryCtx,
      objectiveContext: objectiveCtx,
      activityContext: activityCtx,
      statsContext: statsCtx + (crossModuleCtx || '') + integrityContext,
      automationContext: automationCtx,
      healingReport: healingReport,
      cmsSchemaContext: cmsSchemaCtx,
      heartbeatState: heartbeatStateCtx,
      tokenBudget: TOKEN_BUDGET,
      maxIterations: maxIter,
      siteMaturity,
      customHeartbeatProtocol: customProtocol ?? undefined,
    });

    // 3. Delegate to the shared reason() loop — NO duplicated tool loop
    //    Wall-clock guard: wrap in a timeout to prevent runaway (OpenClaw #3181)
    const reasonPromise = reason(supabase, [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Heartbeat triggered at ${new Date().toISOString()}. Evaluate outcomes, advance objectives, execute due automations.` },
    ], {
      scope: 'internal',
      maxIterations: maxIter,
      tier: 'reasoning',
      traceId,
      builtInToolGroups: ['memory', 'objectives', 'reflect', 'planning', 'automations-exec'],
      tokenBudget: TOKEN_BUDGET,
      // Essential categories for autonomous work (~42 skills instead of 91)
      // CRM + communication skills are available via chain_skills if needed
      skillCategories: ['content', 'analytics', 'system', 'growth'],
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Heartbeat wall-clock timeout (${MAX_WALL_CLOCK_MS}ms)`)), MAX_WALL_CLOCK_MS)
    );

    const result = await Promise.race([reasonPromise, timeoutPromise]);

    const duration = Date.now() - startTime;

    // Parse reply directives (OpenClaw Protocol Specs L5)
    const { directive, cleanContent } = parseReplyDirectives(result.response);
    const isIdle = directive === 'NO_REPLY';

    // 4. Save heartbeat state for next run
    await saveHeartbeatState(supabase, {
      last_run: new Date().toISOString(),
      objectives_advanced: result.actionsExecuted.filter(a => a === 'advance_plan' || a === 'objective_complete'),
      next_priorities: [],
      pending_actions: [],
      token_usage: result.tokenUsage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      iteration_count: result.actionsExecuted.length,
    });

    // 5. Log heartbeat with trace ID — use 'idle' distinction for NO_REPLY
    await supabase.from("agent_activity").insert({
      agent: "flowpilot",
      skill_name: "heartbeat",
      input: { trigger: "scheduled", actions: result.actionsExecuted, trace_id: traceId, directive },
      output: { summary: (isIdle ? 'Idle — no actions needed' : cleanContent).slice(0, 2000) },
      status: "success",
      duration_ms: duration,
      token_usage: result.tokenUsage,
    });

    console.log(`[heartbeat] trace=${traceId} Complete in ${duration}ms, ${result.actionsExecuted.length} actions, ${result.tokenUsage?.total_tokens || 0} tokens`);

    return new Response(
      JSON.stringify({
        status: "ok",
        trace_id: traceId,
        duration_ms: duration,
        actions: result.actionsExecuted,
        token_usage: result.tokenUsage,
        summary: result.response.slice(0, 500),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    const duration = Date.now() - startTime;
    console.error(`[heartbeat] trace=${traceId} Error:`, err);

    await supabase.from("agent_activity").insert({
      agent: "flowpilot",
      skill_name: "heartbeat",
      input: { trigger: "scheduled", trace_id: traceId },
      output: {},
      status: "failed",
      error_message: err.message || "Unknown error",
      duration_ms: duration,
    });

    return new Response(
      JSON.stringify({ error: err.message || "Internal error", trace_id: traceId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } finally {
    await releaseLock(supabase, 'heartbeat');
  }
});
