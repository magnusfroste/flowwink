/**
 * Shared Types for FlowPilot Autonomy Engine
 */

export type PromptMode = 'operate' | 'heartbeat' | 'chat';

export interface PromptCompilerInput {
  mode: PromptMode;
  soulPrompt: string;
  agents?: any;
  memoryContext: string;
  objectiveContext: string;
  activityContext?: string;
  statsContext?: string;
  automationContext?: string;
  healingReport?: string;
  maxIterations?: number;
  cmsSchemaContext?: string;
  heartbeatState?: string;
  tokenBudget?: number;
  siteMaturity?: SiteMaturity;
  customHeartbeatProtocol?: string;
  chatSystemPrompt?: string;
  /** Dispatch mode: business skills are reached via search_skills/execute_skill,
   *  not loaded as direct tools. Injects the tool-access instruction so the
   *  operator discovers skills by intent instead of calling unloaded tool names. */
  dispatchMode?: boolean;
  /** Domain-specific playbook for fresh/new sites (injected by domain pack) */
  freshSitePlaybook?: string;
}

export interface ReasonConfig {
  scope: 'internal' | 'external';
  maxIterations?: number;
  systemPromptOverride?: string;
  extraContext?: string;
  builtInToolGroups?: BuiltInToolGroup[];
  additionalTools?: any[];
  tier?: import('./ai-config.ts').AiTier;
  lockLane?: string;
  lockOwner?: string;
  /** Trace ID for correlating all activity within a single run */
  traceId?: string;
  /** Token budget for the entire run */
  tokenBudget?: number;
  /** Filter skills by category — if set, only skills in these categories are loaded */
  skillCategories?: string[];
  /**
   * Extra intent text used ONLY for skill-relevance scoring (never shown to the
   * LLM). Autonomous runs (heartbeat) trigger with generic meta-text — "evaluate
   * outcomes, advance objectives" — so objective-fulfilling skills (e.g.
   * write_blog_post) get scored out of the top-N, leaving only meta tools. Pass
   * the active objectives here so the shared relevance engine surfaces the skills
   * the operator actually needs — feeding the same scorer a real intent the way
   * an external agent's search_skills query already does. (Law 1: better intent,
   * not hardcoded routing.)
   */
  scoringIntent?: string;
  /**
   * Dispatch mode: expose the 200+ business skills behind a 2-tool surface
   * (search_skills + execute_skill) instead of pre-baking a pre-narrowed set
   * into the tool array. Meta/built-in tools stay direct. This is the same
   * pattern the external MCP gateway uses (?mode=dispatch) — sharing the
   * relevance engine AND the dispatch loop. Eliminates the provider tool-array
   * cap and per-tier contract truncation regardless of how many skills exist.
   */
  dispatchMode?: boolean;
}

export interface ReasonResult {
  response: string;
  actionsExecuted: string[];
  skillResults: Array<{ skill: string; status: string; result: any }>;
  durationMs: number;
  tokenUsage?: TokenUsage;
  skippedDueToLock?: boolean;
  /** Trace ID for this run — use to query all related activity */
  traceId?: string;
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

export type BuiltInToolGroup = 'memory' | 'objectives' | 'self-mod' | 'reflect' | 'soul' | 'planning' | 'automations-exec' | 'workflows' | 'a2a' | 'skill-packs';
