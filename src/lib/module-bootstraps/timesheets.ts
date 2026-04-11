/**
 * Timesheets Module Bootstrap
 * 
 * Seeds:
 * - Skills: log_time, manage_projects, manage_tasks, timesheet_summary
 * - Automation: Weekly Timesheet Reminder, Project Budget Alert
 * 
 * Depends on: invoicing (optional, for billable hours → invoice)
 * - Automation: Weekly Timesheet Reminder (Fridays)
 * 
 * Depends on: invoicing (optional, for billable hours → invoice)
 */

import { registerBootstrap, type SkillSeed, type AutomationSeed } from '@/lib/module-bootstrap';

const TIMESHEET_SKILLS: SkillSeed[] = [
  {
    name: 'log_time',
    description: 'Log time entries for projects. Use when: employee reports hours worked, FlowPilot processes daily standups, user says "jag jobbade 4 timmar på X". NOT for: project management (use manage_projects), summaries (use timesheet_summary).',
    category: 'commerce',
    handler: 'db:timesheets',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'log_time',
        description: 'Create, list, or delete time entries for a project',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'list', 'delete'] },
            project_id: { type: 'string', description: 'Project UUID' },
            project_name: { type: 'string', description: 'Project name (used to look up project_id if not provided)' },
            entry_date: { type: 'string', description: 'YYYY-MM-DD (defaults to today)' },
            hours: { type: 'number', description: 'Hours worked (e.g. 4, 7.5)' },
            description: { type: 'string', description: 'What was done' },
            is_billable: { type: 'boolean', description: 'Defaults to project setting' },
            user_id: { type: 'string', description: 'Employee UUID (defaults to current user)' },
            entry_id: { type: 'string', description: 'For delete action' },
            week_offset: { type: 'number', description: 'For list: 0=current, -1=last week' },
          },
          required: ['action'],
        },
      },
    },
    instructions: 'When logging time via chat: 1) Look up the project by name if only a name is given. 2) Default entry_date to today if not specified. 3) Confirm the log in a friendly way showing project name, hours, and date. Swedish synonyms: "logga tid", "tidsrapport", "jobbade", "timmar".',
  },
  {
    name: 'manage_projects',
    description: 'Create, list, or update time-tracking projects. Use when: admin wants to set up a new project, list active projects, or change hourly rates. NOT for: logging time (use log_time), CRM deals (use manage_deal).',
    category: 'commerce',
    handler: 'db:timesheets',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_projects',
        description: 'CRUD for time-tracking projects',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'list', 'update', 'deactivate'] },
            project_id: { type: 'string' },
            name: { type: 'string' },
            client_name: { type: 'string' },
            description: { type: 'string' },
            color: { type: 'string' },
            hourly_rate_cents: { type: 'number' },
            currency: { type: 'string' },
            is_billable: { type: 'boolean' },
          },
          required: ['action'],
        },
      },
    },
    instructions: 'Projects link to clients and have hourly rates for billing. Default currency is SEK. Colors help visual identification in the weekly timesheet view.',
  },
  {
    name: 'timesheet_summary',
    description: 'Generate timesheet summaries and reports. Use when: admin asks for weekly/monthly hours overview, billing summary, or "hur mycket tid har vi lagt på projekt X". NOT for: logging time (use log_time).',
    category: 'commerce',
    handler: 'db:timesheets',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'timesheet_summary',
        description: 'Summarize logged hours by project, user, or period',
        parameters: {
          type: 'object',
          properties: {
            period: { type: 'string', enum: ['this_week', 'last_week', 'this_month', 'last_month', 'custom'] },
            start_date: { type: 'string', description: 'YYYY-MM-DD for custom period' },
            end_date: { type: 'string', description: 'YYYY-MM-DD for custom period' },
            project_id: { type: 'string', description: 'Filter by project' },
            user_id: { type: 'string', description: 'Filter by employee' },
            billable_only: { type: 'boolean', description: 'Only include billable hours' },
            include_revenue: { type: 'boolean', description: 'Calculate revenue based on hourly rates' },
          },
          required: ['period'],
        },
      },
    },
    instructions: 'Summarize time entries grouped by project and user. When include_revenue is true, multiply hours × hourly_rate for each project. Format output as a table showing project, hours, and optional revenue. Swedish: "tidssammanställning", "fakturerbar tid", "rapportera timmar".',
  },
  {
    name: 'manage_tasks',
    description: 'Create, list, update, or complete project tasks. Use when: user wants to create a task, see open tasks, change status, or assign someone. NOT for: logging time (use log_time), project setup (use manage_projects).',
    category: 'commerce',
    handler: 'db:timesheets',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_tasks',
        description: 'CRUD for project tasks with kanban status management',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'list', 'update', 'delete'] },
            task_id: { type: 'string', description: 'Task UUID (for update/delete)' },
            project_id: { type: 'string', description: 'Project UUID' },
            project_name: { type: 'string', description: 'Project name (lookup if no project_id)' },
            title: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', enum: ['todo', 'in_progress', 'review', 'done'] },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
            assigned_to: { type: 'string', description: 'User UUID to assign' },
            due_date: { type: 'string', description: 'YYYY-MM-DD' },
            estimated_hours: { type: 'number' },
          },
          required: ['action'],
        },
      },
    },
    instructions: 'Tasks live within projects. Status flow: todo → in_progress → review → done. completed_at is set automatically when done. Swedish: "uppgift", "task", "skapa uppgift", "vad ska göras".',
  },
];

const TIMESHEET_AUTOMATIONS: AutomationSeed[] = [
  {
    name: 'Weekly Timesheet Reminder',
    description: 'Every Friday at 15:00, FlowPilot checks if employees have logged at least 35 hours for the week and reminds those who haven\'t.',
    trigger_type: 'cron',
    trigger_config: { cron: '0 15 * * 5', expression: '0 15 * * 5' },
    skill_name: 'timesheet_summary',
    skill_arguments: { period: 'this_week' },
  },
  {
    name: 'Project Budget Alert',
    description: 'Every Monday at 09:00, FlowPilot checks all active projects with budget_hours and alerts if any project has exceeded 90% of its budget.',
    trigger_type: 'cron',
    trigger_config: { cron: '0 9 * * 1', expression: '0 9 * * 1' },
    skill_name: 'timesheet_summary',
    skill_arguments: { period: 'this_month', include_revenue: true },
  },
];

registerBootstrap('timesheets', {
  skills: TIMESHEET_SKILLS,
  automations: TIMESHEET_AUTOMATIONS,
});
