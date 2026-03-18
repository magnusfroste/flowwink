/**
 * Agent Skill Engine Types
 * 
 * TypeScript types for the skill registry, memory, and activity systems.
 * Maps to the agent_skills, agent_memory, and agent_activity database tables.
 */

export type AgentScope = 'internal' | 'external' | 'both';
export type AgentSkillCategory = 'content' | 'crm' | 'communication' | 'automation' | 'search' | 'analytics' | 'growth';
export type AgentActivityStatus = 'success' | 'failed' | 'pending_approval' | 'approved' | 'rejected';
export type AgentType = 'flowpilot' | 'chat';
export type AgentMemoryCategory = 'preference' | 'context' | 'fact';
export type AgentObjectiveStatus = 'active' | 'completed' | 'paused' | 'failed';
export type AutomationTriggerType = 'cron' | 'event' | 'signal';

// =============================================================================
// Skill
// =============================================================================

export interface AgentSkill {
  id: string;
  name: string;
  description: string | null;
  category: AgentSkillCategory;
  scope: AgentScope;
  tool_definition: ToolDefinition;
  handler: string;
  instructions: string | null;
  requires_approval: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

/** OpenAI function-calling format */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

// =============================================================================
// Memory
// =============================================================================

export interface AgentMemory {
  id: string;
  key: string;
  value: Record<string, unknown>;
  category: AgentMemoryCategory;
  created_by: AgentType;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Objective
// =============================================================================

export interface AgentObjective {
  id: string;
  goal: string;
  status: AgentObjectiveStatus;
  constraints: Record<string, unknown>;
  success_criteria: Record<string, unknown>;
  progress: Record<string, unknown>;
  created_by: string | null;
  completed_at: string | null;
  locked_by: string | null;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentObjectiveActivity {
  objective_id: string;
  activity_id: string;
  created_at: string;
}

// =============================================================================
// Activity
// =============================================================================

export interface AgentActivity {
  id: string;
  agent: AgentType;
  skill_id: string | null;
  skill_name: string | null;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  status: AgentActivityStatus;
  conversation_id: string | null;
  error_message: string | null;
  duration_ms: number | null;
  token_usage: TokenUsage | null;
  created_at: string;
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

// =============================================================================
// Automation
// =============================================================================

export interface AgentAutomation {
  id: string;
  name: string;
  description: string | null;
  trigger_type: AutomationTriggerType;
  trigger_config: Record<string, unknown>;
  skill_id: string | null;
  skill_name: string | null;
  skill_arguments: Record<string, unknown>;
  enabled: boolean;
  last_triggered_at: string | null;
  next_run_at: string | null;
  run_count: number;
  last_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// API Request/Response
// =============================================================================

export interface AgentExecuteRequest {
  skill_id?: string;
  skill_name?: string;
  arguments: Record<string, unknown>;
  agent_type: AgentType;
  conversation_id?: string;
  objective_context?: {
    goal: string;
    step: string;
    why: string;
  };
}

export interface AgentExecuteResponse {
  status: 'success' | 'pending_approval' | 'error';
  result?: unknown;
  activity_id?: string;
  message?: string;
  error?: string;
}

// =============================================================================
// Workflow
// =============================================================================

export interface WorkflowStep {
  id: string;
  name: string;
  skill_name: string;
  arguments: Record<string, unknown>;
  on_success?: string; // next step id
  on_failure?: string; // fallback step id
  condition?: string;  // expression to evaluate
  template_vars?: Record<string, string>;
}

export interface AgentWorkflow {
  id: string;
  name: string;
  description: string | null;
  steps: WorkflowStep[];
  trigger_type: string;
  trigger_config: Record<string, unknown> | null;
  enabled: boolean;
  run_count: number;
  last_run_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}
