/**
 * Agent Skill Engine Types
 * 
 * TypeScript types for the skill registry, memory, and activity systems.
 * Maps to the agent_skills, agent_memory, and agent_activity database tables.
 */

export type AgentScope = 'internal' | 'external' | 'both';
export type AgentSkillCategory = 'content' | 'crm' | 'communication' | 'automation' | 'search' | 'analytics';
export type AgentActivityStatus = 'success' | 'failed' | 'pending_approval' | 'approved' | 'rejected';
export type AgentType = 'flowpilot' | 'chat';
export type AgentMemoryCategory = 'preference' | 'context' | 'fact';
export type AgentObjectiveStatus = 'active' | 'completed' | 'paused' | 'failed';

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
  created_at: string;
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
}

export interface AgentExecuteResponse {
  status: 'success' | 'pending_approval' | 'error';
  result?: unknown;
  activity_id?: string;
  message?: string;
  error?: string;
}
