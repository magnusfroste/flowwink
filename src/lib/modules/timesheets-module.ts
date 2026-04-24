/**
 * Timesheets Module — Unified Definition
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { defineModule } from '@/lib/module-def';
import type { SkillSeed, AutomationSeed } from '@/lib/module-bootstrap';

const timesheetsInputSchema = z.object({
  action: z.enum(['create', 'update', 'list', 'get']),
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  task_id: z.string().uuid().optional(),
  date: z.string().optional(),
  hours: z.number().positive().optional(),
  description: z.string().optional(),
});

const timesheetsOutputSchema = z.object({
  success: z.boolean(),
  entry_id: z.string().optional(),
  message: z.string().optional(),
});

type TimesheetsInput = z.infer<typeof timesheetsInputSchema>;
type TimesheetsOutput = z.infer<typeof timesheetsOutputSchema>;

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
        description: 'Create, list, or delete time entries. ALWAYS pass action="create" when logging hours — otherwise the call defaults to listing and nothing is persisted.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'list', 'delete'], description: 'REQUIRED for logging — use "create" to insert a new entry.' },
            project_id: { type: 'string', description: 'Project UUID (preferred over project_name)' },
            project_name: { type: 'string', description: 'Project name (case-insensitive partial match) used to look up project_id if not provided' },
            entry_date: { type: 'string', description: 'YYYY-MM-DD (defaults to today)' },
            hours: { type: 'number', description: 'REQUIRED for create — hours worked, must be > 0 (e.g. 4, 7.5)' },
            description: { type: 'string', description: 'What was done' },
            is_billable: { type: 'boolean', description: 'Defaults to true' },
            user_id: { type: 'string', description: 'Employee UUID (defaults to MCP caller / current user)' },
            entry_id: { type: 'string', description: 'For delete action' },
            week_offset: { type: 'number', description: 'For list: 0=current, -1=last week' },
          },
          required: ['action'],
        },
      },
    },
    instructions: 'CRITICAL: when logging time you MUST set action="create" AND hours>0 — without action="create" the call returns success but persists nothing. Steps: 1) Look up project by name if only a name is given. 2) Default entry_date to today. 3) Confirm the log showing project name, hours, and date. Swedish synonyms: "logga tid", "tidsrapport", "jobbade", "timmar".',
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
        description: 'Summarize logged hours by project/user/period. For arbitrary date ranges pass start_date+end_date (or aliases from_date+to_date) — period auto-switches to "custom".',
        parameters: {
          type: 'object',
          properties: {
            period: { type: 'string', enum: ['this_week', 'last_week', 'this_month', 'last_month', 'custom'], description: 'Predefined window. Ignored when start_date/end_date (or from_date/to_date) are provided.' },
            start_date: { type: 'string', description: 'YYYY-MM-DD inclusive. Alias: from_date.' },
            end_date: { type: 'string', description: 'YYYY-MM-DD inclusive. Alias: to_date.' },
            from_date: { type: 'string', description: 'Alias for start_date.' },
            to_date: { type: 'string', description: 'Alias for end_date.' },
            project_id: { type: 'string' },
            user_id: { type: 'string' },
            billable_only: { type: 'boolean' },
            include_revenue: { type: 'boolean' },
          },
          required: [],
        },
      },
    },
    instructions: 'For custom date ranges pass start_date/end_date (from_date/to_date also accepted) — period auto-switches to "custom". When include_revenue is true, multiply hours × hourly_rate per project. Swedish: "tidssammanställning", "fakturerbar tid", "rapportera timmar".',
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

export const timesheetsModule = defineModule<TimesheetsInput, TimesheetsOutput>({
  id: 'timesheets',
  name: 'Timesheets',
  version: '1.0.0',
  description: 'Time tracking for employees and projects with billable/non-billable categorization',
  capabilities: ['data:write', 'data:read'],
  inputSchema: timesheetsInputSchema,
  outputSchema: timesheetsOutputSchema,

  skills: ['log_time', 'manage_projects', 'manage_tasks', 'timesheet_summary', 'lock_timesheet_period'],
  skillSeeds: TIMESHEET_SKILLS,
  automations: TIMESHEET_AUTOMATIONS,

  async publish(input: TimesheetsInput): Promise<TimesheetsOutput> {
    const validated = timesheetsInputSchema.parse(input);

    if (validated.action === 'create') {
      const { data, error } = await supabase
        .from('time_entries')
        .insert({
          employee_id: validated.employee_id, project_id: validated.project_id,
          task_id: validated.task_id, date: validated.date,
          hours: validated.hours, description: validated.description,
        })
        .select('id')
        .single();
      if (error) { logger.error('[timesheets] create failed', error); return { success: false, message: error.message }; }
      return { success: true, entry_id: data.id, message: 'Time entry created' };
    }

    if (validated.action === 'list') {
      const { data, error } = await supabase.from('time_entries').select('*').order('date', { ascending: false }).limit(50);
      if (error) return { success: false, message: error.message };
      return { success: true, message: `Found ${data.length} time entries` };
    }

    return { success: false, message: 'Unsupported action' };
  },
});
