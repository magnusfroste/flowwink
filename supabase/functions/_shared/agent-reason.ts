/**
 * Agent Reason — Backward-Compatible Re-export Facade
 *
 * All logic now lives in _shared/pilot/ submodules.
 * This file exists solely so existing imports don't break.
 *
 * New code should import from:
 *   - '../_shared/pilot/index.ts' (generic core)
 *   - '../_shared/domains/cms-context.ts' (CMS-specific)
 */

// ─── Generic Pilot Core ──────────────────────────────────────────────────────
export * from './types.ts';
export { resolveAiConfig } from './ai-config.ts';
export type { AiTier } from './ai-config.ts';
export { tryAcquireLock, releaseLock } from './concurrency.ts';
export { extractTokenUsage, accumulateTokens, isOverBudget } from './token-tracking.ts';
export { generateTraceId } from './trace.ts';

// Prompt compiler
export {
  buildSystemPrompt,
  buildWorkspacePrompt,
  buildSoulPrompt,
  loadWorkspaceFiles,
  loadSoulIdentity,
  loadHeartbeatProtocol,
  saveHeartbeatProtocol,
  getDefaultHeartbeatProtocol,
  completeBootstrap,
  truncateSection,
  GROUNDING_RULES,
  DEFAULT_HEARTBEAT_PROTOCOL,
} from './pilot/prompt-compiler.ts';

// Built-in tool definitions
export { getBuiltInTools } from './pilot/built-in-tools.ts';

// Handlers (exported for agent-operate's streaming loop)
export {
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
  runSelfHealing,
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
  checkoutObjective,
  releaseObjective,
} from './pilot/handlers.ts';

// Reason loop + loaders
export {
  reason,
  executeBuiltInTool,
  isBuiltInTool,
  loadSkillTools,
  loadSkillsRaw,
  loadMemories,
  loadObjectives,
  loadHeartbeatState,
  saveHeartbeatState,
  pruneConversationHistory,
  fetchSkillInstructions,
  loadSkillInstructions,
  parseReplyDirectives,
  resolveSkillBudgetTier,
} from './pilot/reason.ts';
export type { ReplyDirective, SkillBudgetTier, SkillCache } from './pilot/reason.ts';

// ─── CMS Domain Pack (FlowWink-specific) ─────────────────────────────────────
export {
  loadCMSSchema,
  loadCrossModuleInsights,
  detectSiteMaturity,
  CMS_DAY_1_PLAYBOOK,
  cmsDomainPack,
} from './domains/cms-context.ts';
