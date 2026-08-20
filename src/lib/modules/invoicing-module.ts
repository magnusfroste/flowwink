/**
 * Invoicing Module — Unified Definition
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { defineModule } from '@/lib/module-def';
import type { SkillSeed, AutomationSeed } from '@/lib/module-bootstrap';
import { getActivePack } from '@/lib/locale-packs';

const invoicingInputSchema = z.object({
  action: z.enum(['create', 'update', 'list']),
  customer_email: z.string().email().optional(),
  customer_name: z.string().optional(),
  deal_id: z.string().uuid().optional(),
  line_items: z.array(z.object({
    description: z.string(),
    qty: z.number().int().positive(),
    unit_price_cents: z.number().int(),
  })).optional(),
  invoice_id: z.string().uuid().optional(),
  status: z.enum(['draft', 'sent', 'paid', 'cancelled']).optional(),
});

const invoicingOutputSchema = z.object({
  success: z.boolean(),
  invoice_id: z.string().optional(),
  message: z.string().optional(),
});

type InvoicingInput = z.infer<typeof invoicingInputSchema>;
type InvoicingOutput = z.infer<typeof invoicingOutputSchema>;

const INVOICING_SKILLS: SkillSeed[] = [
  {
    name: 'auto_mark_invoice_paid',
    description: 'Reference/informational: when a bank tx is reconciled to an invoice covering its full total, the invoice flips to paid automatically via trigger. Use when: an admin asks how invoices auto-mark as paid. Read-only. NOT for: manually marking an invoice paid — use manage_invoice action=mark_paid instead.',
    category: 'commerce',
    handler: 'rpc:auto_mark_invoice_paid',
    scope: 'external',
    trust_level: 'notify',
    tool_definition: {"type":"function","function":{"name":"auto_mark_invoice_paid","parameters":{"type":"object","properties":{}},"description":"Reference: when a bank tx is reconciled to an invoice covering full total, the invoice flips to paid automatically via trigger. Read-only / informational."}} as SkillSeed['tool_definition'],
  },
  {
    name: 'manage_invoice',
    description: 'Create, update, list, or send invoices. Use when: user wants to create an invoice, change status (draft→sent→paid), update line items, or look up invoice details. NOT for: quotes (use manage_quote), accounting entries (use manage_journal_entry), timesheets (use log_time).',
    category: 'commerce',
    handler: 'db:invoices',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_invoice',
        description: 'CRUD for invoices with status lifecycle management',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'list', 'get', 'update', 'send', 'mark_paid', 'cancel'] },
            invoice_id: { type: 'string' },
            lead_id: { type: 'string' },
            deal_id: { type: 'string' },
            project_id: { type: 'string' },
            line_items: { type: 'array', items: { type: 'object', properties: { description: { type: 'string' }, qty: { type: 'number' }, unit_price_cents: { type: 'number' } } } },
            tax_rate: { type: 'number', description: 'Decimal e.g. 0.25 for 25%' },
            currency: { type: 'string', description: `ISO currency code, default ${getActivePack().currency.code}` },
            due_date: { type: 'string', description: 'YYYY-MM-DD' },
            payment_terms: { type: 'string' },
            notes: { type: 'string' },
            status_filter: { type: 'string', enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'] },
          },
          required: ['action'],
        },
      },
    },
    instructions: `Invoice lifecycle: draft → sent → paid (or cancelled).
CREATE: line_items MUST use the field names \`qty\` and \`unit_price_cents\` — NOT quantity/unit_price. unit_price_cents is integer cents (15000 = 150.00 kr). subtotal_cents/tax_cents/total_cents are computed automatically from line_items × tax_rate — do NOT pass them yourself. tax_rate is a decimal (0.25 = 25%). The INV-YYYY-NNNNN number is auto-generated. Returns invoice_id + total_cents.
UPDATE: pass invoice_id + only the fields to change; totals recompute automatically when line_items or tax_rate change.
To RECORD A PAYMENT use record_invoice_payment (not update/mark_paid — mark_paid only flips status, it does not register a paid amount). To credit/refund use create_credit_note.
Locale-specific: ${getActivePack().ai_instructions.invoicing}`,
  },
  {
    name: 'invoice_from_timesheets',
    description: 'Generate invoice draft from billable time entries. Use when: user wants to invoice a client for logged hours, "fakturera timmar", "invoice project X for last month". NOT for: manual invoices (use manage_invoice), logging time (use log_time).',
    category: 'commerce',
    handler: 'internal:invoice_from_timesheets',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'invoice_from_timesheets',
        description: 'Create invoice draft from billable time entries for a project/period',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string' },
            project_name: { type: 'string' },
            period: { type: 'string', enum: ['this_month', 'last_month', 'custom'] },
            start_date: { type: 'string' },
            end_date: { type: 'string' },
            group_by: { type: 'string', enum: ['entry', 'user', 'week'] },
            tax_rate: { type: 'number' },
            due_days: { type: 'number' },
          },
          required: ['project_id'],
        },
      },
    },
    instructions: 'Aggregate billable hours from time_entries for the given project and period. Each entry becomes a line item with hours × project hourly rate. Group options: "entry" (one line per entry), "user" (sum per user), "week" (sum per week). Auto-set due_date to issue_date + due_days.',
  },
  {
    name: 'bulk_invoice_from_timesheets',
    description: 'Bulk-generate invoice draft from billable, uninvoiced time entries for a project + period. Use when: month-end billing run, "create monthly invoice from hours". NOT for: single manual invoices (use manage_invoice).',
    category: 'commerce',
    handler: 'rpc:bulk_invoice_from_timesheets',
    scope: 'external',
    tool_definition: {
      type: 'function',
      function: {
        name: 'bulk_invoice_from_timesheets',
        description: 'Aggregate billable hours into one invoice draft for a project + period',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string' },
            start_date: { type: 'string', description: 'YYYY-MM-DD' },
            end_date: { type: 'string', description: 'YYYY-MM-DD' },
            group_by: { type: 'string', enum: ['entry', 'user', 'week'] },
            due_days: { type: 'integer', description: 'Default 30' },
          },
          required: ['project_id', 'start_date', 'end_date'],
        },
      },
    },
    instructions: 'Calls RPC bulk_invoice_from_timesheets. Marks each used time_entry as invoiced. Creates invoice in draft status — admin reviews before sending.',
  },
  {
    name: 'send_dunning_reminders',
    description: 'Sweep overdue invoices and dispatch graduated dunning reminders (friendly 7d, formal 14d, final 30d). Use when: daily AR run, "run reminders", "send overdue reminders". NOT for: single invoice reminders.',
    category: 'commerce',
    handler: 'rpc:send_dunning_reminders',
    scope: 'external',
    tool_definition: {
      type: 'function',
      function: {
        name: 'send_dunning_reminders',
        description: 'Run dunning sweep across all overdue invoices',
        parameters: {
          type: 'object',
          properties: {
            dry_run: { type: 'boolean', description: 'Preview without writing actions, default false' },
          },
        },
      },
    },
    instructions: 'Returns one row per overdue invoice (status sent/overdue, due_date past, unpaid) with its assigned dunning step. Logs to invoice_dunning_actions — the INVOICE ledger, distinct from dunning_actions which belongs to subscription failed-payment sequences — and flips status sent→overdue. Idempotent per invoice per step per day (a unique index enforces it, so concurrent runs cannot double-remind). dry_run previews without writing; note that a dry run neither flips statuses nor logs.',
  },
  {
    name: 'invoice_overdue_check',
    description: 'List the invoices that are genuinely overdue — issued (status sent/overdue), unpaid, and past due_date — with days overdue and outstanding amount, and flag sent→overdue. Drafts, paid and cancelled invoices are never counted. Use when: FlowPilot runs the daily overdue check, admin asks "any overdue invoices?", "which invoices are overdue", AR follow-up. NOT for: listing invoices generally (manage_invoice action=list); sending the reminder emails (send_dunning_reminders); creating invoices (manage_invoice).',
    category: 'commerce',
    handler: 'db:invoices',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'invoice_overdue_check',
        description: 'Find issued, unpaid invoices past their due date and flag them as overdue',
        parameters: {
          type: 'object',
          properties: {
            auto_flag: { type: 'boolean', description: 'Flip status sent→overdue for the matches (default: true). Pass false for a read-only check.' },
            limit: { type: 'number', description: 'Max rows to return (default 200, max 500)' },
          },
        },
      },
    },
    instructions: 'Overdue means all three at once: status in (sent, overdue) AND due_date < today AND paid_at IS NULL. Drafts are not overdue (never issued), paid and cancelled invoices are not overdue either — the returned `criteria` field states the filter that was applied. Each row carries days_overdue and outstanding_cents (total − paid_amount), plus overdue_count and total_outstanding_cents for the whole set. auto_flag (default true) flips matching sent invoices to overdue and reports flagged_overdue. This skill only REPORTS and flags — the graduated reminder emails are send_dunning_reminders.',
  },
  {
    name: 'create_credit_note',
    description: 'Issue a credit note against an invoice — full (negates the invoice) or partial (a given amount). Use when: a customer returns goods, an invoice was over-billed, or a refund needs a credit document. NOT for: editing the original invoice (manage_invoice) or recording payment.',
    category: 'commerce',
    handler: 'rpc:create_credit_note',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'create_credit_note',
        description: 'Creates a credit_note invoice linked to the original (credited_invoice_id), with negative totals. Omit p_amount_cents for a full credit; pass it (≤ invoice total) for a partial credit. Numbered CN-<invoice>-<n>.',
        parameters: {
          type: 'object',
          required: ['p_invoice_id'],
          properties: {
            p_invoice_id: { type: 'string', format: 'uuid' },
            p_reason: { type: 'string' },
            p_amount_cents: { type: 'number', description: 'Partial credit amount; omit for full credit' },
          },
        },
      },
    },
    instructions: 'Parameters: p_invoice_id (uuid, required), p_reason (optional text), p_amount_cents (optional integer cents — omit for a FULL credit, or pass a positive amount for a PARTIAL credit). Full credit negates subtotal/tax/total of the original; partial credit creates a -p_amount_cents credit. Over-crediting (> invoice total) and crediting a credit note are rejected. Admin/service-role only.',
  },
  {
    name: 'record_invoice_payment',
    description: 'Record a manual payment (cash/Swish/card, no bank transaction) against an invoice; tracks paid_amount_cents and marks the invoice paid when fully settled. Use when: logging a payment received outside the bank feed. NOT for: bank-feed matching (reconcile via reconciliation) or refunds/credit notes (create_credit_note).',
    category: 'commerce',
    handler: 'rpc:record_invoice_payment',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'record_invoice_payment',
        description: 'Adds a payment to an invoice (partial allowed). Increments paid_amount_cents, rejects overpayment, sets status=paid + paid_at when the balance reaches zero. Returns remaining_cents.',
        parameters: {
          type: 'object',
          required: ['p_invoice_id', 'p_amount_cents'],
          properties: {
            p_invoice_id: { type: 'string', format: 'uuid' },
            p_amount_cents: { type: 'number' },
            p_method: { type: 'string', description: 'cash|swish|card|manual|…' },
            p_paid_at: { type: 'string', description: 'ISO timestamp (default now)' },
            p_reference: { type: 'string', description: 'Idempotency key / external payment id (e.g. Stripe PI id, or a stable uuid you generate). If a payment with the same reference was already recorded for this invoice, the call is a safe no-op (returns idempotent:true) — pass it to make retries safe.' },
          },
        },
      },
    },
    instructions: 'Parameters: p_invoice_id (uuid), p_amount_cents (integer cents), p_method (one of cash|swish|card|manual), p_paid_at (optional ISO timestamp), p_reference (optional idempotency key). ALWAYS pass a stable p_reference when there is any chance of a retry/double-submit — a repeat call with the same reference is a no-op (idempotent:true), preventing double-counted payments. Partial payments accumulate in paid_amount_cents; the invoice flips to paid only when fully settled (partially_paid in between). Overpayment is rejected (use create_credit_note for corrections). Complements the bank-reconciliation payment path. Admin/approver/service-role only.',
  },
  {
    name: 'ar_aging_report',
    description: 'Accounts-receivable aging: open (not fully paid) invoices bucketed per customer into current / 1-30 / 31-60 / 61-90 / 90+ days overdue. Use when: "who owes us money", collections review, month-end AR review. NOT for: a single invoice balance (invoice_outstanding via manage_invoice get) or bank reconciliation status (reconciliation_report).',
    category: 'commerce',
    handler: 'rpc:ar_aging_report',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'ar_aging_report',
        description: 'Buckets outstanding (total_cents - paid_amount_cents) of open invoices per customer by days overdue vs p_as_of. Returns { buckets: totals across all customers, customers: [{customer_name, customer_email, lead_id, current_cents, overdue_1_30_cents, overdue_31_60_cents, overdue_61_90_cents, overdue_90_plus_cents, total_outstanding_cents, invoice_count}] }.',
        parameters: {
          type: 'object',
          properties: {
            p_as_of: { type: 'string', description: 'YYYY-MM-DD, default today' },
          },
        },
      },
    },
    instructions: 'Omit p_as_of for a report computed against today. Cancelled invoices and credit notes are excluded; fully-paid invoices (outstanding <= 0) are excluded. Sorted by total_outstanding_cents descending. Admin/approver/service-role only.',
  },
  {
    name: 'run_month_end_invoicing',
    description:
      'Run the WHOLE month-end billing run as one deterministic step: (a) every project with billable uninvoiced time in the period gets one invoice draft (bulk_invoice_from_timesheets per project); (b) every active subscription whose paid period has lapsed gets its renewal invoice. Idempotent — invoiced time entries and renewed periods drop out of the next run. Drafts are NOT sent (sending stays behind send_invoice_email / approval). Use when: month-end billing cron, "fakturera månaden", an agent asked to bill the period end-to-end. NOT for: a single project (bulk_invoice_from_timesheets) or a single renewal (generate_subscription_invoice).',
    category: 'commerce',
    handler: 'db:run_month_end_invoicing',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'run_month_end_invoicing',
        description: 'Composite: timesheets→invoice drafts per project + lapsed subscription renewals, for one period. Returns what was billed.',
        parameters: {
          type: 'object',
          properties: {
            start_date: { type: 'string', description: 'YYYY-MM-DD. Default: first day of the PREVIOUS month.' },
            end_date: { type: 'string', description: 'YYYY-MM-DD. Default: last day of the PREVIOUS month.' },
          },
        },
      },
    },
    instructions:
      'One call = the whole billing run; do NOT hand-walk per-project bulk_invoice_from_timesheets + per-subscription generate_subscription_invoice yourself. Defaults to the previous calendar month — pass start_date/end_date only for a different period. Creates DRAFTS; report invoice numbers + totals and leave sending to the approval flow. Safe to re-run (idempotent). Returns { period, timesheet_invoices: [{project_id, invoice_number, total_cents, hours}], projects_billed, subscription_renewals, *_failed? }.',
  },
];

const INVOICING_AUTOMATIONS: AutomationSeed[] = [
  {
    name: 'Invoice Overdue Check',
    description: 'Every day at 08:00, FlowPilot checks for invoices past their due date and flags them as overdue.',
    trigger_type: 'cron',
    trigger_config: { cron: '0 8 * * *', expression: '0 8 * * *' },
    skill_name: 'invoice_overdue_check',
    skill_arguments: { auto_flag: true },
  },
  {
    name: 'Month-End Billing Run',
    description: 'On the 1st of every month at 05:00 the previous month is billed as one step: timesheet invoice drafts per project + lapsed subscription renewals. Drafts only — sending stays behind approval.',
    trigger_type: 'cron',
    trigger_config: { cron: '0 5 1 * *', expression: '0 5 1 * *' },
    skill_name: 'run_month_end_invoicing',
    skill_arguments: {},
  },
];

export const invoicingModule = defineModule<InvoicingInput, InvoicingOutput>({
  id: 'invoicing',
  name: 'Invoicing',
  version: '1.0.0',
  processes: ['quote-to-cash', 'procure-to-pay', 'record-to-report'],
  maturity: 'L4',
  description: 'Create and manage invoices with line items, tax computation, and status tracking',
  capabilities: ['data:write', 'data:read'],
  tier: 'standard',
  inputSchema: invoicingInputSchema,
  outputSchema: invoicingOutputSchema,

  skills: ['manage_invoice', 'invoice_from_timesheets', 'invoice_overdue_check', 'bulk_invoice_from_timesheets', 'send_dunning_reminders', 'auto_mark_invoice_paid', 'create_credit_note', 'record_invoice_payment', 'ar_aging_report', 'run_month_end_invoicing'],
  data: {
    tables: ['dunning_actions', 'dunning_sequences', 'invoices'],
  },
  skillSeeds: INVOICING_SKILLS,
  automations: INVOICING_AUTOMATIONS,

  async publish(input: InvoicingInput): Promise<InvoicingOutput> {
    const validated = invoicingInputSchema.parse(input);

    if (validated.action === 'create') {
      if (!validated.customer_email) return { success: false, message: 'customer_email is required' };
      const lineItems = validated.line_items || [];
      const subtotal = lineItems.reduce((s, i) => s + i.qty * i.unit_price_cents, 0);
      const taxRate = 0.25;
      const taxCents = Math.round(subtotal * taxRate);
      const { count } = await supabase.from('invoices').select('*', { count: 'exact', head: true });
      const num = `INV-${String((count || 0) + 1).padStart(4, '0')}`;
      const { data, error } = await supabase
        .from('invoices')
        .insert({
          invoice_number: num, customer_email: validated.customer_email,
          customer_name: validated.customer_name || '', deal_id: validated.deal_id || null,
          line_items: lineItems as any, subtotal_cents: subtotal,
          tax_rate: taxRate, tax_cents: taxCents, total_cents: subtotal + taxCents,
        })
        .select('id')
        .single();
      if (error) { logger.error('[invoicing] create failed', error); return { success: false, message: error.message }; }
      return { success: true, invoice_id: data.id, message: `Invoice ${num} created` };
    }

    return { success: false, message: 'Unsupported action' };
  },
});
