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
  /** The COMPANY's Business Identity block (loadBusinessIdentityBlock) — who
   *  the business is, its offerings, claim posture and boundaries. Injected in
   *  operate/heartbeat so content creation grounds in the company, never in
   *  the platform's own features (FlowChat pitched "FlowPilot AI Agent" as an
   *  Optic product, 2026-08-19). */
  businessIdentityContext?: string;
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
  /**
   * Refuse a business skill at the call site when every active objective that
   * counts it in `constraints.cadence` has met its quota (cadenceRefusal in
   * pilot/reason.ts). Autonomous runs set it; a person asking FlowPilot for a
   * post in chat is not the loop re-delivering, so chat leaves it off.
   */
  enforceCadence?: boolean;
  /**
   * The person at the keyboard (FlowChat). Passed to every skill as
   * caller_user_id so a write carries who asked and a cadence-paced skill
   * (comment_on_task) knows a person is writing, not the loop.
   */
  callerUserId?: string | null;
  /** How many pre-narrowed skills go in the tool array (default 25). */
  maxSkills?: number;
  /**
   * Called as the run moves — a surface that streams (FlowChat's SSE) shows
   * the steps from here instead of running its own loop. Never awaited for
   * correctness: a throwing listener does not stop the run.
   */
  onProgress?: (event: ReasonProgressEvent) => void | Promise<void>;
  /**
   * Run a tool result's `_next_action` at once (migrate_url → manage_page)
   * and tell the model it ran; with it, a result's `_next_action.instruction`
   * becomes the next turn's directive. FlowChat sets it; the heartbeat does not.
   */
  autoChainNextAction?: boolean;
  /**
   * After a tool round, tell the model to call the next tool rather than
   * describe it. A person waiting on a reply wants the work done in this turn.
   */
  continuationNudge?: boolean;
  /**
   * When the iterations run out mid-work, make one tool-less call for a short
   * summary instead of returning an empty answer.
   */
  summarizeOnExhaustion?: boolean;
  /** Save context to memory at 80 % of the token budget (default true). */
  memoryFlush?: boolean;
  /** Epoch ms after which no new iteration starts (a surface's wall clock). */
  deadlineAt?: number;
  /**
   * A surface that brings its own tools and executor (FlowWork's read-only
   * dispatch surface, with its permission gates and staging). The engine
   * supplies the loop, budget, guards and trace; no built-ins and no skill
   * catalog are loaded, and every call goes to `execute`.
   */
  toolSurface?: ToolSurface;
  /**
   * Judge a final answer before it is final. Return a system message to send
   * the model back for another round, or null to accept the answer.
   */
  beforeFinalAnswer?: (answer: string, iteration: number) => string | null;
  /** false: the caller already fitted the history to the model's window. */
  pruneHistory?: boolean;
  /** How the run's AI calls are logged (default source `pilot:<scope>`). */
  usage?: { source: string; userId?: string; metadata?: Record<string, unknown> };
}

export interface ToolSurface {
  tools: Array<{ type: string; function: { name: string; description?: string; parameters?: unknown } }>;
  /** What a call is about, for the circuit breaker and loop detection. */
  keyOf?: (name: string, args: Record<string, unknown>) => string;
  execute: (name: string, args: Record<string, unknown>) => Promise<SurfaceToolOutcome>;
}

export interface SurfaceToolOutcome {
  /** What the model reads back as the tool result. */
  content: string;
  failed: boolean;
  /** The structured result, for trace events and `_next_action`. */
  result?: unknown;
  /** Recorded in the run's skillResults when set. */
  skill?: { name: string; status: string; result: unknown };
}

export type ReasonProgressEvent =
  | { kind: 'tool_start'; iteration: number; tools: string[] }
  | { kind: 'tool_done'; iteration: number; tools: string[]; results_count: number };

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
