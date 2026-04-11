/**
 * HR Module Bootstrap
 * 
 * Seeds:
 * - Skills: manage_employee, manage_leave, onboarding_checklist
 * - Automation: HR Leave Review Reminder (daily)
 */

import { registerBootstrap, type SkillSeed, type AutomationSeed } from '@/lib/module-bootstrap';

const HR_SKILLS: SkillSeed[] = [
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
        },
      },
    },
    instructions: 'Employee directory management. Status flow: active → on_leave → active, or active → terminated. When creating, default employment_type to full_time. For search, match against name, email, department. Swedish: "anställd", "medarbetare", "personal".',
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
        },
      },
    },
    instructions: 'Leave request lifecycle: pending → approved/rejected. Calculate days automatically from start/end dates when possible. Swedish: "ledighet", "semester", "sjukfrånvaro", "föräldraledighet".',
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
            items: { type: 'array', description: 'Array of {title, done} items' },
          },
          required: ['action'],
        },
      },
    },
    instructions: 'Default onboarding items: IT setup, access cards, welcome meeting, policy review, buddy assignment. Mark completed_at when all items are done. Swedish: "introduktion", "onboarding", "checklista".',
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

registerBootstrap('hr', {
  skills: HR_SKILLS,
  automations: HR_AUTOMATIONS,
});
