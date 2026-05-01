/**
 * Expenses Module — Unified Definition
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { defineModule } from '@/lib/module-def';
import type { SkillSeed, AutomationSeed } from '@/lib/module-bootstrap';

const expensesInputSchema = z.object({
  action: z.enum(['create', 'list', 'submit_report', 'approve_report', 'analyze_receipt']),
  user_id: z.string().optional(),
  expense_date: z.string().optional(),
  description: z.string().optional(),
  amount_cents: z.number().int().optional(),
  vat_cents: z.number().int().optional(),
  currency: z.string().optional(),
  category: z.enum(['travel', 'meals', 'office', 'software', 'representation', 'other']).optional(),
  vendor: z.string().optional(),
  account_code: z.string().optional(),
  is_representation: z.boolean().optional(),
  attendees: z.array(z.object({ name: z.string(), company: z.string() })).optional(),
  receipt_url: z.string().optional(),
  period: z.string().optional(),
  report_id: z.string().optional(),
});

const expensesOutputSchema = z.object({
  success: z.boolean(),
  expense_id: z.string().optional(),
  report_id: z.string().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
});

type ExpensesInput = z.infer<typeof expensesInputSchema>;
type ExpensesOutput = z.infer<typeof expensesOutputSchema>;

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

  // ── Procure-to-Pay lifecycle: generate → submit → approve → book → pay ──
  // Backed by SECURITY DEFINER RPCs. See mem://erp/expense-procure-to-pay-loop.
  {
    name: 'generate_monthly_expense_report',
    description:
      "Creates or refreshes a monthly expense report for the current user, aggregating all draft/submitted expenses in the period (YYYY-MM). Use when: user wants to compile this month's receipts into a submittable report. NOT for: approving or booking.",
    category: 'commerce',
    handler: 'rpc:generate_monthly_expense_report',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'generate_monthly_expense_report',
        description: 'Generate or refresh a monthly expense report',
        parameters: {
          type: 'object',
          properties: {
            period: { type: 'string', pattern: '^\\d{4}-\\d{2}$', description: 'YYYY-MM, defaults to current month' },
            user_id: { type: 'string', format: 'uuid', description: 'Admin only — defaults to caller' },
          },
        },
      },
    },
  },
  {
    name: 'submit_expense_report',
    description: 'Submits a draft expense report for approval. Locks all included expenses to submitted state.',
    category: 'commerce',
    handler: 'rpc:submit_expense_report',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'submit_expense_report',
        description: 'Submit an expense report for approval',
        parameters: {
          type: 'object',
          required: ['p_report_id'],
          properties: { p_report_id: { type: 'string', format: 'uuid' } },
        },
      },
    },
  },
  {
    name: 'approve_expense_report',
    description: 'Admin-only. Approves a submitted expense report and marks all included expenses as approved.',
    category: 'commerce',
    handler: 'rpc:approve_expense_report',
    scope: 'internal',
    trust_level: 'approve',
    tool_definition: {
      type: 'function',
      function: {
        name: 'approve_expense_report',
        description: 'Approve a submitted expense report (admin only)',
        parameters: {
          type: 'object',
          required: ['p_report_id'],
          properties: { p_report_id: { type: 'string', format: 'uuid' } },
        },
      },
    },
  },
  {
    name: 'book_expense_report',
    description:
      'Admin-only. Posts a balanced journal entry for an approved expense report (Dt expense + VAT / Cr owed-to-employee) and marks the report as booked. Use when: an approved expense report needs to hit the general ledger. NOT for: paying out — use mark_expense_report_paid afterwards.',
    category: 'commerce',
    handler: 'rpc:book_expense_report',
    scope: 'internal',
    trust_level: 'approve',
    tool_definition: {
      type: 'function',
      function: {
        name: 'book_expense_report',
        description: 'Post a journal entry for an approved expense report',
        parameters: {
          type: 'object',
          required: ['p_report_id'],
          properties: {
            p_report_id: { type: 'string', format: 'uuid' },
            p_expense_account: { type: 'string', description: 'Default 5410', default: '5410' },
            p_vat_account: { type: 'string', default: '2641' },
            p_liability_account: { type: 'string', description: 'Owed-to-employee account, default 2890', default: '2890' },
            p_entry_date: { type: 'string', format: 'date' },
          },
        },
      },
    },
  },
  {
    name: 'mark_expense_report_paid',
    description:
      'Admin-only. Records a payout to the employee for a booked expense report. Posts Dt 2890 / Cr 1930 and creates an expense_payments row. Use when: confirming the bank transfer / Swish / SEPA payout has been made.',
    category: 'commerce',
    handler: 'rpc:mark_expense_report_paid',
    scope: 'internal',
    trust_level: 'approve',
    tool_definition: {
      type: 'function',
      function: {
        name: 'mark_expense_report_paid',
        description: 'Record an expense payout',
        parameters: {
          type: 'object',
          required: ['p_report_id'],
          properties: {
            p_report_id: { type: 'string', format: 'uuid' },
            p_method: { type: 'string', enum: ['manual', 'sepa', 'swish', 'bankgiro', 'stripe', 'other'], default: 'manual' },
            p_reference: { type: 'string', description: 'Bank reference / payout ID' },
            p_paid_at: { type: 'string', format: 'date' },
            p_bank_account: { type: 'string', default: '1930' },
            p_liability_account: { type: 'string', default: '2890' },
            p_notes: { type: 'string' },
          },
        },
      },
    },
  },
  {
    name: 'list_expense_reports',
    description:
      'List expense reports filtered by status (draft / submitted / approved / booked / paid) and optionally by employee. Use when: admin reviews pending approvals, FlowPilot scans for reports to advance through the lifecycle, building the expense dashboard. NOT for: individual expense rows (use manage_expenses).',
    category: 'commerce',
    handler: 'db:expense_reports',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_expense_reports',
        description: 'List expense reports by status/employee.',
        parameters: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['draft', 'submitted', 'approved', 'booked', 'paid'] },
            user_id: { type: 'string', description: 'Filter to one employee.' },
            period: { type: 'string', description: 'YYYY-MM.' },
            limit: { type: 'integer', description: 'Default 50.' },
          },
        },
      },
    },
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

export const expensesModule = defineModule<ExpensesInput, ExpensesOutput>({
  id: 'expenses',
  name: 'Expense Reporting',
  version: '1.0.0',
  description: 'Employee expense reporting with receipt scanning, monthly report submission, approval workflow, and autonomous journal entry booking via FlowPilot',
  capabilities: ['data:write', 'data:read'],
  inputSchema: expensesInputSchema,
  outputSchema: expensesOutputSchema,

  // Full record-to-report coverage. All skills below have full SkillSeed
  // definitions in EXPENSE_SKILLS so module reset re-installs them cleanly.
  // See mem://erp/expense-procure-to-pay-loop.
  skills: [
    'manage_expenses',
    'analyze_receipt',
    'generate_monthly_expense_report',
    'submit_expense_report',
    'approve_expense_report',
    'book_expense_report',
    'mark_expense_report_paid',
    'list_expense_reports',
  ],
  skillSeeds: EXPENSE_SKILLS,
  automations: EXPENSE_AUTOMATIONS,

  async publish(input: ExpensesInput): Promise<ExpensesOutput> {
    const validated = expensesInputSchema.parse(input);

    if (validated.action === 'create') {
      if (validated.is_representation && (!validated.attendees || validated.attendees.length === 0)) {
        return { success: false, error: 'Representation expenses require attendees (name + company)' };
      }
      const { data, error } = await supabase
        .from('expenses')
        .insert({
          user_id: validated.user_id || null,
          expense_date: validated.expense_date || new Date().toISOString().slice(0, 10),
          description: validated.description || '',
          amount_cents: validated.amount_cents || 0,
          vat_cents: validated.vat_cents || 0,
          currency: validated.currency || 'SEK',
          category: validated.category || 'other',
          vendor: validated.vendor || null,
          account_code: validated.account_code || null,
          is_representation: validated.is_representation || false,
          attendees: validated.attendees || null,
          receipt_url: validated.receipt_url || null,
          status: 'draft',
        })
        .select('id')
        .single();
      if (error) return { success: false, error: error.message };
      return { success: true, expense_id: data.id, message: 'Expense created' };
    }

    if (validated.action === 'list') {
      const { data, error } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false }).limit(100);
      if (error) return { success: false, error: error.message };
      return { success: true, message: `Found ${data.length} expenses` };
    }

    return { success: false, error: `Unknown action: ${validated.action}` };
  },
});
