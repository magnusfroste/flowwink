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
    description: 'Full lifecycle management for employee expenses: create individual expenses (with optional receipt data, in any currency — converted to the base currency at the receipt date\'s rate), submit monthly reports, approve/reject reports, and book approved reports as journal entries. Use when: employee adds an expense, FlowPilot processes monthly expense reports, admin approves/rejects expenses. NOT for: receipt image analysis (use analyze_receipt), tying an expense to a purchase order (match_expense_to_po), journal entries not related to expenses (use manage_journal_entry).',
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
            user_id: { type: 'string', description: 'User/employee UUID the expense belongs to. Required on create unless the call carries an authenticated caller — there is no default user.' },
            expense_id: { type: 'string' },
            report_id: { type: 'string' },
            period: { type: 'string', description: 'YYYY-MM for monthly reports' },
            expense_date: { type: 'string' },
            description: { type: 'string' },
            amount_cents: { type: 'number' },
            vat_cents: { type: 'number' },
            currency: { type: 'string', description: 'ISO code of the receipt (EUR, USD…). A foreign receipt is converted to the base currency at exchange_rates on expense_date; base_amount_cents / base_vat_cents / fx_rate_source come back on the row. No rate → fx_rate_source "missing" and the report cannot be booked until one exists (set_exchange_rate) or exchange_rate is given here' },
            exchange_rate: { type: 'number', description: 'Manual rate (base-currency units per 1 unit of currency), e.g. 11.2 for EUR→SEK. Overrides the rate table for this receipt' },
            purchase_order_id: { type: 'string', format: 'uuid', description: 'The purchase order this expense pays for — prefer match_expense_to_po, which checks what remains on the order' },
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
    instructions: 'Monthly workflow: 1) Employees create expenses throughout the month. 2) At month-end FlowPilot calls submit_report to bundle them. 3) Admin approves via approve_report. 4) FlowPilot calls book_report to create the journal entry autonomously. Currency: amount_cents/vat_cents are in the receipt\'s currency; the ledger, the report total, the payout and the policy caps are in the base currency (base_amount_cents). A receipt whose currency has no rate on its date is kept with fx_rate_source = missing — set_exchange_rate (multi-currency) or pass exchange_rate, then booking proceeds. For representation: always require attendees with name and company. Account codes (BAS 2024): 5800 for travel, 5810 accommodation, 6110 office supplies, 6071 for deductible representation (6072 non-deductible), 6540 software; or let FlowPilot match from chart_of_accounts.',
  },
  {
    name: 'analyze_receipt',
    description: 'Analyze a receipt image using AI vision to extract structured data: amount, VAT, vendor, date, and suggest matching account code. Use when: employee uploads a receipt photo, FlowPilot processes expense attachments. NOT for: managing expenses (use manage_expenses), creating journal entries (use manage_journal_entry).',
    category: 'commerce',
    handler: 'ai-task:analyze_receipt',
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
    description: 'Submits a draft expense report for approval: locks all included expenses to submitted state and recomputes the report total from its lines. Only the report owner or an admin may submit. Use when: employee finishes their expense report and wants it sent to manager / "submit my expenses" / "skicka in utlägg". NOT for: creating individual expenses (use manage_expenses), compiling the monthly report (use generate_monthly_expense_report) or approving (use approve_expense_report).',
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
    description: 'Admin-only. Approves a submitted expense report, marks all included expenses as approved and refreshes the report total from its lines. Use when: manager approves a submitted report / "approve expense report" / "godkänn utlägg". NOT for: booking to ledger (use book_expense_report) or paying out (use mark_expense_report_paid).',
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
    requires_staging: true, // ledger perimeter: trust 'approve' and the staged envelope are ONE dial for accounting skills
    description:
      'Admin-only. Posts a balanced journal entry for an approved expense report (Dt expense + VAT / Cr owed-to-employee) and marks the report as booked; an open expense advance the employee holds is settled against the liability at the same time (own entry Dt owed-to-employee / Cr employee advance; advance_settled_cents and to_pay_cents come back). Use when: an approved expense report needs to hit the general ledger. NOT for: paying out — use mark_expense_report_paid afterwards.',
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
    requires_staging: true, // ledger perimeter: trust 'approve' and the staged envelope are ONE dial for accounting skills
    description:
      'Admin-only. Records a payout to the employee for a booked expense report: the report total minus any advance settled at booking (paid_cents). Posts Dt 2890 / Cr 1930 and creates an expense_payments row; a report fully covered by an advance is marked paid with no bank movement. Use when: confirming the bank transfer / Swish / SEPA payout has been made.',
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
  {
    name: 'manage_expense_policy',
    description: 'Configure expense spend policies per category (max amount, receipt requirement, approval threshold). Use when: setting company expense rules. NOT for: checking one expense (evaluate_expense_policy) or booking expenses (book_expense_report).',
    category: 'commerce',
    handler: 'rpc:manage_expense_policy',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_expense_policy',
        description: 'List/upsert/delete expense policies. category "*" is the catch-all; a category-specific policy overrides it. Upsert is keyed on category.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['list', 'upsert', 'delete'] },
            p_policy_id: { type: 'string', format: 'uuid' },
            p_category: { type: 'string', description: 'Expense category, or "*" for all' },
            p_max_amount_cents: { type: 'number', description: 'Hard cap (omit for none)' },
            p_requires_receipt: { type: 'boolean' },
            p_requires_approval_over_cents: { type: 'number', description: 'Above this, approval is required' },
          },
        },
      },
    },
    instructions: 'Define "*" first as the baseline, then per-category overrides. Pair with evaluate_expense_policy at expense-entry time.',
  },
  {
    name: 'evaluate_expense_policy',
    description: 'Check a prospective expense against the policies — returns allowed, requires_approval, and any violations (over_limit, missing_receipt, needs_approval). Use when: validating an expense before submit, deciding if approval is needed. NOT for: editing policies (manage_expense_policy).',
    category: 'commerce',
    handler: 'rpc:evaluate_expense_policy',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'evaluate_expense_policy',
        description: 'Evaluates category + amount (+ receipt) against the matching policy (specific over "*"). over_limit/missing_receipt block (allowed=false); over the approval threshold sets requires_approval.',
        parameters: {
          type: 'object',
          required: ['p_category', 'p_amount_cents'],
          properties: {
            p_category: { type: 'string' },
            p_amount_cents: { type: 'number' },
            p_has_receipt: { type: 'boolean' },
          },
        },
      },
    },
    instructions: 'allowed=false means a hard violation (over the cap or a required receipt is missing). requires_approval=true routes it to manage_approvals before booking. No matching policy → allowed.',
  },
  {
    name: 'extract_receipt',
    description: 'Extract structured expense fields (vendor, date, total, VAT, line items) from a receipt image or PDF via AI. Use when: an employee uploads a receipt to file an expense. NOT for: bank statement OCR (import_bank_image); invoice matching (match_invoice_to_receipt).',
    category: 'commerce',
    handler: 'internal:extract_receipt',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'extract_receipt',
        parameters: {
          type: 'object',
          required: ["file_base64", "mime_type"],
          properties: {
            file_base64: { type: 'string', description: 'Base64 receipt image/PDF' },
            mime_type: { type: 'string', description: 'e.g. image/jpeg or application/pdf' },
            filename: { type: 'string', description: 'Original filename (optional)' },
          },
        },
      },
    },
  },
  {
    name: 'manage_expense_advance',
    description:
      'Expense (travel) advances: money paid to an employee BEFORE the trip, settled against their expense reports AFTER it. grant pays it out (Dt employee advance 1610 / Cr bank) and opens the advance; booking the employee\'s next expense report settles it automatically against what the report owes them (oldest advance first) and mark_expense_report_paid pays only the rest; repay records money the employee pays back when the advance exceeded the receipts. list / get show what is open per employee. Use when: "give Anna a 5 000 kr travel advance", "how much advance is out", "Bo paid back the 220 kr", "what did the Oslo advance cover". NOT for: salary advances deducted on payroll (manage_salary_advance); the receipts themselves (manage_expenses); the payout of a report (mark_expense_report_paid).',
    category: 'commerce',
    handler: 'rpc:manage_expense_advance',
    scope: 'internal',
    trust_level: 'approve',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_expense_advance',
        description: 'grant (posts the payout, opens the advance) / repay (posts the repayment; default = what remains) / get (with the reports it was settled against) / list (per employee or status, with open_cents)',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['grant', 'repay', 'get', 'list'] },
            p_advance_id: { type: 'string', format: 'uuid' },
            p_user_id: { type: 'string', format: 'uuid', description: 'The employee who receives the money (profiles.id, the same id expenses.user_id carries). Required on grant — no default user' },
            p_amount_cents: { type: 'integer', description: 'grant: the advance in cents, base currency; repay: the amount paid back (default = what remains)' },
            p_purpose: { type: 'string', description: 'grant: what the money is for, e.g. "Conference trip Oslo"' },
            p_method: { type: 'string', description: 'grant: how it was paid out (bankgiro, swish, cash…)' },
            p_reference: { type: 'string', description: 'grant: bank reference' },
            p_paid_at: { type: 'string', description: 'YYYY-MM-DD the money moved (default today)' },
            p_notes: { type: 'string' },
            p_status: { type: 'string', enum: ['open', 'closed'], description: 'list filter' },
            p_limit: { type: 'integer' },
          },
        },
      },
    },
    instructions:
      'Amounts are cents in the base currency (the report total is too). An advance is settled when the employee\'s report is BOOKED, not when it is approved: book_expense_report applies open advances oldest-first against the liability, posts Dt 2890 / Cr 1610 and returns advance_settled_cents + to_pay_cents; mark_expense_report_paid then pays to_pay_cents (0 → marked paid, no bank entry). An advance larger than the receipts stays open with remaining_cents until the next report or a repay. repay refuses more than what remains. Needs the account role employee_advance (seeded for se-bas2024 as 1610); other locales add their own row in account_roles. Requires the expenses module (service role for the agent); employees read their own advances.',
  },
  {
    name: 'match_expense_to_po',
    description: 'Tie an employee expense to the purchase order it paid for — the employee took the company card for something that was ordered — so the order\'s remaining value shrinks and a vendor invoice for the same delivery is caught by the three-way match instead of being paid twice. Checks what remains on the order (ordered net minus vendor invoices and other matched expenses, in the base currency), refuses an order still in draft and a claim beyond what remains (outside the tolerance) unless forced; unlinks when no order is given. Use when: "this receipt is for PO-00012", "the consultant paid the order on her card", "unlink the expense from the PO". NOT for: matching a VENDOR INVOICE to an order (match_invoice_to_receipt); creating the expense itself (manage_expenses).',
    category: 'commerce',
    handler: 'rpc:match_expense_to_po',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'match_expense_to_po',
        description: 'Link (or unlink) an expense to a purchase order; returns match_status matched / variance / over_claimed with what remained on the order',
        parameters: {
          type: 'object',
          required: ['p_expense_id'],
          properties: {
            p_expense_id: { type: 'string', format: 'uuid' },
            p_purchase_order_id: { type: 'string', format: 'uuid', description: 'The order; omit to unlink' },
            p_tolerance_pct: { type: 'number', description: 'Over-claim tolerance in % of the order net (default 2)' },
            p_force: { type: 'boolean', description: 'Record a claim beyond what remains as over_claimed instead of refusing' },
          },
        },
      },
    },
    instructions: 'The expense must be draft or submitted and have a rate if foreign (fx_rate_source ≠ missing). The claim is the expense NET in the base currency (base_amount_cents − base_vat_cents) against purchase_orders.subtotal_cents minus po_invoiced_value_cents — the same reader the vendor-invoice match and the payment gate use, which now counts matched expenses too. A refusal names remaining / baseline / already claimed: unlink the other claim, correct the amount, or p_force. The status is recomputed when the expense amount changes.',
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
  processes: ['procure-to-pay', 'hire-to-retire', 'record-to-report'],
  maturity: 'L4',
  description: 'Employee expense reporting with receipt scanning, monthly report submission, approval workflow, and autonomous journal entry booking via FlowPilot',
  capabilities: ['data:write', 'data:read'],
  tier: 'standard',
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
    'manage_expense_policy',
    'evaluate_expense_policy',
  ],
  data: {
    tables: ['expense_advance_settlements', 'expense_advances', 'expense_attachments', 'expense_payments', 'expenses', 'expense_reports'],
    // expenses.purchase_order_id → purchasing is a soft link (ON DELETE SET NULL)
  },
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
