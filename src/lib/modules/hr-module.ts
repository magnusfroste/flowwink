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
    name: 'manage_onboarding_template',
    description: 'Create and maintain onboarding templates: the checklist items a new hire gets, optionally per department or employment type. hire_application seeds each new employee\'s checklist from the best-matching active template (department, then employment type, then the default). Use when: setting up onboarding for a team; changing what every new hire must do; a hire got no checklist. NOT for: one employee\'s own checklist (onboarding_checklist); recruiting stages (manage_application).',
    category: 'crm',
    handler: 'db:onboarding_templates',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_onboarding_template',
        description: 'list / get / create / update / delete onboarding_templates. items is [{title, done:false, owner?, due_offset_days?}].',
        parameters: {
          type: 'object',
          required: ['action'],
          'x-action-required': { create: ['name'], get: ['id'], update: ['id'], delete: ['id'] },
          properties: {
            action: { type: 'string', enum: ['list', 'get', 'create', 'update', 'delete'] },
            id: { type: 'string', format: 'uuid', description: 'Template id (get/update/delete)' },
            name: { type: 'string', description: 'create: template name' },
            description: { type: 'string' },
            department: { type: 'string', description: 'Match new hires in this department (optional)' },
            employment_type: { type: 'string', description: 'Match this employment type, e.g. permanent, temporary (optional)' },
            items: {
              type: 'array',
              description: 'Checklist items copied to each new hire',
              items: { type: 'object', properties: { title: { type: 'string' }, done: { type: 'boolean' } }, required: ['title'] },
            },
            is_active: { type: 'boolean' },
            is_default: { type: 'boolean', description: 'Used when no department/type template matches' },
          },
        },
      },
    },
    instructions: 'Create the default first: {action:"create", name:"Standard onboarding", is_default:true, items:[{title:"IT setup",done:false},…]}. Add department-specific templates as needed; hire_application picks department → employment type → default. Existing hires are not changed — only new hires get the new list.',
  },
  {
    name: 'manage_employment_contract_template',
    description: 'Create and maintain employment contract templates: the body (markdown with merge fields), employment type, default probation and notice period. hire_application renders each new hire\'s draft contract from the active default template; manage_job_offer uses the same templates for offers. Use when: setting up hiring on a fresh instance; changing the standard contract wording; a hire got a contract with an empty body. NOT for: one employee\'s contract (sign_employment_contract and the HR contract view); customer contracts (manage_contract_template).',
    category: 'crm',
    handler: 'db:employment_contract_templates',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_employment_contract_template',
        description: 'list / get / create / update / delete employment_contract_templates. body_markdown takes the merge fields hire_application fills: {{employee_name}}, {{title}} (job title), {{department}}, {{start_date}}, {{monthly_salary}}.',
        parameters: {
          type: 'object',
          required: ['action'],
          'x-action-required': { create: ['name'], get: ['id'], update: ['id'], delete: ['id'] },
          properties: {
            action: { type: 'string', enum: ['list', 'get', 'create', 'update', 'delete'] },
            id: { type: 'string', format: 'uuid', description: 'Template id (get/update/delete)' },
            name: { type: 'string', description: 'create: template name' },
            description: { type: 'string' },
            employment_type: { type: 'string', description: 'permanent (default), temporary, …' },
            body_markdown: { type: 'string', description: 'Contract text with merge fields' },
            default_probation_months: { type: 'number', description: 'Default 6' },
            default_notice_period_days: { type: 'number', description: 'Default 30' },
            is_active: { type: 'boolean' },
            is_default: { type: 'boolean', description: 'The template hire_application uses' },
          },
        },
      },
    },
    instructions: 'A fresh install has no template, so hires get a draft contract with no body. Create one: {action:"create", name:"Permanent employment", is_default:true, body_markdown:"…{{employee_name}}…"}. Then hire_application renders it; sign the result with sign_employment_contract (employer and employee side).',
  },
  {
    name: 'sign_employment_contract',
    description: 'Record a signature on an employment contract — the employer side (needs the HR module) or the employee side. When both sides have signed the contract becomes signed. Use when: the employer approves a new hire\'s contract; recording that the employee has signed. NOT for: customer/supplier contracts (send_contract_for_signature); creating the contract (hire_application creates the draft).',
    category: 'crm',
    handler: 'rpc:sign_employment_contract',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'sign_employment_contract',
        description: 'Sign one side of an employment contract; both sides → status signed.',
        parameters: {
          type: 'object',
          required: ['p_contract_id'],
          properties: {
            p_contract_id: { type: 'string', format: 'uuid', description: 'employment_contracts.id (hire_application returns it)' },
            p_side: { type: 'string', enum: ['employer', 'employee'], description: 'Which side signs (default employee)' },
          },
        },
      },
    },
    instructions: 'Same code as the HR contract view. Employer side needs the HR module (or service role). The employee side is the employee themself, or HR recording a wet-ink signature. Call once per side; the second call flips status to signed and stamps signed_at.',
  },
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
            end_date: { type: 'string', description: 'YYYY-MM-DD — last day; payroll stops after it' },
            status: { type: 'string', enum: ['active', 'on_leave', 'terminated'] },
            user_id: { type: 'string', format: 'uuid', description: 'The employee\'s login (profiles.id). Links time entries, approvals and the portal; an employee without one can still be paid' },
            manager_id: { type: 'string', format: 'uuid', description: 'employees.id of the manager (approvals, org chart)' },
            monthly_salary_cents: { type: 'integer', description: 'Monthly salary in cents — what create_payroll_run pays. Without it the run pays 0' },
            tax_rate_pct: { type: 'number', description: 'Preliminary tax rate in percent (e.g. 30); defaults to 30' },
            payroll_country: { type: 'string', description: 'ISO country for the payroll profile (employer social fees); defaults to SE' },
            personal_number: { type: 'string', description: 'Personal identity number (needed for AGI / payslips)' },
            birth_date: { type: 'string', description: 'YYYY-MM-DD' },
            phone: { type: 'string' },
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
          'x-action-required': {
            create: ['employee_id'],
          },
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
  {
    name: 'manage_skill',
    description: 'CRUD on the skills catalog (skills_catalog) — the vocabulary employee skills and job postings share. Use when: registering a competence that employees will be tagged with, listing the catalog before tagging. NOT for: tagging an employee (manage_employee_skill), job requirements (manage_job_posting required_skills).',
    category: 'crm',
    handler: 'db:skills_catalog',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_skill',
        description: 'Create, update, list or delete catalog skills',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'update', 'list', 'get', 'delete'] },
            skill_id: { type: 'string', format: 'uuid' },
            name: { type: 'string', description: 'Skill name — matched case-insensitively by match_internal_candidates' },
            category: { type: 'string' },
            description: { type: 'string' },
            search: { type: 'string' },
          },
          required: ['action'],
          'x-action-required': { create: ['name'] },
        },
      },
    },
  },
  {
    name: 'manage_employee_skill',
    description: 'Tag an employee with a catalog skill and a proficiency (employee_skills). Use when: recording what an employee can do, before match_internal_candidates or succession planning. NOT for: the catalog itself (manage_skill), external candidates (score_candidate).',
    category: 'crm',
    handler: 'db:employee_skills',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_employee_skill',
        description: 'Create, update, list or delete employee skill tags',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'update', 'list', 'get', 'delete'] },
            employee_skill_id: { type: 'string', format: 'uuid' },
            employee_id: { type: 'string', format: 'uuid' },
            skill_id: { type: 'string', format: 'uuid', description: 'skills_catalog.id (manage_skill action=list)' },
            proficiency_level: { type: 'integer', description: '1–5' },
            years_experience: { type: 'number' },
            notes: { type: 'string' },
          },
          required: ['action'],
          'x-action-required': { create: ['employee_id', 'skill_id'] },
        },
      },
    },
    instructions: 'One row per (employee, skill). match_internal_candidates reads proficiency_level; a skill absent from the catalog must be created first with manage_skill.',
  },
  {
    name: 'manage_performance',
    description: 'Performance management for one employee: goals (create_goal / update_goal with progress_pct — 100 % completes it / list_goals), 1:1 meetings between the employee and their manager (schedule_one_on_one / complete_one_on_one with notes, action_items and mood / list_one_on_ones), and performance reviews (start_review for a period → submit_review with overall_rating 1–5, achievements, areas_of_improvement, goals_next_period, salary_adjustment_pct, promotion_recommended → acknowledge_review by the employee / list_reviews). Same tables as HR → Performance. Use when: "set a goal for Anna", "book our 1:1", "write the annual review", "what did we agree last time", "who has no review this year". NOT for: the org chart (org_chart); salary grades and bands (manage_salary_grade); disciplinary matters (manage_disciplinary); leave (manage_leave).',
    category: 'crm',
    handler: 'rpc:manage_performance',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_performance',
        description: 'Goals, 1:1s and reviews for an employee',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['create_goal', 'update_goal', 'list_goals', 'schedule_one_on_one', 'complete_one_on_one', 'list_one_on_ones', 'start_review', 'submit_review', 'acknowledge_review', 'list_reviews'] },
            p_employee_id: { type: 'string', format: 'uuid', description: 'The employee (manage_employee action:list). Required for create/schedule/start/list.' },
            p_goal_id: { type: 'string', format: 'uuid', description: 'update_goal' },
            p_one_on_one_id: { type: 'string', format: 'uuid', description: 'complete_one_on_one' },
            p_review_id: { type: 'string', format: 'uuid', description: 'submit_review / acknowledge_review' },
            p_manager_id: { type: 'string', format: 'uuid', description: 'schedule_one_on_one: the manager (defaults to employees.manager_id)' },
            p_reviewer_id: { type: 'string', format: 'uuid', description: 'start_review: who reviews (defaults to the manager)' },
            p_title: { type: 'string', description: 'create_goal / update_goal' },
            p_description: { type: 'string' },
            p_category: { type: 'string', enum: ['business', 'personal', 'professional', 'skill'], description: 'goal category (default professional)' },
            p_target_date: { type: 'string', format: 'date' },
            p_weight: { type: 'integer', description: 'goal weight 1–5' },
            p_progress_pct: { type: 'integer', description: 'update_goal: 0–100; 100 completes the goal' },
            p_status: { type: 'string', description: 'update_goal: active | completed | cancelled; list_*: filter' },
            p_scheduled_at: { type: 'string', format: 'date-time', description: 'schedule_one_on_one: ISO time with offset' },
            p_duration_minutes: { type: 'integer', description: '1:1 length (default 30)' },
            p_agenda: { type: 'string', description: 'schedule_one_on_one' },
            p_notes: { type: 'string', description: 'complete_one_on_one: what was said' },
            p_action_items: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, owner: { type: 'string' }, due: { type: 'string', format: 'date' } }, required: ['text'] }, description: 'complete_one_on_one' },
            p_employee_mood: { type: 'string', description: 'complete_one_on_one: how the employee is doing, in their words' },
            p_period_start: { type: 'string', format: 'date', description: 'start_review' },
            p_period_end: { type: 'string', format: 'date', description: 'start_review' },
            p_period_type: { type: 'string', enum: ['annual', 'quarterly', 'probation', 'ad_hoc'], description: 'start_review (default annual)' },
            p_overall_rating: { type: 'integer', description: 'submit_review: 1–5, required' },
            p_achievements: { type: 'string' },
            p_areas_of_improvement: { type: 'string' },
            p_goals_next_period: { type: 'string' },
            p_manager_comments: { type: 'string' },
            p_employee_comments: { type: 'string', description: 'acknowledge_review' },
            p_salary_adjustment_pct: { type: 'number', description: 'submit_review: the raise the review recommends, in percent' },
            p_promotion_recommended: { type: 'boolean' },
            p_limit: { type: 'integer', description: 'list_*: max rows (default 50, max 200)' },
          },
        },
      },
    },
    instructions: 'A review runs draft → completed (submit_review, by the reviewer, rating 1–5 required) → acknowledged (acknowledge_review, by the employee). A 1:1 needs a manager: pass p_manager_id or set manager_id on the employee first (manage_employee update). Goals auto-complete at 100 %. Personal content (mood, comments) is the employee\'s and the manager\'s — summarise, do not broadcast. Requires the HR module (or service role).',
  },
  {
    name: 'org_chart',
    description: 'The reporting structure from one seat: the chain of managers above an employee and everyone who reports to them below (recursive, default 3 levels), with open goals, the next 1:1 and the last review per person; without an employee, every active top-level manager and their tree. Use when: "who reports to Anna", "who is Bo\'s manager", "which of my reports has no 1:1 booked", "team overview". NOT for: changing the structure (manage_employee update manager_id); the staff directory itself (manage_employee list).',
    category: 'crm',
    handler: 'rpc:org_chart',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'org_chart',
        description: 'Managers above and reports below one employee, with what is open per person',
        parameters: {
          type: 'object',
          properties: {
            p_employee_id: { type: 'string', format: 'uuid', description: 'The seat to look from; omit for every top-level manager' },
            p_depth: { type: 'integer', description: 'How many levels down (default 3, max 10)' },
          },
        },
      },
    },
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

  skills: ['manage_employee', 'manage_skill', 'manage_employee_skill', 'manage_leave', 'onboarding_checklist', 'auto_allocate_vacation', 'manage_onboarding_template', 'manage_employment_contract_template', 'sign_employment_contract'],
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
