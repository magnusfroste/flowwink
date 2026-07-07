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
  {
    name: 'manage_timesheet_approval',
    description: 'Submit, approve or reject all timesheet entries in a date range (manager approval workflow). Use when: "approve last week\'s timesheets", weekly/monthly sign-off, rejecting a period for correction. NOT for: locking a closed month (lock_timesheet_period) or logging hours (log_time).',
    category: 'commerce',
    handler: 'rpc:manage_timesheet_approval',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_timesheet_approval',
        description: 'Set approval_status on time entries in a date range: submit (draft→submitted), approve or reject (draft/submitted→approved/rejected).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['submit', 'approve', 'reject'], description: 'REQUIRED.' },
            start_date: { type: 'string', description: 'YYYY-MM-DD inclusive. REQUIRED.' },
            end_date: { type: 'string', description: 'YYYY-MM-DD inclusive. REQUIRED.' },
            user_id: { type: 'string', description: 'Limit to one user (auth UUID). Optional.' },
            employee_id: { type: 'string', description: 'Limit to one employee (employees.id UUID). Optional.' },
            notes: { type: 'string', description: 'Approval/rejection note stored on the entries.' },
          },
          required: ['action', 'start_date', 'end_date'],
        },
      },
    },
    instructions: 'Returns entries_updated — 0 means nothing matched (wrong range or entries already approved). Approve BEFORE locking the month; lock_timesheet_period blocks any later status change in that period.',
  },
  {
    name: 'split_time_entry',
    description: 'Split one time entry into several entries across multiple projects on the same day (multi-project day split). Use when: an employee\'s day covered several projects but was logged as one block. NOT for: creating new independent entries (log_time).',
    category: 'commerce',
    handler: 'rpc:split_time_entry',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'split_time_entry',
        description: 'Split an existing time entry into 2+ allocations. Allocations must sum to the original hours unless allow_total_change=true.',
        parameters: {
          type: 'object',
          properties: {
            entry_id: { type: 'string', description: 'UUID of the time entry to split. REQUIRED.' },
            allocations: {
              type: 'array',
              description: 'At least 2 items. Each: {project_id? (UUID), project_name? (resolved case-insensitively), hours (>0), description?, is_billable?}. Omitting project keeps the original project.',
              items: { type: 'object' },
            },
            allow_total_change: { type: 'boolean', description: 'Allow the allocation sum to differ from the original hours. Default false.' },
          },
          required: ['entry_id', 'allocations'],
        },
      },
    },
    instructions: 'Rejected when the entry is invoiced or approved (reject the period first). The first allocation reuses the original entry id; the rest become new entries with the same date/person.',
  },
  {
    name: 'log_indirect_time',
    description: 'Log indirect (non-project) time: PTO, sick, training or overhead hours. Books to the auto-created "Internal (non-billable)" project with the right category. Use when: "Anna was sick Tuesday", "log 8h training for me". NOT for: billable project work (log_time) or formal leave requests (leave/HR module).',
    category: 'commerce',
    handler: 'rpc:log_indirect_time',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'log_indirect_time',
        description: 'Insert a categorized non-billable time entry (pto|sick|training|overhead).',
        parameters: {
          type: 'object',
          properties: {
            entry_date: { type: 'string', description: 'YYYY-MM-DD. Defaults to today.' },
            hours: { type: 'number', description: 'REQUIRED. >0 and ≤24.' },
            category: { type: 'string', enum: ['pto', 'sick', 'training', 'overhead'], description: 'REQUIRED.' },
            description: { type: 'string' },
            user_id: { type: 'string', description: 'Auth user UUID. Defaults to the caller.' },
            employee_id: { type: 'string', description: 'employees.id UUID — pass this when logging for a named employee.' },
          },
          required: ['hours', 'category'],
        },
      },
    },
    instructions: 'When called by an external operator there is no session user — pass employee_id (look it up via the HR/employee skills first). Sick days logged here surface in payroll_timesheet_basis as sick_days.',
  },
  {
    name: 'apply_overtime_rules',
    description: 'Compute and flag overtime: any hours above a daily threshold (default 8h) per person per day in a date range are stamped on the entries as overtime_hours. Use when: month-end before payroll, "how much overtime did we have in June". NOT for: paying it out (apply_timesheet_overtime does that on a payroll run).',
    category: 'commerce',
    handler: 'rpc:apply_overtime_rules',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'apply_overtime_rules',
        description: 'Recompute overtime_hours for all work entries in a range (idempotent — resets then re-flags).',
        parameters: {
          type: 'object',
          properties: {
            start_date: { type: 'string', description: 'YYYY-MM-DD. REQUIRED.' },
            end_date: { type: 'string', description: 'YYYY-MM-DD. REQUIRED.' },
            daily_threshold_hours: { type: 'number', description: 'Hours per day before overtime starts. Default 8.' },
          },
          required: ['start_date', 'end_date'],
        },
      },
    },
    instructions: 'Only category=work entries count toward the daily total. Returns per-day overtime rows; run this for the payroll month BEFORE apply_timesheet_overtime.',
  },
  {
    name: 'timesheet_utilization_report',
    description: 'Utilization / productivity analytics per person for a date range: work vs billable vs indirect hours, overtime, capacity, utilization %, labor cost and revenue. Use when: "team utilization last month", profitability per consultant, capacity planning. NOT for: raw hour listings (timesheet_summary).',
    category: 'analytics',
    handler: 'rpc:timesheet_utilization_report',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'timesheet_utilization_report',
        description: 'Per-person utilization, category breakdown, overtime, cost (entry cost_rate_cents or salary/168h) and revenue (project hourly rate).',
        parameters: {
          type: 'object',
          properties: {
            start_date: { type: 'string', description: 'YYYY-MM-DD. REQUIRED.' },
            end_date: { type: 'string', description: 'YYYY-MM-DD. REQUIRED.' },
            capacity_hours_per_day: { type: 'number', description: 'Workday capacity used for utilization %. Default 8.' },
          },
          required: ['start_date', 'end_date'],
        },
      },
    },
  },
  {
    name: 'payroll_timesheet_basis',
    description: 'Per-employee timesheet basis for one payroll month: work hours, overtime hours, PTO/training hours, sick days and unapproved-entry count. Use when: preparing a payroll run from logged time. NOT for: utilization analysis (timesheet_utilization_report).',
    category: 'commerce',
    handler: 'rpc:payroll_timesheet_basis',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'payroll_timesheet_basis',
        description: 'Summarize time_entries per employee for the month of period_date, as input to payroll.',
        parameters: {
          type: 'object',
          properties: {
            period_date: { type: 'string', description: 'Any date in the target month (YYYY-MM-DD). Defaults to current month.' },
          },
        },
      },
    },
    instructions: 'Workflow: create_payroll_run → payroll_timesheet_basis → apply_sick_pay per employee with sick_days → apply_timesheet_overtime for the run. Only entries linked to an employee (employee_id) appear here.',
  },
  {
    name: 'apply_timesheet_overtime',
    description: 'Apply overtime pay from timesheets onto a DRAFT payroll run: sums time_entries.overtime_hours for the run month per employee, adds overtime pay (hourly = monthly salary / 168, × multiplier) and recomputes tax/social/net. Idempotent — re-running replaces the previous overtime adjustment. Use when: monthly payroll with logged overtime. NOT for: flagging overtime on entries (apply_overtime_rules).',
    category: 'commerce',
    handler: 'rpc:apply_timesheet_overtime',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'apply_timesheet_overtime',
        description: 'Add timesheet-driven overtime pay to draft payroll lines and refresh run totals.',
        parameters: {
          type: 'object',
          properties: {
            run_id: { type: 'string', description: 'UUID of a DRAFT payroll run. REQUIRED.' },
            employee_id: { type: 'string', description: 'Limit to one employee. Optional.' },
            multiplier: { type: 'number', description: 'Overtime multiplier. Default 1.5.' },
            work_days_per_month: { type: 'integer', description: 'Default 21.' },
            hours_per_day: { type: 'number', description: 'Default 8.' },
          },
          required: ['run_id'],
        },
      },
    },
    instructions: 'Run apply_overtime_rules for the month FIRST — this reads time_entries.overtime_hours (rejected entries excluded). Only draft runs accept it. Re-run apply_pension afterwards if pension was already applied (gross changed).',
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

  skills: [
    'log_time', 'timesheet_summary', 'lock_timesheet_period',
    'manage_timesheet_approval', 'split_time_entry', 'log_indirect_time',
    'apply_overtime_rules', 'timesheet_utilization_report',
    'payroll_timesheet_basis', 'apply_timesheet_overtime',
  ],
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
