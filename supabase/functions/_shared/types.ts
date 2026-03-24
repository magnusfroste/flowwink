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
