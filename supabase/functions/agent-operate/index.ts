import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { requireServiceOrRole, unauthorized } from '../_shared/edge-auth.ts';
import { scoreSkillsByIntent, loadRecentUsageCounts } from '../_shared/skills/intent-scorer.ts';
import { loadBusinessIdentityBlock } from '../_shared/domains/business-identity-block.ts';
import { SKILL_CATEGORY_MODULES, isCategoryActive, loadActiveModuleIds } from '../_shared/mcp/groups.ts';
import { readAllRows } from '../_shared/read-all-rows.ts';
import { generateTraceId } from '../_shared/trace.ts';
import {
  loadWorkspaceFiles,
  buildWorkspacePrompt,
  loadMemories,
  loadObjectives,
  buildSystemPrompt,
  loadSkillTools,
  loadSkillsRaw,
  getBuiltInTools,
  loadCMSSchema,
  tryAcquireLock,
  releaseLock,
  parseReplyDirectives,
  reason,
} from "../_shared/agent-reason.ts";
import type { BuiltInToolGroup } from '../_shared/types.ts';

/**
 * FlowPilot Operate — Interactive streaming agent
 * Thin SSE wrapper around the shared agent-reason core + prompt compiler.
 *
 * OpenClaw alignment: NO deterministic intent guards.
 * Skill descriptions with "Use when / NOT for" patterns handle all routing.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const MAX_TOOL_ITERATIONS = 10;
// Broad admin tasks: a wider pre-selected tool window than the heartbeat's 25.
const MAX_FLOWCHAT_SKILLS = 40;
// Ten iterations over ~40 tool schemas; the engine's 80k default ends a
// migrate-and-publish turn half way.
const FLOWCHAT_TOKEN_BUDGET = 250_000;
const MAX_OPERATE_WALL_CLOCK_MS = 120_000; // 120s wall-clock for interactive operate (longer chains)

/**
 * FlowChat Operator Protocol — appended to the system prompt for FlowChat sessions.
 *
 * FlowChat is REACTIVE: it executes what the admin asks, here and now. No heartbeats,
 * no objectives, no proactive memory writes. But within a turn it MUST be a potent
 * operator — drafting content inline, chaining several skills, never bouncing the
 * task back to the admin for text it can write itself.
 *
 * See mem://architecture/flowchat-vs-flowpilot-roles
 *     mem://philosophy/flowpilot-development-laws (Law 3 — utilities are OK inline,
 *     skills are interfaces, not pipelines)
 */
const FLOWCHAT_OPERATOR_PROTOCOL = `
=== FLOWCHAT OPERATOR MODE ===
You are FlowChat — the admin's reactive operator. Same skills as FlowPilot, but you
act on this user's message, not on objectives or schedules. Be a potent doer.

OPERATING PRINCIPLES:
1. EXECUTE, DON'T DEFER. If the admin's request implies a content artifact (KB
   article, blog post, page, product description, email, contract clause, job ad,
   announcement), DRAFT THE CONTENT YOURSELF inside your reasoning, then call the
   matching manage_* / write_* / create_* skill with the drafted text in the same turn.
   Do NOT ask the admin "please provide the title/answer/body" — they already gave you
   the topic. Drafting from a topic is a pure text utility (Law 3 refinement).

2. ALWAYS POPULATE REQUIRED FIELDS. When a skill requires title + question + answer
   (KB), or title + content (blog), or name + description (product) — generate every
   required field from the topic. Never call a skill with only \`action\` set.

3. CHAIN AGGRESSIVELY. You have up to ${MAX_TOOL_ITERATIONS} tool iterations per turn.
   Use them: research → draft → save → publish → notify is one turn, not five.
   Call multiple independent tools in parallel.

4. NO AUTONOMY THEATRE. Do NOT say "I will check on this later", "I've added this to
   my objectives", or "I'll monitor for changes". You are reactive — that's FlowPilot's
   job, and it may be off. Finish the task in this turn or report what's missing.

5. ASK ONLY FOR INPUTS YOU CANNOT SYNTHESIZE. URLs, IDs, prices, dates, customer
   names, file uploads — yes, ask. Body copy, summaries, descriptions, taglines — no,
   write them.

6. REPORT WHAT YOU DID. End with a short summary: what was created/updated, IDs or
   slugs/URLs, and the single best next action the admin might want to take.

7. NEVER HALLUCINATE SUCCESS. You may ONLY claim that something was created /
   updated / sent / published / added / saved if the corresponding tool call in
   THIS turn returned status="success" (no "error" field). If a tool failed,
   say it failed and what the error was. If you wanted to do X but no available
   skill matches X, say "I don't have a skill for that — the relevant module
   may be disabled" instead of substituting a different skill and pretending
   it did the job. Wrong-skill substitution is the worst possible outcome.
=== END FLOWCHAT OPERATOR MODE ===
`;

function sseEvent(writer: WritableStreamDefaultWriter, encoder: TextEncoder, event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return writer.write(encoder.encode(payload));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getServiceClient();
    // Privileged: a streaming agent that chains up to 10 tool iterations of
    // service-role skills/built-ins. Admin UI sends the session JWT; gate it.
    const auth = await requireServiceOrRole(req, supabase);
    // One trace per FlowChat turn: every skill it runs is stamped with it, so the
    // turn shows up as one run in the cockpit's Trace tab (it used to send none).
    const operateTraceId = generateTraceId('flowchat');
    if (!auth.authorized) return unauthorized(corsHeaders);

    const body = await req.json();
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const conversation_id = body.conversation_id;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Separation of concerns:
    //   FlowChat (this endpoint, as web-CLI shell) ALWAYS works — it's the human shell over the
    //   FlowWink platform skills, just like MCP is the agent shell. It does not require the
    //   FlowPilot autonomous-operator module to be enabled.
    //   FlowPilot, when ON, layers autonomous behaviors on top: objectives, soul-driven
    //   reasoning, reflection, planning, and automation execution. When OFF, those FlowPilot-
    //   internal built-in tools are stripped, but skills + reasoning remain available.
    // See mem://architecture/flowwink-as-business-os-three-shells
    //     mem://architecture/mcp-as-platform-not-flowpilot-feature
    const { data: moduleSettings } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'modules')
      .maybeSingle();

    const flowpilotEnabled = moduleSettings?.value?.flowpilot?.enabled ?? false;

    // Concurrency guard — one agent run per conversation
    const lane = conversation_id ? `operate:${conversation_id}` : null;
    if (lane) {
      const acquired = await tryAcquireLock(supabase, lane, 'operate', 300);
      if (!acquired) {
        return new Response(
          JSON.stringify({ error: 'Another agent process is running on this conversation' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Load context in parallel
    const [{ soul, identity, agents, tools, user, bootstrap }, memoryContext, objectiveContext, cmsSchemaCtx, businessIdentityCtx] = await Promise.all([
      loadWorkspaceFiles(supabase),
      loadMemories(supabase),
      loadObjectives(supabase),
      loadCMSSchema(supabase),
      // 'narrative': this loop creates pages, blocks and posts. The bento grid
      // that pitched FlowPilot as the customer's product came from an identity
      // too thin to say what the customer actually sells.
      loadBusinessIdentityBlock(supabase, 'narrative').catch(() => ''),
    ]);

    // Use prompt compiler (OpenClaw Layer 1)
    const baseSystemPrompt = buildSystemPrompt({
      mode: 'operate',
      soulPrompt: buildWorkspacePrompt(soul, identity, agents, tools, user, bootstrap),
      agents,
      memoryContext,
      objectiveContext,
      cmsSchemaContext: cmsSchemaCtx,
      businessIdentityContext: businessIdentityCtx,
    });

    // Append the FlowChat operator protocol — turns the generic operate-mode prompt
    // into a "potent reactive doer" prompt without affecting heartbeat/autonomous flows.
    const systemPrompt = `${baseSystemPrompt}\n${FLOWCHAT_OPERATOR_PROTOCOL}`;

    // Build tools — server-side loading with gating + caching (OpenClaw alignment)
    // Platform-level built-ins (always on for the FlowChat shell): memory (read), workflows, a2a, skill-packs.
    // FlowPilot-internal built-ins (autonomous-operator only): objectives, self-mod, reflect, soul, planning, automations-exec.
    const builtInGroups: BuiltInToolGroup[] = flowpilotEnabled
      ? ['memory', 'objectives', 'self-mod', 'reflect', 'soul', 'planning', 'automations-exec', 'workflows', 'a2a', 'skill-packs']
      : ['memory', 'workflows', 'a2a', 'skill-packs'];
    const builtInTools = getBuiltInTools(builtInGroups);
    // Scored here only for the module-off honesty check below; reason() scores
    // the same skills against the same message for the run itself.
    const skillCache = await loadSkillsRaw(supabase, 'internal');
    const [externalSkills, usageBoost] = await Promise.all([
      loadSkillTools(supabase, 'internal', undefined, 'full', skillCache),
      loadRecentUsageCounts(supabase),
    ]);

    // Intent-based adaptive tool window — wider for FlowChat operator (broad admin tasks).
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user')?.content || '';
    const MAX_TOOLS = 128;
    const maxSkills = MAX_TOOLS - builtInTools.length;
    const filteredSkills = scoreSkillsByIntent(externalSkills, lastUserMsg, {
      maxSkills: Math.min(maxSkills, MAX_FLOWCHAT_SKILLS),
      usageBoost,
    });
    
    // ─── Module-disabled intent detection ──────────────────────────────────
    // Same scoring algorithm, but run against skills that WERE filtered out
    // by `loadActiveModuleIds` (modules turned off in /admin/modules). If the
    // user's intent matches a disabled skill more strongly than any exposed
    // skill, we tell them honestly instead of letting the LLM substitute the
    // wrong skill from an active module. See plan: FlowChat module-aware
    // honesty.
    let disabledMatch: { module: string; skills: string[]; topScore: number } | null = null;
    let exposedSkillCount = filteredSkills.length;
    let disabledSkillCount = 0;
    let modulesOffCount = 0;
    try {
      const activeModules = await loadActiveModuleIds(supabase);
      if (!activeModules.has('__all__')) {
        // Paginated. This read is the honesty mechanism: everything in it that
        // is NOT in `exposedNames` gets reported to the user as "that skill's
        // module is off". An unbounded select stops at 1000 rows without a
        // word (agent_skills: 540 rows on optic, 2026-08-23, and climbing), so
        // past the cap the tail would simply stop being mentioned — the
        // operator would say nothing at all about a capability that exists and
        // is merely switched off, which is the failure this block was written
        // to prevent. `.in('scope', …)` bounds the values, not the row count.
        const allEnabledResult = await readAllRows(supabase, 'agent_skills', {
          columns: 'name, tool_definition, category',
          orderBy: 'name',
          filter: (q) => q.eq('enabled', true).in('scope', ['internal', 'both']),
        });
        if (allEnabledResult.error || allEnabledResult.truncated) {
          console.error(
            '[agent-operate] Skill register read incomplete — disabled-module honesty ' +
            'runs over a prefix:',
            allEnabledResult.error ?? 'page ceiling reached',
          );
        }
        const allEnabled = allEnabledResult.rows;

        const exposedNames = new Set(filteredSkills.map((t: any) => t.function?.name));
        const disabled = (allEnabled || []).filter((s: any) =>
          s.tool_definition?.function &&
          !exposedNames.has(s.tool_definition.function.name) &&
          !isCategoryActive(s.category, activeModules, SKILL_CATEGORY_MODULES)
        );
        disabledSkillCount = disabled.length;

        // Module-off count for honesty badge
        const { data: settingsRow } = await supabase
          .from('site_settings').select('value').eq('key', 'modules').maybeSingle();
        if (settingsRow?.value && typeof settingsRow.value === 'object') {
          modulesOffCount = Object.values(settingsRow.value as Record<string, any>)
            .filter((m: any) => !(m && m.enabled === true)).length;
        }

        if (disabled.length > 0 && lastUserMsg.trim().length > 0) {
          // Score disabled skills with the same scorer
          const disabledTools = disabled
            .map((s: any) => s.tool_definition)
            .filter((td: any) => td?.function);
          // Force scoring (>maxSkills) by using a small cap
          const scored = scoreSkillsByIntent(disabledTools, lastUserMsg, { maxSkills: 1 });

          // Manually re-score top exposed for comparison (use same function with cap=1)
          const exposedTopArr = filteredSkills.length > 1
            ? scoreSkillsByIntent(filteredSkills, lastUserMsg, { maxSkills: 1 })
            : filteredSkills;

          // Compute raw scores via direct expansion check (re-derive by name match — quick approximation)
          const computeMatchScore = (td: any) => {
            const fn = (td?.function?.name || '').toLowerCase();
            const desc = (td?.function?.description || '').toLowerCase();
            const msg = lastUserMsg.toLowerCase();
            let score = 0;
            for (const part of fn.split('_').filter((w: string) => w.length > 2)) {
              if (msg.includes(part)) score += 8;
            }
            const useWhen = desc.match(/use when:\s*([^.]*?)(?:\.|not for:|$)/i);
            if (useWhen) {
              for (const w of useWhen[1].toLowerCase().split(/[\s,]+/).filter((w: string) => w.length > 3)) {
                if (msg.includes(w)) score += 7;
              }
            }
            return score;
          };

          const topDisabledScore = scored[0] ? computeMatchScore(scored[0]) : 0;
          const topExposedScore = exposedTopArr[0] ? computeMatchScore(exposedTopArr[0]) : 0;

          // Trigger early-return if disabled skill clearly wins
          if (topDisabledScore >= 14 && topDisabledScore > topExposedScore + 4) {
            // Group top-3 matched disabled skills by their owning module
            const matchedSkills = scored
              .map((td: any) => disabled.find((d: any) => d.tool_definition?.function?.name === td.function?.name))
              .filter(Boolean)
              .slice(0, 3);

            // Find which module(s) need to be turned on for the top match
            const topCat = matchedSkills[0]?.category;
            const owningModules = SKILL_CATEGORY_MODULES[topCat] || [];
            const offModule = owningModules.find((m: string) => !activeModules.has(m)) || topCat || 'unknown';

            disabledMatch = {
              module: offModule,
              skills: matchedSkills.map((s: any) => s.name),
              topScore: topDisabledScore,
            };
            console.log(`[operate] Module-disabled intent detected: top disabled "${disabledMatch.skills[0]}" (score ${topDisabledScore}) > top exposed (score ${topExposedScore}). Suggesting module "${offModule}".`);
          }
        }
      } else {
        exposedSkillCount = filteredSkills.length;
      }
    } catch (e) {
      console.warn('[operate] Module-disabled detection failed (non-fatal):', (e as any)?.message);
    }

    // Set up SSE stream
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    const response = new Response(readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

    (async () => {
      const operateTimeout = setTimeout(async () => {
        console.warn(`[operate] Wall-clock timeout (${MAX_OPERATE_WALL_CLOCK_MS}ms) — closing stream`);
        try {
          await sseEvent(writer, encoder, 'error', { message: 'Operation timed out. Partial results may have been returned.' });
          await sseEvent(writer, encoder, 'done', {});
        } catch { /* writer closed */ }
        try { await writer.close(); } catch { /* already closed */ }
      }, MAX_OPERATE_WALL_CLOCK_MS);

      // SSE keepalive to prevent gateway idle-timeout (sends comment every 10s)
      const keepalive = setInterval(async () => {
        try { await writer.write(encoder.encode(': keepalive\n\n')); } catch { clearInterval(keepalive); }
      }, 10_000);

      // Honesty meta — tells the UI how many skills are actually exposed vs hidden by disabled modules.
      await sseEvent(writer, encoder, 'flowchat_meta', {
        exposed_skill_count: exposedSkillCount,
        disabled_skill_count: disabledSkillCount,
        modules_off_count: modulesOffCount,
      });

      // Module-disabled early return: if the user clearly wants something only a
      // disabled module's skill can do, refuse honestly instead of letting the
      // LLM substitute the wrong skill. No tool calls, no hallucinated success.
      if (disabledMatch) {
        const skillsList = disabledMatch.skills.map(s => `\`${s}\``).join(', ');
        const reply =
          `I can't do that right now — it needs the **${disabledMatch.module}** module, which is currently disabled.\n\n` +
          `Skills that would handle this: ${skillsList}.\n\n` +
          `Enable the module in [Modules](/admin/modules), then ask me again.`;
        await sseEvent(writer, encoder, 'delta', { content: reply });
        await sseEvent(writer, encoder, 'done', {});
        clearInterval(keepalive);
        clearTimeout(operateTimeout);
        try { await writer.close(); } catch { /* already closed */ }
        if (lane) await releaseLock(supabase, lane).catch(() => {});
        return;
      }

      try {
        // The shared engine — the same loop, guards, trace events, trust and
        // budget as the heartbeat. FlowChat used to run its own copy of the
        // loop, so a guard added to one never reached the other.
        const result = await reason(supabase, [{ role: 'system', content: systemPrompt }, ...messages], {
          scope: 'internal',
          tier: 'reasoning',
          builtInToolGroups: builtInGroups,
          maxIterations: MAX_TOOL_ITERATIONS,
          maxSkills: MAX_FLOWCHAT_SKILLS,
          tokenBudget: FLOWCHAT_TOKEN_BUDGET,
          traceId: operateTraceId,
          lockOwner: 'flowchat',
          callerUserId: auth.userId,
          autoChainNextAction: true,
          continuationNudge: true,
          summarizeOnExhaustion: true,
          // A person's question is not a reason to write memory on its own.
          memoryFlush: false,
          deadlineAt: Date.now() + MAX_OPERATE_WALL_CLOCK_MS - 15_000,
          onProgress: (e) => sseEvent(writer, encoder, e.kind, e.kind === 'tool_start'
            ? { iteration: e.iteration, tools: e.tools }
            : { iteration: e.iteration, tools: e.tools, results_count: e.results_count }),
        });

        if (result.skillResults.length > 0) {
          // The engine says 'pending' for anything that waits on a person; the
          // chat's chips and "Review in Approvals" link read the skill's own
          // status (pending_approval / staged), as they did before.
          const wire = result.skillResults.map((r) => r.status === 'pending'
            ? { ...r, status: (r.result && typeof r.result.status === 'string' ? r.result.status : 'pending_approval') }
            : r);
          await sseEvent(writer, encoder, 'skill_results', wire);
        }
        const { cleanContent } = parseReplyDirectives(result.response || 'Done.');
        await sseEvent(writer, encoder, 'delta', { content: cleanContent || result.response || 'Done.' });
        await sseEvent(writer, encoder, 'done', {});
      } catch (err: any) {
        console.error('agent-operate stream error:', err);
        try { await sseEvent(writer, encoder, 'error', { message: err.message || 'Internal error' }); } catch { /* writer closed */ }
      } finally {
        clearTimeout(operateTimeout);
        clearInterval(keepalive);
        if (lane) {
          try { await releaseLock(supabase, lane); } catch { /* best effort */ }
        }
        try { await writer.close(); } catch { /* already closed */ }
      }
    })();

    return response;

  } catch (err: any) {
    console.error('agent-operate error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
