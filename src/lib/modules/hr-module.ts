/**
 * HR Module — Unified Definition
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { defineModule } from '@/lib/module-def';
import type { SkillSeed, AutomationSeed } from '@/lib/module-bootstrap';

const hrInputSchema = z.object({
  action: z.enum(['list_employees', 'get_employee', 'list_leave_requests', 'update_leave_status']),
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid().optional(),
  status: z.enum(['pending', 'approved', 'denied']).optional(),
});

const hrOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

type HrInput = z.infer<typeof hrInputSchema>;
type HrOutput = z.infer<typeof hrOutputSchema>;

const HR_SKILLS: SkillSeed[] = [
  {
    name: 'auto_allocate_vacation',
    description: 'Allocate annual vacation days for all active employees at year-end based on age/tenure policies, including capped carry-over from previous year. Use when: rolling over to a new fiscal year, onboarding HR module mid-year. NOT for: per-employee manual adjustments (use manage_leave).',
    category: 'crm',
    handler: 'rpc:auto_allocate_vacation',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {"type":"function","function":{"name":"auto_allocate_vacation","parameters":{"type":"object","required":["p_year"],"properties":{"p_year":{"type":"integer","description":"Fiscal year to allocate, e.g. 2026"},"p_dry_run":{"type":"boolean","description":"If true, returns preview without writing"}}},"description":"Bulk-allocate vacation days for a fiscal year based on active vacation_policies; writes audit log per employee."}} as SkillSeed['tool_definition'],
  },
  {
    name: 'manage_employee',
    description: 'Create, update, search, and deactivate employee records. Use when: adding new team members, updating roles/departments, offboarding. NOT for: leave requests (use manage_leave), documents.',
    category: 'crm',
    handler: 'db:employees',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_employee',
        description: 'CRUD operations on employee records',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'update', 'search', 'deactivate'] },
            employee_id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' },
            title: { type: 'string' },
            department: { type: 'string' },
            employment_type: { type: 'string', enum: ['full_time', 'part_time', 'contractor'] },
            start_date: { type: 'string', description: 'YYYY-MM-DD' },
            status: { type: 'string', enum: ['active', 'on_leave', 'terminated'] },
            search_query: { type: 'string' },
          },
          required: ['action'],
          'x-action-required': {
            create: ['name'],
          },
        },
      },
    },
    instructions: 'Employee directory management. Status flow: active → on_leave → active, or active → terminated. When creating, default employment_type to full_time. For search, match against name, email, department.',
  },
  {
    name: 'manage_leave',
    description: 'Create, approve, reject, or list leave requests for employees. Use when: handling vacation/sick leave, reviewing pending requests, checking who is on leave. NOT for: general employee data (use manage_employee).',
    category: 'crm',
    handler: 'db:leave_requests',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_leave',
        description: 'Leave request operations',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'approve', 'reject', 'list_pending', 'list_by_employee'] },
            request_id: { type: 'string' },
            employee_id: { type: 'string' },
            leave_type: { type: 'string', enum: ['vacation', 'sick', 'parental', 'other'] },
            start_date: { type: 'string' },
            end_date: { type: 'string' },
            days: { type: 'number' },
            reason: { type: 'string' },
          },
          required: ['action'],
          'x-action-required': {
            create: ['employee_id', 'start_date', 'end_date'],
          },
        },
      },
    },
    instructions: 'Leave request lifecycle: pending → approved/rejected. Calculate days automatically from start/end dates when possible. Leave types: vacation, sick, parental.',
  },
  {
    name: 'onboarding_checklist',
    description: 'Create and manage onboarding checklists for new employees. Use when: a new employee is added and needs onboarding steps, checking onboarding progress. NOT for: general task management.',
    category: 'crm',
    handler: 'db:onboarding_checklists',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'onboarding_checklist',
        description: 'Manage onboarding checklists',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'update_item', 'get_status', 'list_incomplete'] },
            employee_id: { type: 'string' },
            checklist_id: { type: 'string' },
            items: {
              type: 'array',
              description: 'Array of {title, done} items',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  done: { type: 'boolean' },
                },
                required: ['title'],
              },
            },
          },
          required: ['action'],
        },
      },
    },
    instructions: 'Default onboarding items: IT setup, access cards, welcome meeting, policy review, buddy assignment. Mark completed_at when all items are done. Swedish: "introduktion", "onboarding", "checklista".',
  },
  {
    name: 'manage_salary_grade',
    description:
      'Salary grades/scales: define pay bands (code, level, min/mid/max), assign employees to a grade, and audit band compliance (who is paid outside their band, compa-ratios). Use when: setting up a compensation structure, benchmarking pay, salary review prep. NOT for: setting an individual salary (manage_employee) or payroll runs (create_payroll_run).',
    category: 'crm',
    handler: 'rpc:manage_salary_grade',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_salary_grade',
        description:
          'create/update/delete/list grades; assign links an employee (employees.salary_grade_id) and reports in_band vs their monthly salary; compliance lists out-of-band employees with compa-ratio (salary/mid).',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['create', 'update', 'delete', 'list', 'assign', 'compliance'] },
            p_grade_id: { type: 'string', format: 'uuid' },
            p_code: { type: 'string', description: 'Stable grade code, e.g. G1, SENIOR-ENG (uppercased; create upserts on it)' },
            p_name: { type: 'string' },
            p_level: { type: 'integer', description: 'Ordering level, 1 = lowest' },
            p_min_cents: { type: 'integer', description: 'Band minimum, monthly salary in cents' },
            p_mid_cents: { type: 'integer', description: 'Band midpoint (defaults to (min+max)/2)' },
            p_max_cents: { type: 'integer', description: 'Band maximum, monthly salary in cents' },
            p_currency: { type: 'string', default: 'SEK' },
            p_employee_id: { type: 'string', format: 'uuid', description: 'Employee to assign (assign)' },
            p_is_active: { type: 'boolean' },
            p_notes: { type: 'string' },
          },
        },
      },
    },
    instructions:
      'Amounts are MONTHLY salary in cents (like employees.monthly_salary_cents). assign with only p_employee_id (no grade) clears the grade. compliance also counts active employees with no grade. compa_ratio 1.0 = paid at midpoint; <0.8 or >1.2 usually warrants review.',
  },
  {
    name: 'manage_benefits',
    description:
      'Benefits/allowances: maintain benefit plans (health, pension, insurance, wellness, meal, commute, equipment) with employer/employee monthly costs, enroll employees, and report total benefit spend. Use when: adding a pension or wellness allowance, enrolling a new hire in benefits, reporting monthly benefits cost. NOT for: salary (manage_salary_grade/manage_employee) or expense claims (expenses module).',
    category: 'crm',
    handler: 'rpc:manage_benefits',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_benefits',
        description:
          'create_plan/update_plan/list_plans over benefit_plans; enroll/end_enrollment/list_enrollments over employee_benefits; summary aggregates monthly employer/employee cost per active plan.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['create_plan', 'update_plan', 'list_plans', 'enroll', 'end_enrollment', 'list_enrollments', 'summary'] },
            p_plan_id: { type: 'string', format: 'uuid' },
            p_name: { type: 'string', description: 'Plan name (create_plan)' },
            p_benefit_type: { type: 'string', enum: ['health', 'pension', 'insurance', 'wellness', 'meal', 'commute', 'equipment', 'other'] },
            p_description: { type: 'string' },
            p_provider: { type: 'string', description: 'e.g. insurance company or pension provider' },
            p_employer_cost_cents: { type: 'integer', description: 'Employer cost per employee per month, cents' },
            p_employee_cost_cents: { type: 'integer', description: 'Employee co-pay per month, cents' },
            p_employee_id: { type: 'string', format: 'uuid', description: 'Employee (enroll/end_enrollment/list_enrollments filter)' },
            p_start_date: { type: 'string', format: 'date' },
            p_end_date: { type: 'string', format: 'date' },
            p_is_active: { type: 'boolean' },
            p_notes: { type: 'string' },
          },
        },
      },
    },
    instructions:
      'One active enrollment per employee+plan (enforced). end_enrollment closes the active one with an end_date. summary gives the monthly employer cost total — useful for budget questions. Employees see their own benefits via the self-service portal (RLS self-read).',
  },
  {
    name: 'manage_training',
    description:
      'Training/course catalog: maintain courses (provider, duration, cost, mandatory flag, certification validity), enroll employees, track completion and optionally award a certification. Use when: onboarding training, compliance courses, upskilling plans, "who has completed X". NOT for: skills matrix entries themselves (skills panel) or performance goals.',
    category: 'crm',
    handler: 'rpc:manage_training',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_training',
        description:
          'create_course/update_course/list_courses over training_courses; enroll/complete/cancel/list_enrollments over training_enrollments. complete with p_award_certification=true also writes a certifications row (expiry from the course valid_months).',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['create_course', 'update_course', 'list_courses', 'enroll', 'complete', 'cancel', 'list_enrollments'] },
            p_course_id: { type: 'string', format: 'uuid' },
            p_title: { type: 'string', description: 'Course title (create_course)' },
            p_description: { type: 'string' },
            p_category: { type: 'string', description: 'e.g. safety, compliance, leadership, technical' },
            p_provider: { type: 'string' },
            p_duration_hours: { type: 'number' },
            p_cost_cents: { type: 'integer' },
            p_url: { type: 'string' },
            p_mandatory: { type: 'boolean', description: 'Required for all employees' },
            p_valid_months: { type: 'integer', description: 'Certification validity in months (drives expiry when awarding)' },
            p_employee_id: { type: 'string', format: 'uuid', description: 'Employee (enroll/complete/cancel/list filter)' },
            p_due_date: { type: 'string', format: 'date' },
            p_score: { type: 'string', description: 'Result/grade on completion' },
            p_notes: { type: 'string' },
            p_award_certification: { type: 'boolean', default: false, description: 'On complete: also create a certifications row for the employee' },
            p_is_active: { type: 'boolean' },
          },
        },
      },
    },
    instructions:
      'enroll upserts (re-enrolling a cancelled employee reactivates). complete requires an existing enrollment. p_award_certification links training to the existing certifications table so expiring certs show up in the skills/certifications panel. Swedish: "utbildning", "kurs", "certifiering".',
  },
  {
    name: 'manage_disciplinary',
    description:
      'Disciplinary actions/warnings: record verbal/written/final warnings, suspensions or termination notices with reason and severity, track acknowledgement and resolution. Use when: documenting a policy breach, HR investigation trail, checking an employee\'s warning history before action. NOT for: performance improvement goals (performance panel) or firing/offboarding itself (manage_employee).',
    category: 'crm',
    handler: 'rpc:manage_disciplinary',
    scope: 'internal',
    trust_level: 'approve',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_disciplinary',
        description:
          'create/update/acknowledge/resolve/withdraw/get/list over disciplinary_actions. Status flow: open → acknowledged → resolved (or withdrawn). Admin-only data (strict RLS).',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['create', 'update', 'acknowledge', 'resolve', 'withdraw', 'get', 'list'] },
            p_record_id: { type: 'string', format: 'uuid' },
            p_employee_id: { type: 'string', format: 'uuid', description: 'Employee (create; list filter)' },
            p_action_type: { type: 'string', enum: ['verbal_warning', 'written_warning', 'final_warning', 'suspension', 'termination_notice', 'note'] },
            p_severity: { type: 'integer', description: '1 minor, 2 serious, 3 gross misconduct' },
            p_reason: { type: 'string', description: 'Short reason (required for create)' },
            p_description: { type: 'string', description: 'Full incident description' },
            p_resolution: { type: 'string', description: 'Outcome note (resolve/withdraw)' },
            p_follow_up_date: { type: 'string', format: 'date' },
            p_limit: { type: 'integer', default: 100 },
          },
        },
      },
    },
    instructions:
      'Sensitive HR data — admin-only, keep descriptions factual. acknowledge marks that the employee has seen the warning; resolve closes it with an outcome; withdraw retracts a wrongly issued record (kept for audit, never delete). Swedish labor practice: verbal → written (LAS-varning) → final before termination.',
  },
  {
    name: 'manage_shift',
    description:
      'Shift scheduling/roster: create and assign work shifts (date, start/end, role, location), detect overlaps, and read a weekly roster with hours per employee and open (unassigned) shifts. Use when: staffing a week, swapping/assigning shifts, checking who works when, coverage planning. NOT for: clock in/out actuals (attendance) or leave (manage_leave).',
    category: 'crm',
    handler: 'rpc:manage_shift',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_shift',
        description:
          'create/update/assign/delete/list/roster over shifts. create/assign reject overlapping shifts for the same employee. roster returns a 7-day view grouped per employee with total hours + open shifts.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['create', 'update', 'assign', 'delete', 'list', 'roster'] },
            p_shift_id: { type: 'string', format: 'uuid' },
            p_employee_id: { type: 'string', format: 'uuid', description: 'Omit on create for an OPEN shift to assign later' },
            p_shift_date: { type: 'string', format: 'date' },
            p_start_time: { type: 'string', description: 'HH:MM (24h)' },
            p_end_time: { type: 'string', description: 'HH:MM (24h), must be after start (no overnight spans — split at midnight)' },
            p_role: { type: 'string', description: 'e.g. cashier, support, on-call' },
            p_location: { type: 'string' },
            p_status: { type: 'string', enum: ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'] },
            p_break_minutes: { type: 'integer', default: 0 },
            p_notes: { type: 'string' },
            p_week_start: { type: 'string', format: 'date', description: 'roster/list: start of the 7-day window' },
          },
        },
      },
    },
    instructions:
      'Overlap guard: an employee cannot have two overlapping non-cancelled shifts on the same date (create and assign both check). Overnight shifts are not supported in one row — split at midnight. roster total_hours = (end-start) - break per shift. Employees see their own shifts via self-service (RLS self-read). Swedish: "schema", "arbetspass", "bemanning".',
  },
];

const HR_AUTOMATIONS: AutomationSeed[] = [
  {
    name: 'HR Leave Review Reminder',
    description: 'Every weekday at 09:00, FlowPilot checks for pending leave requests and reminds admin to review them.',
    trigger_type: 'cron',
    trigger_config: { cron: '0 9 * * 1-5', expression: '0 9 * * 1-5' },
    skill_name: 'manage_leave',
    skill_arguments: { action: 'list_pending' },
  },
];

export const hrModule = defineModule<HrInput, HrOutput>({
  id: 'hr',
  name: 'HR & Employees',
  version: '1.0.0',
  processes: ['hire-to-retire'],
  maturity: 'L3',
  description: 'Employee directory, leave management, and organizational structure',
  capabilities: ['data:write', 'data:read'],
  tier: 'standard',
  inputSchema: hrInputSchema,
  outputSchema: hrOutputSchema,

  skills: ['manage_employee', 'manage_leave', 'onboarding_checklist', 'auto_allocate_vacation'],
  data: {
    // children first (FK-safe order)
    tables: [
      'employee_documents',
      'employee_skills',
      'leave_requests',
      'leave_allocations',
      'vacation_policies',
      'attendance_entries',
      'certifications',
      'onboarding_checklists',
      'onboarding_templates',
      'one_on_ones',
      'performance_goals',
      'performance_reviews',
      'employees',
    ],
  },
  skillSeeds: HR_SKILLS,
  automations: HR_AUTOMATIONS,

  async publish(input: HrInput): Promise<HrOutput> {
    const validated = hrInputSchema.parse(input);

    if (validated.action === 'list_employees') {
      const { data, error } = await supabase.from('employees').select('*').order('name').limit(100);
      if (error) { logger.error('[hr] list_employees failed', error); return { success: false, message: error.message }; }
      return { success: true, message: `Found ${data.length} employees` };
    }

    if (validated.action === 'list_leave_requests') {
      let query = supabase.from('leave_requests').select('*').order('created_at', { ascending: false }).limit(50);
      if (validated.employee_id) query = query.eq('employee_id', validated.employee_id);
      const { data, error } = await query;
      if (error) return { success: false, message: error.message };
      return { success: true, message: `Found ${data.length} leave requests` };
    }

    return { success: false, message: 'Unsupported action' };
  },
});
