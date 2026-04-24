import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { defineModule } from '@/lib/module-def';
import { z } from 'zod';
import type { SkillSeed, AutomationSeed } from '@/lib/module-bootstrap';
import { getActivePack } from '@/lib/locale-packs';

const accountingInputSchema = z.object({
  action: z.enum(['create_entry', 'list_entries', 'balance_sheet', 'profit_loss']),
  entry_date: z.string().optional(),
  description: z.string().optional(),
  reference_number: z.string().optional(),
  lines: z.array(z.object({
    account_code: z.string(),
    account_name: z.string(),
    debit_cents: z.number().int(),
    credit_cents: z.number().int(),
    description: z.string().optional(),
  })).optional(),
});

const accountingOutputSchema = z.object({
  success: z.boolean(),
  entry_id: z.string().optional(),
  message: z.string().optional(),
});

type AccountingInput = z.infer<typeof accountingInputSchema>;
type AccountingOutput = z.infer<typeof accountingOutputSchema>;

// ── Skill Seeds ──

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
            lines: { type: 'array', items: { type: 'object', properties: { account_code: { type: 'string' }, account_name: { type: 'string' }, debit_cents: { type: 'number' }, credit_cents: { type: 'number' } } } },
            invoice_id: { type: 'string' },
            reference_number: { type: 'string' },
          },
          required: ['action'],
        },
      },
    },
    instructions: `Double-entry bookkeeping. Ensure debits equal credits. Match accounting templates by keywords when possible. Locale-specific guidance: ${getActivePack().ai_instructions.journal_entry}`,
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
        parameters: { type: 'object', properties: { type: { type: 'string', enum: ['balance_sheet', 'income_statement', 'general_ledger', 'trial_balance', 'unbooked_invoices'] }, from_date: { type: 'string' }, to_date: { type: 'string' } }, required: ['type'] },
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
        parameters: { type: 'object', properties: { action: { type: 'string', enum: ['create', 'list', 'update'] }, template_name: { type: 'string' }, description: { type: 'string' }, category: { type: 'string' }, keywords: { type: 'array', items: { type: 'string' } }, template_lines: { type: 'array' } }, required: ['action'] },
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
        parameters: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'set', 'delete'] }, fiscal_year: { type: 'number', description: 'Fiscal year, e.g. 2024' }, account_code: { type: 'string' }, amount_cents: { type: 'number' }, balance_type: { type: 'string', enum: ['debit', 'credit'] }, locale: { type: 'string', description: 'Chart locale, e.g. se-bas2024' } }, required: ['action'] },
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
        parameters: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'add', 'update', 'deactivate'] }, locale: { type: 'string' }, account_code: { type: 'string' }, account_name: { type: 'string' }, account_type: { type: 'string', enum: ['asset', 'liability', 'equity', 'income', 'expense'] }, account_category: { type: 'string' }, normal_balance: { type: 'string', enum: ['debit', 'credit'] }, search: { type: 'string' } }, required: ['action'] },
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
        parameters: { type: 'object', properties: { min_occurrences: { type: 'number' }, since_date: { type: 'string' }, locale: { type: 'string' } } },
      },
    },
    instructions: 'Group journal entries by their account_code combinations. If the same set of accounts appears 3+ times, suggest it as a template. Include common descriptions as keywords.',
  },
  {
    name: 'close_accounting_period',
    description: 'Close an accounting period (month) — locks all journal entries with dates in that period against further changes and snapshots totals. Use when: month-end close after all entries are posted and reconciled. NOT for: permanent archival (use lock_accounting_period after audit).',
    category: 'commerce',
    handler: 'rpc:close_accounting_period',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'close_accounting_period',
        description: 'Close a month so no further bookings can be made. Refuses if any draft entries remain.',
        parameters: {
          type: 'object',
          properties: {
            year: { type: 'number', description: 'Fiscal year, e.g. 2026' },
            month: { type: 'number', description: 'Month 1-12' },
            notes: { type: 'string', description: 'Optional close note (auditor reference, etc.)' },
          },
          required: ['year', 'month'],
        },
      },
    },
    instructions: 'Always run accounting_reports for unbooked_invoices first to ensure nothing is missing. Confirm with admin before closing. Once closed, only reopen_accounting_period (admin-only) can revert it — and only if not permanently locked.',
  },
  {
    name: 'reopen_accounting_period',
    description: 'Reopen a previously closed accounting period to allow corrections. Fails if the period was permanently locked. Use when: late-arriving correction needs to be booked, auditor requests adjustment. NOT for: locked periods (those are immutable).',
    category: 'commerce',
    handler: 'rpc:reopen_accounting_period',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'reopen_accounting_period',
        description: 'Reopen a closed period for corrections',
        parameters: {
          type: 'object',
          properties: {
            year: { type: 'number' },
            month: { type: 'number' },
            reason: { type: 'string', description: 'Why the period is being reopened (audit trail)' },
          },
          required: ['year', 'month', 'reason'],
        },
      },
    },
    instructions: 'Always require an explicit reason for the audit log. Notify the responsible accountant after reopening.',
  },
  {
    name: 'list_accounting_periods',
    description: 'List accounting periods with their status (open/closed/locked) and snapshot totals. Use when: admin asks "is March closed?", before attempting to close a new month, or for the month-end dashboard.',
    category: 'commerce',
    handler: 'db:accounting_periods',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_accounting_periods',
        description: 'List accounting periods and their status',
        parameters: {
          type: 'object',
          properties: {
            year: { type: 'number' },
            status: { type: 'string', enum: ['open', 'closed', 'locked'] },
          },
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
    trigger_config: { cron: '0 8 * * *', expression: '0 8 * * *' },
    skill_name: 'accounting_reports',
    skill_arguments: { type: 'unbooked_invoices' },
  },
];

/** Seed chart of accounts from the active locale pack if not already present */
async function seedChartOfAccounts() {
  const pack = getActivePack();
  const { count } = await supabase
    .from('chart_of_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('locale', pack.id);

  if ((count ?? 0) > 0) {
    logger.log(`[accounting] ${pack.label} chart already populated, skipping`);
    return;
  }

  const accounts = pack.chart.map((a) => ({ ...a, locale: pack.id }));
  for (let i = 0; i < accounts.length; i += 50) {
    const batch = accounts.slice(i, i + 50);
    const { error } = await supabase.from('chart_of_accounts').insert(batch);
    if (error) throw error;
  }
  logger.log(`[accounting] Seeded ${accounts.length} ${pack.label} accounts`);
}

/** Seed default accounting templates from the active locale pack */
async function seedAccountingTemplates() {
  const pack = getActivePack();
  const { count } = await supabase
    .from('accounting_templates')
    .select('id', { count: 'exact', head: true })
    .eq('locale', pack.id);

  if ((count ?? 0) > 0) {
    logger.log(`[accounting] ${pack.label} templates already populated, skipping`);
    return;
  }

  const templates = pack.templates.map((t) => ({
    ...t,
    locale: pack.id,
    is_system: t.is_system ?? true,
    template_lines: t.template_lines as any,
  })) as any[];
  for (let i = 0; i < templates.length; i += 20) {
    const batch = templates.slice(i, i + 20);
    const { error } = await supabase.from('accounting_templates').insert(batch);
    if (error) throw error;
  }
  logger.log(`[accounting] Seeded ${templates.length} ${pack.label} templates`);
}

export const accountingModule = defineModule<AccountingInput, AccountingOutput>({
  id: 'accounting',
  name: 'Accounting',
  version: '1.0.0',
  description: 'Double-entry bookkeeping with pluggable locale packs (chart of accounts, VAT rules, payroll, bank import). Default: BAS 2024 (Sweden); also supports IFRS-generic. Add new market packs in src/lib/locale-packs/.',
  capabilities: ['data:write', 'data:read'],
  inputSchema: accountingInputSchema,
  outputSchema: accountingOutputSchema,

  skills: [
    'manage_journal_entry',
    'accounting_reports',
    'manage_accounting_template',
    'manage_opening_balances',
    'manage_chart_of_accounts',
    'suggest_accounting_template',
    'close_accounting_period',
    'reopen_accounting_period',
    'list_accounting_periods',
  ],

  skillSeeds: ACCOUNTING_SKILLS,
  automations: ACCOUNTING_AUTOMATIONS,

  seedData: async () => {
    await seedChartOfAccounts();
    await seedAccountingTemplates();
  },

  async publish(input: AccountingInput): Promise<AccountingOutput> {
    const validated = accountingInputSchema.parse(input);

    if (validated.action === 'create_entry') {
      if (!validated.lines || validated.lines.length === 0) {
        return { success: false, message: 'lines are required' };
      }

      const totalDebit = validated.lines.reduce((s, l) => s + l.debit_cents, 0);
      const totalCredit = validated.lines.reduce((s, l) => s + l.credit_cents, 0);
      if (totalDebit !== totalCredit) {
        return { success: false, message: `Unbalanced: debit ${totalDebit} ≠ credit ${totalCredit}` };
      }

      const { data, error } = await supabase
        .from('journal_entries')
        .insert({
          entry_date: validated.entry_date || new Date().toISOString().split('T')[0],
          description: validated.description || '',
          reference_number: validated.reference_number || null,
          status: 'posted',
          source: 'flowpilot',
        })
        .select('id')
        .single();

      if (error) {
        logger.error('[accounting] create entry failed', error);
        return { success: false, message: error.message };
      }

      const { error: linesError } = await supabase
        .from('journal_entry_lines')
        .insert(
          validated.lines.map((l) => ({
            journal_entry_id: data.id,
            account_code: l.account_code,
            account_name: l.account_name,
            debit_cents: l.debit_cents,
            credit_cents: l.credit_cents,
            description: l.description || null,
          }))
        );

      if (linesError) {
        logger.error('[accounting] create lines failed', linesError);
        return { success: false, message: linesError.message };
      }

      return { success: true, entry_id: data.id, message: 'Journal entry created' };
    }

    return { success: false, message: 'Unsupported action' };
  },
});
