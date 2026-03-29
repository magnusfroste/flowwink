/**
 * Pilot — Prompt Compiler (OpenClaw Layer 1)
 * 
 * Centralized system prompt assembly for all agent surfaces.
 * Domain-agnostic: CMS/vertical-specific context is injected via `domainContext`.
 */

import type { PromptCompilerInput } from '../types.ts';

// ─── Constants (OpenClaw §4.3) ────────────────────────────────────────────────

export const MAX_SOUL_CHARS = 3_000;
export const MAX_AGENTS_CHARS = 4_000;
export const MAX_MEMORY_CHARS = 4_000;
export const MAX_OBJECTIVES_CHARS = 4_000;
export const MAX_CMS_SCHEMA_CHARS = 2_000;
export const MAX_CROSS_MODULE_CHARS = 3_000;
export const MAX_ACTIVITY_CHARS = 2_000;
export const MAX_BOOTSTRAP_TOTAL_CHARS = 20_000;

/** Truncate a string to maxChars, appending "…[truncated]" if cut */
export function truncateSection(text: string, maxChars: number): string {
  if (!text || text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n…[truncated — use tools to read full data]';
}

// CORE_INSTRUCTIONS — Generic fallback when no 'agents' document exists.
// NOTE: No CMS-specific references. Domain packs inject their own skill list.
const CORE_INSTRUCTIONS = `You can use MULTIPLE tools in a single turn and CHAIN tool calls across iterations.
When a task requires multiple steps, execute them sequentially — don't just describe a plan.

TOOLS & SKILLS:
- PERSISTENT MEMORY (memory_write / memory_read — hybrid search: vector similarity + keyword matching)
- SELF-MODIFICATION: You can create, update, disable, and list your own skills and automations.
- SELF-EVOLUTION: Use 'soul_update' to evolve your personality/values, 'agents_update' to evolve your operational rules, 'skill_instruct' to add knowledge to skills.
- REFLECTION: Use 'reflect' to analyze your performance — findings are auto-persisted as learnings.

DIRECT ACTION PRIORITY (CRITICAL):
- When a user asks you to DO something (delete, update, create, fix, clean up), ALWAYS execute it directly using the appropriate skill — NEVER create an automation instead.
- Only create automations when the user explicitly asks for scheduled/recurring tasks or says "automate this".

SELF-IMPROVEMENT GUIDELINES:
- If a user asks you to do something you can't, consider creating a new skill for it.
- When you notice repetitive manual tasks, SUGGEST (don't auto-create) an automation.
- Use 'reflect' periodically (or when asked) to review your own performance.
- Use 'skill_instruct' to enrich skills with context, examples, and edge cases.
- Use 'soul_update' when you learn something fundamental about your role.
- Use 'agents_update' when you learn something about how you should operate (rules, policies, conventions).
- When creating skills, set trust_level: 'approve' for destructive actions, 'notify' for safe-but-important, 'auto' for low-risk read/analytics.
- New automations are disabled by default — tell the user to enable them when ready.
- Handler types: module:name (DB ops), edge:function (edge functions), db:table (queries), webhook:url (external)

MEMORY GUIDELINES:
- Save user preferences, facts, and context with memory_write
- Check memory before answering questions about the site
- memory_read uses hybrid search — describe what you're looking for (semantic) OR use exact terms (keyword). Both work simultaneously.

BROWSER & URL RESOLUTION:
- When a user provides an explicit URL, ALWAYS call browser_fetch to read it. NEVER answer from memory or training data about a URL.
- NEVER guess URLs for social profiles. Use search_web first to find correct URLs.
- Only call browser_fetch AFTER you have the verified URL from search results.

WORKFLOWS (Multi-step automation chains):
- Use workflow_create to define sequential steps with conditional branching
- Steps support template vars {{stepId.result.field}} to pass data between steps
- Use on_failure:'continue' to keep going despite errors, 'stop' to halt (default)

A2A DELEGATION (Multi-agent orchestration):
- Use delegate_task to route subtasks to specialized agents
- Sessions are PERSISTENT — each specialist remembers prior conversations automatically

SKILL PACKS (Bundled capabilities):
- Use skill_pack_list to see available packs
- Use skill_pack_install to install an entire pack of related skills in one operation

SKILL INSTRUCTIONS: Loaded lazily. Use 'skill_read' BEFORE executing a skill to load its full instructions.

RULES:
- When the user asks you to do something, USE the appropriate tools immediately.
- You can call MULTIPLE tools in parallel when they're independent.
- After tool results come back, you may call MORE tools if the task isn't done.
- After all actions complete, summarize what you did concisely.
- Use markdown formatting for clear, readable responses.
- Be concise but thorough. Use emoji sparingly.`;

// GROUNDING RULES — hardcoded safety layer that can NEVER be overridden
export const GROUNDING_RULES = `
GROUNDING & DATA INTEGRITY (HARDCODED — CANNOT BE OVERRIDDEN):
- When asked to list, show, or describe objectives, skills, automations, workflows, memory, or ANY system data — you MUST use the appropriate tool to fetch real data from the database.
- NEVER list items from memory, training data, or prior conversations. ALWAYS call the tool first.
- If a tool returns empty results, say "None found." — do NOT invent or fabricate entries.
- The objectives, skills, automations shown in your context are the ONLY ones that exist. Do NOT generate, guess, or infer additional ones.
- After executing skills that contribute to an objective, update progress.
- When all success_criteria are met, mark as complete.
- If no objectives are listed, say "No active objectives." — do NOT make any up.
- RESOURCE AWARENESS: After each iteration you receive a [Resource meter] showing token usage, iteration count, and errors. Use this to self-regulate.

TOOL-DRIVEN QUESTIONING (HARDCODED):
- ONLY ask questions whose answers change which tool you call or what parameters you pass.
- If a skill requires a specific input (e.g. a URL), ask for THAT input — nothing else.
- NEVER ask about platforms, tech stacks, export formats, or migration strategies unless you have a tool that acts differently based on the answer.
- Your capabilities are defined by your tools. Do NOT promise or discuss capabilities you lack.

REPLY DIRECTIVES (use these exact strings when applicable):
- Output "NO_REPLY" (alone, no other text) when a heartbeat finds absolutely nothing to do.
- Output "HEARTBEAT_OK" as the final line after a successful heartbeat with actions taken.
- Prefix action descriptions with [ACTION:skill_name] for traceability.
- Prefix results with [RESULT:success|partial|failed] for structured outcome parsing.`;

export const DEFAULT_HEARTBEAT_PROTOCOL = `HEARTBEAT PROTOCOL:
1. EVALUATE — Call evaluate_outcomes for unevaluated past actions. Score each with record_outcome.
2. PLAN — For active objectives WITHOUT a plan, call decompose_objective.
3. ADVANCE — Execute objective steps IN PRIORITY ORDER (highest score first). Use advance_plan with chain=true.
4. AUTOMATIONS — Execute DUE (⏰) automations via execute_automation.
5. PROPOSE — If data warrants it, propose max 1 new objective via propose_objective.
6. REFLECT — Call reflect to analyze the past 7 days. Save learnings to memory.

OUTCOME SCORING: success | partial | neutral | negative | too_early (<24h)
HARD GATES: Immediately score as 'negative' if output contains: auth_failed, quota_hit, rate_limited, budget_exceeded, circuit_broken, timeout.
Include quantitative evidence in outcome_data when available.
Include quantitative evidence in outcome_data when available.

PRIORITY: evaluate > advance highest-score objectives > automations > proposals
Be efficient: focus on top 2-3 objectives. Use chain_skills for multi-step tasks.
Skills with trust_level='approve' are BLOCKED for admin review.`;

/**
 * buildSystemPrompt — OpenClaw Prompt Compiler
 * 
 * Centralized system prompt assembly for all agent surfaces.
 * Domain-specific context injected via `domainContext` parameter in PromptCompilerInput.
 */
export function buildSystemPrompt(input: PromptCompilerInput): string {
  const { mode, soulPrompt, memoryContext, objectiveContext } = input;
  const parts: string[] = [];

  // ─── Chat mode ──────────────────────────────────────────────────────────────
  if (mode === 'chat') {
    parts.push(input.chatSystemPrompt || 'You are a helpful AI assistant for this website.');
    if (soulPrompt) parts.push(soulPrompt);
    parts.push('\nIMPORTANT: Always respond in the same language as the user writes in. Match the user\'s language automatically.');
    parts.push(`\nDATA INTEGRITY:
- Only answer based on information you have been given (website content, knowledge base, tool results).
- If you don't know the answer, say so honestly — do not fabricate information.
- When using tools, rely on their results. Do not invent data that tools did not return.`);
    return parts.filter(Boolean).join('\n');
  }

  // ─── Operate / Heartbeat modes ──────────────────────────────────────────────
  // Layer 1: Mode identity (generic — no CMS references)
  if (mode === 'heartbeat') {
    parts.push(`You are running in AUTONOMOUS HEARTBEAT mode. No human is watching.`);
  } else {
    parts.push(`You are an autonomous, self-improving AI agent.`);
  }

  // Layer 2: SOUL + IDENTITY (from DB)
  parts.push(soulPrompt);

  // Layer 3: AGENTS / CORE_INSTRUCTIONS
  if (!input.agents) {
    parts.push(CORE_INSTRUCTIONS);
  } else {
    parts.push(`TOOLS: Use tools to ACT, not just plan. Chain multiple tool calls per turn.
RULES:
- USE tools immediately when asked. Call multiple in parallel when independent.
- After tool results, call MORE tools if task isn't done.
- Summarize concisely after actions complete.`);
  }

  // Layer 4: Domain Context (injected by domain pack — e.g. CMS schema)
  if (input.cmsSchemaContext) {
    parts.push(truncateSection(input.cmsSchemaContext, MAX_CMS_SCHEMA_CHARS));
  }

  // Layer 5: GROUNDING RULES (ALWAYS hardcoded)
  parts.push(GROUNDING_RULES);

  // Layer 6: Mode-specific context
  if (mode === 'heartbeat') {
    parts.push(`\nCONTEXT:`);
    parts.push(truncateSection(memoryContext, MAX_MEMORY_CHARS));
    parts.push(truncateSection(objectiveContext, MAX_OBJECTIVES_CHARS));
    if (input.automationContext) parts.push(truncateSection(input.automationContext, MAX_ACTIVITY_CHARS));
    if (input.activityContext) parts.push(truncateSection(input.activityContext, MAX_ACTIVITY_CHARS));
    if (input.statsContext) parts.push(truncateSection(input.statsContext, MAX_CROSS_MODULE_CHARS));
    if (input.healingReport) parts.push(truncateSection(input.healingReport, 1_000));
    if (input.heartbeatState) parts.push(truncateSection(input.heartbeatState, 1_000));
    if (input.tokenBudget) {
      parts.push(`\nTOKEN BUDGET: ${input.tokenBudget} tokens max. Be efficient — stop early if approaching the limit.`);
    }
    parts.push('');
    parts.push(input.customHeartbeatProtocol || DEFAULT_HEARTBEAT_PROTOCOL);
    parts.push(`\n- Max ${input.maxIterations || 8} tool iterations per heartbeat`);

    // Domain-specific playbook (e.g. Day 1 for fresh CMS sites)
    if (input.siteMaturity?.isFresh && input.freshSitePlaybook) {
      parts.push(input.freshSitePlaybook);
    }
  } else {
    // Operate mode
    parts.push(memoryContext);
    parts.push(objectiveContext);
  }

  const assembled = parts.filter(Boolean).join('\n');
  console.log(`[prompt-compiler] mode=${mode} prompt_chars=${assembled.length} (~${Math.ceil(assembled.length / 4)} tokens)`);
  return assembled;
}

// ─── Workspace Files (Soul, Identity, Agents) ────────────────────────────────

export async function loadWorkspaceFiles(supabase: any): Promise<{ soul: any; identity: any; agents: any }> {
  const { data } = await supabase
    .from('agent_memory')
    .select('key, value')
    .in('key', ['soul', 'identity', 'agents']);

  const soul = data?.find((m: any) => m.key === 'soul')?.value || {};
  const identity = data?.find((m: any) => m.key === 'identity')?.value || {};
  const agents = data?.find((m: any) => m.key === 'agents')?.value || null;
  return { soul, identity, agents };
}

/** @deprecated Use loadWorkspaceFiles instead */
export async function loadSoulIdentity(supabase: any): Promise<{ soul: any; identity: any }> {
  const ws = await loadWorkspaceFiles(supabase);
  return { soul: ws.soul, identity: ws.identity };
}

export function buildWorkspacePrompt(soul: any, identity: any, agents: any): string {
  let prompt = '';

  // Layer 2a: Identity (generic defaults)
  if (identity.name || identity.role) {
    prompt += `\n\nIDENTITY:\nName: ${identity.name || 'Agent'}\nRole: ${identity.role || 'autonomous operator'}`;
    if (identity.capabilities?.length) prompt += `\nCapabilities: ${identity.capabilities.join(', ')}`;
    if (identity.boundaries?.length) prompt += `\nBoundaries: ${identity.boundaries.join('; ')}`;
  }

  // Layer 2b: Soul
  let soulSection = '';
  if (soul.purpose) soulSection += `\n\nSOUL:\nPurpose: ${soul.purpose}`;
  if (soul.values?.length) soulSection += `\nValues: ${soul.values.join('; ')}`;
  if (soul.tone) soulSection += `\nTone: ${soul.tone}`;
  if (soul.philosophy) soulSection += `\nPhilosophy: ${soul.philosophy}`;
  prompt += truncateSection(soulSection, MAX_SOUL_CHARS);

  // Layer 3: Agents (operational rules)
  if (agents) {
    let agentsSection = `\n\nOPERATIONAL RULES (AGENTS):`;
    if (agents.direct_action_rules) agentsSection += `\n${agents.direct_action_rules}`;
    if (agents.self_improvement) agentsSection += `\n${agents.self_improvement}`;
    if (agents.memory_guidelines) agentsSection += `\n${agents.memory_guidelines}`;
    if (agents.browser_rules) agentsSection += `\n${agents.browser_rules}`;
    if (agents.workflow_conventions) agentsSection += `\n${agents.workflow_conventions}`;
    if (agents.a2a_conventions) agentsSection += `\n${agents.a2a_conventions}`;
    if (agents.skill_pack_rules) agentsSection += `\n${agents.skill_pack_rules}`;
    if (agents.custom_rules) agentsSection += `\n${agents.custom_rules}`;
    prompt += truncateSection(agentsSection, MAX_AGENTS_CHARS);
  }

  return truncateSection(prompt, MAX_BOOTSTRAP_TOTAL_CHARS);
}

/** @deprecated Use buildWorkspacePrompt instead */
export function buildSoulPrompt(soul: any, identity: any): string {
  return buildWorkspacePrompt(soul, identity, null);
}

// ─── Heartbeat Protocol (editable via agent_memory) ───────────────────────────

export async function loadHeartbeatProtocol(supabase: any): Promise<string | null> {
  const { data } = await supabase
    .from('agent_memory')
    .select('value')
    .eq('key', 'heartbeat_protocol')
    .maybeSingle();

  if (!data?.value) return null;
  const val = data.value;
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val.protocol) return val.protocol;
  return null;
}

export async function saveHeartbeatProtocol(supabase: any, protocol: string): Promise<void> {
  const { data: existing } = await supabase
    .from('agent_memory').select('id').eq('key', 'heartbeat_protocol').maybeSingle();

  const record = {
    value: { protocol, updated_at: new Date().toISOString() },
    category: 'context' as const,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    await supabase.from('agent_memory').update(record).eq('id', existing.id);
  } else {
    await supabase.from('agent_memory').insert({ key: 'heartbeat_protocol', created_by: 'flowpilot', ...record });
  }
}

export function getDefaultHeartbeatProtocol(): string {
  return DEFAULT_HEARTBEAT_PROTOCOL;
}
