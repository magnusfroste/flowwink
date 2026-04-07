/**
 * Expenses Module Bootstrap
 * 
 * Seeds:
 * - Skills: manage_expenses, analyze_receipt
 * - Automation: Monthly Expense Processing (1st of each month)
 * 
 * Depends on: accounting (for book_report → journal entries)
 */

import { registerBootstrap, type SkillSeed, type AutomationSeed } from '@/lib/module-bootstrap';

const EXPENSE_SKILLS: SkillSeed[] = [
  {
    name: 'manage_expenses',
    description: 'Full lifecycle management for employee expenses: create individual expenses (with optional receipt data), submit monthly reports, approve/reject reports, and book approved reports as journal entries. Use when: employee adds an expense, FlowPilot processes monthly expense reports, admin approves/rejects expenses. NOT for: receipt image analysis (use analyze_receipt), journal entries not related to expenses (use manage_journal_entry).',
    category: 'commerce',
    handler: 'db:expenses',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_expenses',
        description: 'CRUD for expenses and monthly expense reports with full approval workflow',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'list', 'update', 'delete', 'submit_report', 'approve_report', 'book_report', 'list_reports'] },
            user_id: { type: 'string', description: 'User/employee UUID' },
            expense_id: { type: 'string' },
            report_id: { type: 'string' },
            period: { type: 'string', description: 'YYYY-MM for monthly reports' },
            expense_date: { type: 'string' },
            description: { type: 'string' },
            amount_cents: { type: 'number' },
            vat_cents: { type: 'number' },
            currency: { type: 'string' },
            category: { type: 'string', enum: ['travel', 'meals', 'office', 'software', 'representation', 'other'] },
            vendor: { type: 'string' },
            account_code: { type: 'string' },
            is_representation: { type: 'boolean' },
            attendees: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, company: { type: 'string' } } } },
            receipt_url: { type: 'string' },
            receipt_data: { type: 'object', description: 'AI-extracted receipt data' },
            status: { type: 'string' },
            approved_by: { type: 'string' },
          },
          required: ['action'],
        },
      },
    },
    instructions: 'Monthly workflow: 1) Employees create expenses throughout the month. 2) At month-end FlowPilot calls submit_report to bundle them. 3) Admin approves via approve_report. 4) FlowPilot calls book_report to create the journal entry autonomously. For representation: always require attendees with name and company. Account codes: use 6071 for travel, 6110 for office, 7690 for representation, or let FlowPilot match from chart_of_accounts.',
  },
  {
    name: 'analyze_receipt',
    description: 'Analyze a receipt image using AI vision to extract structured data: amount, VAT, vendor, date, and suggest matching account code. Use when: employee uploads a receipt photo, FlowPilot processes expense attachments. NOT for: managing expenses (use manage_expenses), creating journal entries (use manage_journal_entry).',
    category: 'commerce',
    handler: 'edge:analyze-receipt',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'analyze_receipt',
        description: 'Extract structured data from a receipt image using AI vision',
        parameters: {
          type: 'object',
          properties: {
            image_url: { type: 'string', description: 'Public URL to the receipt image' },
            locale: { type: 'string', description: 'Expected locale for currency/VAT rules (default: se)' },
          },
          required: ['image_url'],
        },
      },
    },
    instructions: 'Send the receipt image to AI vision. Extract: total amount (in cents), VAT amount (in cents), vendor name, date, line items if visible. Suggest a matching account_code from chart_of_accounts based on the vendor/category. Swedish receipts typically show "Moms" for VAT. Return structured JSON that can be passed directly to manage_expenses create action.',
  },
];

const EXPENSE_AUTOMATIONS: AutomationSeed[] = [
  {
    name: 'Monthly Expense Processing',
    description: 'On the 1st of each month, FlowPilot reviews all draft expenses from the previous month, submits reports per employee, and prompts admin for approval.',
    trigger_type: 'cron',
    trigger_config: { cron: '0 9 1 * *', expression: '0 9 1 * *' },
    skill_name: 'manage_expenses',
    skill_arguments: { action: 'list', status: 'draft' },
  },
];

registerBootstrap('expenses', {
  skills: EXPENSE_SKILLS,
  automations: EXPENSE_AUTOMATIONS,
});
