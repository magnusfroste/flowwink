/**
 * Pilot — Built-in Tool Definitions
 * 
 * All universal tool schemas (memory, objectives, skills, workflows, A2A, etc.)
 * Domain-agnostic: no CMS-specific tools here.
 */

import type { BuiltInToolGroup } from '../types.ts';

// ─── Tool Definition Arrays ──────────────────────────────────────────────────

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
  { type: 'function', function: { name: 'skill_instruct', description: 'Add rich instructions/knowledge to a skill (WRITE operation).', parameters: { type: 'object', properties: { skill_name: { type: 'string' }, instructions: { type: 'string' } }, required: ['skill_name', 'instructions'] } } },
  { type: 'function', function: { name: 'skill_read', description: 'Load full instructions, handler, and metadata for a skill BEFORE executing it.', parameters: { type: 'object', properties: { skill_name: { type: 'string', description: 'Exact skill name to load instructions for' } }, required: ['skill_name'] } } },
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
  { type: 'function', function: { name: 'heartbeat_protocol_update', description: 'Update the heartbeat protocol. Pass action="get" to read, action="set" with protocol text to update, or action="reset" to restore default.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['get', 'set', 'reset'] }, protocol: { type: 'string', description: 'New protocol text (required for action=set)' } }, required: ['action'] } } },
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
      description: 'Create a multi-step workflow with conditional branching. Steps support {{stepId.result.field}} templates.',
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
      description: 'Execute a workflow by name or ID. Returns step-by-step execution trace.',
      parameters: { type: 'object', properties: { workflow_id: { type: 'string' }, workflow_name: { type: 'string' }, input: { type: 'object', description: 'Input context accessible as {{input.field}} in steps' } } },
    },
  },
  { type: 'function', function: { name: 'workflow_list', description: 'List all registered workflows.', parameters: { type: 'object', properties: {} } } },
  {
    type: 'function', function: {
      name: 'workflow_update',
      description: 'Update an existing workflow by ID or name.',
      parameters: { type: 'object', properties: { workflow_id: { type: 'string' }, workflow_name: { type: 'string' }, updates: { type: 'object', description: 'Fields to update: name, description, steps, trigger_type, trigger_config, enabled' } }, required: ['updates'] },
    },
  },
  {
    type: 'function', function: {
      name: 'workflow_delete',
      description: 'Permanently delete a workflow by ID or name.',
      parameters: { type: 'object', properties: { workflow_id: { type: 'string' }, workflow_name: { type: 'string' } } },
    },
  },
];

const A2A_TOOLS = [
  {
    type: 'function', function: {
      name: 'delegate_task',
      description: "Delegate a subtask to a specialized agent (internal specialist or external A2A peer like ClawOne). Use when: objectives mention federation, audit, delegation, or peer review. Sessions are persistent — each agent remembers prior conversations.",
      parameters: {
        type: 'object',
        properties: {
          agent_name: { type: 'string', description: "Specialist name or any custom name" },
          task: { type: 'string', description: 'The specific task for the specialist' },
          context: { type: 'object', description: 'Optional context data' },
          session_id: { type: 'string', description: 'Optional custom session key for isolated threads' },
        },
        required: ['agent_name', 'task'],
      },
    },
  },
];

const SKILL_PACK_TOOLS = [
  { type: 'function', function: { name: 'skill_pack_list', description: 'List available skill packs and their installation status.', parameters: { type: 'object', properties: {} } } },
  {
    type: 'function', function: {
      name: 'skill_pack_install',
      description: 'Install a skill pack — adds multiple related skills in one operation.',
      parameters: { type: 'object', properties: { pack_name: { type: 'string', description: 'Pack name from skill_pack_list' } }, required: ['pack_name'] },
    },
  },
];

const CHAIN_SKILLS_TOOL = [
  {
    type: 'function', function: {
      name: 'chain_skills',
      description: 'Execute multiple skills in sequence, piping each result as context to the next. Returns all results.',
      parameters: {
        type: 'object',
        properties: {
          steps: {
            type: 'array',
            description: 'Ordered skills to chain. Each step gets previous results as _previous_result.',
            items: {
              type: 'object',
              properties: {
                skill_name: { type: 'string', description: 'Skill to execute' },
                args: { type: 'object', description: 'Arguments. Use {{prev.field}} for previous output.' },
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
      description: 'Fetch recent agent actions that have not been evaluated yet. Returns activities enriched with causal correlation data and a skill scorecard.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max unevaluated actions to return (default 15)' },
          skill_filter: { type: 'string', description: 'Only evaluate actions from this skill' },
          include_too_early: { type: 'boolean', description: 'Re-evaluate actions previously marked as too_early' },
        },
      },
    },
  },
  {
    type: 'function', function: {
      name: 'record_outcome',
      description: 'Record the evaluated outcome of a past agent action. Closes the feedback loop.',
      parameters: {
        type: 'object',
        properties: {
          activity_id: { type: 'string', description: 'The agent_activity ID to evaluate' },
          outcome_status: { type: 'string', enum: ['success', 'partial', 'neutral', 'negative', 'too_early'], description: 'Assessed outcome' },
          outcome_data: { type: 'object', description: 'Quantitative evidence' },
        },
        required: ['activity_id', 'outcome_status'],
      },
    },
  },
];

// ─── Public API ───────────────────────────────────────────────────────────────

export function getBuiltInTools(groups: BuiltInToolGroup[]): any[] {
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
  if (groups.includes('planning')) tools.push(...CHAIN_SKILLS_TOOL);
  if (groups.includes('planning')) tools.push(...OUTCOME_TOOLS);
  return tools;
}

export const BUILT_IN_TOOL_NAMES = new Set([
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

export function isBuiltInTool(name: string): boolean {
  return BUILT_IN_TOOL_NAMES.has(name);
}
