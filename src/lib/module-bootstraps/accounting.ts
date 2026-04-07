/**
 * Accounting Module Bootstrap
 * 
 * Seeds:
 * - BAS 2024 chart of accounts (if empty)
 * - Default accounting templates (if empty)
 * - Skills: manage_journal_entry, accounting_reports, manage_accounting_template
 * - Automation: Invoice Reconciliation (daily check for unbooked invoices)
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { registerBootstrap, type SkillSeed, type AutomationSeed } from '@/lib/module-bootstrap';
import { BAS_2024_ACCOUNTS } from '@/data/bas2024-accounts';

const ACCOUNTING_SKILLS: SkillSeed[] = [
  {
    name: 'manage_journal_entry',
    description: 'Create, list, or void double-entry journal entries (verifikat). Use when: admin asks to book/record a transaction, invoice is paid and needs journal entry, salary/rent/VAT or other recurring transactions, heartbeat detects unbooked invoices. NOT for: reading reports (use accounting_reports), managing templates (use manage_accounting_template).',
    category: 'commerce',
    handler: 'db:journal_entries',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_journal_entry',
        description: 'Create or list double-entry journal entries',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'list', 'void'] },
            description: { type: 'string' },
            entry_date: { type: 'string' },
            lines: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  account_code: { type: 'string' },
                  account_name: { type: 'string' },
                  debit_cents: { type: 'number' },
                  credit_cents: { type: 'number' },
                },
              },
            },
            invoice_id: { type: 'string' },
            reference_number: { type: 'string' },
          },
          required: ['action'],
        },
      },
    },
    instructions: 'Always use BAS 2024 account codes. Ensure debits equal credits. Match accounting templates by keywords when possible. For invoices: Debit 1510 Kundfordringar, Credit 3010 Försäljning + Credit 2610 Utgående moms 25%.',
  },
  {
    name: 'accounting_reports',
    description: 'Generate financial reports: balance sheet (balansräkning), income statement (resultaträkning), general ledger (huvudbok), trial balance, or check for unbooked invoices. Use when: admin asks for financial overview, month-end closing, reconciliation checks. NOT for: creating entries (use manage_journal_entry).',
    category: 'commerce',
    handler: 'db:journal_entries',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'accounting_reports',
        parameters: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['balance_sheet', 'income_statement', 'general_ledger', 'trial_balance', 'unbooked_invoices'] },
            from_date: { type: 'string' },
            to_date: { type: 'string' },
          },
          required: ['type'],
        },
      },
    },
  },
  {
    name: 'manage_accounting_template',
    description: 'Create, list, or update reusable accounting templates for common transactions. Templates have keyword matching for AI auto-selection. Use when: admin wants to add a new template, or a new transaction pattern is identified that should be reusable. NOT for: actual bookkeeping (use manage_journal_entry).',
    category: 'commerce',
    handler: 'db:accounting_templates',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_accounting_template',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'list', 'update'] },
            template_name: { type: 'string' },
            description: { type: 'string' },
            category: { type: 'string' },
            keywords: { type: 'array', items: { type: 'string' } },
            template_lines: { type: 'array' },
          },
          required: ['action'],
        },
      },
    },
  },
];

const ACCOUNTING_AUTOMATIONS: AutomationSeed[] = [
  {
    name: 'Invoice Reconciliation',
    description: 'Daily check for sent invoices without matching journal entries. FlowPilot reviews and books them autonomously using the correct accounting template.',
    trigger_type: 'cron',
    trigger_config: { cron: '0 8 * * *', expression: '0 8 * * *' }, // Daily at 08:00
    skill_name: 'accounting_reports',
    skill_arguments: { type: 'unbooked_invoices' },
  },
];

/** Seed BAS 2024 chart of accounts if table is empty */
async function seedChartOfAccounts() {
  const { count } = await supabase
    .from('chart_of_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('locale', 'se-bas2024');

  if ((count ?? 0) > 0) {
    logger.log('[accounting-bootstrap] BAS 2024 chart already populated, skipping');
    return;
  }

  // Insert in batches of 50 to avoid payload limits
  for (let i = 0; i < BAS_2024_ACCOUNTS.length; i += 50) {
    const batch = BAS_2024_ACCOUNTS.slice(i, i + 50);
    const { error } = await supabase.from('chart_of_accounts').insert(batch);
    if (error) throw error;
  }
  logger.log(`[accounting-bootstrap] Seeded ${BAS_2024_ACCOUNTS.length} BAS 2024 accounts`);
}

/** Seed default accounting templates if table is empty */
async function seedAccountingTemplates() {
  const { count } = await supabase
    .from('accounting_templates')
    .select('id', { count: 'exact', head: true });

  if ((count ?? 0) > 0) {
    logger.log('[accounting-bootstrap] Accounting templates already populated, skipping');
    return;
  }

  const templates = [
    {
      template_name: 'Försäljning tjänster 25% moms',
      description: 'Fakturerad tjänsteförsäljning med 25% moms',
      category: 'revenue',
      keywords: ['faktura', 'försäljning', 'tjänst', 'konsult', 'arvode', 'invoice', 'sale'],
      is_system: true,
      template_lines: [
        { account_code: '1510', account_name: 'Kundfordringar', debit_pct: 125, credit_pct: 0 },
        { account_code: '3010', account_name: 'Försäljning tjänster', debit_pct: 0, credit_pct: 100 },
        { account_code: '2610', account_name: 'Utgående moms 25%', debit_pct: 0, credit_pct: 25 },
      ],
    },
    {
      template_name: 'Inbetalning kundfordran',
      description: 'Kund betalar faktura — bankkonto ökar, kundfordran minskar',
      category: 'payment',
      keywords: ['betalning', 'inbetalning', 'betald', 'payment', 'received', 'paid'],
      is_system: true,
      template_lines: [
        { account_code: '1930', account_name: 'Företagskonto', debit_pct: 100, credit_pct: 0 },
        { account_code: '1510', account_name: 'Kundfordringar', debit_pct: 0, credit_pct: 100 },
      ],
    },
    {
      template_name: 'Leverantörsfaktura med 25% moms',
      description: 'Inkommande faktura med avdragsgill moms',
      category: 'expense',
      keywords: ['leverantör', 'inköp', 'faktura', 'supplier', 'purchase', 'vendor'],
      is_system: true,
      template_lines: [
        { account_code: '4010', account_name: 'Inköp material och varor', debit_pct: 100, credit_pct: 0 },
        { account_code: '2640', account_name: 'Ingående moms', debit_pct: 25, credit_pct: 0 },
        { account_code: '2440', account_name: 'Leverantörsskulder', debit_pct: 0, credit_pct: 125 },
      ],
    },
    {
      template_name: 'Löneutbetalning',
      description: 'Bruttolön med skatt och arbetsgivaravgifter',
      category: 'payroll',
      keywords: ['lön', 'salary', 'payroll', 'löner'],
      is_system: true,
      template_lines: [
        { account_code: '7210', account_name: 'Löner tjänstemän', debit_pct: 100, credit_pct: 0 },
        { account_code: '2710', account_name: 'Personalskatt', debit_pct: 0, credit_pct: 30 },
        { account_code: '1930', account_name: 'Företagskonto', debit_pct: 0, credit_pct: 70 },
        { account_code: '7510', account_name: 'Arbetsgivaravgifter', debit_pct: 31.42, credit_pct: 0 },
        { account_code: '2730', account_name: 'Arbetsgivaravgifter', debit_pct: 0, credit_pct: 31.42 },
      ],
    },
    {
      template_name: 'Hyra kontor',
      description: 'Månadshyra för kontor',
      category: 'expense',
      keywords: ['hyra', 'kontor', 'lokal', 'rent', 'office'],
      is_system: true,
      template_lines: [
        { account_code: '5010', account_name: 'Lokalhyra', debit_pct: 100, credit_pct: 0 },
        { account_code: '1930', account_name: 'Företagskonto', debit_pct: 0, credit_pct: 100 },
      ],
    },
    {
      template_name: 'IT-tjänster & hosting',
      description: 'SaaS, hosting, domäner och IT-konsulter',
      category: 'expense',
      keywords: ['hosting', 'saas', 'domän', 'server', 'IT', 'software', 'subscription'],
      is_system: true,
      template_lines: [
        { account_code: '6540', account_name: 'IT-tjänster', debit_pct: 80, credit_pct: 0 },
        { account_code: '2640', account_name: 'Ingående moms', debit_pct: 20, credit_pct: 0 },
        { account_code: '1930', account_name: 'Företagskonto', debit_pct: 0, credit_pct: 100 },
      ],
    },
    {
      template_name: 'Bankkostnader',
      description: 'Bankavgifter, kortavgifter, transaktionsavgifter',
      category: 'expense',
      keywords: ['bank', 'avgift', 'stripe', 'kort', 'fee', 'transaction'],
      is_system: true,
      template_lines: [
        { account_code: '6570', account_name: 'Bankkostnader', debit_pct: 100, credit_pct: 0 },
        { account_code: '1930', account_name: 'Företagskonto', debit_pct: 0, credit_pct: 100 },
      ],
    },
  ];

  const { error } = await supabase.from('accounting_templates').insert(templates);
  if (error) throw error;
  logger.log(`[accounting-bootstrap] Seeded ${templates.length} accounting templates`);
}

// Register the accounting module bootstrap
registerBootstrap('accounting', {
  seedData: async () => {
    await seedChartOfAccounts();
    await seedAccountingTemplates();
  },
  skills: ACCOUNTING_SKILLS,
  automations: ACCOUNTING_AUTOMATIONS,
});
