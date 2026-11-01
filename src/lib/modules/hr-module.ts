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
    name: 'hr_process_guide',
    description: 'The HR process guides a founder without an HR person is led through — "welcome a new employee" (p_process onboarding) and "when someone leaves" (p_process offboarding: who ends it and the last day, grounds when the employer ends it, the notice in writing, a notice period LAS 11 § allows, vacation left (semesterlagen 28 §), handover, access removed, the final salary, the employer\'s certificate, the priority right after a redundancy (LAS 25 §), closing the record). Onboarding: for one employee every step from record to the end of probation (contract, pay details, employer registration, login, vacation, introduction plan, manager, emergency contact, probation decision, first salary, pension) with why in plain words, the rule behind it for the business country (in Sweden LAS 6 c § written terms within 7 days, LAS 6 §/31 § probation, semesterlagen, AGI, arbetsmiljölagen), (the rule lines come from the employment rules in force — manage_hr_rules; none when nothing is saved for the country), a state judged from the records (done | todo | overdue | info), the due date the rule sets and the exact skill call that does it. Without an employee: who is being onboarded and how far each has come, plus the outline. Use when: "we are hiring our first person — what do we have to do", "is Anna\'s onboarding done", "what is left for the new hire", "Erik has resigned — what now", "we have to let someone go", starting or checking any onboarding or offboarding, before a probation period ends. NOT for: recording the decision itself (end_employment); recruiting before the hire (summarize_candidate_pipeline, hire_application); one checklist\'s items only (onboarding_checklist); the books (check_books).',
    category: 'crm',
    handler: 'rpc:hr_process_guide',
    scope: 'internal',
    trust_level: 'auto',
    instructions: 'Read first, then act: hr_process_guide({p_process:"onboarding"}) lists the people; hr_process_guide({p_process:"onboarding", p_employee_id}) gives the steps. Work the steps whose state is overdue or todo, required ones first, in order — each fix.skill + fix.args is the exact call; `<placeholder>` values are facts only a person has (personal identity number, the role a login needs, a manager, an emergency contact, a time): ask for them, never invent them. Explain a step to the person with its `why` and `law` in your own words — the founder is not an HR person. Signing a contract, the probation decision and paying a salary are the person\'s: prepare them (draft contract, book the follow-up talk, create the payroll run) and say what they need to do. A step in state info is a reminder, not a task. An offboarding starts with end_employment (a person decides); the written notice and the certificate are ticked on the offboarding checklist with the step\'s own fix (onboarding_checklist update), only when the person says it happened. Removing a login\'s roles is a person\'s step under Users — never claim it is done. Run the guide again after acting.',
    tool_definition: {"type":"function","risk":"low","function":{"name":"hr_process_guide","parameters":{"type":"object","properties":{"p_process":{"type":"string","enum":["onboarding","offboarding"],"description":"onboarding = welcome a new employee (default); offboarding = someone leaves"},"p_employee_id":{"type":"string","format":"uuid","description":"employees.id — the steps for this person. Omit for the list of people being onboarded and the outline"}}},"description":"HR process guide: the steps of welcoming a new employee, why, the rule behind each, what is done and the exact call for what is not."}} as SkillSeed['tool_definition'],
  },
  {
    name: 'manage_hr_rules',
    description: 'The employment rules the HR guides and end_employment read, per country: notice by length of employment (employer and employee, tiers of {from_years, months|days}), the longest probation and the notice to end it, vacation days a year, and the rule line each guide step shows. FlowWink ships templates (SE, NO, DK, FI, DE); the company can save its own terms for its country — from the template, adjusted, or from nothing where no template exists — and they win. get (default: the business country) answers what is in force and the template; list shows the templates and the saved terms; save merges what you send onto what is in force; reset removes the own terms. Use when: "we are in Norway — use the Norwegian rules", "our collective agreement gives three months\' notice", "there are no rules for our country", setting up HR on a new instance. NOT for: one employee\'s contract terms (manage_employment_contract); vacation days of one person (manage_leave_allocation).',
    category: 'crm',
    handler: 'rpc:manage_hr_rules',
    scope: 'internal',
    instructions: 'Read first: manage_hr_rules({}) — rules.origin is own | template, or rules is null when nothing applies (then end_employment checks only the contract and the guides show no rule lines). To adjust: {p_action:"save", p_rules:{employer_notice:[{from_years:0, months:1}, {from_years:2, months:2}], vacation_days:25, laws:{"offboarding.decision":"…"}}} — only the keys you send change; laws keys are "<process>.<step id>". Only save terms a person gave you or confirmed; never invent a country\'s law. reset returns to the template.',
    tool_definition: {"type":"function","risk":"medium","reversible":true,"reversal":"manage_hr_rules reset (back to the template)","function":{"name":"manage_hr_rules","parameters":{"type":"object","properties":{"p_action":{"type":"string","enum":["get","list","save","reset"],"description":"Default get"},"p_country":{"type":"string","description":"ISO country code; defaults to the business country"},"p_rules":{"type":"object","description":"save: {label, employer_notice, employee_notice, probation_max_months, probation_end_notice_days, vacation_days, laws:{\"<process>.<step>\": text}, notes} — only the keys sent change"}}},"description":"Employment rules per country: templates and the company's own terms."}} as SkillSeed['tool_definition'],
  },
  {
    name: 'end_employment',
    description: 'Record that an employment is ending — who ends it (employee resigned, employer for personal reasons, employer for redundancy, ending a probation, a fixed term ending, by agreement), the day notice was given and the last day — and check the notice against the employment rules in force for the business country (manage_hr_rules: the company\'s own terms, else the FlowWink template — in Sweden LAS 11 §: employee one month, employer 1–6 months by length of employment, LAS 31 § two weeks to end a probation); a longer period in the contract wins. Without rules for the country only the contract is checked, and the answer says so. A last day earlier than the rules allow is refused unless a shorter notice was agreed in writing (p_force). Sets the employee\'s end date, the contract\'s end date and reason, and creates the offboarding checklist the guide reads. Use when: "Erik has resigned, last day in a month", "we are letting Sara go for redundancy", "end the probation", "what notice do we have to give" (p_dry_run). NOT for: the steps after the decision (hr_process_guide offboarding); closing the record after the last day (manage_employee status terminated); a warning (manage_disciplinary).',
    category: 'crm',
    handler: 'rpc:end_employment',
    scope: 'internal',
    trust_level: 'approve',
    instructions: 'A person decides who leaves — this waits for their approval. Ask who ended it and why; never guess p_initiator. Run with p_dry_run:true first: the answer carries termination.minimum_last_day and the rule, so you can tell the person the earliest lawful last day before anything is written. Omit p_last_day to use that earliest day. p_force only when the person confirms a shorter notice was agreed in writing. Then follow `next` (hr_process_guide offboarding).',
    tool_definition: {"type":"function","risk":"high","reversible":false,"function":{"name":"end_employment","parameters":{"type":"object","required":["p_employee_id","p_initiator"],"properties":{"p_employee_id":{"type":"string","format":"uuid","description":"employees.id"},"p_initiator":{"type":"string","enum":["employee","employer_personal","employer_redundancy","probation","fixed_term_end","mutual"],"description":"Who ends it: employee = they resigned; employer_personal / employer_redundancy = you end it (saklig grund, LAS 7 §); probation = ending a probation; fixed_term_end; mutual = by agreement"},"p_last_day":{"type":"string","format":"date","description":"The last day of employment. Omit for the earliest the notice allows"},"p_notice_date":{"type":"string","format":"date","description":"The day notice was given (default today)"},"p_reason":{"type":"string","description":"Why, in a sentence — kept on the contract"},"p_dry_run":{"type":"boolean","description":"true = compute the notice and the earliest last day, write nothing"},"p_force":{"type":"boolean","description":"Accept a last day shorter than the law's notice — only when a shorter notice was agreed in writing"}}},"description":"Record who ends an employment and the last day; checks the notice against LAS 11 §."}} as SkillSeed['tool_definition'],
  },
  {
    name: 'manage_employment_contract',
    description: 'One employee\'s employment contract: create (draft), list, get and update — title, employment type, start and end date, monthly salary or hourly rate, weekly hours, probation end, notice period, the text, and status draft → sent → signed → active → terminated. Use when: someone was added directly (not hired from Recruitment) and needs a contract; correcting a draft\'s salary, probation or text; sending a draft; marking a signed contract active; ending a contract. NOT for: signing (sign_employment_contract — both sides, it flips the status to signed); the standard wording (manage_employment_contract_template); hiring a candidate (hire_application drafts the contract itself); customer or supplier contracts (manage_contract).',
    category: 'crm',
    handler: 'db:employment_contracts',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      risk: 'medium',
      reversible: true,
      reversal: 'manage_employment_contract update (status terminated, or correct the fields while draft)',
      function: {
        name: 'manage_employment_contract',
        description: 'list / get / create / update employment_contracts. Amounts in cents. Status: draft → sent → (sign_employment_contract) signed → active → terminated.',
        parameters: {
          type: 'object',
          required: ['action'],
          'x-action-required': { create: ['employee_id', 'title', 'start_date'], get: ['id'], update: ['id'] },
          properties: {
            action: { type: 'string', enum: ['list', 'get', 'create', 'update'] },
            id: { type: 'string', format: 'uuid', description: 'employment_contracts.id (get/update)' },
            employee_id: { type: 'string', format: 'uuid', description: 'employees.id (create; list filter)' },
            template_id: { type: 'string', format: 'uuid', description: 'employment_contract_templates.id the text came from (optional)' },
            title: { type: 'string', description: 'Job title on the contract' },
            employment_type: { type: 'string', description: 'permanent (default — LAS 4 §), probation, fixed_term, …' },
            start_date: { type: 'string', format: 'date' },
            end_date: { type: 'string', format: 'date', description: 'Only for a fixed-term contract' },
            probation_end_date: { type: 'string', format: 'date', description: 'At most six months after the start in Sweden (LAS 6 §)' },
            notice_period_days: { type: 'integer', description: 'Default 30' },
            monthly_salary_cents: { type: 'integer', description: 'Monthly salary in cents' },
            hourly_rate_cents: { type: 'integer', description: 'Hourly rate in cents, for hourly employment' },
            weekly_hours: { type: 'number', description: 'e.g. 40' },
            currency: { type: 'string', description: 'Defaults to the business currency' },
            body_markdown: { type: 'string', description: 'The contract text' },
            status: { type: 'string', enum: ['draft', 'sent', 'signed', 'active', 'terminated'] },
            sent_at: { type: 'string', format: 'date-time', description: 'Set with status sent' },
            terminated_at: { type: 'string', format: 'date-time' },
            termination_reason: { type: 'string' },
          },
        },
      },
    } as SkillSeed['tool_definition'],
    instructions: 'Create as a draft: {action:"create", employee_id, title, employment_type:"permanent", start_date, monthly_salary_cents, probation_end_date, notice_period_days:30}. Take the text from the default template (manage_employment_contract_template list) and fill its merge fields yourself into body_markdown. A person reads the draft; then {action:"update", id, status:"sent", sent_at:<now>}. Signatures are recorded with sign_employment_contract, never by setting status signed here. hr_process_guide names the contract step and its 7-day deadline (LAS 6 c §).',
  },
  {
    name: 'manage_leave_allocation',
    description: 'One employee\'s leave allocation for a year — how many vacation (or other leave) days they have: list, get, create, update. Use when: a new hire needs this year\'s vacation days; correcting one person\'s days or carry-over. NOT for: every employee at year-end (auto_allocate_vacation); a leave request (manage_leave); what is left (the HR Balances tab reads allocations minus approved leave).',
    category: 'crm',
    handler: 'db:leave_allocations',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      risk: 'low',
      reversible: true,
      reversal: 'manage_leave_allocation update',
      function: {
        name: 'manage_leave_allocation',
        description: 'list / get / create / update leave_allocations — one row per employee, leave_type and year.',
        parameters: {
          type: 'object',
          required: ['action'],
          'x-action-required': { create: ['employee_id', 'leave_type', 'year', 'allocated_days'], get: ['id'], update: ['id'] },
          properties: {
            action: { type: 'string', enum: ['list', 'get', 'create', 'update'] },
            id: { type: 'string', format: 'uuid', description: 'leave_allocations.id (get/update)' },
            employee_id: { type: 'string', format: 'uuid' },
            leave_type: { type: 'string', enum: ['vacation', 'sick', 'parental', 'other'], description: 'vacation for vacation days' },
            year: { type: 'integer', description: 'e.g. 2026' },
            allocated_days: { type: 'number', description: '25 is the Swedish statutory minimum (semesterlagen 4 §)' },
            carried_over_days: { type: 'number', description: 'Saved days brought from earlier years' },
            notes: { type: 'string' },
          },
        },
      },
    } as SkillSeed['tool_definition'],
    instructions: 'One row per employee + leave_type + year — list first ({action:"list", employee_id}) and update the existing row instead of creating a second. hr_process_guide\'s vacation step carries the exact create call with the days the vacation policy gives.',
  },
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
            emergency_contact: { type: 'object', description: 'Whom to call if something happens: {name, phone, relation}', properties: { name: { type: 'string' }, phone: { type: 'string' }, relation: { type: 'string' } } },
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
            action: { type: 'string', enum: ['create', 'list', 'get', 'update'], description: 'update replaces items: send the whole array with the changed done flags (the guides hand out the exact array)' },
            id: { type: 'string', format: 'uuid', description: 'onboarding_checklists.id (get/update)' },
            title: { type: 'string', description: 'create: e.g. Introduction, Offboarding' },
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
    instructions: 'One employee can have an introduction checklist and an offboarding one (title Offboarding — end_employment creates it; its items carry a key the offboarding guide reads). list with employee_id to find them; update with id and the full items array to tick items — hr_process_guide hands out the exact call. Set completed_at when every item is done. Default introduction items: workplace and equipment, welcome talk, the work environment and its risks, accounts, meeting the team, a follow-up talk. Swedish: "introduktion", "onboarding", "checklista", "avslut".',
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
            p_currency: { type: 'string', description: 'Defaults to the business currency (get_business_home)' },
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
  {
    name: 'manage_compensation_revision',
    description:
      'The salary revision round: open a budgeted round for the active staff (or one department / a list of employees), proposals pre-filled from each person\'s latest review recommendation (salary_adjustment_pct) or the round\'s default %, adjust per employee, read the total against the budget, approve, and apply on the effective date — which writes the new salary, the salary history row AND the contract in force in one pass. Also the per-employee salary history. Use when: "run the 2027 salary review", "what does a 3 % raise for Engineering cost", "give Anna 5 % from July", "what has Bo earned over time", "apply the approved round". NOT for: pay bands themselves (manage_salary_grade), a one-off salary edit outside a round (manage_employee monthly_salary_cents — it is still logged in the history), payroll runs (create_payroll_run).',
    category: 'crm',
    handler: 'rpc:manage_compensation_revision',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_compensation_revision',
        description:
          'create (lines for every active employee in scope) → propose / exclude / include per line → summary (totals vs budget, by department, out-of-band after) → approve (refuses over budget unless p_force) → apply (refuses before the effective date unless p_force; writes employees.monthly_salary_cents, employee_salary_history and the active/signed employment contract). apply_due applies every approved round whose date has come; list; cancel; history per employee.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['create', 'update', 'propose', 'exclude', 'include', 'summary', 'list', 'approve', 'apply', 'apply_due', 'cancel', 'history'] },
            p_revision_id: { type: 'string', format: 'uuid' },
            p_line_id: { type: 'string', format: 'uuid', description: 'One line of a round (propose / exclude / include); or pass p_revision_id + p_employee_id' },
            p_employee_id: { type: 'string', format: 'uuid', description: 'The employee (propose with p_revision_id; history)' },
            p_employee_ids: { type: 'array', items: { type: 'string', format: 'uuid' }, description: 'create: limit the round to these employees' },
            p_name: { type: 'string', description: 'create: the round\'s name, e.g. "Lönerevision 2027"' },
            p_effective_date: { type: 'string', description: 'create: YYYY-MM-DD the new salaries take effect; apply refuses before it' },
            p_budget_pct: { type: 'number', description: 'create: budget as % of the current monthly payroll in scope' },
            p_budget_cents: { type: 'integer', description: 'create: budget as an absolute monthly increase in cents (the lower of the two applies)' },
            p_default_pct: { type: 'number', description: 'create: proposal % for employees without a review recommendation (default 0)' },
            p_department: { type: 'string', description: 'create: limit the round to one department' },
            p_pct: { type: 'number', description: 'propose: the raise in % of the current salary (negative = cut, needs p_rationale)' },
            p_new_cents: { type: 'integer', description: 'propose: the new monthly salary in cents (instead of p_pct)' },
            p_rationale: { type: 'string', description: 'propose / exclude: why — copied to the salary history on apply' },
            p_notes: { type: 'string' },
            p_force: { type: 'boolean', description: 'approve: accept over budget; apply: apply before the effective date' },
            p_status: { type: 'string', enum: ['draft', 'approved', 'applied', 'cancelled'], description: 'list filter' },
            p_limit: { type: 'integer' },
          },
        },
      },
    },
    instructions:
      'Amounts are MONTHLY salary in cents (like employees.monthly_salary_cents). Flow: create → (propose per line) → summary → approve → apply, in that order; a round can only be edited while draft, approved while draft, applied while approved. create pre-fills each line from the employee\'s latest completed/acknowledged review with a salary_adjustment_pct in the 18 months before the effective date (not already used by an applied round), else p_default_pct; employees with no salary on record are added as excluded. summary.totals: delta_cents and delta_pct vs budget_limit_cents, within_budget, over_by_cents, out_of_band_after (proposed outside the salary grade band). approve fails over budget — lower proposals or exclude lines, or p_force (noted on the round). apply before the effective date fails without p_force; an automation runs apply_due daily so an approved round applies itself on its date. apply updates the active/signed employment contract too (monthly_salary_cents + metadata.salary_revision_id). history lists every salary change for one employee (hire / manual / revision) with dates, % and reason. Requires the HR module (or service role).',
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
  {
    name: 'HR Salary Revision Apply',
    description: 'Every morning at 06:00, an approved salary revision whose effective date has come is applied: new salaries, salary history, contracts.',
    trigger_type: 'cron',
    trigger_config: { cron: '0 6 * * *', expression: '0 6 * * *' },
    skill_name: 'manage_compensation_revision',
    skill_arguments: { p_action: 'apply_due' },
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

  skills: ['hr_process_guide', 'end_employment', 'manage_hr_rules', 'manage_employee', 'manage_employment_contract', 'manage_leave_allocation', 'manage_skill', 'manage_employee_skill', 'manage_leave', 'onboarding_checklist', 'auto_allocate_vacation', 'manage_onboarding_template', 'manage_employment_contract_template', 'sign_employment_contract'],
  data: {
    // children first (FK-safe order)
    tables: [
      'compensation_revision_lines',
      'employee_salary_history',
      'compensation_revisions',
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
