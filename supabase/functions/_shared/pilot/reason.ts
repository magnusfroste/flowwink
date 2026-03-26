/**
 * Pilot — Reasoning Loop (OpenClaw Core)
 * 
 * Domain-agnostic LLM orchestration engine shared by all agent surfaces:
 *   - agent-operate (interactive, streaming)
 *   - flowpilot-heartbeat (autonomous, non-streaming)
 *   - chat-completion (visitor-facing)
 *
 * Extracted from agent-reason.ts as part of the Pilot/Domain separation.
 */

import type { ReasonConfig, ReasonResult, TokenUsage, HeartbeatState, BuiltInToolGroup } from '../types.ts';
import { resolveAiConfig } from '../ai-config.ts';
import { tryAcquireLock, releaseLock } from '../concurrency.ts';
import { generateTraceId } from '../trace.ts';
import {
  handleMemoryWrite,
  handleMemoryRead,
  handleMemoryDelete,
  handleObjectiveUpdateProgress,
  handleObjectiveComplete,
  handleObjectiveDelete,
  handleDecomposeObjective,
  handleAdvancePlan,
  handleProposeObjective,
  handleExecuteAutomation,
  handleWorkflowCreate,
  handleWorkflowExecute,
  handleWorkflowList,
  handleWorkflowUpdate,
  handleWorkflowDelete,
  handleDelegateTask,
  handleSkillPackList,
  handleSkillPackInstall,
  handleChainSkills,
  handleEvaluateOutcomes,
  handleRecordOutcome,
  handleReflect,
  handleSkillCreate,
  handleSkillUpdate,
  handleSkillList,
  handleSkillDisable,
  handleSkillEnable,
  handleSkillDelete,
  handleSkillInstruct,
  handleSkillRead,
  handleSoulUpdate,
  handleAgentsUpdate,
  handleHeartbeatProtocolUpdate,
  handleAutomationCreate,
  handleAutomationList,
  handleAutomationUpdate,
  handleAutomationDelete,
} from './handlers.ts';
import { getBuiltInTools } from './built-in-tools.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_CONTEXT_TOKENS = 80_000;
const SUMMARY_THRESHOLD = 60_000;
const DEFAULT_TOKEN_BUDGET = 80_000;
const MEMORY_FLUSH_THRESHOLD = 0.80;
const SKILL_TIMEOUT_MS = 30_000;
const CIRCUIT_BREAKER_THRESHOLD = 3;
const SAME_ACTION_LIMIT = 3;
const MAX_SELF_REPAIR_RETRIES = 2;

const BUILT_IN_TOOL_NAMES = new Set([
  'memory_write', 'memory_read', 'memory_delete',
  'objective_update_progress', 'objective_complete', 'objective_delete',
  'skill_create', 'skill_update', 'skill_list', 'skill_disable', 'skill_enable', 'skill_delete',
  'skill_instruct', 'skill_read',
  'soul_update', 'agents_update', 'heartbeat_protocol_update',
  'automation_create', 'automation_list', 'automation_update', 'automation_delete',
  'reflect',
  'decompose_objective', 'advance_plan', 'propose_objective', 'execute_automation',
  'workflow_create', 'workflow_execute', 'workflow_list', 'workflow_update', 'workflow_delete',
  'delegate_task',
  'skill_pack_list', 'skill_pack_install',
  'chain_skills',
  'evaluate_outcomes', 'record_outcome',
]);

// ─── Reply Directive Parser (OpenClaw Protocol Specs L5) ──────────────────────

export type ReplyDirective = 'NO_REPLY' | 'HEARTBEAT_OK' | null;

export function parseReplyDirectives(content: string): { directive: ReplyDirective; cleanContent: string } {
  const trimmed = content.trim();

  if (trimmed === 'NO_REPLY') {
    return { directive: 'NO_REPLY', cleanContent: '' };
  }

  let cleanContent = content;
  let directive: ReplyDirective = null;
  if (trimmed.endsWith('HEARTBEAT_OK')) {
    directive = 'HEARTBEAT_OK';
    cleanContent = trimmed.replace(/\n?HEARTBEAT_OK\s*$/, '').trim();
  }

  cleanContent = cleanContent
    .replace(/\[ACTION:[^\]]+\]\s*/g, '')
    .replace(/\[RESULT:[^\]]+\]\s*/g, '');

  return { directive, cleanContent };
}

// ─── Skill Budget Tiers (OpenClaw §4.4) ───────────────────────────────────────

export type SkillBudgetTier = 'full' | 'compact' | 'drop';

export function resolveSkillBudgetTier(tokenBudget: number, tokensUsed: number): SkillBudgetTier {
  const pct = tokensUsed / tokenBudget;
  if (pct < 0.50) return 'full';
  if (pct < 0.75) return 'compact';
  return 'drop';
}

function compactToolDefinition(td: any): any {
  const clone = JSON.parse(JSON.stringify(td));
  const fn = clone.function;
  if (!fn) return clone;
  if (fn.description && fn.description.length > 80) {
    fn.description = fn.description.slice(0, 77) + '...';
  }
  const props = fn.parameters?.properties;
  if (props) {
    for (const val of Object.values(props) as any[]) {
      delete val.description;
    }
  }
  return clone;
}

// ─── Memory & Objectives Loaders ──────────────────────────────────────────────

export async function loadMemories(supabase: any): Promise<string> {
  const { data } = await supabase
    .from('agent_memory')
    .select('key, value, category')
    .not('key', 'in', '("soul","identity","agents","heartbeat_state","heartbeat_protocol","tool_policy","expected_skill_hash")')
    .order('updated_at', { ascending: false })
    .limit(20);

  if (!data || data.length === 0) return '';
  const lines = data.map((m: any) => {
    const val = typeof m.value === 'string' ? m.value : JSON.stringify(m.value);
    const truncated = val.length > 150 ? val.slice(0, 150) + '…' : val;
    return `- [${m.category}] ${m.key}: ${truncated}`;
  });
  return `\n\nMemory (use memory_read for full values):\n${lines.join('\n')}`;
}

export async function loadObjectives(supabase: any, opts?: { unlockedOnly?: boolean }): Promise<string> {
  let query = supabase
    .from('agent_objectives')
    .select('id, goal, status, constraints, success_criteria, progress, created_at, updated_at, locked_by, locked_at')
    .eq('status', 'active');

  if (opts?.unlockedOnly) {
    const staleThreshold = new Date(Date.now() - 30 * 60_000).toISOString();
    query = query.or(`locked_by.is.null,locked_at.lt.${staleThreshold}`);
  }

  const { data } = await query
    .order('created_at', { ascending: false })
    .limit(10);

  if (!data || data.length === 0) return '\nNo active objectives.';

  // Priority scoring
  const scored = data.map((o: any) => {
    let score = 0;
    const plan = o.progress?.plan;
    const constraints = o.constraints || {};
    const now = Date.now();

    if (constraints.deadline) {
      const daysLeft = (new Date(constraints.deadline).getTime() - now) / 86_400_000;
      if (daysLeft < 0) score += 50;
      else if (daysLeft < 1) score += 40;
      else if (daysLeft < 3) score += 25;
      else if (daysLeft < 7) score += 10;
    }

    if (constraints.priority === 'critical') score += 35;
    else if (constraints.priority === 'high') score += 20;
    else if (constraints.priority === 'medium') score += 10;

    if (plan?.steps?.length) {
      const done = plan.steps.filter((s: any) => s.status === 'done').length;
      const pct = done / plan.steps.length;
      if (pct > 0 && pct < 1) score += 15;
      if (pct >= 0.7) score += 10;
    } else {
      score += 5;
    }

    const daysSinceUpdate = (now - new Date(o.updated_at).getTime()) / 86_400_000;
    if (daysSinceUpdate > 3) score += 8;
    if (daysSinceUpdate > 7) score += 12;

    if (plan?.has_failures) score += 10;

    return { ...o, _priority_score: score };
  });

  scored.sort((a: any, b: any) => b._priority_score - a._priority_score);

  return '\n\nActive objectives (sorted by priority ⬆️):\n' + scored.map((o: any, i: number) => {
    const plan = o.progress?.plan;
    const planInfo = plan
      ? ` | plan: ${plan.steps?.filter((s: any) => s.status === 'done').length}/${plan.total_steps} steps done`
      : ' | NO PLAN (needs decompose_objective)';
    const deadline = o.constraints?.deadline ? ` | ⏰ deadline: ${o.constraints.deadline}` : '';
    const priority = o.constraints?.priority ? ` | priority: ${o.constraints.priority}` : '';
    const nextStep = plan?.steps?.find((s: any) => s.status !== 'done');
    const nextInfo = nextStep ? ` | next: "${nextStep.description || nextStep.action}"` : '';
    return `- #${i + 1} [score:${o._priority_score}] [${o.id}] "${o.goal}"${planInfo}${nextInfo}${deadline}${priority}`;
  }).join('\n');
}

// ─── Heartbeat State ──────────────────────────────────────────────────────────

export async function loadHeartbeatState(supabase: any): Promise<string> {
  const { data } = await supabase
    .from('agent_memory')
    .select('value')
    .eq('key', 'heartbeat_state')
    .maybeSingle();

  if (!data?.value) return '';

  const state = data.value as HeartbeatState;
  const parts: string[] = ['\n\nHEARTBEAT STATE (from previous run):'];
  if (state.last_run) parts.push(`Last run: ${state.last_run}`);
  if (state.objectives_advanced?.length) parts.push(`Objectives advanced last time: ${state.objectives_advanced.join(', ')}`);
  if (state.next_priorities?.length) parts.push(`Priorities flagged: ${state.next_priorities.join(', ')}`);
  if (state.pending_actions?.length) parts.push(`Pending actions: ${state.pending_actions.join(', ')}`);
  if (state.token_usage) parts.push(`Previous token usage: ${state.token_usage.total_tokens} tokens`);
  if (state.iteration_count) parts.push(`Previous iterations: ${state.iteration_count}`);
  return parts.join('\n');
}

export async function saveHeartbeatState(supabase: any, state: HeartbeatState): Promise<void> {
  const { data: existing } = await supabase
    .from('agent_memory').select('id').eq('key', 'heartbeat_state').maybeSingle();

  const record = {
    value: state,
    category: 'context',
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    await supabase.from('agent_memory').update(record).eq('id', existing.id);
  } else {
    await supabase.from('agent_memory')
      .insert({ key: 'heartbeat_state', ...record, created_by: 'flowpilot' });
  }
}

// ─── Lazy Skill Instructions Loader ───────────────────────────────────────────

export async function fetchSkillInstructions(
  supabase: any,
  skillNames: string[],
  alreadyLoaded: Set<string>,
): Promise<string> {
  const toFetch = skillNames.filter(n => !alreadyLoaded.has(n));
  if (toFetch.length === 0) return '';

  const { data } = await supabase
    .from('agent_skills')
    .select('name, instructions')
    .in('name', toFetch)
    .not('instructions', 'is', null);

  if (!data || data.length === 0) return '';

  for (const s of data) alreadyLoaded.add(s.name);

  const lines = data.map((s: any) => `### ${s.name}\n${s.instructions}`);
  return `\n\nSKILL CONTEXT (instructions for skills you just used):\n${lines.join('\n\n')}`;
}

/** @deprecated No-op for backward compatibility */
export async function loadSkillInstructions(_supabase: any): Promise<string> {
  return '';
}

// ─── Skill Gating ─────────────────────────────────────────────────────────────

async function filterGatedSkills(supabase: any, skills: any[]): Promise<any[]> {
  const skillsWithGates = skills.filter((s: any) => s.requires && Array.isArray(s.requires) && s.requires.length > 0);
  if (skillsWithGates.length === 0) return skills;

  const enabledSkillNames = new Set(skills.map((s: any) => s.name));

  const [{ data: moduleSettings }, { data: integrationSettings }] = await Promise.all([
    supabase.from('site_settings').select('value').eq('key', 'modules').maybeSingle(),
    supabase.from('site_settings').select('value').eq('key', 'integrations').maybeSingle(),
  ]);

  const modules = moduleSettings?.value || {};
  const integrations = integrationSettings?.value || {};

  return skills.filter((s: any) => {
    if (!s.requires || !Array.isArray(s.requires) || s.requires.length === 0) return true;

    return s.requires.every((req: any) => {
      switch (req.type) {
        case 'skill':
          return enabledSkillNames.has(req.name);
        case 'integration':
          return integrations[req.key]?.enabled === true;
        case 'module':
          return modules[req.id]?.enabled === true;
        default:
          return true;
      }
    });
  });
}

// ─── Load Skills from Registry ────────────────────────────────────────────────

export async function loadSkillTools(
  supabase: any,
  scope: 'internal' | 'external',
  categories?: string[],
  budgetTier?: SkillBudgetTier,
): Promise<any[]> {
  const scopes = scope === 'internal' ? ['internal', 'both'] : ['external', 'both'];

  let query = supabase
    .from('agent_skills')
    .select('name, tool_definition, scope, requires, category')
    .eq('enabled', true)
    .in('scope', scopes);
  
  if (categories && categories.length > 0) {
    query = query.in('category', categories);
  }

  const [{ data: skills }, { data: policyRow }] = await Promise.all([
    query,
    supabase.from('agent_memory').select('value').eq('key', 'tool_policy').maybeSingle(),
  ]);

  const blockedSkills: Set<string> = new Set();
  if (policyRow?.value?.blocked && Array.isArray(policyRow.value.blocked)) {
    for (const name of policyRow.value.blocked) blockedSkills.add(name);
  }

  if (!skills?.length) return [];

  const unblockedSkills = blockedSkills.size > 0
    ? skills.filter((s: any) => !blockedSkills.has(s.name))
    : skills;

  let gatedSkills = await filterGatedSkills(supabase, unblockedSkills);

  // Tier 3: DROP — only keep top-used skills
  if (budgetTier === 'drop') {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 14);
    const { data: recentUsage } = await supabase
      .from('agent_activity')
      .select('skill_name')
      .gte('created_at', weekAgo.toISOString())
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(200);

    const usageCounts: Record<string, number> = {};
    for (const a of (recentUsage || [])) {
      if (a.skill_name) usageCounts[a.skill_name] = (usageCounts[a.skill_name] || 0) + 1;
    }

    const scored = gatedSkills.map((s: any) => ({
      ...s,
      _score: (usageCounts[s.name] || 0) + (s.category === 'content' || s.category === 'analytics' ? 2 : 0),
    }));
    scored.sort((a: any, b: any) => b._score - a._score);
    gatedSkills = scored.slice(0, 20);
    console.log(`[skill-budget] DROP tier: reduced to ${gatedSkills.length} skills from ${skills.length}`);
  }

  const tier = budgetTier || 'full';

  return gatedSkills
    .filter((s: any) => s.tool_definition?.function)
    .map((s: any) => {
      const td = s.tool_definition;
      if (!td.type) td.type = 'function';
      try {
        const fixProps = (props: any) => {
          if (!props || typeof props !== 'object') return;
          for (const [, val] of Object.entries(props)) {
            const p = val as any;
            if (!p.type && !p.enum && !p.items && !p.oneOf && !p.anyOf) {
              p.type = 'string';
            }
            if (p.type === 'array' && !p.items) {
              p.items = { type: 'string' };
            }
            if (p.type === 'object' && p.properties) {
              fixProps(p.properties);
            }
          }
        };
        fixProps(td?.function?.parameters?.properties);
        const params = td?.function?.parameters;
        if (params?.required && Array.isArray(params.required) && params.required.length === 0) {
          delete params.required;
        }
      } catch { /* safety net */ }

      if (tier === 'compact' || tier === 'drop') {
        return compactToolDefinition(td);
      }
      return td;
    });
}

// ─── Context Pruning ──────────────────────────────────────────────────────────

export async function pruneConversationHistory(
  messages: any[],
  supabase: any,
  opts?: { maxTokens?: number; summaryThreshold?: number }
): Promise<any[]> {
  const maxTokens = opts?.maxTokens || MAX_CONTEXT_TOKENS;
  const threshold = opts?.summaryThreshold || SUMMARY_THRESHOLD;

  let totalTokens = 0;
  for (const msg of messages) {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '');
    totalTokens += Math.ceil(content.length / 4);
    if (msg.tool_calls) {
      totalTokens += Math.ceil(JSON.stringify(msg.tool_calls).length / 4);
    }
  }

  if (totalTokens < threshold) {
    return messages;
  }

  console.log(`[context-pruning] Total ~${totalTokens} tokens exceeds ${threshold}, pruning...`);

  const systemMessages = messages.filter(m => m.role === 'system');
  const conversationMessages = messages.filter(m => m.role !== 'system');

  if (conversationMessages.length <= 6) {
    return messages;
  }

  const keepRecent = Math.min(10, Math.floor(conversationMessages.length / 2));
  const oldMessages = conversationMessages.slice(0, -keepRecent);
  const recentMessages = conversationMessages.slice(-keepRecent);

  await preCompactionFlush(oldMessages, supabase);

  const summary = await summarizeMessages(oldMessages, supabase);

  if (!summary) {
    return [...systemMessages, ...recentMessages];
  }

  const summaryMessage = {
    role: 'system' as const,
    content: `[CONVERSATION SUMMARY — Earlier messages condensed for context]\n${summary}`,
  };

  console.log(`[context-pruning] Pruned ${oldMessages.length} messages into summary (~${Math.ceil(summary.length / 4)} tokens)`);

  return [...systemMessages, summaryMessage, ...recentMessages];
}

async function preCompactionFlush(messages: any[], supabase: any): Promise<void> {
  try {
    const { apiKey, apiUrl, model } = await resolveAiConfig(supabase, 'fast');

    const transcript = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => `${m.role}: ${(m.content || '').slice(0, 400)}`)
      .join('\n')
      .slice(0, 8000);

    if (!transcript || transcript.length < 50) return;

    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: `You are a memory extraction agent. Extract discrete facts from this conversation that should be remembered long-term.\n\nOutput a JSON array of objects, each with:\n- "key": short identifier (snake_case, max 40 chars) \n- "value": the fact/preference/decision (1-2 sentences max)\n- "category": one of "preference", "context", "fact"\n\nFocus on:\n- User preferences and decisions\n- Configuration choices made\n- Business facts mentioned (names, IDs, URLs, numbers)\n- Explicit corrections or clarifications\n- Important outcomes or results\n\nSkip:\n- Greetings, small talk, acknowledgments\n- Things already obvious from the system prompt\n- Temporary/session-specific details\n\nReturn ONLY the JSON array. If nothing worth remembering, return [].`,
          },
          { role: 'user', content: transcript },
        ],
        max_tokens: 600,
        temperature: 0.1,
      }),
    });

    if (!resp.ok) {
      console.warn('[pre-compaction] AI extraction failed:', resp.status);
      return;
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || '[]';
    
    const cleaned = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    let facts: Array<{ key: string; value: string; category?: string }>;
    try {
      facts = JSON.parse(cleaned);
    } catch {
      console.warn('[pre-compaction] Failed to parse extraction result');
      return;
    }

    if (!Array.isArray(facts) || facts.length === 0) return;

    const toSave = facts.slice(0, 5);
    console.log(`[pre-compaction] Flushing ${toSave.length} facts to memory before pruning`);

    for (const fact of toSave) {
      if (!fact.key || !fact.value) continue;
      const prefixedKey = `conv_${fact.key}`;
      await handleMemoryWrite(supabase, {
        key: prefixedKey,
        value: fact.value,
        category: fact.category || 'context',
      });
    }
  } catch (err) {
    console.error('[pre-compaction] Flush failed (non-fatal):', err);
  }
}

async function summarizeMessages(messages: any[], supabase: any): Promise<string | null> {
  try {
    const { apiKey, apiUrl, model } = await resolveAiConfig(supabase, 'fast');

    const compactMessages = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => `${m.role}: ${(m.content || '').slice(0, 500)}`)
      .join('\n');

    if (!compactMessages) return null;

    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'Summarize this conversation history into a concise context summary (max 500 words). Preserve: key decisions, facts learned, actions taken, user preferences. Drop: greetings, filler, redundant details.',
          },
          { role: 'user', content: compactMessages.slice(0, 12000) },
        ],
        max_tokens: 800,
      }),
    });

    if (!resp.ok) return null;
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error('[context-pruning] Summarization failed:', err);
    return null;
  }
}

// ─── Skill Timeout Wrapper ───────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Skill '${label}' timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// ─── Tool Execution Router ───────────────────────────────────────────────────

export async function executeBuiltInTool(
  supabase: any,
  supabaseUrl: string,
  serviceKey: string,
  fnName: string,
  fnArgs: any,
  traceId?: string,
): Promise<any> {
  const execute = async () => {
    switch (fnName) {
      case 'memory_write': return handleMemoryWrite(supabase, fnArgs);
      case 'memory_read': return handleMemoryRead(supabase, fnArgs);
      case 'objective_update_progress': return handleObjectiveUpdateProgress(supabase, fnArgs);
      case 'objective_complete': return handleObjectiveComplete(supabase, fnArgs);
      case 'objective_delete': return handleObjectiveDelete(supabase, fnArgs);
      case 'memory_delete': return handleMemoryDelete(supabase, fnArgs);
      case 'skill_create': return handleSkillCreate(supabase, fnArgs);
      case 'skill_update': return handleSkillUpdate(supabase, fnArgs);
      case 'skill_list': return handleSkillList(supabase, fnArgs);
      case 'skill_disable': return handleSkillDisable(supabase, fnArgs);
      case 'skill_enable': return handleSkillEnable(supabase, fnArgs);
      case 'skill_delete': return handleSkillDelete(supabase, fnArgs);
      case 'skill_instruct': return handleSkillInstruct(supabase, fnArgs);
      case 'skill_read': return handleSkillRead(supabase, fnArgs);
      case 'soul_update': return handleSoulUpdate(supabase, fnArgs);
      case 'agents_update': return handleAgentsUpdate(supabase, fnArgs);
      case 'heartbeat_protocol_update': return handleHeartbeatProtocolUpdate(supabase, fnArgs);
      case 'automation_create': return handleAutomationCreate(supabase, fnArgs);
      case 'automation_list': return handleAutomationList(supabase, fnArgs);
      case 'automation_update': return handleAutomationUpdate(supabase, fnArgs);
      case 'automation_delete': return handleAutomationDelete(supabase, fnArgs);
      case 'reflect': return handleReflect(supabase, fnArgs);
      case 'decompose_objective': return handleDecomposeObjective(supabase, fnArgs);
      case 'advance_plan': return handleAdvancePlan(supabase, supabaseUrl, serviceKey, fnArgs);
      case 'propose_objective': return handleProposeObjective(supabase, fnArgs);
      case 'execute_automation': return handleExecuteAutomation(supabase, supabaseUrl, serviceKey, fnArgs);
      case 'workflow_create': return handleWorkflowCreate(supabase, fnArgs);
      case 'workflow_execute': return handleWorkflowExecute(supabase, supabaseUrl, serviceKey, fnArgs);
      case 'workflow_list': return handleWorkflowList(supabase);
      case 'workflow_update': return handleWorkflowUpdate(supabase, fnArgs);
      case 'workflow_delete': return handleWorkflowDelete(supabase, fnArgs);
      case 'delegate_task': return handleDelegateTask(supabase, supabaseUrl, serviceKey, fnArgs);
      case 'skill_pack_list': return handleSkillPackList(supabase);
      case 'skill_pack_install': return handleSkillPackInstall(supabase, fnArgs);
      case 'chain_skills': return handleChainSkills(supabase, supabaseUrl, serviceKey, fnArgs);
      case 'evaluate_outcomes': return handleEvaluateOutcomes(supabase, fnArgs);
      case 'record_outcome': return handleRecordOutcome(supabase, fnArgs);
    }

    // Not a built-in → delegate to agent-execute
    const body: Record<string, any> = { skill_name: fnName, arguments: fnArgs, agent_type: 'flowpilot' };
    if (traceId) body.trace_id = traceId;
    const response = await fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error(`[reason] trace=${traceId} agent-execute ${fnName} HTTP ${response.status}: ${errText.slice(0, 200)}`);
      return { error: `Skill ${fnName} failed: HTTP ${response.status}`, status: 'failed' };
    }
    return response.json();
  };

  // Wrap with timeout
  try {
    return await withTimeout(execute(), SKILL_TIMEOUT_MS, fnName);
  } catch (err: any) {
    console.error(`[reason] trace=${traceId} ${fnName} error:`, err.message);
    return { error: err.message, status: 'failed' };
  }
}

export function isBuiltInTool(name: string): boolean {
  return BUILT_IN_TOOL_NAMES.has(name);
}

// ─── Non-Streaming Reason Loop ────────────────────────────────────────────────

export async function reason(
  supabase: any,
  messages: any[],
  config: ReasonConfig,
): Promise<ReasonResult> {
  const startTime = Date.now();
  const maxIterations = config.maxIterations || 6;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const traceId = config.traceId || generateTraceId(config.lockOwner || 'reason');
  console.log(`[reason] Starting run trace=${traceId} lane=${config.lockLane || 'none'} tier=${config.tier || 'fast'}`);

  const lane = config.lockLane;
  if (lane) {
    const acquired = await tryAcquireLock(supabase, lane, config.lockOwner || 'reason', 300);
    if (!acquired) {
      console.warn(`[reason] trace=${traceId} Lane '${lane}' is locked — skipping`);
      return {
        response: 'Another agent process is currently running on this context. Please try again in a moment.',
        actionsExecuted: [],
        skillResults: [],
        durationMs: Date.now() - startTime,
        skippedDueToLock: true,
        traceId,
      };
    }
  }

  try {
    const { apiKey, apiUrl, model } = await resolveAiConfig(supabase, config.tier || 'fast');
    const tokenBudget = config.tokenBudget || DEFAULT_TOKEN_BUDGET;

    const initialTier = resolveSkillBudgetTier(tokenBudget, 0);
    const builtInTools = getBuiltInTools(config.builtInToolGroups || ['memory', 'objectives', 'reflect']);
    let currentSkillTier: SkillBudgetTier = initialTier;
    let skillTools = await loadSkillTools(supabase, config.scope, config.skillCategories, currentSkillTier);
    console.log(`[reason] trace=${traceId} Loaded ${builtInTools.length} built-in + ${skillTools.length} skill tools (tier: ${currentSkillTier})${config.skillCategories ? ` (categories: ${config.skillCategories.join(',')})` : ' (ALL categories)'}`);
    let allTools = [...builtInTools, ...(config.additionalTools || []), ...skillTools];

    let conversationMessages = await pruneConversationHistory(messages, supabase);
    const actionsExecuted: string[] = [];
    const skillResults: ReasonResult['skillResults'] = [];
    let finalResponse = '';
    let totalTokenUsage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const loadedInstructions = new Set<string>();
    let consecutiveEmptyTurns = 0;
    let memoryFlushed = false;
    const skillFailureCounts: Record<string, number> = {};  // Circuit breaker state
    const circuitBrokenSkills = new Set<string>();           // Skills tripped by circuit breaker
    const recentToolCalls: string[] = [];                    // Same-action detection buffer

    for (let i = 0; i < maxIterations; i++) {
      if (totalTokenUsage.total_tokens >= tokenBudget) {
        console.log(`[reason] trace=${traceId} Token budget reached (${totalTokenUsage.total_tokens}/${tokenBudget})`);
        finalResponse = finalResponse || `Heartbeat complete. Used ${totalTokenUsage.total_tokens} tokens in ${i} iterations.`;
        break;
      }

      const remainingBudget = tokenBudget - totalTokenUsage.total_tokens;
      if (remainingBudget < tokenBudget * 0.05 && i > 0) {
        console.log(`[reason] trace=${traceId} Budget nearly exhausted (${remainingBudget} remaining), stopping early`);
        finalResponse = finalResponse || `Heartbeat complete. ${actionsExecuted.length} actions in ${i} iterations.`;
        break;
      }

      // OpenClaw §5.4 — Pre-Budget Memory Flush
      if (!memoryFlushed && totalTokenUsage.total_tokens > tokenBudget * MEMORY_FLUSH_THRESHOLD && i > 1) {
        memoryFlushed = true;
        console.log(`[reason] trace=${traceId} Budget at ${Math.round(totalTokenUsage.total_tokens / tokenBudget * 100)}% — flushing context to memory`);
        try {
          const accomplishments = actionsExecuted.length > 0
            ? `Actions: ${actionsExecuted.join(', ')}. Skills: ${skillResults.map(r => `${r.skill}(${r.status})`).join(', ')}`
            : 'No actions yet';
          await handleMemoryWrite(supabase, {
            key: `heartbeat_flush_${new Date().toISOString().slice(0, 10)}`,
            value: `Pre-budget flush at ${totalTokenUsage.total_tokens}/${tokenBudget} tokens. ${accomplishments}. Partial response: ${(finalResponse || '').slice(0, 300)}`,
            category: 'context',
          });
          conversationMessages.push({
            role: 'system',
            content: `⚠️ Token budget at ${Math.round(totalTokenUsage.total_tokens / tokenBudget * 100)}%. Context has been saved to memory. Focus on completing the most important remaining action, then summarize.`,
          });
        } catch (flushErr) {
          console.warn(`[reason] trace=${traceId} Memory flush failed (non-fatal):`, flushErr);
        }
      }

      // Dynamic skill tier degradation
      const newTier = resolveSkillBudgetTier(tokenBudget, totalTokenUsage.total_tokens);
      if (newTier !== currentSkillTier) {
        console.log(`[reason] trace=${traceId} Skill budget tier changed: ${currentSkillTier} → ${newTier} at ${Math.round(totalTokenUsage.total_tokens / tokenBudget * 100)}%`);
        currentSkillTier = newTier;
        skillTools = await loadSkillTools(supabase, config.scope, config.skillCategories, currentSkillTier);
        allTools = [...builtInTools, ...(config.additionalTools || []), ...skillTools];
        console.log(`[reason] trace=${traceId} Reloaded ${skillTools.length} skill tools at ${currentSkillTier} tier`);
      }

      const aiResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: conversationMessages,
          tools: allTools.length > 0 ? allTools : undefined,
          tool_choice: allTools.length > 0 ? 'auto' : undefined,
        }),
      });

      if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        console.error(`[reason] trace=${traceId} AI error:`, aiResponse.status, errText);
        throw new Error(`AI provider error: ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json();

      const usage = aiData.usage || {};
      const iterTokens: TokenUsage = {
        prompt_tokens: usage.prompt_tokens || 0,
        completion_tokens: usage.completion_tokens || 0,
        total_tokens: (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
      };
      totalTokenUsage = {
        prompt_tokens: totalTokenUsage.prompt_tokens + iterTokens.prompt_tokens,
        completion_tokens: totalTokenUsage.completion_tokens + iterTokens.completion_tokens,
        total_tokens: totalTokenUsage.total_tokens + iterTokens.total_tokens,
      };

      const choice = aiData.choices?.[0];
      if (!choice) throw new Error('No AI response');

      const msg = choice.message;

      if (!msg.tool_calls?.length) {
        finalResponse = msg.content || 'Done.';
        break;
      }

      consecutiveEmptyTurns = 0;
      
      conversationMessages.push(msg);

      const calledSkillNames: string[] = [];
      let turnErrors = 0;

      for (const tc of msg.tool_calls) {
        const fnName = tc.function.name;
        let fnArgs: any;
        try { fnArgs = JSON.parse(tc.function.arguments || '{}'); } catch { fnArgs = {}; }

        // Circuit breaker — skip skills that have tripped
        if (circuitBrokenSkills.has(fnName)) {
          console.warn(`[reason] trace=${traceId} Circuit broken for '${fnName}' — skipping`);
          conversationMessages.push({
            role: 'tool', tool_call_id: tc.id,
            content: JSON.stringify({ error: `Skill '${fnName}' is circuit-broken after ${CIRCUIT_BREAKER_THRESHOLD} consecutive failures. Try a different approach.`, status: 'circuit_broken' }),
          });
          turnErrors++;
          continue;
        }

        // Same-action detection
        recentToolCalls.push(fnName);
        if (recentToolCalls.length > SAME_ACTION_LIMIT) recentToolCalls.shift();
        if (recentToolCalls.length === SAME_ACTION_LIMIT && recentToolCalls.every(n => n === fnName)) {
          console.warn(`[reason] trace=${traceId} Same tool '${fnName}' called ${SAME_ACTION_LIMIT}x consecutively — breaking`);
          conversationMessages.push({
            role: 'tool', tool_call_id: tc.id,
            content: JSON.stringify({ error: `Loop detected: '${fnName}' called ${SAME_ACTION_LIMIT} times in a row. Try a different approach or summarize.`, status: 'loop_detected' }),
          });
          turnErrors++;
          continue;
        }

        console.log(`[reason] trace=${traceId} iter=${i} Executing: ${fnName}`, JSON.stringify(fnArgs).slice(0, 200));
        actionsExecuted.push(fnName);

        let result: any;
        let retryCount = 0;
        let lastError = '';

        // Self-Repair Phase 1: retry with param variation on failure
        while (retryCount <= MAX_SELF_REPAIR_RETRIES) {
          try {
            const argsToUse = retryCount === 0 ? fnArgs : { ...fnArgs, _retry: retryCount, _prev_error: lastError };
            result = await executeBuiltInTool(supabase, supabaseUrl, serviceKey, fnName, argsToUse, traceId);
          } catch (err: any) {
            result = { error: err.message };
          }

          const failed = !!(result?.error || result?.status === 'failed');
          if (!failed || retryCount >= MAX_SELF_REPAIR_RETRIES) break;

          lastError = result?.error || 'unknown';
          retryCount++;
          console.log(`[reason] trace=${traceId} Self-repair retry ${retryCount}/${MAX_SELF_REPAIR_RETRIES} for '${fnName}': ${lastError}`);
        }

        const failed = !!(result?.error || result?.status === 'failed');
        if (failed) {
          turnErrors++;
          // Circuit breaker tracking
          skillFailureCounts[fnName] = (skillFailureCounts[fnName] || 0) + 1;
          if (skillFailureCounts[fnName] >= CIRCUIT_BREAKER_THRESHOLD) {
            circuitBrokenSkills.add(fnName);
            console.warn(`[reason] trace=${traceId} Circuit breaker tripped for '${fnName}' after ${skillFailureCounts[fnName]} failures`);
          }
          }
        } else {
          // Reset failure count on success
          skillFailureCounts[fnName] = 0;
        }

        if (!isBuiltInTool(fnName)) {
          skillResults.push({ skill: fnName, status: failed ? 'failed' : 'success', result: result?.result || result });
          calledSkillNames.push(fnName);
        }

        conversationMessages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
      }

      // Anti-runaway guard
      if (turnErrors === msg.tool_calls.length && msg.tool_calls.length > 0) {
        consecutiveEmptyTurns++;
        if (consecutiveEmptyTurns >= 2) {
          console.warn(`[reason] trace=${traceId} ${consecutiveEmptyTurns} consecutive error turns — breaking loop`);
          conversationMessages.push({ role: 'system', content: 'Multiple consecutive tool errors detected. Stop calling failing tools and summarize what you accomplished.' });
        }
      }

      // Report circuit-broken skills in resource meter
      const brokenList = circuitBrokenSkills.size > 0 ? ` | Circuit-broken: ${[...circuitBrokenSkills].join(', ')}` : '';

      // Resource Awareness
      const budgetPct = Math.round((totalTokenUsage.total_tokens / tokenBudget) * 100);
      const iterationsLeft = maxIterations - i - 1;
      if (i > 0) {
        conversationMessages.push({
          role: 'system',
          content: `[Resource meter] Iteration ${i + 1}/${maxIterations} | Tokens: ${totalTokenUsage.total_tokens.toLocaleString()}/${tokenBudget.toLocaleString()} (${budgetPct}%) | Errors this turn: ${turnErrors}/${msg.tool_calls.length} | Remaining iterations: ${iterationsLeft}${brokenList}`,
        });
      }

      // Lazy instruction loading
      if (calledSkillNames.length > 0) {
        const instrContext = await fetchSkillInstructions(supabase, calledSkillNames, loadedInstructions);
        if (instrContext) {
          conversationMessages.push({ role: 'system', content: instrContext });
        }
      }
    }

    console.log(`[reason] trace=${traceId} Complete: ${actionsExecuted.length} actions, ${totalTokenUsage.total_tokens} tokens, ${Date.now() - startTime}ms`);

    return {
      response: finalResponse,
      actionsExecuted,
      skillResults,
      durationMs: Date.now() - startTime,
      tokenUsage: totalTokenUsage,
      traceId,
    };
  } finally {
    if (lane) {
      await releaseLock(supabase, lane);
    }
  }
}
