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
    description: 'Create, update, move, and list tasks within a project. Use when: adding work items, moving tasks on the kanban board, checking task status. NOT for: CRM tasks (use manage_crm_tasks), project-level operations (use manage_project).',
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
];

export const projectsModule = defineModule<ProjectsInput, ProjectsOutput>({
  id: 'projects',
  name: 'Projects',
  version: '1.0.0',
  processes: ['quote-to-cash'],
  maturity: 'L3',
  description: 'Project and task management with Kanban boards, assignments, and time tracking integration',
  capabilities: ['data:write', 'data:read'],
  tier: 'standard',
  inputSchema: projectsInputSchema,
  outputSchema: projectsOutputSchema,

  skills: ['manage_project', 'manage_project_task', 'manage_project_milestone'],
  data: {
    tables: ['project_tasks', 'project_members', 'projects'],
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
