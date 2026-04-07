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
import { BAS_2024_TEMPLATES } from '@/data/templates-bas2024';

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
  {
    name: 'manage_opening_balances',
    description: 'Create, list, update, or delete opening balances (ingående balanser / IB) for a fiscal year. Use when: admin wants to set initial account balances, migrating from another system, starting a new fiscal year. NOT for: journal entries (use manage_journal_entry), reports (use accounting_reports).',
    category: 'commerce',
    handler: 'db:opening_balances',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_opening_balances',
        description: 'CRUD for opening balances per fiscal year',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'set', 'delete'] },
            fiscal_year: { type: 'number', description: 'Fiscal year, e.g. 2024' },
            account_code: { type: 'string' },
            amount_cents: { type: 'number' },
            balance_type: { type: 'string', enum: ['debit', 'credit'] },
            locale: { type: 'string', description: 'Chart locale, e.g. se-bas2024' },
          },
          required: ['action'],
        },
      },
    },
    instructions: 'Opening balances must balance (total debit = total credit). Each account should have only one IB per fiscal year. Use the chart_of_accounts to validate account codes.',
  },
  {
    name: 'manage_chart_of_accounts',
    description: 'List, add, update, or deactivate accounts in the chart of accounts. Supports multiple locales (se-bas2024, ifrs, us-gaap). Use when: admin asks about available accounts, needs to add a custom account, or deactivate unused accounts. NOT for: journal entries (use manage_journal_entry), opening balances (use manage_opening_balances).',
    category: 'commerce',
    handler: 'db:chart_of_accounts',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_chart_of_accounts',
        description: 'CRUD for chart of accounts across locales',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'add', 'update', 'deactivate'] },
            locale: { type: 'string', description: 'e.g. se-bas2024, ifrs, us-gaap' },
            account_code: { type: 'string' },
            account_name: { type: 'string' },
            account_type: { type: 'string', enum: ['asset', 'liability', 'equity', 'income', 'expense'] },
            account_category: { type: 'string' },
            normal_balance: { type: 'string', enum: ['debit', 'credit'] },
            search: { type: 'string', description: 'Search term for listing' },
          },
          required: ['action'],
        },
      },
    },
    instructions: 'When listing, group by account_type for clarity. BAS 2024 uses 4-digit codes (1xxx=assets, 2xxx=liabilities, 3xxx=income, 4-7xxx=expenses, 8xxx=financial). IFRS and US GAAP use similar groupings. Custom accounts should follow the locale convention.',
  },
  {
    name: 'suggest_accounting_template',
    description: 'Analyze recent journal entries to identify recurring transaction patterns and suggest new reusable templates. Use when: heartbeat detects repeated similar bookings, admin asks FlowPilot to learn from past transactions, or after importing historical data. NOT for: creating entries (use manage_journal_entry), managing existing templates (use manage_accounting_template).',
    category: 'commerce',
    handler: 'db:journal_entries',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'suggest_accounting_template',
        description: 'Analyze journal entries and suggest reusable templates',
        parameters: {
          type: 'object',
          properties: {
            min_occurrences: { type: 'number', description: 'Minimum times a pattern must appear to suggest (default 3)' },
            since_date: { type: 'string', description: 'Only analyze entries after this date' },
            locale: { type: 'string', description: 'Filter by chart locale' },
          },
        },
      },
    },
    instructions: 'Group journal entries by their account_code combinations. If the same set of accounts appears 3+ times, suggest it as a template. Include common descriptions as keywords. Return structured suggestions that can be passed to manage_accounting_template to create.',
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
    .select('id', { count: 'exact', head: true })
    .eq('locale', 'se-bas2024');

  if ((count ?? 0) > 0) {
    logger.log('[accounting-bootstrap] BAS 2024 templates already populated, skipping');
    return;
  }

  // Insert in batches of 20
  for (let i = 0; i < BAS_2024_TEMPLATES.length; i += 20) {
    const batch = BAS_2024_TEMPLATES.slice(i, i + 20);
    const { error } = await supabase.from('accounting_templates').insert(batch);
    if (error) throw error;
  }
  logger.log(`[accounting-bootstrap] Seeded ${BAS_2024_TEMPLATES.length} BAS 2024 templates`);
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
