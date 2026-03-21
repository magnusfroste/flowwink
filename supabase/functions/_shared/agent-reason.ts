import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Agent Reason — Unified LLM Orchestration Engine
 *
 * The single reasoning core shared by all FlowPilot surfaces:
 *   - agent-operate (interactive, streaming)
 *   - flowpilot-heartbeat (autonomous, non-streaming)
 *   - chat-completion delegates skill execution here too
 *
 * Consolidates: AI config, built-in tools, tool loop, memory/objectives,
 * soul/identity, reflection, self-modification, plan decomposition,
 * self-healing, context pruning, vector memory, and prompt compilation.
 *
 * NOT a serve() handler — this is an importable module.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type PromptMode = 'operate' | 'heartbeat' | 'chat';

export interface PromptCompilerInput {
  mode: PromptMode;
  soulPrompt: string;
  /** @deprecated — use agentsDoc instead for layered prompt */
  agents?: any;
  memoryContext: string;
  objectiveContext: string;
  // Heartbeat-specific
  activityContext?: string;
  statsContext?: string;
  automationContext?: string;
  healingReport?: string;
  maxIterations?: number;
  // Autonomy features
  cmsSchemaContext?: string;
  heartbeatState?: string;
  tokenBudget?: number;
  siteMaturity?: SiteMaturity;
  /** Custom heartbeat protocol loaded from agent_memory. Falls back to HEARTBEAT_PROTOCOL constant. */
  customHeartbeatProtocol?: string;
  // Chat-specific
  chatSystemPrompt?: string;
}

export interface ReasonConfig {
  scope: 'internal' | 'external';
  maxIterations?: number;
  systemPromptOverride?: string;
  extraContext?: string;
  builtInToolGroups?: Array<'memory' | 'objectives' | 'self-mod' | 'reflect' | 'soul' | 'planning' | 'automations-exec' | 'workflows' | 'a2a' | 'skill-packs'>;
  additionalTools?: any[];
  tier?: AiTier;
  /** Lane name for concurrency guard. If set, only one agent can run on this lane at a time. */
  lockLane?: string;
  /** Identifier for who holds the lock (e.g. 'heartbeat', 'chat', 'operate') */
  lockOwner?: string;
}

export interface ReasonResult {
  response: string;
  actionsExecuted: string[];
  skillResults: Array<{ skill: string; status: string; result: any }>;
  durationMs: number;
  tokenUsage?: TokenUsage;
  /** True if the run was skipped because another agent process holds the lock */
  skippedDueToLock?: boolean;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface HeartbeatState {
  last_run: string;
  objectives_advanced: string[];
  next_priorities: string[];
  pending_actions: string[];
  token_usage: TokenUsage;
  iteration_count: number;
}

export interface SiteMaturity {
  isFresh: boolean;
  blogPosts: number;
  leads: number;
  subscribers: number;
  pageViews: number;
  contentResearch: number;
  contentProposals: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SELF_HEAL_THRESHOLD = 3;
const MAX_CHAIN_DEPTH = 4;
const MAX_CONTEXT_TOKENS = 80_000;
const SUMMARY_THRESHOLD = 60_000;
const DEFAULT_TOKEN_BUDGET = 50_000; // Max tokens per heartbeat session

const BUILT_IN_TOOL_NAMES = new Set([
  'memory_write', 'memory_read', 'memory_delete',
  'objective_update_progress', 'objective_complete', 'objective_delete',
  'skill_create', 'skill_update', 'skill_list', 'skill_disable', 'skill_enable', 'skill_delete',
  'skill_instruct',
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

// ─── Prompt Compiler (OpenClaw Layer 1 — Centralized) ─────────────────────────

// CORE_INSTRUCTIONS serves as FALLBACK when no 'agents' document exists in agent_memory.
// Once the agents document is seeded, it takes precedence (see buildWorkspacePrompt).
const CORE_INSTRUCTIONS = `You can use MULTIPLE tools in a single turn and CHAIN tool calls across iterations.
When a task requires multiple steps, execute them sequentially — don't just describe a plan.

TOOLS & SKILLS:
- CMS skills: blog posts, leads, analytics, bookings, newsletters, etc.
- PERSISTENT MEMORY (memory_write / memory_read — hybrid search: vector similarity + keyword matching)
- SELF-MODIFICATION: You can create, update, disable, and list your own skills and automations.
- SELF-EVOLUTION: Use 'soul_update' to evolve your personality/values, 'agents_update' to evolve your operational rules, 'skill_instruct' to add knowledge to skills.
- REFLECTION: Use 'reflect' to analyze your performance — findings are auto-persisted as learnings.

DIRECT ACTION PRIORITY (CRITICAL):
- When a user asks you to DO something (delete, update, create, fix, clean up), ALWAYS execute it directly using the appropriate skill — NEVER create an automation instead.
- Only create automations when the user explicitly asks for scheduled/recurring tasks or says "automate this".
- Example: "remove duplicates" → execute manage_consultants with find_duplicates + delete. NOT create an automation.
- Example: "run this every Monday" → THEN create an automation with cron schedule.

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
- When a user provides an explicit URL (starts with http/https or a domain), ALWAYS call browser_fetch to read it. NEVER answer from memory or training data about a URL — always fetch it live.
- NEVER guess URLs for social profiles (LinkedIn, X, GitHub). People's profile slugs are unpredictable.
- When asked to fetch someone's LinkedIn/social profile WITHOUT a URL, FIRST use search_web to find the correct URL.
- Only call browser_fetch AFTER you have the verified URL from search results.
- If the user says "look at", "read", "fetch", "check", "summarize" + a URL → browser_fetch immediately.

WORKFLOWS (Multi-step automation chains):
- Use workflow_create to define sequential steps with conditional branching
- Steps support template vars {{stepId.result.field}} to pass data between steps
- Use on_failure:'continue' to keep going despite errors, 'stop' to halt (default)
- Use workflow_execute to run a workflow with optional input context
- Use workflow_list to see all registered workflows

A2A DELEGATION (Multi-agent orchestration):
- Use delegate_task to route subtasks to specialized agents
- Built-in specialists: 'seo', 'content', 'sales', 'analytics', 'email'
- Returns the specialist's focused analysis or content — then use it in your next action
- Register custom agents in memory with key 'agent:name' and value {system_prompt}

SKILL PACKS (Bundled capabilities):
- Use skill_pack_list to see available packs (E-Commerce, Content Marketing, CRM Nurture)
- Use skill_pack_install to install an entire pack of related skills in one operation

SKILL INSTRUCTIONS: Loaded lazily — you'll receive specific skill instructions after you use each skill.

RULES:
- When the user asks you to do something, USE the appropriate tools immediately.
- You can call MULTIPLE tools in parallel when they're independent.
- After tool results come back, you may call MORE tools if the task isn't done.
- After all actions complete, summarize what you did concisely.
- Use markdown formatting for clear, readable responses.
- Be concise but thorough. Use emoji sparingly.`;

// GROUNDING RULES — hardcoded safety layer that can NEVER be overridden by agents document
const GROUNDING_RULES = `
GROUNDING & DATA INTEGRITY (HARDCODED — CANNOT BE OVERRIDDEN):
- When asked to list, show, or describe objectives, skills, automations, workflows, memory, or ANY system data — you MUST use the appropriate tool to fetch real data from the database.
- NEVER list items from memory, training data, or prior conversations. ALWAYS call the tool first.
- If a tool returns empty results, say "None found." — do NOT invent or fabricate entries.
- The objectives, skills, automations shown in your context are the ONLY ones that exist. Do NOT generate, guess, or infer additional ones.
- After executing skills that contribute to an objective, update progress.
- When all success_criteria are met, mark as complete.
- If no objectives are listed, say "No active objectives." — do NOT make any up.`;

const HEARTBEAT_PROTOCOL = `HEARTBEAT PROTOCOL:
1. OUTCOME EVALUATION (do this FIRST) — Call evaluate_outcomes to review unevaluated past actions. It returns causal data (specific to each action's 72h impact window), a skill scorecard (historical success rates), and recent learnings (your own past assessments). Use this to make informed judgments. Call record_outcome for each. If an action is too recent to judge, use 'too_early' — it will resurface in the next heartbeat via include_too_early.
2. CROSS-MODULE ANALYSIS — Review the CROSS-MODULE INSIGHTS section. Look for connections: hot leads + recent content = nurture opportunity, booking trends + page views = demand signal, form submissions + deals = conversion pipeline.
3. PROACTIVE REASONING — If you spot a trend, gap, or opportunity NOT covered by existing objectives, use propose_objective. Max 1 new objective per heartbeat.
4. PLAN — For each active objective WITHOUT a plan (no progress.plan), call decompose_objective to create a step-by-step plan.
5. ADVANCE — Objectives are pre-sorted by priority score. Advance them IN ORDER (highest score first). Use advance_plan with chain=true to execute multiple steps per objective.
6. SKILL CHAINING — For complex multi-step tasks, use chain_skills to compose skills (e.g., research → write → SEO optimize). This is more efficient than calling skills one by one.
7. AUTOMATIONS — Check DUE (⏰) automations. Execute them via execute_automation.
8. WORKFLOWS — If a due automation has a workflow_id in trigger_config, run it via workflow_execute.
9. REFLECT — Use 'reflect' to analyze the past 7 days. Include outcome evaluation insights.
10. REMEMBER — Save learnings to memory. Especially save outcome patterns (what skills/strategies produce best results).
11. SUMMARIZE — Brief heartbeat report including plan progress, outcome evaluation summary, and any new proposals.

OUTCOME EVALUATION GUIDELINES:
- evaluate_outcomes returns per-activity causal_data with a 72h impact window specific to each action
- For content skills: check causal_data.page_views_72h for the specific page created
- For CRM skills: check causal_data.related_leads for lead status changes
- The skill_scorecard shows historical success rates — skills below 50% need strategy adjustment via skill_instruct
- recent_learnings contains your own past assessments — read them to avoid repeating mistakes
- Score outcomes: 'success' (clear positive impact), 'partial' (some impact), 'neutral' (no measurable change), 'negative' (worsened metrics), 'too_early' (action < 48h ago, not enough data yet)
- Include quantitative evidence in outcome_data (e.g., {views_generated: 45, leads_attributed: 2, bookings: 1, revenue_cents: 50000})
- Correlation data now includes deals, bookings, orders, and chat feedback — use all available signals
- Pattern: after several heartbeats, the scorecard reveals which strategies work best for THIS specific business

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
- For recipes that compose multiple skills, prefer chain_skills over manual sequential calls.
- If a step fails, note it but continue to the next objective.
- If ALL steps are done, mark the objective as completed via objective_complete.
- Plans persist between heartbeats. FlowPilot picks up where it left off.

PROACTIVE REASONING RULES:
- Only propose objectives when stats or activity clearly warrant action
- Never duplicate existing active objectives (checked automatically)
- Include a clear "reason" explaining what data drove the proposal
- Keep goals specific and actionable
- When proposing, set constraints.priority ('critical'|'high'|'medium'|'low')
- CROSS-MODULE CONNECTIONS: Look for patterns across CRM, content, bookings, and newsletter data

CONSTRAINTS:
- Skills with trust_level='approve' will be BLOCKED and logged for admin review. trust_level='notify' will execute but notify admin. trust_level='auto' executes silently.
- PRIORITIZE: outcome evaluation > high-score objectives > DUE automations > proposals
- Self-healing auto-disables skills with 3+ consecutive failures
- Be efficient: use chaining, focus on top 2-3 objectives per heartbeat`;

const DAY_1_PLAYBOOK = `
🚀 FRESH SITE DETECTED — DAY 1 PLAYBOOK ACTIVE
This site was just installed. There is almost no content, no leads, no research. Your job is to PRODUCE TANGIBLE OUTPUT that demonstrates value immediately. Do NOT just plan — EXECUTE.

PRIORITY ORDER (complete each before moving to next):

1. RESEARCH & INTELLIGENCE (use available web search/scrape skills)
   - Read and understand ALL published pages to learn what this company does
   - Use search_web to research the company's industry, competitors, and market trends
   - Use memory_write to save key findings: ICP definition, competitor list, industry trends
   - Store a structured company profile in memory with key 'company_research'

2. SEO AUDIT (use seo_audit_page skill if available)
   - Audit every published page for SEO issues
   - Fix meta titles and descriptions where possible
   - Save findings to memory with key 'seo_audit_results'

3. CONTENT CAMPAIGN (use blog_write, content proposal skills)
   - Based on research, identify 3-5 blog topics that would attract the company's ICP
   - Write at least 1 full blog post draft (status: draft, ready for human review)
   - Create content proposals for remaining topics
   - Save content strategy to memory with key 'content_strategy'

4. SALES PROSPECTING (use search_web + memory_write)
   - Based on ICP, research 5-10 companies that match the ideal customer profile
   - For each: company name, website, industry, why they're a good fit
   - Save prospect list to memory with key 'prospect_pipeline'
   - Create leads for the most promising prospects if add_lead skill is available

EXECUTION RULES:
- Spend 60% of token budget on research + content, 20% on SEO, 20% on prospecting
- ALWAYS save results to memory — this persists between heartbeats
- If a step fails, log it and move on. Don't get stuck in loops.
- Write REAL content, not placeholders. Quality matters for the showcase.
- After completing tasks, update objective progress with specific deliverables
- Flag the heartbeat state with day1_completed: true when done
`;

/**
 * buildSystemPrompt — OpenClaw Prompt Compiler
 * 
 * Centralized system prompt assembly for all agent surfaces.
 * Eliminates prompt duplication between heartbeat, operate, and chat.
 */
export function buildSystemPrompt(input: PromptCompilerInput): string {
  const { mode, soulPrompt, memoryContext, objectiveContext } = input;

  const parts: string[] = [];

  // ─── Chat mode: layered prompt with soul + grounding ────────────────────────
  if (mode === 'chat') {
    // Layer 1: Base system prompt from admin config (or default)
    parts.push(input.chatSystemPrompt || 'You are a helpful AI assistant for this website.');

    // Layer 2: Soul + Identity personality (from DB — gives the chat personality)
    if (soulPrompt) {
      parts.push(soulPrompt);
    }

    // Layer 3: Language matching (always)
    parts.push('\nIMPORTANT: Always respond in the same language as the user writes in. Match the user\'s language automatically.');

    // Layer 4: Grounding rules for chat (lighter version — no internal tool catalog)
    parts.push(`\nDATA INTEGRITY:
- Only answer based on information you have been given (website content, knowledge base, tool results).
- If you don't know the answer, say so honestly — do not fabricate information.
- When using tools, rely on their results. Do not invent data that tools did not return.`);

    return parts.filter(Boolean).join('\n');
  }

  // ─── Operate / Heartbeat modes ──────────────────────────────────────────────

  // Layer 1: Mode identity (hardcoded, short)
  if (mode === 'heartbeat') {
    parts.push(`You are FlowPilot running in AUTONOMOUS HEARTBEAT mode. No human is watching.`);
  } else {
    parts.push(`You are FlowPilot — an autonomous, self-improving AI agent that operates a CMS platform.`);
  }

  // Layer 2: SOUL + IDENTITY (from DB, evolvable via soul_update)
  parts.push(soulPrompt);

  // Layer 3: AGENTS / CORE_INSTRUCTIONS
  if (!input.agents) {
    parts.push(CORE_INSTRUCTIONS);
  } else {
    parts.push(`You can use MULTIPLE tools in a single turn and CHAIN tool calls across iterations.
When a task requires multiple steps, execute them sequentially — don't just describe a plan.

TOOLS & SKILLS:
- CMS skills: blog posts, leads, analytics, bookings, newsletters, etc.
- PERSISTENT MEMORY (memory_write / memory_read — supports semantic vector search)
- OBJECTIVES (objective_update_progress / objective_complete)
- SELF-MODIFICATION: You can create, update, disable, and list your own skills and automations.
- SELF-EVOLUTION: Use 'soul_update' to evolve your personality/values, 'agents_update' to evolve your operational rules.
- REFLECTION: Use 'reflect' to analyze your performance — findings are auto-persisted as learnings.
- WORKFLOWS: workflow_create, workflow_execute, workflow_list (multi-step chains with template vars)
- SKILL CHAINING: chain_skills — compose multiple skills sequentially with output piping (research → write → optimize)
- A2A DELEGATION: delegate_task to route subtasks to specialized agents
- SKILL PACKS: skill_pack_list, skill_pack_install (bundled capabilities)

SKILL INSTRUCTIONS: Loaded lazily — you'll receive specific skill instructions after you use each skill.

RULES:
- When the user asks you to do something, USE the appropriate tools immediately.
- You can call MULTIPLE tools in parallel when they're independent.
- After tool results come back, you may call MORE tools if the task isn't done.
- After all actions complete, summarize what you did concisely.
- Use markdown formatting for clear, readable responses.
- Be concise but thorough. Use emoji sparingly.`);
  }

  // Layer 4: CMS Schema Awareness
  if (input.cmsSchemaContext) {
    parts.push(input.cmsSchemaContext);
  }

  // Layer 5: GROUNDING RULES (ALWAYS hardcoded — safety layer, cannot be overridden)
  parts.push(GROUNDING_RULES);

  // Layer 6: Mode-specific context
  if (mode === 'heartbeat') {
    parts.push(`\nCONTEXT:`);
    parts.push(memoryContext);
    parts.push(objectiveContext);
    if (input.automationContext) parts.push(input.automationContext);
    if (input.activityContext) parts.push(input.activityContext);
    if (input.statsContext) parts.push(input.statsContext);
    if (input.healingReport) parts.push(input.healingReport);
    if (input.heartbeatState) parts.push(input.heartbeatState);
    if (input.tokenBudget) {
      parts.push(`\nTOKEN BUDGET: ${input.tokenBudget} tokens max. Be efficient — stop early if approaching the limit.`);
    }
    parts.push('');
    // Use custom heartbeat protocol from memory if available, else default
    parts.push(input.customHeartbeatProtocol || HEARTBEAT_PROTOCOL);
    parts.push(`\n- Max ${input.maxIterations || 8} tool iterations per heartbeat`);

    // Day 1 Playbook (fresh sites only)
    if (input.siteMaturity?.isFresh) {
      parts.push(DAY_1_PLAYBOOK);
    }
  } else {
    // Operate mode
    parts.push(memoryContext);
    parts.push(objectiveContext);
  }

  return parts.filter(Boolean).join('\n');
}

// ─── AI Config Resolution ─────────────────────────────────────────────────────

export type AiTier = 'fast' | 'reasoning';

// Server-side model migration — normalize legacy model names
const OPENAI_MODEL_MIGRATION: Record<string, string> = {
  'gpt-4o': 'gpt-4.1', 'gpt-4o-mini': 'gpt-4.1-mini', 'gpt-3.5-turbo': 'gpt-4.1-nano',
  'gpt-4-turbo': 'gpt-4.1', 'gpt-4': 'gpt-4.1',
};
const GEMINI_MODEL_MIGRATION: Record<string, string> = {
  'gemini-1.5-pro': 'gemini-2.5-pro', 'gemini-1.5-flash': 'gemini-2.5-flash',
  'gemini-2.0-flash-exp': 'gemini-2.5-flash', 'gemini-pro': 'gemini-2.5-pro',
};
function migrateOpenaiModel(m?: string): string { return (m && OPENAI_MODEL_MIGRATION[m]) || m || 'gpt-4.1-mini'; }
function migrateGeminiModel(m?: string): string { return (m && GEMINI_MODEL_MIGRATION[m]) || m || 'gemini-2.5-flash'; }

export async function resolveAiConfig(supabase: any, tier: AiTier = 'fast'): Promise<{ apiKey: string; apiUrl: string; model: string }> {
  let apiKey = '';
  let apiUrl = 'https://api.openai.com/v1/chat/completions';
  let model = tier === 'reasoning' ? 'gpt-4.1' : 'gpt-4.1-mini';

  const { data: settings } = await supabase
    .from('site_settings').select('value').eq('key', 'system_ai').maybeSingle();

  if (settings?.value) {
    const cfg = settings.value as Record<string, string>;
    if (cfg.provider === 'gemini' && Deno.env.get('GEMINI_API_KEY')) {
      apiKey = Deno.env.get('GEMINI_API_KEY')!;
      apiUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
      model = tier === 'reasoning'
        ? migrateGeminiModel(cfg.geminiReasoningModel || 'gemini-2.5-pro')
        : migrateGeminiModel(cfg.geminiModel || cfg.model);
    } else if (cfg.provider === 'openai' && Deno.env.get('OPENAI_API_KEY')) {
      apiKey = Deno.env.get('OPENAI_API_KEY')!;
      model = tier === 'reasoning'
        ? migrateOpenaiModel(cfg.openaiReasoningModel || 'gpt-4.1')
        : migrateOpenaiModel(cfg.openaiModel || cfg.model);
    }
  }

  if (!apiKey) {
    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    if (lovableKey) {
      apiKey = lovableKey;
      apiUrl = 'https://ai.gateway.lovable.dev/v1/chat/completions';
      model = tier === 'reasoning' ? 'google/gemini-2.5-pro' : 'google/gemini-2.5-flash';
    }
  }

  if (!apiKey) {
    throw new Error('No AI provider configured. Set OPENAI_API_KEY, GEMINI_API_KEY, or LOVABLE_API_KEY.');
  }

  return { apiKey, apiUrl, model };
}

// ─── Soul, Identity & Agents (Workspace Files) ───────────────────────────────

/** @deprecated Use loadWorkspaceFiles instead */
export async function loadSoulIdentity(supabase: any): Promise<{ soul: any; identity: any }> {
  const ws = await loadWorkspaceFiles(supabase);
  return { soul: ws.soul, identity: ws.identity };
}

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

/** @deprecated Use buildWorkspacePrompt instead */
export function buildSoulPrompt(soul: any, identity: any): string {
  return buildWorkspacePrompt(soul, identity, null);
}

export function buildWorkspacePrompt(soul: any, identity: any, agents: any): string {
  let prompt = '';

  // Layer 2a: Identity
  if (identity.name || identity.role) {
    prompt += `\n\nIDENTITY:\nName: ${identity.name || 'FlowPilot'}\nRole: ${identity.role || 'CMS operator'}`;
    if (identity.capabilities?.length) prompt += `\nCapabilities: ${identity.capabilities.join(', ')}`;
    if (identity.boundaries?.length) prompt += `\nBoundaries: ${identity.boundaries.join('; ')}`;
  }

  // Layer 2b: Soul
  if (soul.purpose) prompt += `\n\nSOUL:\nPurpose: ${soul.purpose}`;
  if (soul.values?.length) prompt += `\nValues: ${soul.values.join('; ')}`;
  if (soul.tone) prompt += `\nTone: ${soul.tone}`;
  if (soul.philosophy) prompt += `\nPhilosophy: ${soul.philosophy}`;

  // Layer 3: Agents (operational rules from DB — overrides CORE_INSTRUCTIONS if present)
  if (agents) {
    prompt += `\n\nOPERATIONAL RULES (AGENTS):`;
    if (agents.direct_action_rules) prompt += `\n${agents.direct_action_rules}`;
    if (agents.self_improvement) prompt += `\n${agents.self_improvement}`;
    if (agents.memory_guidelines) prompt += `\n${agents.memory_guidelines}`;
    if (agents.browser_rules) prompt += `\n${agents.browser_rules}`;
    if (agents.workflow_conventions) prompt += `\n${agents.workflow_conventions}`;
    if (agents.a2a_conventions) prompt += `\n${agents.a2a_conventions}`;
    if (agents.skill_pack_rules) prompt += `\n${agents.skill_pack_rules}`;
    if (agents.custom_rules) prompt += `\n${agents.custom_rules}`;
  }

  return prompt;
}

// ─── CMS Schema Awareness ─────────────────────────────────────────────────────

export async function loadCMSSchema(supabase: any): Promise<string> {
  try {
    const [modulesRes, countsRes] = await Promise.all([
      supabase.from('site_settings').select('key, value').in('key', ['modules', 'integrations', 'system_ai']),
      Promise.all([
        supabase.from('pages').select('id', { count: 'exact', head: true }),
        supabase.from('blog_posts').select('id', { count: 'exact', head: true }),
        supabase.from('leads').select('id', { count: 'exact', head: true }),
        supabase.from('products').select('id', { count: 'exact', head: true }),
        supabase.from('bookings').select('id', { count: 'exact', head: true }),
        supabase.from('newsletter_subscribers').select('id', { count: 'exact', head: true }).eq('status', 'confirmed'),
        supabase.from('kb_articles').select('id', { count: 'exact', head: true }),
        supabase.from('agent_skills').select('id', { count: 'exact', head: true }).eq('enabled', true),
      ]),
    ]);

    const settings = modulesRes.data || [];
    const modules = settings.find((s: any) => s.key === 'modules')?.value || {};
    const integrations = settings.find((s: any) => s.key === 'integrations')?.value || {};

    const [pages, posts, leads, products, bookings, subscribers, kbArticles, skills] = countsRes;

    const enabledModules = Object.entries(modules)
      .filter(([, v]: [string, any]) => v?.enabled)
      .map(([k]) => k);

    const activeIntegrations: string[] = [];
    if (Deno.env.get('STRIPE_SECRET_KEY')) activeIntegrations.push('Stripe');
    if (Deno.env.get('RESEND_API_KEY')) activeIntegrations.push('Resend');
    if (Deno.env.get('FIRECRAWL_API_KEY')) activeIntegrations.push('Firecrawl');
    if (Deno.env.get('UNSPLASH_ACCESS_KEY')) activeIntegrations.push('Unsplash');
    if (Deno.env.get('OPENAI_API_KEY')) activeIntegrations.push('OpenAI');
    if (Deno.env.get('GEMINI_API_KEY')) activeIntegrations.push('Gemini');

    const blockTypes = [
      'hero', 'text', 'image', 'gallery', 'cta', 'contact', 'faq', 'pricing',
      'testimonials', 'features', 'stats', 'team', 'video', 'map', 'newsletter',
      'blog-list', 'product-list', 'booking', 'chat', 'parallax-section', 'marquee',
      'consultant-profile', 'webinar', 'knowledge-base',
    ];

    return `\n\nCMS SCHEMA AWARENESS:
Enabled modules: ${enabledModules.length > 0 ? enabledModules.join(', ') : 'none configured'}
Active integrations: ${activeIntegrations.length > 0 ? activeIntegrations.join(', ') : 'none'}
Available block types: ${blockTypes.join(', ')}
Data counts: ${pages.count ?? 0} pages, ${posts.count ?? 0} blog posts, ${leads.count ?? 0} leads, ${products.count ?? 0} products, ${bookings.count ?? 0} bookings, ${subscribers.count ?? 0} subscribers, ${kbArticles.count ?? 0} KB articles, ${skills.count ?? 0} active skills`;
  } catch (err) {
    console.error('[cms-schema] Failed to load:', err);
    return '';
  }
}

// ─── Cross-Module Insights ────────────────────────────────────────────────────

export async function loadCrossModuleInsights(supabase: any): Promise<string> {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  try {
    const [
      dealsByStage, hotLeads, recentBookings,
      topPages, newsletterPerf, formSubs, recentOutcomes,
    ] = await Promise.all([
      supabase.from('deals').select('stage, value_cents, currency')
        .in('stage', ['proposal', 'negotiation', 'qualification']),
      supabase.from('leads').select('name, email, score, status, updated_at')
        .gte('score', 30).eq('status', 'lead').order('score', { ascending: false }).limit(5),
      supabase.from('bookings').select('status, start_time, customer_name')
        .gte('start_time', new Date().toISOString()).order('start_time').limit(10),
      supabase.from('page_views').select('page_slug, page_title')
        .gte('created_at', weekAgo.toISOString()).limit(500),
      supabase.from('newsletter_email_opens').select('id', { count: 'exact', head: true })
        .gte('created_at', weekAgo.toISOString()),
      supabase.from('form_submissions').select('form_name, created_at')
        .gte('created_at', weekAgo.toISOString()).order('created_at', { ascending: false }).limit(10),
      supabase.from('agent_activity').select('skill_name, outcome_status, outcome_data')
        .not('outcome_status', 'is', null).gte('created_at', weekAgo.toISOString())
        .order('created_at', { ascending: false }).limit(20),
    ]);

    const parts: string[] = ['\n\nCROSS-MODULE INSIGHTS (7 days):'];

    // CRM Pipeline
    if (dealsByStage.data?.length) {
      const pipeline: Record<string, { count: number; value: number }> = {};
      for (const d of dealsByStage.data) {
        if (!pipeline[d.stage]) pipeline[d.stage] = { count: 0, value: 0 };
        pipeline[d.stage].count++;
        pipeline[d.stage].value += d.value_cents;
      }
      parts.push('📊 CRM Pipeline:');
      for (const [stage, info] of Object.entries(pipeline)) {
        parts.push(`  - ${stage}: ${info.count} deals (${(info.value / 100).toFixed(0)} total value)`);
      }
    }

    if (hotLeads.data?.length) {
      parts.push(`🔥 Hot leads (score≥30): ${hotLeads.data.map((l: any) => `${l.name || l.email} (${l.score}pts)`).join(', ')}`);
    }

    if (recentBookings.data?.length) {
      const upcoming = recentBookings.data.filter((b: any) => b.status === 'confirmed');
      parts.push(`📅 Upcoming bookings: ${upcoming.length} confirmed`);
    }

    if (topPages.data?.length) {
      const pageCounts: Record<string, number> = {};
      for (const pv of topPages.data) {
        pageCounts[pv.page_slug] = (pageCounts[pv.page_slug] || 0) + 1;
      }
      const sorted = Object.entries(pageCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
      if (sorted.length) {
        parts.push(`📈 Top pages: ${sorted.map(([slug, count]) => `${slug} (${count})`).join(', ')}`);
      }
    }

    parts.push(`📧 Newsletter opens (7d): ${newsletterPerf.count ?? 0}`);

    if (formSubs.data?.length) {
      parts.push(`📝 Form submissions (7d): ${formSubs.data.length}`);
    }

    if (recentOutcomes.data?.length) {
      const outcomes: Record<string, number> = {};
      const skillPerf: Record<string, { total: number; good: number }> = {};
      for (const o of recentOutcomes.data) {
        outcomes[o.outcome_status] = (outcomes[o.outcome_status] || 0) + 1;
        const sk = o.skill_name || 'unknown';
        if (!skillPerf[sk]) skillPerf[sk] = { total: 0, good: 0 };
        skillPerf[sk].total++;
        if (o.outcome_status === 'success' || o.outcome_status === 'partial') skillPerf[sk].good++;
      }
      parts.push(`🎯 Action outcomes: ${Object.entries(outcomes).map(([s, c]) => `${s}:${c}`).join(', ')}`);
      // Top/bottom performing skills
      const perfEntries = Object.entries(skillPerf).filter(([, v]) => v.total >= 2);
      if (perfEntries.length) {
        const sorted = perfEntries.sort((a, b) => (b[1].good / b[1].total) - (a[1].good / a[1].total));
        const best = sorted.slice(0, 3).map(([name, v]) => `${name}(${Math.round(v.good / v.total * 100)}%)`);
        parts.push(`📊 Skill performance (7d): ${best.join(', ')}`);
        const worst = sorted.filter(([, v]) => v.good / v.total < 0.5);
        if (worst.length) parts.push(`⚠️ Underperforming: ${worst.map(([n]) => n).join(', ')} — check learnings`);
      }
    }

    return parts.join('\n');
  } catch (err) {
    console.error('[cross-module] Failed to load insights:', err);
    return '';
  }
}

// ─── Site Maturity Detection ──────────────────────────────────────────────────

export async function detectSiteMaturity(supabase: any): Promise<SiteMaturity> {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [posts, leads, subscribers, views, research, proposals] = await Promise.all([
    supabase.from('blog_posts').select('id', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('leads').select('id', { count: 'exact', head: true }),
    supabase.from('newsletter_subscribers').select('id', { count: 'exact', head: true }).eq('status', 'confirmed'),
    supabase.from('page_views').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo.toISOString()),
    supabase.from('content_research').select('id', { count: 'exact', head: true }),
    supabase.from('content_proposals').select('id', { count: 'exact', head: true }),
  ]);

  const blogPosts = posts.count ?? 0;
  const leadsCount = leads.count ?? 0;
  const subscribersCount = subscribers.count ?? 0;
  const pageViews = views.count ?? 0;
  const contentResearch = research.count ?? 0;
  const contentProposals = proposals.count ?? 0;

  // Fresh site: minimal content, no organic traction yet
  const isFresh = blogPosts <= 2 && leadsCount === 0 && contentResearch === 0 && contentProposals === 0;

  return {
    isFresh,
    blogPosts,
    leads: leadsCount,
    subscribers: subscribersCount,
    pageViews,
    contentResearch,
    contentProposals,
  };
}

// ─── Editable Heartbeat Protocol (OpenClaw Layer) ─────────────────────────────

/**
 * Load custom heartbeat protocol from agent_memory.
 * Key: 'heartbeat_protocol' — if present, replaces the hardcoded HEARTBEAT_PROTOCOL.
 * This allows admins to customize the agent's autonomous behavior via Skill Hub.
 */
export async function loadHeartbeatProtocol(supabase: any): Promise<string | null> {
  const { data } = await supabase
    .from('agent_memory')
    .select('value')
    .eq('key', 'heartbeat_protocol')
    .maybeSingle();

  if (!data?.value) return null;

  // Value can be a string or { protocol: string }
  const val = data.value;
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val.protocol) return val.protocol;
  return null;
}

/**
 * Save a custom heartbeat protocol to agent_memory.
 */
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

/**
 * Get the default (hardcoded) heartbeat protocol. Useful for reset.
 */
export function getDefaultHeartbeatProtocol(): string {
  return HEARTBEAT_PROTOCOL;
}

// ─── Persistent Heartbeat State ───────────────────────────────────────────────

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

// ─── Atomic Task Checkout ─────────────────────────────────────────────────────

export async function checkoutObjective(supabase: any, objectiveId: string): Promise<boolean> {
  // Atomic checkout via database function — prevents race conditions
  const { data, error } = await supabase.rpc('checkout_objective', {
    p_objective_id: objectiveId,
    p_locked_by: 'heartbeat',
  });

  return !error && data === true;
}

export async function releaseObjective(supabase: any, objectiveId: string): Promise<void> {
  await supabase
    .from('agent_objectives')
    .update({ locked_by: null, locked_at: null })
    .eq('id', objectiveId)
    .eq('locked_by', 'heartbeat');
}

// ─── Token Tracking ───────────────────────────────────────────────────────────

export function extractTokenUsage(aiData: any): TokenUsage {
  const usage = aiData.usage || {};
  return {
    prompt_tokens: usage.prompt_tokens || 0,
    completion_tokens: usage.completion_tokens || 0,
    total_tokens: (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
  };
}

export function accumulateTokens(current: TokenUsage, incoming: TokenUsage): TokenUsage {
  return {
    prompt_tokens: current.prompt_tokens + incoming.prompt_tokens,
    completion_tokens: current.completion_tokens + incoming.completion_tokens,
    total_tokens: current.total_tokens + incoming.total_tokens,
  };
}

export function isOverBudget(usage: TokenUsage, budget: number): boolean {
  return usage.total_tokens >= budget;
}

// ─── Memory ───────────────────────────────────────────────────────────────────

export async function loadMemories(supabase: any): Promise<string> {
  const { data } = await supabase
    .from('agent_memory')
    .select('key, value, category')
    .not('key', 'in', '("soul","identity","agents","heartbeat_state")')
    .order('updated_at', { ascending: false })
    .limit(30);

  if (!data || data.length === 0) return '';
  const lines = data.map((m: any) => `- [${m.category}] ${m.key}: ${JSON.stringify(m.value)}`);
  return `\n\nYour memory (things you've learned about this site and its owner):\n${lines.join('\n')}`;
}

async function handleMemoryWrite(supabase: any, args: { key: string; value: any; category?: string }) {
  const { key, value, category = 'context' } = args;
  const { data: existing } = await supabase
    .from('agent_memory').select('id').eq('key', key).maybeSingle();

  const memValue = typeof value === 'object' ? value : { text: value };

  // Generate embedding for vector search
  const embedding = await generateEmbedding(supabase, `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);

  const record: any = {
    value: memValue,
    category,
    updated_at: new Date().toISOString(),
  };
  if (embedding) record.embedding = embedding;

  if (existing) {
    await supabase.from('agent_memory').update(record).eq('id', existing.id);
  } else {
    await supabase.from('agent_memory')
      .insert({ key, ...record, created_by: 'flowpilot' });
  }
  return { status: 'saved', key, has_embedding: !!embedding };
}

async function handleMemoryRead(supabase: any, args: { key?: string; category?: string; semantic_query?: string }) {
  const searchText = args.semantic_query || args.key || '';
  
  if (searchText) {
    // Generate embedding for vector component
    const embedding = await generateEmbedding(supabase, searchText);

    // Use hybrid search (70% vector + 30% keyword via pg_trgm)
    const { data: hybridResults, error } = await supabase.rpc('search_memories_hybrid', {
      query_text: searchText,
      query_embedding: embedding || null,
      match_threshold: 0.25,
      match_count: 10,
      filter_category: args.category || null,
    });

    if (!error && hybridResults?.length) {
      return {
        memories: hybridResults.map((r: any) => ({
          key: r.key, value: r.value, category: r.category, 
          similarity: r.similarity, search_type: r.search_type,
        })),
        search_type: 'hybrid',
      };
    }

    // Fallback: pure vector search if hybrid function fails
    if (embedding) {
      const { data: semanticResults } = await supabase.rpc('search_memories_semantic', {
        query_embedding: embedding,
        match_threshold: 0.5,
        match_count: 10,
        filter_category: args.category || null,
      });

      if (semanticResults?.length) {
        return {
          memories: semanticResults.map((r: any) => ({
            key: r.key, value: r.value, category: r.category, similarity: r.similarity,
          })),
          search_type: 'semantic',
        };
      }
    }
  }

  // Final fallback: basic keyword search
  let q = supabase.from('agent_memory').select('key, value, category, updated_at');
  if (args.key) q = q.ilike('key', `%${args.key}%`);
  if (args.category) q = q.eq('category', args.category);
  const { data } = await q.order('updated_at', { ascending: false }).limit(10);
  return { memories: data || [], search_type: 'keyword' };
}

// ─── Vector Memory (Embedding Generation) ─────────────────────────────────────

async function generateEmbedding(supabase: any, text: string): Promise<number[] | null> {
  try {
    // Try OpenAI embeddings first
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (openaiKey) {
      const resp = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: text.slice(0, 8000),
          dimensions: 768,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        return data.data?.[0]?.embedding || null;
      }
    }

    // Try Gemini embeddings
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (geminiKey) {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'models/text-embedding-004',
            content: { parts: [{ text: text.slice(0, 8000) }] },
            outputDimensionality: 768,
          }),
        }
      );
      if (resp.ok) {
        const data = await resp.json();
        return data.embedding?.values || null;
      }
    }

    console.warn('[vector-memory] No embedding provider available');
    return null;
  } catch (err) {
    console.error('[vector-memory] Embedding generation failed:', err);
    return null;
  }
}

// ─── Context Pruning ──────────────────────────────────────────────────────────

/**
 * pruneConversationHistory — Token-aware context management
 * 
 * OpenClaw-aligned: Before summarizing, a silent "pre-compaction flush" extracts
 * key facts from the messages about to be pruned and persists them to agent_memory.
 * This prevents context loss during summarization.
 */
export async function pruneConversationHistory(
  messages: any[],
  supabase: any,
  opts?: { maxTokens?: number; summaryThreshold?: number }
): Promise<any[]> {
  const maxTokens = opts?.maxTokens || MAX_CONTEXT_TOKENS;
  const threshold = opts?.summaryThreshold || SUMMARY_THRESHOLD;

  // Estimate total tokens
  let totalTokens = 0;
  for (const msg of messages) {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '');
    totalTokens += Math.ceil(content.length / 4);
    if (msg.tool_calls) {
      totalTokens += Math.ceil(JSON.stringify(msg.tool_calls).length / 4);
    }
  }

  // Under threshold — no pruning needed
  if (totalTokens < threshold) {
    return messages;
  }

  console.log(`[context-pruning] Total ~${totalTokens} tokens exceeds ${threshold}, pruning...`);

  // Separate system messages from conversation
  const systemMessages = messages.filter(m => m.role === 'system');
  const conversationMessages = messages.filter(m => m.role !== 'system');

  if (conversationMessages.length <= 6) {
    return messages; // Too few messages to prune
  }

  // Keep the last N messages (recent context)
  const keepRecent = Math.min(10, Math.floor(conversationMessages.length / 2));
  const oldMessages = conversationMessages.slice(0, -keepRecent);
  const recentMessages = conversationMessages.slice(-keepRecent);

  // ─── PRE-COMPACTION MEMORY FLUSH (OpenClaw pattern) ───
  // Extract and persist key facts BEFORE summarization to prevent context loss
  await preCompactionFlush(oldMessages, supabase);

  // Summarize old messages using AI
  const summary = await summarizeMessages(oldMessages, supabase);

  if (!summary) {
    // Fallback: simple truncation — keep system + recent
    return [...systemMessages, ...recentMessages];
  }

  // Build pruned history: system + summary + recent
  const summaryMessage = {
    role: 'system' as const,
    content: `[CONVERSATION SUMMARY — Earlier messages condensed for context]\n${summary}`,
  };

  console.log(`[context-pruning] Pruned ${oldMessages.length} messages into summary (~${Math.ceil(summary.length / 4)} tokens)`);

  return [...systemMessages, summaryMessage, ...recentMessages];
}

/**
 * preCompactionFlush — Silent extraction of key facts before context summarization.
 * 
 * Uses a fast AI call to identify discrete facts (user preferences, decisions, 
 * configurations, names, IDs) from the messages about to be pruned, then
 * persists each as a separate agent_memory entry with embeddings.
 */
async function preCompactionFlush(messages: any[], supabase: any): Promise<void> {
  try {
    const { apiKey, apiUrl, model } = await resolveAiConfig(supabase, 'fast');

    // Build compact transcript of messages being pruned
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
            content: `You are a memory extraction agent. Extract discrete facts from this conversation that should be remembered long-term.

Output a JSON array of objects, each with:
- "key": short identifier (snake_case, max 40 chars) 
- "value": the fact/preference/decision (1-2 sentences max)
- "category": one of "preference", "context", "fact"

Focus on:
- User preferences and decisions (e.g. "user prefers dark mode", "company name is Acme")
- Configuration choices made
- Business facts mentioned (names, IDs, URLs, numbers)
- Explicit corrections or clarifications
- Important outcomes or results

Skip:
- Greetings, small talk, acknowledgments
- Things already obvious from the system prompt
- Temporary/session-specific details

Return ONLY the JSON array. If nothing worth remembering, return [].`,
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
    
    // Parse the JSON array (handle markdown code fences)
    const cleaned = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    let facts: Array<{ key: string; value: string; category?: string }>;
    try {
      facts = JSON.parse(cleaned);
    } catch {
      console.warn('[pre-compaction] Failed to parse extraction result');
      return;
    }

    if (!Array.isArray(facts) || facts.length === 0) return;

    // Persist each fact (max 5 to avoid noise)
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
    // Non-fatal: pruning continues even if flush fails
    console.error('[pre-compaction] Flush failed (non-fatal):', err);
  }
}

async function summarizeMessages(messages: any[], supabase: any): Promise<string | null> {
  try {
    const { apiKey, apiUrl, model } = await resolveAiConfig(supabase, 'fast');

    // Build a compact representation of old messages
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

// ─── Objectives ───────────────────────────────────────────────────────────────

export async function loadObjectives(supabase: any, opts?: { unlockedOnly?: boolean }): Promise<string> {
  let query = supabase
    .from('agent_objectives')
    .select('id, goal, status, constraints, success_criteria, progress, created_at, updated_at, locked_by, locked_at')
    .eq('status', 'active');

  // Heartbeat needs only unlocked objectives to avoid race conditions.
  // Chat/admin context should see ALL active objectives regardless of lock state.
  if (opts?.unlockedOnly) {
    query = query.is('locked_by', null);
  }

  const { data } = await query
    .order('created_at', { ascending: false })
    .limit(10);

  if (!data || data.length === 0) return '\nNo active objectives.';

  // Priority scoring (ported from ClawCMS)
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
    return `- #${i + 1} [score:${o._priority_score}] [${o.id}] "${o.goal}"${planInfo}${deadline}${priority} | progress: ${JSON.stringify(o.progress)} | criteria: ${JSON.stringify(o.success_criteria)}`;
  }).join('\n');
}

async function handleObjectiveUpdateProgress(supabase: any, args: { objective_id: string; progress: any }) {
  const { error } = await supabase
    .from('agent_objectives').update({ progress: args.progress }).eq('id', args.objective_id);
  if (error) return { status: 'error', error: error.message };
  return { status: 'updated', objective_id: args.objective_id };
}

async function handleObjectiveComplete(supabase: any, args: { objective_id: string }) {
  const { error } = await supabase
    .from('agent_objectives')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', args.objective_id);
  if (error) return { status: 'error', error: error.message };
  return { status: 'completed', objective_id: args.objective_id };
}

async function handleObjectiveDelete(supabase: any, args: { objective_id: string }) {
  // Remove linked activities first
  await supabase.from('agent_objective_activities').delete().eq('objective_id', args.objective_id);
  const { error } = await supabase.from('agent_objectives').delete().eq('id', args.objective_id);
  if (error) return { status: 'error', error: error.message };
  return { status: 'deleted', objective_id: args.objective_id };
}

async function handleMemoryDelete(supabase: any, args: { key: string }) {
  const { error } = await supabase.from('agent_memory').delete().eq('key', args.key);
  if (error) return { status: 'error', error: error.message };
  return { status: 'deleted', key: args.key };
}

// ─── Plan Decomposition (ported from ClawCMS) ─────────────────────────────────

async function decomposeObjectiveIntoPlan(
  objective: { id: string; goal: string; constraints: any; success_criteria: any },
  supabase: any,
): Promise<{ steps: any[]; total_steps: number }> {
  const { data: skills } = await supabase.from('agent_skills')
    .select('name, description, category, handler')
    .eq('enabled', true);

  const skillList = (skills || []).map((s: any) => `- ${s.name}: ${s.description} (${s.handler})`).join('\n');

  const { apiKey, apiUrl, model } = await resolveAiConfig(supabase, 'reasoning');
  const aiResp = await fetch(apiUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: `You are a planning agent. Decompose an objective into 3-7 concrete, sequential steps. Each step should map to an available skill when possible.

Available skills:
${skillList}

Return ONLY a JSON array, no markdown. Each step:
{"id":"s1","order":1,"description":"What to do","skill_name":"skill_name_or_null","skill_args":{},"status":"pending"}

Rules:
- Steps should be ordered logically (research before drafting, drafting before publishing)
- Use actual skill names from the list above when applicable
- Set skill_args with sensible defaults based on the objective
- If no skill matches, set skill_name to null (manual step)
- Keep descriptions short and actionable`,
        },
        {
          role: 'user',
          content: `Objective: "${objective.goal}"
Constraints: ${JSON.stringify(objective.constraints || {})}
Success criteria: ${JSON.stringify(objective.success_criteria || {})}`,
        },
      ],
    }),
  });

  const data = await aiResp.json();
  const raw = data.choices?.[0]?.message?.content || '[]';
  const cleaned = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  let steps: any[];
  try {
    steps = JSON.parse(cleaned);
    if (!Array.isArray(steps)) steps = [];
  } catch {
    steps = [{ id: 's1', order: 1, description: objective.goal, skill_name: null, skill_args: {}, status: 'pending' }];
  }

  steps = steps.map((s: any, i: number) => ({
    id: s.id || `s${i + 1}`,
    order: s.order || i + 1,
    description: s.description || `Step ${i + 1}`,
    skill_name: s.skill_name || null,
    skill_args: s.skill_args || {},
    status: 'pending',
  }));

  return { steps, total_steps: steps.length };
}

async function handleDecomposeObjective(supabase: any, args: { objective_id: string }) {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!args.objective_id || !UUID_RE.test(args.objective_id)) {
    return { status: 'error', error: `Invalid objective_id UUID: "${args.objective_id}". Use the full UUID from the objectives list.` };
  }
  const { data: obj, error } = await supabase.from('agent_objectives')
    .select('id, goal, constraints, success_criteria, progress')
    .eq('id', args.objective_id).single();
  if (error || !obj) return { status: 'error', error: error?.message || 'Objective not found' };

  const plan = await decomposeObjectiveIntoPlan(obj, supabase);
  const progress = (obj.progress as Record<string, any>) || {};
  progress.plan = { ...plan, current_step: 0, created_at: new Date().toISOString() };

  await supabase.from('agent_objectives').update({ progress }).eq('id', args.objective_id);
  return { status: 'planned', objective_id: args.objective_id, steps: plan.steps.length, plan: plan.steps };
}

async function handleAdvancePlan(supabase: any, supabaseUrl: string, serviceKey: string, args: { objective_id: string; chain?: boolean }) {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!args.objective_id || !UUID_RE.test(args.objective_id)) {
    return { status: 'error', error: `Invalid objective_id UUID: "${args.objective_id}". Use the full UUID from the objectives list.` };
  }
  const { objective_id, chain = true } = args;
  const maxSteps = chain ? MAX_CHAIN_DEPTH : 1;
  const chainResults: any[] = [];

  // Atomic checkout — prevent concurrent heartbeat instances from advancing the same objective
  const locked = await checkoutObjective(supabase, objective_id);
  if (!locked) {
    return { status: 'locked', message: 'Objective is currently being worked on by another process.' };
  }

  for (let depth = 0; depth < maxSteps; depth++) {
    const { data: obj, error } = await supabase.from('agent_objectives')
      .select('id, goal, progress')
      .eq('id', objective_id).single();
    if (error || !obj) return { status: 'error', error: error?.message || 'Objective not found' };

    const progress = (obj.progress as Record<string, any>) || {};
    const plan = progress.plan;
    if (!plan?.steps?.length) return { status: 'no_plan', message: 'No plan found. Use decompose_objective first.', chain_results: chainResults };

    const nextStep = plan.steps.find((s: any) => s.status === 'pending');
    if (!nextStep) {
      if (!plan.completed) {
        plan.completed = true;
        progress.plan = plan;
        progress.last_updated = new Date().toISOString();
        await supabase.from('agent_objectives').update({ progress }).eq('id', objective_id);
      }
      return { status: 'all_done', message: 'All plan steps completed.', chain_results: chainResults };
    }

    nextStep.status = 'running';
    plan.current_step = nextStep.order;
    await supabase.from('agent_objectives').update({ progress }).eq('id', objective_id);

    let result: any = { status: 'manual', message: 'No skill mapped — requires manual action.' };
    if (nextStep.skill_name) {
      try {
        // Goal-Aware Execution: pass objective context to agent-execute
        const objectiveContext = {
          goal: obj.goal,
          step: nextStep.description,
          why: `Step ${nextStep.order} of plan for objective: ${obj.goal}`,
        };
        const resp = await fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
          body: JSON.stringify({
            skill_name: nextStep.skill_name,
            arguments: nextStep.skill_args || {},
            agent_type: 'flowpilot',
            objective_context: objectiveContext,
          }),
        });
        result = await resp.json();
      } catch (err: any) {
        result = { error: err.message };
      }
    }

    const success = !result.error && result.status !== 'failed';
    nextStep.status = success ? 'done' : 'failed';
    nextStep.result = result;
    nextStep.completed_at = new Date().toISOString();

    const allDone = plan.steps.every((s: any) => s.status === 'done');
    const anyFailed = plan.steps.some((s: any) => s.status === 'failed');
    plan.completed = allDone;
    plan.has_failures = anyFailed;

    progress.plan = plan;
    progress.total_runs = (progress.total_runs || 0) + 1;
    progress.last_updated = new Date().toISOString();
    await supabase.from('agent_objectives').update({ progress }).eq('id', objective_id);

    const remaining = plan.steps.filter((s: any) => s.status === 'pending').length;
    chainResults.push({
      step: nextStep.description,
      skill: nextStep.skill_name,
      status: success ? 'done' : 'failed',
      remaining_steps: remaining,
    });

    if (!success || !nextStep.skill_name || allDone) break;
  }

  // Release the lock
  await releaseObjective(supabase, objective_id);

  const lastResult = chainResults[chainResults.length - 1];
  return {
    status: chainResults.some(r => r.status === 'failed') ? 'chain_partial' : 'chain_completed',
    steps_executed: chainResults.length,
    remaining_steps: lastResult?.remaining_steps ?? 0,
    plan_completed: chainResults.length > 0 && lastResult?.remaining_steps === 0,
    chain_results: chainResults,
  };
}

async function handleProposeObjective(supabase: any, args: { goal: string; reason: string; constraints?: any; success_criteria?: any }) {
  const { goal, reason, constraints, success_criteria } = args;

  const { data: existing } = await supabase.from('agent_objectives')
    .select('id, goal').eq('status', 'active');
  const isDuplicate = (existing || []).some((o: any) =>
    o.goal.toLowerCase().includes(goal.toLowerCase().slice(0, 20)) ||
    goal.toLowerCase().includes(o.goal.toLowerCase().slice(0, 20))
  );
  if (isDuplicate) {
    return { status: 'skipped', reason: 'Similar objective already active' };
  }

  const { data: newObj, error } = await supabase.from('agent_objectives')
    .insert({
      goal,
      constraints: constraints || {},
      success_criteria: success_criteria || {},
      progress: { proposed_by: 'flowpilot', reason: reason || 'proactive', proposed_at: new Date().toISOString() },
      status: 'active',
    })
    .select('id').single();
  if (error) return { status: 'error', error: error.message };

  await supabase.from('agent_activity').insert({
    agent: 'flowpilot', skill_name: 'propose_objective',
    input: { goal, reason },
    output: { objective_id: newObj.id },
    status: 'success',
  });

  return { status: 'proposed', objective_id: newObj.id, goal };
}

// ─── Cron helpers ─────────────────────────────────────────────────────────────

function calculateNextRun(cronExpr: string): string | null {
  try {
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length < 5) return null;
    const now = new Date();
    const [min, hour, dayOfMonth] = parts;

    if (min === '*' && hour === '*') return new Date(now.getTime() + 60_000).toISOString();
    if (min.startsWith('*/')) return new Date(now.getTime() + parseInt(min.slice(2), 10) * 60_000).toISOString();
    if (hour.startsWith('*/')) return new Date(now.getTime() + parseInt(hour.slice(2), 10) * 3600_000).toISOString();
    if (hour !== '*' && min !== '*') {
      const next = new Date(now);
      next.setHours(parseInt(hour, 10), parseInt(min, 10), 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      if (dayOfMonth !== '*') {
        next.setDate(parseInt(dayOfMonth, 10));
        if (next <= now) next.setMonth(next.getMonth() + 1);
      }
      return next.toISOString();
    }
    return new Date(now.getTime() + 12 * 3600_000).toISOString();
  } catch {
    return new Date(Date.now() + 12 * 3600_000).toISOString();
  }
}

async function handleExecuteAutomation(supabase: any, supabaseUrl: string, serviceKey: string, args: { automation_id: string }) {
  const { data: auto, error: fetchErr } = await supabase.from('agent_automations')
    .select('*').eq('id', args.automation_id).maybeSingle();
  if (fetchErr || !auto) return { status: 'error', error: fetchErr?.message || 'Automation not found' };

  if (auto.skill_name) {
    const { data: skill } = await supabase.from('agent_skills')
      .select('trust_level, requires_approval').eq('name', auto.skill_name).maybeSingle();
    const trustLevel = skill?.trust_level || (skill?.requires_approval ? 'approve' : 'auto');
    if (trustLevel === 'approve') {
      await supabase.from('agent_activity').insert({
        agent: 'flowpilot', skill_name: auto.skill_name,
        input: { automation_id: args.automation_id, arguments: auto.skill_arguments },
        output: { reason: 'Skill requires admin approval before execution' },
        status: 'pending_approval',
      });
      return { status: 'pending_approval', skill: auto.skill_name };
    }
  }

  let skillResult: any;
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
      body: JSON.stringify({
        skill_name: auto.skill_name,
        arguments: auto.skill_arguments || {},
        agent_type: 'flowpilot',
      }),
    });
    skillResult = await resp.json();
  } catch (err: any) {
    skillResult = { error: err.message };
  }

  let nextRun: string | null = null;
  if (auto.trigger_type === 'cron' && auto.trigger_config?.cron) {
    nextRun = calculateNextRun(auto.trigger_config.cron);
  }

  const updatePayload: Record<string, any> = {
    last_triggered_at: new Date().toISOString(),
    run_count: (auto.run_count || 0) + 1,
    last_error: skillResult.error || null,
  };
  if (nextRun) updatePayload.next_run_at = nextRun;
  await supabase.from('agent_automations').update(updatePayload).eq('id', args.automation_id);

  return {
    status: skillResult.error ? 'failed' : 'success',
    automation: auto.name,
    skill: auto.skill_name,
    next_run_at: nextRun,
    result: skillResult,
  };
}

// ─── Workflow DAGs ────────────────────────────────────────────────────────────

function resolveTemplateVars(value: any, context: Record<string, any>): any {
  if (typeof value === 'string') {
    return value.replace(/\{\{([\w.]+)\}\}/g, (match, path) => {
      const parts = path.split('.');
      let current: any = context;
      for (const p of parts) {
        if (current == null) return match;
        current = current[p];
      }
      return current !== undefined ? String(current) : match;
    });
  }
  if (Array.isArray(value)) return value.map((v) => resolveTemplateVars(v, context));
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) result[k] = resolveTemplateVars(v, context);
    return result;
  }
  return value;
}

function evaluateCondition(condition: any, context: Record<string, any>): boolean {
  const { step, field, operator, value } = condition;
  const stepCtx = context[step];
  if (!stepCtx) return false;
  const parts = (field as string).split('.');
  let actual: any = stepCtx;
  for (const p of parts) {
    if (actual == null) return false;
    actual = actual[p];
  }
  switch (operator) {
    case 'eq': return actual == value;
    case 'neq': return actual != value;
    case 'gt': return Number(actual) > Number(value);
    case 'lt': return Number(actual) < Number(value);
    case 'contains': return String(actual).includes(String(value));
    case 'truthy': return Boolean(actual);
    default: return true;
  }
}

async function handleWorkflowCreate(supabase: any, args: any) {
  const { name, description, steps, trigger_type = 'manual', trigger_config = {} } = args;
  if (!name || !steps?.length) return { status: 'error', error: 'name and steps are required' };
  const { data, error } = await supabase.from('agent_workflows')
    .insert({ name, description, steps, trigger_type, trigger_config })
    .select('id, name, trigger_type').single();
  if (error) return { status: 'error', error: error.message };
  return { status: 'created', workflow: data, step_count: steps.length };
}

async function handleWorkflowList(supabase: any) {
  const { data } = await supabase.from('agent_workflows')
    .select('id, name, description, trigger_type, enabled, run_count, last_run_at, last_error, steps')
    .order('created_at', { ascending: false });
  return {
    workflows: (data || []).map((w: any) => ({
      ...w, step_count: Array.isArray(w.steps) ? w.steps.length : 0, steps: undefined,
    })),
    count: data?.length || 0,
  };
}

async function handleWorkflowUpdate(supabase: any, args: { workflow_id?: string; workflow_name?: string; updates: Record<string, any> }) {
  const safeFields = ['name', 'description', 'steps', 'trigger_type', 'trigger_config', 'enabled'];
  const filtered: Record<string, any> = {};
  for (const [k, v] of Object.entries(args.updates)) {
    if (safeFields.includes(k)) filtered[k] = v;
  }
  if (Object.keys(filtered).length === 0) return { status: 'error', error: 'No valid fields to update' };
  filtered.updated_at = new Date().toISOString();

  let q = supabase.from('agent_workflows').update(filtered);
  if (args.workflow_id) q = q.eq('id', args.workflow_id);
  else if (args.workflow_name) q = q.eq('name', args.workflow_name);
  else return { status: 'error', error: 'Provide workflow_id or workflow_name' };

  const { data, error } = await q.select('id, name, enabled').single();
  if (error) return { status: 'error', error: error.message };
  return { status: 'updated', workflow: data };
}

async function handleWorkflowDelete(supabase: any, args: { workflow_id?: string; workflow_name?: string }) {
  let q = supabase.from('agent_workflows').delete();
  if (args.workflow_id) q = q.eq('id', args.workflow_id);
  else if (args.workflow_name) q = q.eq('name', args.workflow_name);
  else return { status: 'error', error: 'Provide workflow_id or workflow_name' };

  const { data, error } = await q.select('id, name').single();
  if (error) return { status: 'error', error: error.message };
  return { status: 'deleted', workflow: data };
}


async function handleWorkflowExecute(
  supabase: any, supabaseUrl: string, serviceKey: string,
  args: { workflow_id?: string; workflow_name?: string; input?: Record<string, any> },
) {
  let q = supabase.from('agent_workflows').select('*');
  if (args.workflow_id) q = q.eq('id', args.workflow_id);
  else if (args.workflow_name) q = q.eq('name', args.workflow_name);
  else return { status: 'error', error: 'workflow_id or workflow_name required' };

  const { data: wf, error } = await q.maybeSingle();
  if (error || !wf) return { status: 'error', error: error?.message || 'Workflow not found' };

  const steps: any[] = wf.steps || [];
  const context: Record<string, any> = { input: args.input || {} };
  const trace: any[] = [];
  let overallStatus = 'completed';

  for (const step of steps) {
    if (step.condition) {
      const condMet = evaluateCondition(step.condition, context);
      if (!condMet) {
        trace.push({ id: step.id, skill: step.skill_name, status: 'skipped', reason: 'condition not met' });
        context[step.id] = { status: 'skipped' };
        continue;
      }
    }

    const resolvedArgs = resolveTemplateVars(step.skill_args || {}, context);
    let result: any;
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
        body: JSON.stringify({ skill_name: step.skill_name, arguments: resolvedArgs, agent_type: 'flowpilot' }),
      });
      result = await resp.json();
    } catch (err: any) {
      result = { error: err.message };
    }

    const success = !result.error && result.status !== 'failed';
    trace.push({ id: step.id, skill: step.skill_name, status: success ? 'done' : 'failed', result });
    context[step.id] = { status: success ? 'done' : 'failed', result };

    if (!success && (step.on_failure || 'stop') === 'stop') {
      overallStatus = 'failed';
      break;
    }
  }

  await supabase.from('agent_workflows').update({
    run_count: (wf.run_count || 0) + 1,
    last_run_at: new Date().toISOString(),
    last_error: overallStatus === 'failed' ? (trace.find((s) => s.status === 'failed')?.result?.error || 'step failed') : null,
  }).eq('id', wf.id);

  return {
    status: overallStatus,
    workflow: wf.name,
    steps_executed: trace.filter((s) => s.status !== 'skipped').length,
    steps_skipped: trace.filter((s) => s.status === 'skipped').length,
    trace,
  };
}

// ─── A2A Delegation ───────────────────────────────────────────────────────────

const SPECIALIST_PROMPTS: Record<string, string> = {
  seo: 'You are an SEO specialist. Focus on: keyword analysis, meta optimization, content structure, link building, page speed, Core Web Vitals. Provide specific, actionable recommendations with priority order.',
  content: 'You are a content strategy specialist. Focus on: audience alignment, content quality, editorial calendar, SEO integration, distribution channels. Write compelling, engaging content that drives results.',
  sales: 'You are a sales intelligence specialist. Focus on: lead qualification, pipeline analysis, deal strategy, ICP fit, outreach personalization. Prioritize revenue impact and provide concrete next actions.',
  analytics: 'You are a data analytics specialist. Focus on: trend identification, anomaly detection, conversion funnels, cohort analysis, actionable insights. Back every conclusion with data and suggest experiments.',
  email: 'You are an email marketing specialist. Focus on: subject lines, personalization, segmentation, deliverability, A/B testing, lifecycle campaigns. Optimize for open rates, click rates, and conversions.',
};

async function handleDelegateTask(
  supabase: any, _supabaseUrl: string, _serviceKey: string,
  args: { agent_name: string; task: string; context?: Record<string, any> },
) {
  const { agent_name, task, context = {} } = args;

  const { data: profile } = await supabase.from('agent_memory')
    .select('value').eq('key', `agent:${agent_name}`).maybeSingle();

  const systemPrompt = profile?.value?.system_prompt
    || SPECIALIST_PROMPTS[agent_name]
    || `You are a specialist agent focused on ${agent_name}. Complete the given task thoroughly and concisely.`;

  const { apiKey, apiUrl, model } = await resolveAiConfig(supabase, 'fast');
  const contextStr = Object.keys(context).length > 0
    ? `\n\nContext:\n${JSON.stringify(context, null, 2)}`
    : '';

  try {
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${task}${contextStr}` },
        ],
        max_tokens: 1500,
      }),
    });
    if (!resp.ok) throw new Error(`AI error: ${resp.status}`);
    const data = await resp.json();
    const response = data.choices?.[0]?.message?.content || 'No response generated.';
    return { status: 'completed', agent: agent_name, task, response };
  } catch (err: any) {
    return { status: 'error', agent: agent_name, error: err.message };
  }
}

// ─── Skill Packs ──────────────────────────────────────────────────────────────

async function handleSkillPackList(supabase: any) {
  const { data } = await supabase.from('agent_skill_packs')
    .select('id, name, description, version, installed, installed_at, skills')
    .order('name');
  return {
    packs: (data || []).map((p: any) => ({
      id: p.id, name: p.name, description: p.description,
      version: p.version, installed: p.installed, installed_at: p.installed_at,
      skill_count: Array.isArray(p.skills) ? p.skills.length : 0,
    })),
    count: data?.length || 0,
  };
}

async function handleSkillPackInstall(supabase: any, args: { pack_name: string }) {
  const { data: pack, error } = await supabase.from('agent_skill_packs')
    .select('*').eq('name', args.pack_name).maybeSingle();
  if (error || !pack) return { status: 'error', error: error?.message || 'Pack not found. Use skill_pack_list to see available packs.' };

  const skills: any[] = pack.skills || [];
  const results: any[] = [];

  for (const skill of skills) {
    const { data: existing } = await supabase.from('agent_skills')
      .select('id').eq('name', skill.name).maybeSingle();

    if (existing) {
      await supabase.from('agent_skills')
        .update({ description: skill.description, updated_at: new Date().toISOString() })
        .eq('name', skill.name);
      results.push({ skill: skill.name, action: 'updated' });
    } else {
      const { error: insertErr } = await supabase.from('agent_skills').insert({
        name: skill.name,
        description: skill.description,
        handler: skill.handler,
        category: skill.category || 'automation',
        scope: skill.scope || 'internal',
        trust_level: skill.trust_level || (skill.requires_approval ? 'approve' : 'auto'),
        requires_approval: skill.requires_approval ?? false,
        enabled: skill.enabled ?? true,
        instructions: skill.instructions || null,
        tool_definition: skill.tool_definition || null,
        origin: 'managed',
      });
      results.push({ skill: skill.name, action: insertErr ? 'failed' : 'created', error: insertErr?.message });
    }
  }

  await supabase.from('agent_skill_packs').update({
    installed: true, installed_at: new Date().toISOString(),
  }).eq('id', pack.id);

  return {
    status: 'installed',
    pack: args.pack_name,
    skills_processed: results.length,
    results,
  };
}

// ─── Self-Healing (ported from ClawCMS) ───────────────────────────────────────

export async function runSelfHealing(supabase: any): Promise<string> {
  const since = new Date();
  since.setDate(since.getDate() - 3);
  const { data: recentActivity } = await supabase
    .from('agent_activity')
    .select('skill_name, status, created_at')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false }).limit(200);

  if (!recentActivity?.length) return '';

  const skillStreaks: Record<string, number> = {};
  const checked = new Set<string>();

  for (const a of recentActivity) {
    const name = a.skill_name;
    if (!name || checked.has(name)) continue;
    if (a.status === 'failed') {
      skillStreaks[name] = (skillStreaks[name] || 0) + 1;
    } else {
      checked.add(name);
    }
  }

  const toDisable = Object.entries(skillStreaks)
    .filter(([, count]) => count >= SELF_HEAL_THRESHOLD)
    .map(([name]) => name);

  if (!toDisable.length) return '';

  for (const skillName of toDisable) {
    await supabase.from('agent_skills')
      .update({ enabled: false })
      .eq('name', skillName);
    console.log(`[self-heal] Auto-disabled skill: ${skillName} (${skillStreaks[skillName]} consecutive failures)`);
  }

  for (const skillName of toDisable) {
    await supabase.from('agent_automations')
      .update({ enabled: false, last_error: `Auto-disabled: ${SELF_HEAL_THRESHOLD}+ consecutive failures` })
      .eq('skill_name', skillName)
      .eq('enabled', true);
  }

  return `\n\n⚠️ Self-healing: Auto-disabled ${toDisable.length} skills due to repeated failures: ${toDisable.join(', ')}`;
}

// ─── Skill CRUD (Self-Modification) ──────────────────────────────────────────

async function handleSkillCreate(supabase: any, args: any) {
  const { data: existing } = await supabase
    .from('agent_skills').select('id').eq('name', args.name).maybeSingle();
  if (existing) return { status: 'error', error: `Skill "${args.name}" already exists` };

  const { data, error } = await supabase.from('agent_skills').insert({
    name: args.name,
    description: args.description,
    handler: args.handler,
    category: args.category || 'automation',
    scope: args.scope || 'internal',
    trust_level: args.trust_level || 'approve',
    requires_approval: (args.trust_level || 'approve') === 'approve',
    enabled: true,
    tool_definition: args.tool_definition,
    origin: 'agent',
  }).select('id, name, handler, enabled, trust_level, origin').single();

  if (error) return { status: 'error', error: error.message };
  return { status: 'created', skill: data };
}

async function handleSkillUpdate(supabase: any, args: { skill_name: string; updates: Record<string, any> }) {
  const safeFields = ['description', 'handler', 'category', 'scope', 'trust_level', 'requires_approval', 'enabled', 'tool_definition', 'instructions'];
  const filtered: Record<string, any> = {};
  for (const [k, v] of Object.entries(args.updates)) {
    if (safeFields.includes(k)) filtered[k] = v;
  }
  if (Object.keys(filtered).length === 0) return { status: 'error', error: 'No valid fields to update' };
  filtered.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('agent_skills').update(filtered).eq('name', args.skill_name).select('id, name, enabled').single();
  if (error) return { status: 'error', error: error.message };
  return { status: 'updated', skill: data };
}

async function handleSkillList(supabase: any, args: { category?: string; scope?: string; include_disabled?: boolean }) {
  let q = supabase.from('agent_skills').select('id, name, description, category, scope, handler, enabled, trust_level, requires_approval');
  if (!args.include_disabled) q = q.eq('enabled', true);
  if (args.category) q = q.eq('category', args.category);
  if (args.scope) q = q.eq('scope', args.scope);
  const { data } = await q.order('category').order('name');
  return { skills: data || [], count: data?.length || 0 };
}

async function handleSkillDisable(supabase: any, args: { skill_name: string }) {
  const { data, error } = await supabase
    .from('agent_skills').update({ enabled: false, updated_at: new Date().toISOString() }).eq('name', args.skill_name).select('id, name').single();
  if (error) return { status: 'error', error: error.message };
  return { status: 'disabled', skill: data };
}

async function handleSkillEnable(supabase: any, args: { skill_name: string }) {
  const { data, error } = await supabase
    .from('agent_skills').update({ enabled: true, updated_at: new Date().toISOString() }).eq('name', args.skill_name).select('id, name').single();
  if (error) return { status: 'error', error: error.message };
  return { status: 'enabled', skill: data };
}

async function handleSkillDelete(supabase: any, args: { skill_name: string }) {
  const { data, error } = await supabase
    .from('agent_skills').delete().eq('name', args.skill_name).select('id, name').single();
  if (error) return { status: 'error', error: error.message };
  return { status: 'deleted', skill: data };
}

async function handleSkillInstruct(supabase: any, args: { skill_name: string; instructions: string }) {
  const { data, error } = await supabase
    .from('agent_skills').update({ instructions: args.instructions, updated_at: new Date().toISOString() }).eq('name', args.skill_name).select('id, name, instructions').single();
  if (error) return { status: 'error', error: error.message };

  // Log activity so Evolution panel can track instruction rewrites
  await supabase.from('agent_activity').insert({
    agent: 'flowpilot',
    skill_name: 'skill_instruct',
    input: { skill_name: args.skill_name, instructions_length: args.instructions.length },
    output: { skill_id: data.id, skill_name: data.name, preview: args.instructions.slice(0, 200) },
    status: 'success',
  });

  return { status: 'updated', skill: data };
}

// ─── Soul Update ──────────────────────────────────────────────────────────────

async function handleSoulUpdate(supabase: any, args: { field: string; value: any }) {
  const { data: existing } = await supabase
    .from('agent_memory').select('id, value').eq('key', 'soul').maybeSingle();

  const currentSoul = existing?.value || {};
  const updatedSoul = { ...currentSoul, [args.field]: args.value };

  if (existing) {
    await supabase.from('agent_memory')
      .update({ value: updatedSoul, updated_at: new Date().toISOString() }).eq('id', existing.id);
  } else {
    await supabase.from('agent_memory')
      .insert({ key: 'soul', value: updatedSoul, category: 'preference', created_by: 'flowpilot' });
  }
  return { status: 'updated', field: args.field, soul: updatedSoul };
}

// ─── Agents Update (operational rules) ────────────────────────────────────────

async function handleAgentsUpdate(supabase: any, args: { field: string; value: any }) {
  const { data: existing } = await supabase
    .from('agent_memory').select('id, value').eq('key', 'agents').maybeSingle();

  const currentAgents = existing?.value || {};
  const updatedAgents = { ...currentAgents, [args.field]: args.value, version: currentAgents.version || '1.0' };

  if (existing) {
    await supabase.from('agent_memory')
      .update({ value: updatedAgents, updated_at: new Date().toISOString() }).eq('id', existing.id);
  } else {
    await supabase.from('agent_memory')
      .insert({ key: 'agents', value: updatedAgents, category: 'preference', created_by: 'flowpilot' });
  }
  return { status: 'updated', field: args.field, agents: updatedAgents };
}

// ─── Heartbeat Protocol Update ────────────────────────────────────────────────

async function handleHeartbeatProtocolUpdate(supabase: any, args: { action: string; protocol?: string }) {
  if (args.action === 'get') {
    const custom = await loadHeartbeatProtocol(supabase);
    return { status: 'ok', protocol: custom || getDefaultHeartbeatProtocol(), is_custom: !!custom };
  }
  if (args.action === 'reset') {
    await supabase.from('agent_memory').delete().eq('key', 'heartbeat_protocol');
    return { status: 'reset', message: 'Heartbeat protocol restored to default' };
  }
  if (args.action === 'set') {
    if (!args.protocol) return { status: 'error', error: 'protocol text is required for action=set' };
    await saveHeartbeatProtocol(supabase, args.protocol);
    return { status: 'updated', message: 'Custom heartbeat protocol saved. Will be used on next heartbeat.' };
  }
  return { status: 'error', error: `Unknown action: ${args.action}` };
}

// ─── Automation CRUD ──────────────────────────────────────────────────────────

async function handleAutomationCreate(supabase: any, args: any) {
  const { data: skill } = await supabase
    .from('agent_skills').select('id').eq('name', args.skill_name).eq('enabled', true).maybeSingle();

  const { data, error } = await supabase.from('agent_automations').insert({
    name: args.name,
    description: args.description || null,
    trigger_type: args.trigger_type || 'cron',
    trigger_config: args.trigger_config || {},
    skill_id: skill?.id || null,
    skill_name: args.skill_name,
    skill_arguments: args.skill_arguments || {},
    enabled: args.enabled ?? false,
  }).select('id, name, trigger_type, enabled').single();

  if (error) return { status: 'error', error: error.message };
  return { status: 'created', automation: data };
}

async function handleAutomationList(supabase: any, args: { enabled_only?: boolean }) {
  let q = supabase.from('agent_automations').select('id, name, description, trigger_type, trigger_config, skill_name, enabled, run_count, last_triggered_at, next_run_at, last_error');
  if (args.enabled_only) q = q.eq('enabled', true);
  const { data } = await q.order('created_at', { ascending: false });
  return { automations: data || [], count: data?.length || 0 };
}

async function handleAutomationUpdate(supabase: any, args: { automation_id?: string; automation_name?: string; updates: Record<string, any> }) {
  const safeFields = ['name', 'description', 'trigger_type', 'trigger_config', 'skill_name', 'skill_arguments', 'enabled'];
  const filtered: Record<string, any> = {};
  for (const [k, v] of Object.entries(args.updates)) {
    if (safeFields.includes(k)) filtered[k] = v;
  }
  if (Object.keys(filtered).length === 0) return { status: 'error', error: 'No valid fields to update' };
  filtered.updated_at = new Date().toISOString();

  let q = supabase.from('agent_automations').update(filtered);
  if (args.automation_id) q = q.eq('id', args.automation_id);
  else if (args.automation_name) q = q.eq('name', args.automation_name);
  else return { status: 'error', error: 'Provide automation_id or automation_name' };

  const { data, error } = await q.select('id, name, enabled').single();
  if (error) return { status: 'error', error: error.message };
  return { status: 'updated', automation: data };
}

async function handleAutomationDelete(supabase: any, args: { automation_id?: string; automation_name?: string }) {
  let q = supabase.from('agent_automations').delete();
  if (args.automation_id) q = q.eq('id', args.automation_id);
  else if (args.automation_name) q = q.eq('name', args.automation_name);
  else return { status: 'error', error: 'Provide automation_id or automation_name' };

  const { data, error } = await q.select('id, name').single();
  if (error) return { status: 'error', error: error.message };
  return { status: 'deleted', automation: data };
}

// ─── Reflection ───────────────────────────────────────────────────────────────

async function handleReflect(supabase: any, args: { focus?: string }) {
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const { data: recentActivity } = await supabase
    .from('agent_activity')
    .select('skill_name, status, duration_ms, error_message, created_at')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(100);

  const activities = recentActivity || [];
  const skillStats: Record<string, { count: number; errors: number; avg_ms: number; last_error?: string }> = {};
  for (const a of activities) {
    const name = a.skill_name || 'unknown';
    if (!skillStats[name]) skillStats[name] = { count: 0, errors: 0, avg_ms: 0 };
    skillStats[name].count++;
    if (a.status === 'failed') {
      skillStats[name].errors++;
      skillStats[name].last_error = a.error_message;
    }
    if (a.duration_ms) {
      skillStats[name].avg_ms = Math.round(
        (skillStats[name].avg_ms * (skillStats[name].count - 1) + a.duration_ms) / skillStats[name].count
      );
    }
  }

  const { data: allSkills } = await supabase.from('agent_skills').select('name, category, handler, enabled').order('category');
  const { data: automations } = await supabase.from('agent_automations').select('name, trigger_type, skill_name, enabled, run_count');
  const { data: objectives } = await supabase.from('agent_objectives').select('goal, status, progress');

  const suggestions: string[] = [];
  for (const [name, s] of Object.entries(skillStats)) {
    if (s.errors > 2) suggestions.push(`Skill "${name}" has ${s.errors} failures — consider debugging.`);
  }
  const automatedSkills = new Set((automations || []).map((a: any) => a.skill_name));
  for (const [name, s] of Object.entries(skillStats)) {
    if (s.count >= 5 && !automatedSkills.has(name)) suggestions.push(`"${name}" used ${s.count} times — consider automating.`);
  }
  const usedSkills = new Set(Object.keys(skillStats));
  const unusedSkills = (allSkills || []).filter((s: any) => s.enabled && !usedSkills.has(s.name));
  if (unusedSkills.length > 3) suggestions.push(`${unusedSkills.length} skills never used. Consider disabling or promoting them.`);
  if (suggestions.length === 0) suggestions.push('System running well. No improvements suggested.');

  const learnings: string[] = [];
  for (const [name, s] of Object.entries(skillStats)) {
    if (s.errors > 2 && s.last_error) learnings.push(`Skill "${name}" fails frequently: ${s.last_error}`);
  }
  if (learnings.length > 0) {
    await supabase.from('agent_memory').upsert({
      key: `lesson:reflect_${new Date().toISOString().slice(0, 10)}`,
      value: { learnings, suggestions, generated_at: new Date().toISOString() },
      category: 'fact',
      created_by: 'flowpilot',
    }, { onConflict: 'key' });
  }

  return {
    period: '7 days',
    total_actions: activities.length,
    skill_usage: skillStats,
    registered_skills: allSkills?.length || 0,
    active_automations: automations?.filter((a: any) => a.enabled).length || 0,
    total_automations: automations?.length || 0,
    active_objectives: objectives?.filter((o: any) => o.status === 'active').length || 0,
    skills: allSkills || [],
    automations: automations || [],
    objectives: objectives || [],
    suggestions,
    auto_persisted_learnings: learnings.length,
  };
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

// Keep backward-compat export
export async function loadSkillInstructions(_supabase: any): Promise<string> {
  return '';
}

// ─── Built-in Tool Definitions ────────────────────────────────────────────────

const MEMORY_TOOLS = [
  { type: 'function', function: { name: 'memory_write', description: 'Save something to your persistent memory. Generates vector embedding for semantic search.', parameters: { type: 'object', properties: { key: { type: 'string', description: 'Short identifier' }, value: { type: 'string', description: 'The information to remember' }, category: { type: 'string', enum: ['preference', 'context', 'fact'] } }, required: ['key', 'value'] } } },
  { type: 'function', function: { name: 'memory_read', description: 'Search your persistent memory using hybrid search (vector similarity + keyword matching). Finds both semantically similar AND exact keyword matches (IDs, error strings, names).', parameters: { type: 'object', properties: { key: { type: 'string', description: 'Keyword search term — good for exact matches (IDs, names, error codes)' }, category: { type: 'string', enum: ['preference', 'context', 'fact'] }, semantic_query: { type: 'string', description: 'Natural language query for semantic search — good for conceptual matching' } } } } },
  { type: 'function', function: { name: 'memory_delete', description: 'Delete a memory entry by key.', parameters: { type: 'object', properties: { key: { type: 'string', description: 'The memory key to delete' } }, required: ['key'] } } },
];

const OBJECTIVE_TOOLS = [
  { type: 'function', function: { name: 'objective_update_progress', description: 'Update progress on an active objective.', parameters: { type: 'object', properties: { objective_id: { type: 'string' }, progress: { type: 'object', description: 'Updated progress object' } }, required: ['objective_id', 'progress'] } } },
  { type: 'function', function: { name: 'objective_complete', description: 'Mark an objective as completed.', parameters: { type: 'object', properties: { objective_id: { type: 'string' } }, required: ['objective_id'] } } },
  { type: 'function', function: { name: 'objective_delete', description: 'Permanently delete an objective and its linked activities.', parameters: { type: 'object', properties: { objective_id: { type: 'string' } }, required: ['objective_id'] } } },
];

const SELF_MOD_TOOLS = [
  { type: 'function', function: { name: 'skill_create', description: 'Create a new skill in your registry.', parameters: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, handler: { type: 'string' }, category: { type: 'string', enum: ['content', 'crm', 'communication', 'automation', 'search', 'analytics'] }, scope: { type: 'string', enum: ['internal', 'external', 'both'] }, trust_level: { type: 'string', enum: ['auto', 'notify', 'approve'], description: 'auto=silent execution, notify=execute+notify admin, approve=block until approved' }, tool_definition: { type: 'object' } }, required: ['name', 'description', 'handler', 'tool_definition'] } } },
  { type: 'function', function: { name: 'skill_update', description: 'Update an existing skill.', parameters: { type: 'object', properties: { skill_name: { type: 'string' }, updates: { type: 'object' } }, required: ['skill_name', 'updates'] } } },
  { type: 'function', function: { name: 'skill_list', description: 'List all registered skills.', parameters: { type: 'object', properties: { category: { type: 'string' }, scope: { type: 'string' }, include_disabled: { type: 'boolean' } } } } },
  { type: 'function', function: { name: 'skill_disable', description: 'Disable a skill.', parameters: { type: 'object', properties: { skill_name: { type: 'string' } }, required: ['skill_name'] } } },
  { type: 'function', function: { name: 'skill_enable', description: 'Re-enable a disabled skill.', parameters: { type: 'object', properties: { skill_name: { type: 'string' } }, required: ['skill_name'] } } },
  { type: 'function', function: { name: 'skill_delete', description: 'Permanently delete a skill from the registry.', parameters: { type: 'object', properties: { skill_name: { type: 'string' } }, required: ['skill_name'] } } },
  { type: 'function', function: { name: 'skill_instruct', description: 'Add rich instructions/knowledge to a skill.', parameters: { type: 'object', properties: { skill_name: { type: 'string' }, instructions: { type: 'string' } }, required: ['skill_name', 'instructions'] } } },
  { type: 'function', function: { name: 'automation_create', description: 'Create a new automation. Disabled by default for safety.', parameters: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, trigger_type: { type: 'string', enum: ['cron', 'event', 'signal'] }, trigger_config: { type: 'object' }, skill_name: { type: 'string' }, skill_arguments: { type: 'object' }, enabled: { type: 'boolean' } }, required: ['name', 'trigger_type', 'trigger_config', 'skill_name'] } } },
  { type: 'function', function: { name: 'automation_list', description: 'List all automations.', parameters: { type: 'object', properties: { enabled_only: { type: 'boolean' } } } } },
  { type: 'function', function: { name: 'automation_update', description: 'Update an existing automation by ID or name.', parameters: { type: 'object', properties: { automation_id: { type: 'string' }, automation_name: { type: 'string' }, updates: { type: 'object', description: 'Fields to update: name, description, trigger_type, trigger_config, skill_name, skill_arguments, enabled' } }, required: ['updates'] } } },
  { type: 'function', function: { name: 'automation_delete', description: 'Permanently delete an automation by ID or name.', parameters: { type: 'object', properties: { automation_id: { type: 'string' }, automation_name: { type: 'string' } } } } },
];

const REFLECT_TOOL = [
  { type: 'function', function: { name: 'reflect', description: 'Analyze your performance over the past week. Auto-persists learnings.', parameters: { type: 'object', properties: { focus: { type: 'string', description: 'Focus area: errors, usage, automations, objectives' } } } } },
];

const SOUL_TOOL = [
  { type: 'function', function: { name: 'soul_update', description: 'Update your personality, values, tone, or philosophy.', parameters: { type: 'object', properties: { field: { type: 'string', enum: ['purpose', 'values', 'tone', 'philosophy'] }, value: { type: 'string', description: 'New value' } }, required: ['field', 'value'] } } },
  { type: 'function', function: { name: 'agents_update', description: 'Update your operational rules, policies, and conventions (AGENTS document). Fields: direct_action_rules, self_improvement, memory_guidelines, browser_rules, workflow_conventions, a2a_conventions, skill_pack_rules, custom_rules.', parameters: { type: 'object', properties: { field: { type: 'string', enum: ['direct_action_rules', 'self_improvement', 'memory_guidelines', 'browser_rules', 'workflow_conventions', 'a2a_conventions', 'skill_pack_rules', 'custom_rules'] }, value: { type: 'string', description: 'New value for this operational rule section' } }, required: ['field', 'value'] } } },
  { type: 'function', function: { name: 'heartbeat_protocol_update', description: 'Update the heartbeat protocol — the step-by-step procedure FlowPilot follows during autonomous heartbeat runs. Use to add/remove/reorder steps, or adjust priorities. Pass action="get" to read the current protocol, action="set" with protocol text to update, or action="reset" to restore default.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['get', 'set', 'reset'] }, protocol: { type: 'string', description: 'New protocol text (required for action=set)' } }, required: ['action'] } } },
];

const PLANNING_TOOLS = [
  { type: 'function', function: { name: 'decompose_objective', description: 'Break an objective into 3-7 ordered steps using AI planning.', parameters: { type: 'object', properties: { objective_id: { type: 'string', description: 'The objective UUID to decompose' } }, required: ['objective_id'] } } },
  { type: 'function', function: { name: 'advance_plan', description: "Execute the next pending step(s) in an objective's plan with automatic chaining (up to 4 steps).", parameters: { type: 'object', properties: { objective_id: { type: 'string' }, chain: { type: 'boolean', description: 'Auto-chain consecutive steps (default: true)' } }, required: ['objective_id'] } } },
  { type: 'function', function: { name: 'propose_objective', description: 'Proactively create a new objective based on signal patterns or strategic gaps.', parameters: { type: 'object', properties: { goal: { type: 'string' }, reason: { type: 'string' }, constraints: { type: 'object' }, success_criteria: { type: 'object' } }, required: ['goal', 'reason'] } } },
];

const AUTOMATION_EXEC_TOOLS = [
  { type: 'function', function: { name: 'execute_automation', description: 'Execute an enabled automation by ID.', parameters: { type: 'object', properties: { automation_id: { type: 'string' } }, required: ['automation_id'] } } },
];

const WORKFLOW_TOOLS = [
  {
    type: 'function', function: {
      name: 'workflow_create',
      description: 'Create a multi-step workflow with conditional branching. Steps support {{stepId.result.field}} templates to pass data between steps.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Unique workflow name' },
          description: { type: 'string' },
          steps: {
            type: 'array',
            description: 'Ordered steps. Each step: {id, skill_name, skill_args, condition?, on_failure?}',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Step ID e.g. "s1"' },
                skill_name: { type: 'string' },
                skill_args: { type: 'object', description: 'Supports {{stepId.result.field}} templates' },
                condition: { type: 'object', description: 'Optional: {step, field, operator, value}. Operators: eq|neq|gt|lt|contains|truthy' },
                on_failure: { type: 'string', enum: ['stop', 'continue'], description: 'Default: stop' },
              },
              required: ['id', 'skill_name'],
            },
          },
          trigger_type: { type: 'string', enum: ['manual', 'cron', 'event', 'signal'], description: 'Default: manual' },
          trigger_config: { type: 'object' },
        },
        required: ['name', 'steps'],
      },
    },
  },
  {
    type: 'function', function: {
      name: 'workflow_execute',
      description: 'Execute a workflow by name or ID. Returns step-by-step execution trace with results.',
      parameters: {
        type: 'object',
        properties: {
          workflow_id: { type: 'string' },
          workflow_name: { type: 'string' },
          input: { type: 'object', description: 'Input context accessible as {{input.field}} in steps' },
        },
      },
    },
  },
  {
    type: 'function', function: {
      name: 'workflow_list',
      description: 'List all registered workflows with run history and status.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function', function: {
      name: 'workflow_update',
      description: 'Update an existing workflow by ID or name.',
      parameters: {
        type: 'object',
        properties: {
          workflow_id: { type: 'string' },
          workflow_name: { type: 'string' },
          updates: { type: 'object', description: 'Fields to update: name, description, steps, trigger_type, trigger_config, enabled' },
        },
        required: ['updates'],
      },
    },
  },
  {
    type: 'function', function: {
      name: 'workflow_delete',
      description: 'Permanently delete a workflow by ID or name.',
      parameters: {
        type: 'object',
        properties: {
          workflow_id: { type: 'string' },
          workflow_name: { type: 'string' },
        },
      },
    },
  },
];

const A2A_TOOLS = [
  {
    type: 'function', function: {
      name: 'delegate_task',
      description: "Delegate a subtask to a specialized agent. Built-in: 'seo', 'content', 'sales', 'analytics', 'email'. Returns specialist's focused analysis.",
      parameters: {
        type: 'object',
        properties: {
          agent_name: { type: 'string', description: "Specialist: 'seo' | 'content' | 'sales' | 'analytics' | 'email', or any custom name" },
          task: { type: 'string', description: 'The specific task for the specialist to handle' },
          context: { type: 'object', description: 'Optional context data to pass to the specialist' },
        },
        required: ['agent_name', 'task'],
      },
    },
  },
];

const SKILL_PACK_TOOLS = [
  {
    type: 'function', function: {
      name: 'skill_pack_list',
      description: 'List available skill packs and their installation status.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function', function: {
      name: 'skill_pack_install',
      description: 'Install a skill pack — adds multiple related skills in one operation.',
      parameters: {
        type: 'object',
        properties: {
          pack_name: { type: 'string', description: 'Pack name from skill_pack_list' },
        },
        required: ['pack_name'],
      },
    },
  },
];

const CHAIN_SKILLS_TOOL = [
  {
    type: 'function', function: {
      name: 'chain_skills',
      description: 'Execute multiple skills in sequence, piping each result as context to the next. Use for multi-step recipes like: research → write → optimize. Returns all results.',
      parameters: {
        type: 'object',
        properties: {
          steps: {
            type: 'array',
            description: 'Ordered array of skills to chain. Each step gets previous results injected into args as _previous_result.',
            items: {
              type: 'object',
              properties: {
                skill_name: { type: 'string', description: 'Skill to execute' },
                args: { type: 'object', description: 'Arguments for the skill. Use {{prev.field}} to reference previous step output.' },
              },
            },
          },
          stop_on_error: { type: 'boolean', description: 'Stop chain on first error (default: true)' },
        },
        required: ['steps'],
      },
    },
  },
];

const OUTCOME_TOOLS = [
  {
    type: 'function', function: {
      name: 'evaluate_outcomes',
      description: 'Fetch recent agent actions that have not been evaluated yet. Returns activities enriched with CAUSAL correlation data specific to each action (e.g. page views for the exact blog post written, leads from the specific source). Also includes a skill scorecard showing historical success rates and past learnings.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max number of unevaluated actions to return (default 15)' },
          skill_filter: { type: 'string', description: 'Optional: only evaluate actions from this skill' },
          include_too_early: { type: 'boolean', description: 'Re-evaluate actions previously marked as too_early (default false)' },
        },
      },
    },
  },
  {
    type: 'function', function: {
      name: 'record_outcome',
      description: 'Record the evaluated outcome of a past agent action. Closes the feedback loop so FlowPilot learns what works.',
      parameters: {
        type: 'object',
        properties: {
          activity_id: { type: 'string', description: 'The agent_activity ID to evaluate' },
          outcome_status: { type: 'string', enum: ['success', 'partial', 'neutral', 'negative', 'too_early'], description: 'Assessed outcome' },
          outcome_data: { type: 'object', description: 'Quantitative evidence: {views_generated, leads_attributed, conversions, bookings, revenue_cents, notes}' },
        },
        required: ['activity_id', 'outcome_status'],
      },
    },
  },
];

export function getBuiltInTools(groups: Array<'memory' | 'objectives' | 'self-mod' | 'reflect' | 'soul' | 'planning' | 'automations-exec' | 'workflows' | 'a2a' | 'skill-packs'>): any[] {
  const tools: any[] = [];
  if (groups.includes('memory')) tools.push(...MEMORY_TOOLS);
  if (groups.includes('objectives')) tools.push(...OBJECTIVE_TOOLS);
  if (groups.includes('self-mod')) tools.push(...SELF_MOD_TOOLS);
  if (groups.includes('reflect')) tools.push(...REFLECT_TOOL);
  if (groups.includes('soul')) tools.push(...SOUL_TOOL);
  if (groups.includes('planning')) tools.push(...PLANNING_TOOLS);
  if (groups.includes('automations-exec')) tools.push(...AUTOMATION_EXEC_TOOLS);
  if (groups.includes('workflows')) tools.push(...WORKFLOW_TOOLS);
  if (groups.includes('a2a')) tools.push(...A2A_TOOLS);
  if (groups.includes('skill-packs')) tools.push(...SKILL_PACK_TOOLS);
  // Chain skills always available when planning is available
  if (groups.includes('planning')) tools.push(...CHAIN_SKILLS_TOOL);
  // Outcome evaluation always available with planning
  if (groups.includes('planning')) tools.push(...OUTCOME_TOOLS);
  return tools;
}

// ─── Skill Chaining ───────────────────────────────────────────────────────────

async function handleChainSkills(
  supabase: any, supabaseUrl: string, serviceKey: string,
  args: { steps: Array<{ skill_name: string; args?: Record<string, any> }>; stop_on_error?: boolean },
) {
  const { steps = [], stop_on_error = true } = args;
  if (!steps.length) return { status: 'error', error: 'No steps provided' };
  if (steps.length > 6) return { status: 'error', error: 'Max 6 steps per chain' };

  const trace: any[] = [];
  let previousResult: any = null;

  for (const step of steps) {
    // Inject previous result into args
    const resolvedArgs: Record<string, any> = { ...(step.args || {}) };
    if (previousResult) {
      resolvedArgs._previous_result = previousResult;
      // Resolve {{prev.field}} template vars
      for (const [k, v] of Object.entries(resolvedArgs)) {
        if (typeof v === 'string' && v.includes('{{prev.')) {
          resolvedArgs[k] = v.replace(/\{\{prev\.(\w+)\}\}/g, (_m, field) => {
            const val = previousResult?.[field] ?? previousResult?.result?.[field];
            return val !== undefined ? String(val) : '';
          });
        }
      }
    }

    let result: any;
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
        body: JSON.stringify({ skill_name: step.skill_name, arguments: resolvedArgs, agent_type: 'flowpilot' }),
      });
      result = await resp.json();
    } catch (err: any) {
      result = { error: err.message };
    }

    const success = !result.error && result.status !== 'failed';
    trace.push({ skill: step.skill_name, status: success ? 'done' : 'failed', result });
    previousResult = result?.result || result;

    if (!success && stop_on_error) break;
  }

  const allSuccess = trace.every(t => t.status === 'done');
  return {
    status: allSuccess ? 'chain_completed' : 'chain_partial',
    steps_executed: trace.length,
    steps_total: steps.length,
    trace,
    final_result: previousResult,
  };
}

// ─── Outcome Evaluation ───────────────────────────────────────────────────────

/**
 * Extract causal hints from an activity's input/output to enable
 * skill-specific correlation (e.g. the slug of a blog post written).
 */
function extractCausalHints(activity: any): { slugs: string[]; emails: string[]; skillType: string } {
  const inp = activity.input || {};
  const out = activity.output || {};
  const slugs: string[] = [];
  const emails: string[] = [];

  // Extract slugs from common fields
  for (const obj of [inp, out, out?.result]) {
    if (!obj || typeof obj !== 'object') continue;
    if (obj.slug) slugs.push(obj.slug);
    if (obj.page_slug) slugs.push(obj.page_slug);
    if (obj.post_slug) slugs.push(obj.post_slug);
    if (obj.email) emails.push(obj.email);
    if (obj.lead_email) emails.push(obj.lead_email);
  }

  // Classify skill type for correlation strategy
  const name = activity.skill_name || '';
  let skillType = 'general';
  if (name.match(/blog|post|content|page|seo/i)) skillType = 'content';
  else if (name.match(/lead|crm|qualify|prospect|enrich/i)) skillType = 'crm';
  else if (name.match(/newsletter|email|subscribe/i)) skillType = 'communication';
  else if (name.match(/book|schedule/i)) skillType = 'booking';
  else if (name.match(/deal|order|product/i)) skillType = 'commerce';

  return { slugs, emails, skillType };
}

async function handleEvaluateOutcomes(supabase: any, args: { limit?: number; skill_filter?: string; include_too_early?: boolean }) {
  const limit = args.limit || 15;
  const since = new Date();
  since.setDate(since.getDate() - 7);

  // Fetch unevaluated activities
  let query = supabase
    .from('agent_activity')
    .select('id, skill_name, input, output, status, created_at, duration_ms')
    .eq('status', 'success')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(limit);

  if (args.include_too_early) {
    // Include both null AND too_early for re-evaluation
    query = query.or('outcome_status.is.null,outcome_status.eq.too_early');
  } else {
    query = query.is('outcome_status', null);
  }

  if (args.skill_filter) {
    query = query.eq('skill_name', args.skill_filter);
  }

  const { data: activities } = await query;
  if (!activities?.length) {
    return { status: 'no_pending', message: 'No unevaluated actions found.' };
  }

  // For each activity, build a temporal window (24-72h after the action)
  const enrichedActivities = [];
  for (const a of activities) {
    const actionTime = new Date(a.created_at);
    const windowStart = actionTime.toISOString();
    const windowEnd = new Date(actionTime.getTime() + 72 * 60 * 60 * 1000).toISOString();
    const hints = extractCausalHints(a);

    const causal: Record<string, any> = { window: `${windowStart} → ${windowEnd}`, skill_type: hints.skillType };

    // Skill-specific causal queries within the 72h window
    if (hints.skillType === 'content' && hints.slugs.length) {
      const { data: views } = await supabase.from('page_views').select('page_slug', { count: 'exact', head: false })
        .in('page_slug', hints.slugs.map(s => `/${s}`).concat(hints.slugs.map(s => `/blog/${s}`)).concat(hints.slugs))
        .gte('created_at', windowStart).lte('created_at', windowEnd).limit(200);
      causal.page_views_72h = views?.length || 0;
      causal.tracked_slugs = hints.slugs;
    }

    if (hints.skillType === 'crm' && hints.emails.length) {
      const { data: leads } = await supabase.from('leads').select('id, score, status')
        .in('email', hints.emails).limit(10);
      causal.related_leads = leads?.map((l: any) => ({ score: l.score, status: l.status })) || [];
    }

    enrichedActivities.push({
      id: a.id,
      skill_name: a.skill_name,
      created_at: a.created_at,
      input_summary: JSON.stringify(a.input).slice(0, 300),
      output_summary: JSON.stringify(a.output).slice(0, 300),
      causal_data: causal,
    });
  }

  // Fetch broad correlation context (all metrics in 7d window)
  const [viewsResult, leadsResult, subscriberResult, dealsResult, bookingsResult, ordersResult, feedbackResult] = await Promise.all([
    supabase.from('page_views').select('page_slug', { count: 'exact', head: false })
      .gte('created_at', since.toISOString()).limit(500),
    supabase.from('leads').select('id, source, score, created_at')
      .gte('created_at', since.toISOString()).order('created_at', { ascending: false }).limit(50),
    supabase.from('newsletter_subscribers').select('id', { count: 'exact', head: true })
      .gte('created_at', since.toISOString()),
    supabase.from('deals').select('stage, value_cents, created_at')
      .gte('created_at', since.toISOString()).limit(50),
    supabase.from('bookings').select('id, status, created_at')
      .gte('created_at', since.toISOString()).limit(50),
    supabase.from('order_items').select('id, price_cents, created_at')
      .gte('created_at', since.toISOString()).limit(50),
    supabase.from('chat_feedback').select('rating, created_at')
      .gte('created_at', since.toISOString()).limit(50),
  ]);

  // Page view counts
  const pageViewCounts: Record<string, number> = {};
  for (const pv of (viewsResult.data || [])) {
    pageViewCounts[pv.page_slug] = (pageViewCounts[pv.page_slug] || 0) + 1;
  }

  // Feedback summary
  const feedbackSummary: Record<string, number> = {};
  for (const f of (feedbackResult.data || [])) {
    feedbackSummary[f.rating] = (feedbackSummary[f.rating] || 0) + 1;
  }

  const correlationContext = {
    total_page_views_7d: viewsResult.data?.length || 0,
    top_pages: Object.entries(pageViewCounts).sort((a, b) => b[1] - a[1]).slice(0, 10),
    new_leads_7d: leadsResult.data?.length || 0,
    new_subscribers_7d: subscriberResult.count || 0,
    lead_sources: [...new Set((leadsResult.data || []).map((l: any) => l.source))],
    new_deals_7d: dealsResult.data?.length || 0,
    deal_value_7d: (dealsResult.data || []).reduce((s: number, d: any) => s + (d.value_cents || 0), 0),
    bookings_7d: bookingsResult.data?.length || 0,
    orders_7d: ordersResult.data?.length || 0,
    order_revenue_7d: (ordersResult.data || []).reduce((s: number, o: any) => s + (o.price_cents || 0), 0),
    chat_feedback_7d: feedbackSummary,
  };

  // Build skill scorecard from historical evaluated outcomes
  const { data: historicalOutcomes } = await supabase
    .from('agent_activity')
    .select('skill_name, outcome_status')
    .not('outcome_status', 'is', null)
    .neq('outcome_status', 'too_early')
    .order('created_at', { ascending: false })
    .limit(200);

  const scorecard: Record<string, { total: number; success: number; partial: number; neutral: number; negative: number; rate: number }> = {};
  for (const o of (historicalOutcomes || [])) {
    if (!o.skill_name) continue;
    if (!scorecard[o.skill_name]) scorecard[o.skill_name] = { total: 0, success: 0, partial: 0, neutral: 0, negative: 0, rate: 0 };
    const s = scorecard[o.skill_name];
    s.total++;
    if (o.outcome_status === 'success') s.success++;
    else if (o.outcome_status === 'partial') s.partial++;
    else if (o.outcome_status === 'neutral') s.neutral++;
    else if (o.outcome_status === 'negative') s.negative++;
  }
  for (const s of Object.values(scorecard)) {
    s.rate = s.total > 0 ? Math.round(((s.success + s.partial * 0.5) / s.total) * 100) : 0;
  }

  // Fetch recent learnings from memory so the agent reads its own diary
  const { data: learnings } = await supabase
    .from('agent_memory')
    .select('key, value, created_at')
    .like('key', 'outcome_learning:%')
    .order('created_at', { ascending: false })
    .limit(10);

  const recentLearnings = (learnings || []).map((l: any) => ({
    skill: l.value?.skill,
    outcome: l.value?.outcome,
    lesson: l.value?.lesson,
    data: l.value?.data,
    date: l.created_at?.slice(0, 10),
  }));

  return {
    status: 'pending_evaluation',
    count: enrichedActivities.length,
    activities: enrichedActivities,
    correlation_data: correlationContext,
    skill_scorecard: scorecard,
    recent_learnings: recentLearnings.length ? recentLearnings : undefined,
    instructions: 'For each activity, assess impact using its causal_data (skill-specific, 72h window) AND the broad correlation_data. Check the skill_scorecard to see historical patterns. Review recent_learnings to avoid repeating mistakes. Call record_outcome for each activity.',
  };
}

async function handleRecordOutcome(supabase: any, args: {
  activity_id: string;
  outcome_status: string;
  outcome_data?: Record<string, any>;
}) {
  const validStatuses = ['success', 'partial', 'neutral', 'negative', 'too_early'];
  if (!validStatuses.includes(args.outcome_status)) {
    return { status: 'error', error: `Invalid outcome_status. Must be one of: ${validStatuses.join(', ')}` };
  }

  const { data, error } = await supabase
    .from('agent_activity')
    .update({
      outcome_status: args.outcome_status,
      outcome_data: args.outcome_data || {},
      outcome_evaluated_at: new Date().toISOString(),
    })
    .eq('id', args.activity_id)
    .select('id, skill_name, outcome_status')
    .single();

  if (error) return { status: 'error', error: error.message };

  // Log learnings for negative/neutral outcomes
  if (args.outcome_status === 'negative' || args.outcome_status === 'neutral') {
    const skillName = data?.skill_name || 'unknown';
    await supabase.from('agent_memory').upsert({
      key: `outcome_learning:${skillName}:${new Date().toISOString().slice(0, 10)}`,
      value: {
        skill: skillName,
        outcome: args.outcome_status,
        data: args.outcome_data,
        lesson: `${skillName} produced ${args.outcome_status} result. Review strategy.`,
      },
      category: 'context',
      created_by: 'flowpilot',
    }, { onConflict: 'key' });
  }

  // Log learnings for success outcomes too — what works is as important as what doesn't
  if (args.outcome_status === 'success' && args.outcome_data) {
    const skillName = data?.skill_name || 'unknown';
    await supabase.from('agent_memory').upsert({
      key: `outcome_success:${skillName}:${new Date().toISOString().slice(0, 10)}`,
      value: {
        skill: skillName,
        outcome: 'success',
        data: args.outcome_data,
        lesson: `${skillName} produced successful result. Replicate this approach.`,
      },
      category: 'context',
      created_by: 'flowpilot',
    }, { onConflict: 'key' });
  }

  return { status: 'recorded', activity: data };
}

// ─── Tool Execution Router ───────────────────────────────────────────────────

export async function executeBuiltInTool(
  supabase: any,
  supabaseUrl: string,
  serviceKey: string,
  fnName: string,
  fnArgs: any,
): Promise<any> {
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
  const response = await fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
    body: JSON.stringify({ skill_name: fnName, arguments: fnArgs, agent_type: 'flowpilot' }),
  });
  return response.json();
}

export function isBuiltInTool(name: string): boolean {
  return BUILT_IN_TOOL_NAMES.has(name);
}

// ─── Load Skills from Registry ────────────────────────────────────────────────

export async function loadSkillTools(supabase: any, scope: 'internal' | 'external'): Promise<any[]> {
  const scopes = scope === 'internal' ? ['internal', 'both'] : ['external', 'both'];
  const { data: skills } = await supabase
    .from('agent_skills')
    .select('name, tool_definition, scope')
    .eq('enabled', true)
    .in('scope', scopes);

  return (skills || [])
    .filter((s: any) => s.tool_definition?.function)
    .map((s: any) => {
      const td = s.tool_definition;
      // Ensure every tool has the required 'type' field
      if (!td.type) td.type = 'function';
      // Normalize properties for OpenAI compatibility
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
      return td;
    });
}

// ─── Concurrency Guard (OpenClaw Command Queue) ──────────────────────────────

/**
 * Try to acquire a lane-based lock. Returns true if acquired.
 * Lanes: 'heartbeat', 'chat:{conversationId}', 'operate:{conversationId}'
 */
export async function tryAcquireLock(supabase: any, lane: string, lockedBy = 'agent', ttlSeconds = 300): Promise<boolean> {
  const { data, error } = await supabase.rpc('try_acquire_agent_lock', {
    p_lane: lane,
    p_locked_by: lockedBy,
    p_ttl_seconds: ttlSeconds,
  });
  if (error) {
    console.warn(`[lock] Failed to acquire '${lane}':`, error.message);
    return false;
  }
  return data === true;
}

/**
 * Release a lane lock.
 */
export async function releaseLock(supabase: any, lane: string): Promise<void> {
  await supabase.rpc('release_agent_lock', { p_lane: lane });
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

  // ─── Concurrency guard ───
  const lane = config.lockLane;
  if (lane) {
    const acquired = await tryAcquireLock(supabase, lane, config.lockOwner || 'reason', 300);
    if (!acquired) {
      console.warn(`[agent-reason] Lane '${lane}' is locked — skipping to prevent race condition`);
      return {
        response: 'Another agent process is currently running on this context. Please try again in a moment.',
        actionsExecuted: [],
        skillResults: [],
        durationMs: Date.now() - startTime,
        skippedDueToLock: true,
      };
    }
  }

  try {
    const { apiKey, apiUrl, model } = await resolveAiConfig(supabase, config.tier || 'fast');

    const builtInTools = getBuiltInTools(config.builtInToolGroups || ['memory', 'objectives', 'reflect']);
    const skillTools = await loadSkillTools(supabase, config.scope);
    const allTools = [...builtInTools, ...(config.additionalTools || []), ...skillTools];

    // Apply context pruning before starting the loop
    let conversationMessages = await pruneConversationHistory(messages, supabase);
  const actionsExecuted: string[] = [];
  const skillResults: ReasonResult['skillResults'] = [];
  let finalResponse = '';
  const loadedInstructions = new Set<string>();

  for (let i = 0; i < maxIterations; i++) {
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
      console.error('[agent-reason] AI error:', aiResponse.status, errText);
      throw new Error(`AI provider error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const choice = aiData.choices?.[0];
    if (!choice) throw new Error('No AI response');

    const msg = choice.message;

    if (!msg.tool_calls?.length) {
      finalResponse = msg.content || 'Done.';
      break;
    }

    conversationMessages.push(msg);

    const calledSkillNames: string[] = [];

    for (const tc of msg.tool_calls) {
      const fnName = tc.function.name;
      let fnArgs: any;
      try { fnArgs = JSON.parse(tc.function.arguments || '{}'); } catch { fnArgs = {}; }

      console.log(`[agent-reason] Executing: ${fnName}`, JSON.stringify(fnArgs).slice(0, 200));
      actionsExecuted.push(fnName);

      let result: any;
      try {
        result = await executeBuiltInTool(supabase, supabaseUrl, serviceKey, fnName, fnArgs);
      } catch (err: any) {
        result = { error: err.message };
      }

      if (!isBuiltInTool(fnName)) {
        skillResults.push({ skill: fnName, status: result?.status || 'success', result: result?.result || result });
        calledSkillNames.push(fnName);
      }

      conversationMessages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
    }

    // Lazy instruction loading
    if (calledSkillNames.length > 0) {
      const instrContext = await fetchSkillInstructions(supabase, calledSkillNames, loadedInstructions);
      if (instrContext) {
        conversationMessages.push({ role: 'system', content: instrContext });
      }
    }
  }

    return {
      response: finalResponse,
      actionsExecuted,
      skillResults,
      durationMs: Date.now() - startTime,
    };
  } finally {
    // Always release the lock
    if (lane) {
      await releaseLock(supabase, lane);
    }
  }
}
