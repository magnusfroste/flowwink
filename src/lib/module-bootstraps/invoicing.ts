/**
 * Invoicing Module Bootstrap
 * 
 * Seeds:
 * - Skills: manage_invoice, invoice_from_timesheets, invoice_overdue_check
 * - Automation: Invoice Overdue Check (daily)
 * 
 * Closes the Quote-to-Cash loop:
 *   Timesheets → Invoice draft → Send → Payment → Accounting journal entry
 */

import { registerBootstrap, type SkillSeed, type AutomationSeed } from '@/lib/module-bootstrap';

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
            invoice_id: { type: 'string', description: 'Invoice UUID (for get/update/send/mark_paid/cancel)' },
            lead_id: { type: 'string', description: 'Lead UUID for customer (create)' },
            deal_id: { type: 'string', description: 'Link to deal (optional)' },
            project_id: { type: 'string', description: 'Link to project (optional)' },
            line_items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  description: { type: 'string' },
                  qty: { type: 'number' },
                  unit_price_cents: { type: 'number' },
                },
              },
            },
            tax_rate: { type: 'number', description: 'Decimal e.g. 0.25 for 25%' },
            currency: { type: 'string', description: 'ISO currency code, default SEK' },
            due_date: { type: 'string', description: 'YYYY-MM-DD' },
            payment_terms: { type: 'string', description: 'e.g. "Net 30"' },
            notes: { type: 'string' },
            status_filter: { type: 'string', enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'] },
          },
          required: ['action'],
        },
      },
    },
    instructions: 'Invoice lifecycle: draft → sent → paid (or cancelled). When creating, auto-generate INV-XXXXX number. When marking as sent, set sent_at. When marking as paid, set paid_at. For listing, support status filter. Swedish: "faktura", "skapa faktura", "skicka faktura", "betald".',
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
            project_id: { type: 'string', description: 'Project UUID' },
            project_name: { type: 'string', description: 'Project name (lookup if no project_id)' },
            period: { type: 'string', enum: ['this_month', 'last_month', 'custom'] },
            start_date: { type: 'string', description: 'YYYY-MM-DD for custom period' },
            end_date: { type: 'string', description: 'YYYY-MM-DD for custom period' },
            group_by: { type: 'string', enum: ['entry', 'user', 'week'], description: 'How to group into line items (default: entry)' },
            tax_rate: { type: 'number', description: 'Decimal e.g. 0.25' },
            due_days: { type: 'number', description: 'Days until due (default: 30)' },
          },
          required: ['project_id'],
        },
      },
    },
    instructions: 'Aggregate billable hours from time_entries for the given project and period. Each entry becomes a line item with hours × project hourly rate. Group options: "entry" (one line per entry), "user" (sum per user), "week" (sum per week). Auto-set due_date to issue_date + due_days. Swedish: "fakturera timmar", "faktura från tidsrapport".',
  },
  {
    name: 'invoice_overdue_check',
    description: 'Check for overdue invoices and optionally send reminders. Use when: FlowPilot runs daily overdue check, admin asks "any overdue invoices?", "vilka fakturor är förfallna". NOT for: creating invoices (use manage_invoice).',
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
    instructions: 'Query invoices with status=sent and due_date < today. Report count and total amount. If auto_flag is true, update their status to overdue. Format output showing invoice number, customer, amount, and days overdue. Swedish: "förfallna fakturor", "påminnelse".',
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

registerBootstrap('invoicing', {
  skills: INVOICING_SKILLS,
  automations: INVOICING_AUTOMATIONS,
});
