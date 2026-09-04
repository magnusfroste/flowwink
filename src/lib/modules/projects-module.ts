/**
 * Projects Module — Unified Definition
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { defineModule } from '@/lib/module-def';
import type { SkillSeed } from '@/lib/module-bootstrap';

const projectsInputSchema = z.object({
  action: z.enum(['create', 'list', 'get', 'update', 'list_tasks', 'create_task']),
  id: z.string().uuid().optional(),
  name: z.string().optional(),
  project_id: z.string().uuid().optional(),
  is_active: z.boolean().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  assigned_to: z.string().uuid().optional(),
  due_date: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  status: z.enum(['todo', 'in_progress', 'review', 'done']).optional(),
});

const projectsOutputSchema = z.object({
  success: z.boolean(),
  project_id: z.string().optional(),
  task_id: z.string().optional(),
  message: z.string().optional(),
});

type ProjectsInput = z.infer<typeof projectsInputSchema>;
type ProjectsOutput = z.infer<typeof projectsOutputSchema>;

const PROJECT_SKILLS: SkillSeed[] = [
  {
    name: 'manage_project',
    description: 'Create, update, search, and close projects. Use when: starting new client work, updating project status, reviewing active projects. NOT for: individual tasks (use manage_project_task), timesheets (use log_time).',
    category: 'crm',
    handler: 'db:projects',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_project',
        description: 'CRUD for projects',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'update', 'search', 'list_active', 'close'] },
            project_id: { type: 'string' },
            name: { type: 'string' },
            status: { type: 'string', enum: ['active', 'completed', 'on_hold'] },
            client_name: { type: 'string' },
            budget_hours: { type: 'number' },
            search_query: { type: 'string' },
          },
          required: ['action'],
          'x-action-required': {
            create: ['name'],
          },
        },
      },
    },
    instructions: 'Projects tie together tasks, timesheets, invoices, and deals. Status flow: active → completed/on_hold. When closing, check for open tasks and unbilled time. Swedish: "projekt", "uppdrag", "klient".',
  },
  {
    name: 'manage_project_task',
    description: 'Create, update, move, and list tasks within a project. Use when: adding work items, moving tasks on the kanban board, checking task status. NOT for: CRM tasks (use crm_task_create / crm_task_update), project-level operations (use manage_project).',
    category: 'crm',
    handler: 'db:project_tasks',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_project_task',
        description: 'Task operations within projects',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'update', 'move', 'list', 'complete'] },
            task_id: { type: 'string' },
            project_id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string', description: "The brief: what needs to happen and what done looks like. Read it before working the task." },
            checklist: { type: 'array', description: 'The pieces of done: [{id, text, done}]. Send the whole list back when ticking an item.', items: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' }, done: { type: 'boolean' } } } },
            status: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
            assigned_to: { type: 'string' },
            due_date: { type: 'string' },
            parent_task_id: { type: 'string', description: 'Parent task UUID — makes this a sub-task' },
            milestone_id: { type: 'string', description: 'Milestone UUID this task belongs to' },
          },
          required: ['action'],
          'x-action-required': {
            create: ['project_id', 'title'],
          },
        },
      },
    },
    instructions: 'Kanban-style task management within projects. Status flow: todo → in_progress → done. Set completed_at when moving to done. For move action, update sort_order. Set parent_task_id to create a sub-task, milestone_id to attach a task to a milestone.',
  },
  {
    name: 'comment_on_task',
    description: "Write into a project task's thread — the card's ledger where people and agents write together. kind=step for what you did, question when a person must decide, decision when something is settled, comment for a note. The person opening the card sees it in time order next to their own notes; a question shows as such. Use when: you worked on a task and should say what and where you stopped; you need a person's input before continuing. NOT for: changing the task itself (manage_project_task), ticket comments (reply_to_ticket_via_email / manage_ticket).",
    category: 'crm',
    handler: 'internal:comment_on_task',
    scope: 'both',
    trust_level: 'auto',
    instructions: 'task_id and body are required; kind defaults to step. author_name defaults to the calling agent. Keep a step to what was done and what is next; put the reason a person is needed in a question.',
    tool_definition: {
      type: 'function',
      function: {
        name: 'comment_on_task',
        description: "Post to a project task's thread (step | question | decision | comment).",
        parameters: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: 'project_tasks.id (REQUIRED)' },
            body: { type: 'string', description: 'The entry (REQUIRED). Plain text or markdown.' },
            kind: { type: 'string', enum: ['step', 'question', 'decision', 'comment'], description: 'Default step.' },
            author_name: { type: 'string', description: 'Shown as the voice; defaults to the agent.' },
          },
          required: ['task_id', 'body'],
        },
      },
    },
  },
  {
    name: 'manage_project_milestone',
    description: 'Manage project milestones (named delivery gates with a due date and task-completion progress). Use when: planning project phases, marking a milestone reached, tracking gate progress. NOT for: individual tasks (use manage_project_task) or project CRUD (manage_project).',
    category: 'crm',
    handler: 'rpc:manage_project_milestone',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_project_milestone',
        description: 'List/create/update/reach/reopen/delete project milestones. list returns task-progress rollup (tasks_total / tasks_done) per milestone.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['list', 'create', 'update', 'reach', 'reopen', 'delete'] },
            p_milestone_id: { type: 'string', format: 'uuid' },
            p_project_id: { type: 'string', format: 'uuid' },
            p_name: { type: 'string' },
            p_description: { type: 'string' },
            p_due_date: { type: 'string', description: 'YYYY-MM-DD' },
            p_sort_order: { type: 'number' },
          },
        },
      },
    },
    instructions: 'Milestones are delivery gates per project. Attach tasks via manage_project_task milestone_id; list shows tasks_total/tasks_done rollup (done = task.completed_at set). reach marks it complete; reopen reverses. Admin/service-role only for mutations.',
  },
  {
    name: 'manage_project_template',
    description: 'Reusable project templates: snapshot an existing project (tasks + milestones with day offsets) or author a spec, then instantiate new projects from it. Use when: the same project structure repeats per client. NOT for: site/page templates (templates module) or one-off projects (manage_project).',
    category: 'crm',
    handler: 'rpc:manage_project_template',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_project_template',
        description: 'create/create_from_project/instantiate/list/get/delete. instantiate creates the project + tasks + milestones with due dates = start_date + offset_days.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['create', 'create_from_project', 'instantiate', 'list', 'get', 'delete'] },
            p_template_id: { type: 'string', format: 'uuid' },
            p_project_id: { type: 'string', format: 'uuid', description: 'Source project for create_from_project' },
            p_name: { type: 'string', description: 'Template name, or the new project name on instantiate' },
            p_description: { type: 'string' },
            p_spec: { type: 'object', description: '{tasks:[{title,priority,estimated_hours,offset_days}], milestones:[{name,offset_days}], defaults:{hourly_rate_cents,budget_hours,…}}' },
            p_client_name: { type: 'string', description: 'Client for the instantiated project' },
            p_start_date: { type: 'string', description: 'YYYY-MM-DD baseline for offsets (default today)' },
          },
        },
      },
    },
    instructions: 'create_from_project snapshots top-level tasks + milestones with offset_days relative to project creation. instantiate needs p_template_id (+ optional p_name/p_client_name/p_start_date) and returns the new project_id with created counts.',
  },
  {
    name: 'manage_project_member',
    description: 'Team and stakeholder roles on a project: add/update/remove members with a role, rate override and time-tracking flag. Use when: staffing a project, setting a member\'s billing rate. NOT for: task assignment (manage_project_task assigned_to) or HR records (manage_employee).',
    category: 'crm',
    handler: 'rpc:manage_project_member',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_project_member',
        description: 'add/update/remove/list project_members. One row per (project, user); rate override feeds project_cost_forecast.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['add', 'update', 'remove', 'list'] },
            p_project_id: { type: 'string', format: 'uuid' },
            p_member_id: { type: 'string', format: 'uuid', description: 'project_members row id (update/remove)' },
            p_user_id: { type: 'string', format: 'uuid' },
            p_role: { type: 'string', description: 'e.g. manager, member, stakeholder, viewer' },
            p_hourly_rate_override_cents: { type: 'number', description: 'Overrides the project rate for this member' },
            p_tracks_time: { type: 'boolean' },
          },
        },
      },
    },
    instructions: 'add requires p_project_id + p_user_id + p_role. remove accepts either p_member_id or the (p_project_id, p_user_id) pair. list joins employee names where the user is an employee.',
  },
  {
    name: 'project_cost_forecast',
    description: 'Cost forecasting and burn rate for a project: hours logged, cost (member rate overrides honored), 4-week burn rate, weeks until budget exhaustion, over-budget risk from open task estimates. Use when: asked "how is the project tracking against budget?". NOT for: invoicing (create_invoice) or time logging (log_time).',
    category: 'crm',
    handler: 'rpc:project_cost_forecast',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'project_cost_forecast',
        description: 'Read-only forecast: {hours_logged, cost_cents, budget_consumed_pct, burn_rate_hours_per_week, weeks_until_budget_exhausted, forecast_total_hours, over_budget_risk, …}.',
        parameters: {
          type: 'object',
          required: ['p_project_id'],
          properties: {
            p_project_id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    instructions: 'Burn rate = time_entries hours over the last 28 days / 4. over_budget_risk compares hours_logged + open task estimates against budget_hours. Costs use project_members.hourly_rate_override_cents when set, else projects.hourly_rate_cents.',
  },
  {
    name: 'manage_task_workflow',
    description: 'Stage-workflow gating per project: restrict which task status transitions are allowed, require sub-tasks done before a parent closes, and block starting tasks with unfinished dependencies. Use when: enforcing a review step or dependency discipline. NOT for: moving tasks (manage_project_task).',
    category: 'crm',
    handler: 'rpc:manage_task_workflow',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_task_workflow',
        description: 'set/get/clear the project task_workflow config. Enforced by a DB trigger on project_tasks status changes; no config = no gating.',
        parameters: {
          type: 'object',
          required: ['p_action', 'p_project_id'],
          properties: {
            p_action: { type: 'string', enum: ['set', 'get', 'clear'] },
            p_project_id: { type: 'string', format: 'uuid' },
            p_transitions: { type: 'object', description: 'Allowed transitions, e.g. {"todo":["in_progress"],"in_progress":["review"],"review":["done","in_progress"]}' },
            p_require_subtasks_done: { type: 'boolean', description: 'Parent cannot be done while sub-tasks are open' },
            p_enforce_dependencies: { type: 'boolean', description: 'Task cannot start/finish while dependencies are unfinished' },
          },
        },
      },
    },
    instructions: 'Statuses: todo|in_progress|review|done. A status key missing from transitions = unrestricted from that status. set merges the given fields into existing config; clear removes all gating. Blocked updates raise "Workflow gate: …" errors.',
  },
  {
    name: 'manage_task_dependency',
    description: 'Task dependencies (finish-to-start edges) within a project, with cycle detection. Use when: task B cannot start before task A is done; building a Gantt/dependency plan. NOT for: sub-task hierarchy (manage_project_task parent_task_id).',
    category: 'crm',
    handler: 'rpc:manage_task_dependency',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_task_dependency',
        description: 'add/remove/list dependency edges (task_id depends on depends_on_task_id). Same-project only; cycles rejected.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['add', 'remove', 'list'] },
            p_task_id: { type: 'string', format: 'uuid' },
            p_depends_on_task_id: { type: 'string', format: 'uuid' },
            p_project_id: { type: 'string', format: 'uuid', description: 'Filter for list' },
          },
        },
      },
    },
    instructions: 'add validates both tasks share a project and rejects transitive cycles. Combine with manage_task_workflow enforce_dependencies=true to hard-block starting tasks whose prerequisites are open. get_project_schedule returns the full graph.',
  },
  {
    name: 'get_project_schedule',
    description: 'Gantt-ready schedule for a project: every task with start/due dates, estimated hours, dependency edges and topological depth, plus milestones. Use when: rendering a timeline/Gantt, planning order of work. NOT for: editing tasks (manage_project_task).',
    category: 'crm',
    handler: 'rpc:get_project_schedule',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'get_project_schedule',
        description: 'Read-only: {tasks:[{id,title,status,start_date,due_date,estimated_hours,depth,depends_on[]}], dependencies[], milestones[]}. Tasks sorted by depth then start date.',
        parameters: {
          type: 'object',
          required: ['p_project_id'],
          properties: {
            p_project_id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    instructions: 'depth = longest dependency chain into the task (0 = no prerequisites) — render as Gantt rows or use it as a safe execution order. start_date falls back to the task creation date when unset (set real ones via manage_project_task).',
  },
  {
    name: 'resource_capacity_report',
    description: 'Resource/capacity planning: per person — open tasks, estimated hours of backlog, hours logged, utilization % against weekly capacity, overload flag. Use when: "who has room for this?", spotting overloaded people, staffing decisions. NOT for: a single project\'s cost (project_cost_forecast).',
    category: 'crm',
    handler: 'rpc:resource_capacity_report',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'resource_capacity_report',
        description: 'Read-only: {resources:[{user_id,name,open_tasks,open_estimated_hours,hours_logged_in_window,utilization_pct,weeks_of_backlog,overloaded}]}. Scope to one project or run globally.',
        parameters: {
          type: 'object',
          properties: {
            p_project_id: { type: 'string', format: 'uuid', description: 'Omit for all projects' },
            p_weeks: { type: 'number', description: 'Lookback window in weeks (default 4)' },
            p_capacity_hours_per_week: { type: 'number', description: 'Default 40' },
          },
        },
      },
    },
    instructions: 'People = union of task assignees, project members and recent time loggers. utilization_pct is logged hours vs capacity over the window; weeks_of_backlog is open estimated hours / weekly capacity. overloaded = backlog exceeds the whole window\'s capacity.',
  },
];

export const projectsModule = defineModule<ProjectsInput, ProjectsOutput>({
  id: 'projects',
  name: 'Projects',
  version: '1.0.0',
  processes: ['quote-to-cash'],
  maturity: 'L4',
  description: 'Project and task management with Kanban boards, assignments, and time tracking integration',
  capabilities: ['data:write', 'data:read'],
  tier: 'standard',
  inputSchema: projectsInputSchema,
  outputSchema: projectsOutputSchema,

  skills: [
    'manage_project', 'manage_project_task', 'manage_project_milestone',
    'manage_project_template', 'manage_project_member', 'project_cost_forecast',
    'manage_task_workflow', 'manage_task_dependency', 'get_project_schedule', 'resource_capacity_report',
  ],
  data: {
    tables: ['project_task_dependencies', 'project_tasks', 'project_members', 'project_templates', 'projects'],
  },
  skillSeeds: PROJECT_SKILLS,
  automations: [],

  async publish(input: ProjectsInput): Promise<ProjectsOutput> {
    const validated = projectsInputSchema.parse(input);

    if (validated.action === 'create') {
      if (!validated.name) return { success: false, message: 'name is required' };
      const { data, error } = await supabase
        .from('projects')
        .insert({ name: validated.name, is_active: validated.is_active ?? true })
        .select('id')
        .single();
      if (error) { logger.error('[projects] create failed', error); return { success: false, message: error.message }; }
      return { success: true, project_id: data.id, message: 'Project created' };
    }

    if (validated.action === 'create_task') {
      if (!validated.title || !validated.project_id) return { success: false, message: 'title and project_id are required' };
      const { data, error } = await supabase
        .from('project_tasks')
        .insert({
          title: validated.title, project_id: validated.project_id,
          description: validated.description, assigned_to: validated.assigned_to,
          due_date: validated.due_date, priority: validated.priority || 'medium',
          status: validated.status || 'todo',
        })
        .select('id')
        .single();
      if (error) { logger.error('[projects] create_task failed', error); return { success: false, message: error.message }; }
      return { success: true, task_id: data.id, message: 'Task created' };
    }

    if (validated.action === 'list') {
      const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false }).limit(50);
      if (error) return { success: false, message: error.message };
      return { success: true, message: `Found ${data.length} projects` };
    }

    return { success: false, message: 'Unsupported action' };
  },
});
