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
    name: 'lock_timesheet_period',
    description: 'Lock all time entries in a fiscal month so they can no longer be edited. Use when: month-end close, payroll cutoff, "lock timesheets for March". NOT for: deleting individual entries (use log_time) or closing the accounting period (close_accounting_period).',
    category: 'commerce',
    handler: 'rpc:lock_timesheet_period',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {"type":"function","function":{"name":"lock_timesheet_period","parameters":{"type":"object","required":["fiscal_year","period_month"],"properties":{"notes":{"type":"string"},"fiscal_year":{"type":"integer","description":"Year, e.g. 2026"},"period_month":{"type":"integer","description":"Month 1-12"}}},"description":"Lock all time entries in a fiscal month."}} as SkillSeed['tool_definition'],
  },
  {
    name: 'log_time',
    description: 'Log time entries for projects. Use when: employee reports hours worked, FlowPilot processes daily standups, user says "I worked 4 hours on X". NOT for: project management (use manage_projects), summaries (use timesheet_summary).',
    category: 'commerce',
    handler: 'module:timesheets',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'log_time',
        description: 'Create, list, or delete time entries. STRICT: action is required and never auto-inferred. To log hours you MUST send action="create" together with hours (>0, ≤24) AND project_id OR project_name — otherwise the call fails loudly with a validation error.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'list', 'delete'], description: 'REQUIRED. Must be explicitly set. Use "create" to insert a new entry — there is no default and no auto-inference.' },
            project_id: { type: 'string', description: 'Project UUID. Required for create unless project_name is supplied.' },
            project_name: { type: 'string', description: 'Project name (case-insensitive partial match). Required for create unless project_id is supplied.' },
            entry_date: { type: 'string', description: 'YYYY-MM-DD (defaults to today). Strict format — invalid dates are rejected.' },
            hours: { type: 'number', description: 'REQUIRED for create. Must be a number > 0 and ≤ 24.' },
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
    instructions: 'STRICT VALIDATION: log_time will reject the call (status="failed") if action is missing, if action!="create" while attempting to log, if hours is missing/zero/negative/>24, or if neither project_id nor project_name is supplied. To log hours: 1) Resolve the project (lookup by name if needed). 2) Send action="create", hours, and project_id|project_name — entry_date defaults to today. 3) Confirm the log showing project name, hours, and date. Swedish synonyms: "logga tid", "tidsrapport", "jobbade", "timmar".',
  },
  // NOTE: manage_projects / manage_tasks intentionally removed.
  // Use the canonical skills from projects-module instead:
  //   - manage_project        (handler: db:projects)
  //   - manage_project_task   (handler: db:project_tasks)
  // Previous duplicates here had handler='db:timesheets' which doesn't exist
  // and would crash at runtime. See guardrail:
  //   src/lib/__tests__/skill-schema-not-null-coverage.guardrails.test.ts
  {
    name: 'timesheet_summary',
    description: 'Generate timesheet summaries and reports. Use when: admin asks for weekly/monthly hours overview, billing summary, or "how much time have we spent on project X". NOT for: logging time (use log_time).',
    category: 'commerce',
    handler: 'module:timesheets',
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
    instructions: 'For custom date ranges pass start_date/end_date (from_date/to_date also accepted) — period auto-switches to "custom". When include_revenue is true, multiply hours × hourly_rate per project.',
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
  processes: ['quote-to-cash', 'hire-to-retire'],
  maturity: 'L3',
  description: 'Time tracking for employees and projects with billable/non-billable categorization',
  requires: ['projects'],
  capabilities: ['data:write', 'data:read'],
  tier: 'standard',
  inputSchema: timesheetsInputSchema,
  outputSchema: timesheetsOutputSchema,

  skills: ['log_time', 'timesheet_summary', 'lock_timesheet_period'],
  data: {
    tables: ['time_entries', 'timesheet_period_locks'],
  },
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
