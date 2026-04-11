import { registerBootstrap, type SkillSeed } from '@/lib/module-bootstrap';

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
          },
          required: ['action'],
        },
      },
    },
    instructions: 'Kanban-style task management within projects. Status flow: todo → in_progress → done. Set completed_at when moving to done. For move action, update sort_order. Swedish: "uppgift", "ärende", "kanban".',
  },
];

registerBootstrap('projects', {
  skills: PROJECT_SKILLS,
  automations: [],
});
