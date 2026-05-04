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
    instructions: `Invoice lifecycle: draft → sent → paid (or cancelled). When creating, auto-generate INV-XXXXX number. When marking as sent, set sent_at. When marking as paid, set paid_at. For listing, support status filter. Locale-specific: ${getActivePack().ai_instructions.invoicing}`,
  },
  {
    name: 'invoice_from_timesheets',
    description: 'Generate invoice draft from billable time entries. Use when: user wants to invoice a client for logged hours, "fakturera timmar", "invoice project X for last month". NOT for: manual invoices (use manage_invoice), logging time (use log_time).',
    category: 'commerce',
    handler: 'db:invoices',
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
    instructions: 'Returns one row per overdue invoice with assigned dunning step. Logs to dunning_actions and flips status sent→overdue. Idempotent per step per day.',
  },
  {
    name: 'invoice_overdue_check',
    description: 'Check for overdue invoices and optionally send reminders. Use when: FlowPilot runs daily overdue check, admin asks "any overdue invoices?", "which invoices are overdue". NOT for: creating invoices (use manage_invoice).',
    category: 'commerce',
    handler: 'db:invoices',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'invoice_overdue_check',
        description: 'Find sent invoices past due date and flag them as overdue',
        parameters: {
          type: 'object',
          properties: {
            auto_flag: { type: 'boolean', description: 'Automatically update status to overdue (default: true)' },
            send_reminder: { type: 'boolean', description: 'Send reminder email to customer (default: false)' },
          },
        },
      },
    },
    instructions: 'Query invoices with status=sent and due_date < today. Report count and total amount. If auto_flag is true, update their status to overdue. Format output showing invoice number, customer, amount, and days overdue.',
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
];

export const invoicingModule = defineModule<InvoicingInput, InvoicingOutput>({
  id: 'invoicing',
  name: 'Invoicing',
  version: '1.0.0',
  description: 'Create and manage invoices with line items, tax computation, and status tracking',
  capabilities: ['data:write', 'data:read'],
  inputSchema: invoicingInputSchema,
  outputSchema: invoicingOutputSchema,

  skills: ['manage_invoice', 'invoice_from_timesheets', 'invoice_overdue_check', 'bulk_invoice_from_timesheets', 'send_dunning_reminders', 'auto_mark_invoice_paid'],
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
