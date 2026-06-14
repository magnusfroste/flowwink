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
    name: 'list_voucher_gaps',
    description: 'Detect gaps in voucher-number sequences per series and fiscal year. Use when: closing a period, verifying audit integrity. NOT for: listing all entries (manage_journal_entry action=list) or explaining a specific gap (explain_voucher_gap).',
    category: 'system',
    handler: 'rpc:list_voucher_gaps',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {"type":"function","function":{"name":"list_voucher_gaps","parameters":{"type":"object","properties":{"p_year":{"type":"integer"},"p_series":{"type":["string","null"]}}},"description":"Detect gaps in voucher-number sequences per series and fiscal year."}} as SkillSeed['tool_definition'],
  },
  {
    name: 'explain_voucher_gap',
    description: 'Look up audit_logs for clues about a missing voucher number. Use when: list_voucher_gaps returned a gap and root cause is needed. NOT for: detecting gaps (list_voucher_gaps) or posting corrections (record_accounting_correction).',
    category: 'system',
    handler: 'rpc:explain_voucher_gap',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {"type":"function","function":{"name":"explain_voucher_gap","parameters":{"type":"object","required":["p_series","p_year","p_voucher_number"],"properties":{"p_year":{"type":"integer"},"p_series":{"type":"string"},"p_voucher_number":{"type":"integer"}}},"description":"Look up audit_logs for clues about a missing voucher number."}} as SkillSeed['tool_definition'],
  },
  {
    name: 'year_end_readiness',
    description: 'Year-end checklist: periods closed, no drafts, no voucher gaps, reconciliations done, invoices/expenses settled. Use when: preparing annual close. NOT for: running the close (run_year_end) or closing a single month (close_accounting_period).',
    category: 'system',
    handler: 'rpc:year_end_readiness',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {"type":"function","function":{"name":"year_end_readiness","parameters":{"type":"object","properties":{"p_year":{"type":"integer","description":"Defaults to previous calendar year"}}},"description":"Year-end checklist: periods closed, no drafts, no voucher gaps, reconciliations done, invoices/expenses settled."}} as SkillSeed['tool_definition'],
  },
  {
    name: 'run_year_end',
    description: 'Orchestrate year-end close: runs year_end_readiness + propose_accruals + propose_annual_depreciation and returns a consolidated report with next-step instructions. Read-only; actual posting requires follow-up staged calls to manage_journal_entry. Use when: starting bokslut for a fiscal year. NOT for: posting entries directly (manage_journal_entry).',
    category: 'commerce',
    handler: 'rpc:run_year_end',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {"type":"function","function":{"name":"run_year_end","parameters":{"type":"object","required":["p_year"],"properties":{"p_year":{"type":"integer","description":"Fiscal year, e.g. 2025"},"p_confirm":{"type":"boolean","default":false,"description":"Reserved for future use"}}},"description":"Orchestrate year-end close: runs year_end_readiness + propose_accruals + propose_annual_depreciation and returns a consolidated report."}} as SkillSeed['tool_definition'],
  },
  {
    name: 'propose_accruals',
    description: 'Scan for unpaid invoices and approved-but-unpaid expense reports that may need year-end accrual entries. Returns proposals with suggested_action (defer_revenue, accrue_receivable, accrue_payable). Use when: closing a fiscal year and need periodiseringar. NOT for: posting accruals — call manage_journal_entry per proposal.',
    category: 'commerce',
    handler: 'rpc:propose_accruals',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {"type":"function","function":{"name":"propose_accruals","parameters":{"type":"object","required":["p_year"],"properties":{"p_year":{"type":"integer","description":"Fiscal year, e.g. 2025"}}},"description":"Scan for unpaid invoices and approved-but-unpaid expense reports that may need year-end accrual entries."}} as SkillSeed['tool_definition'],
  },
  {
    name: 'manage_journal_entry',
    description: 'Create, list, or void double-entry journal entries (verifikat). Use when: admin asks to book/record a transaction, invoice is paid and needs journal entry, salary/rent/VAT or other recurring transactions, heartbeat detects unbooked invoices. NOT for: reading reports (use accounting_reports), managing templates (use manage_accounting_template). MANDATORY WORKFLOW for create: (1) if a vendor is involved, look up the vendor and prefer its `default_account_code` and `last_used_template_id`; (2) otherwise call manage_accounting_template action=list and rank by keyword overlap × usage_count; (3) only invent accounts if no vendor default and no template scores ≥0.6 — and in that case also call suggest_accounting_template to register the new pattern; (4) ALWAYS pass `template_id` (when matched) and `vendor_id` (when known) so the system can learn.',
    category: 'commerce',
    handler: 'db:journal_entries',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_journal_entry',
        description: 'Create or list double-entry journal entries. For create, prefer vendor.default_account_code → matching template → suggest new template last.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'list', 'void'] },
            description: { type: 'string' },
            entry_date: { type: 'string' },
            lines: { type: 'array', items: { type: 'object', properties: { account_code: { type: 'string' }, account_name: { type: 'string' }, debit_cents: { type: 'number' }, credit_cents: { type: 'number' } } } },
            invoice_id: { type: 'string' },
            vendor_id: { type: 'string', description: 'Link to vendor — required when booking a supplier transaction so vendor learning fires.' },
            template_id: { type: 'string', description: 'Link to the accounting_template that guided the booking — usage_count auto-increments.' },
            reference_number: { type: 'string' },
          },
          required: ['action'],
          'x-action-required': {
            create: ['description'],
          },
        },
      },
    },
    instructions: `Double-entry bookkeeping. Ensure debits equal credits. Routing rules in order: (1) vendor.default_account_code wins; (2) keyword-match against accounting_templates ordered by usage_count DESC; (3) only fall back to manual account selection if no template scores ≥0.6 and the vendor has no default. Always include template_id and vendor_id in the create payload when known. Locale-specific guidance: ${getActivePack().ai_instructions.journal_entry}`,
  },
  {
    name: 'accounting_reports',
    description: 'Generate financial reports: balance sheet, income statement, general ledger, trial balance, or check for unbooked invoices. Use when: admin asks for financial overview, month-end closing, reconciliation checks. NOT for: creating entries (use manage_journal_entry).',
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
        parameters: {
          type: 'object',
          properties: { action: { type: 'string', enum: ['create', 'list', 'update'] }, template_name: { type: 'string' }, description: { type: 'string' }, category: { type: 'string' }, keywords: { type: 'array', items: { type: 'string' } }, template_lines: { type: 'array' } },
          required: ['action'],
          'x-action-required': {
            create: ['template_name'],
          },
        },
      },
    },
  },
  {
    name: 'manage_opening_balances',
    description: 'Create, list, update, or delete opening balances (IB) for a fiscal year. Use when: admin wants to set initial account balances, migrating from another system, starting a new fiscal year. NOT for: journal entries (use manage_journal_entry), reports (use accounting_reports).',
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
            account_code: { type: 'string', description: 'Required for set/delete — e.g. "1930"' },
            account_name: { type: 'string', description: 'Required for action=set — human-readable name, e.g. "Bankkonto"' },
            amount_cents: { type: 'number' },
            balance_type: { type: 'string', enum: ['debit', 'credit'] },
            locale: { type: 'string', description: 'Chart locale, e.g. se-bas2024' },
          },
          required: ['action'],
          'x-action-required': {
            set: ['account_code', 'account_name', 'amount_cents'],
          },
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
          properties: { action: { type: 'string', enum: ['list', 'add', 'update', 'deactivate'] }, locale: { type: 'string' }, account_code: { type: 'string' }, account_name: { type: 'string' }, account_type: { type: 'string', enum: ['asset', 'liability', 'equity', 'income', 'expense'] }, account_category: { type: 'string' }, normal_balance: { type: 'string', enum: ['debit', 'credit'] }, search: { type: 'string' } },
          required: ['action'],
          'x-action-required': {
            add: ['account_code', 'account_name', 'account_type', 'account_category', 'normal_balance'],
          },
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
  {
    name: 'manage_analytic_account',
    description: 'Create, list, update, or archive analytic accounts (cost centers, projects, departments, campaigns) used to tag journal entries for profitability and per-project reporting. Use when: admin asks to track costs/revenue per project or cost center, set up department budgeting, or analyze campaign ROI. NOT for: actual bookkeeping (use manage_journal_entry), tagging existing entries (use tag_journal_entry_analytics).',
    category: 'commerce',
    handler: 'db:analytic_accounts',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_analytic_account',
        description: 'CRUD for analytic accounts (cost centers / projects / departments / campaigns)',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'get', 'create', 'update', 'delete'] },
            id: { type: 'string', description: 'Required for get/update/delete' },
            code: { type: 'string', description: 'Unique short code, e.g. CC-001' },
            name: { type: 'string' },
            account_type: { type: 'string', enum: ['cost_center', 'project', 'department', 'campaign', 'other'] },
            parent_id: { type: 'string', description: 'Optional parent analytic account for hierarchy' },
            project_id: { type: 'string', description: 'Optional link to a real project' },
            description: { type: 'string' },
            is_active: { type: 'boolean' },
          },
          required: ['action'],
          'x-action-required': {
            create: ['code', 'name'],
          },
        },
      },
    },
    instructions: 'Use cost_center for departments/teams, project for revenue-bearing engagements, campaign for marketing initiatives. Codes should be short and stable (CC-001, PRJ-2026-A). After creating, journal entries can be tagged via tag_journal_entry_analytics.',
  },
  {
    name: 'tag_journal_entry_analytics',
    description: 'Tag an existing journal entry line with one or more analytic accounts to attribute the cost/revenue to projects, cost centers, departments or campaigns. Supports splitting (e.g. 60% Project A / 40% Project B). Use when: a posted entry needs project attribution, monthly cost allocation across departments, retroactive tagging of historical entries. NOT for: creating entries (use manage_journal_entry), creating analytic accounts (use manage_analytic_account).',
    category: 'commerce',
    handler: 'db:analytic_lines',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'tag_journal_entry_analytics',
        description: 'Create analytic_lines that tag a journal_entry_line to one or more analytic accounts',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'create', 'delete'] },
            analytic_account_id: { type: 'string', description: 'Target cost center / project / etc.' },
            journal_entry_id: { type: 'string' },
            journal_entry_line_id: { type: 'string' },
            entry_date: { type: 'string', description: 'YYYY-MM-DD' },
            account_code: { type: 'string', description: 'Source GL account code, e.g. 5910' },
            description: { type: 'string' },
            amount_cents: { type: 'number', description: 'Signed: positive = expense/debit, negative = revenue/credit' },
            currency: { type: 'string', description: 'ISO code, default SEK' },
          },
          required: ['action'],
        },
      },
    },
    instructions: 'For a single 100% tag, create one analytic_line whose amount_cents matches the original JE line (debit positive, credit negative). For splits, create multiple lines that sum to the original amount. Always supply entry_date and account_code from the source JE for accurate reporting.',
  },
  {
    name: 'manage_vendor_defaults',
    description: 'Read or update a vendor\'s auto-coding defaults — `default_account_code` (e.g. 6540 for IT services), `default_vat_code`, `default_description`, `last_used_template_id`. Use when: agent has just booked a vendor invoice and wants to remember the choice for next time, admin onboards a new supplier, OR before booking a vendor invoice (read defaults first). NOT for: actual bookkeeping (use manage_journal_entry).',
    category: 'commerce',
    handler: 'db:vendors',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_vendor_defaults',
        description: 'Get or update a vendor\'s default bookkeeping settings (Visma-style autokontering).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['get', 'update'] },
            id: { type: 'string', description: 'Vendor id (required).' },
            default_account_code: { type: 'string' },
            default_vat_code: { type: 'string' },
            default_description: { type: 'string' },
            last_used_template_id: { type: 'string' },
          },
          required: ['action', 'id'],
        },
      },
    },
    instructions: 'When you book a vendor invoice for the first time without an existing default, ALWAYS call this with action=update afterwards so future invoices auto-route correctly. When you start to book a vendor invoice, call action=get first to see if a default already exists.',
  },
  {
    name: 'record_accounting_correction',
    description: 'Record that a manually-corrected journal entry differed from what was originally booked (auto or by template). This is the learning signal — every call makes the agent smarter for similar future transactions. Use when: a user edits an account_code on an existing JE line, OR the agent itself notices its previous booking was wrong and re-books. NOT for: original bookings (use manage_journal_entry).',
    category: 'commerce',
    handler: 'db:accounting_corrections',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'record_accounting_correction',
        description: 'Append a correction row so the agent can learn from past mistakes.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'list'] },
            journal_entry_id: { type: 'string' },
            vendor_id: { type: 'string' },
            description_pattern: { type: 'string' },
            original_account_code: { type: 'string' },
            corrected_account_code: { type: 'string' },
            original_vat_code: { type: 'string' },
            corrected_vat_code: { type: 'string' },
            reason: { type: 'string' },
            agent_source: { type: 'string', enum: ['openclaw', 'flowpilot', 'manual', 'template'] },
          },
          required: ['action'],
        },
      },
    },
    instructions: 'Before booking a similar transaction (same vendor or similar description), call action=list with vendor_id or description_pattern to fetch prior corrections — these override template defaults.',
  },
  {
    name: 'manage_budget',
    description: 'Set and list per-account budgets (annual or per-month). Use when: planning a fiscal year, setting a cost-centre budget. NOT for: comparing to actuals (budget_vs_actual) or posting entries (manage_journal_entry).',
    category: 'commerce',
    handler: 'rpc:manage_budget',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_budget',
        description: 'List/upsert/delete account budget rows. period_month NULL = annual budget; 1–12 = that month. Upsert is keyed on (account_code, fiscal_year, period_month).',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['list', 'upsert', 'delete'] },
            p_budget_id: { type: 'string', format: 'uuid' },
            p_account_code: { type: 'string' },
            p_fiscal_year: { type: 'number' },
            p_period_month: { type: 'number', description: '1–12, or omit for an annual budget' },
            p_amount_cents: { type: 'number' },
            p_currency: { type: 'string' },
            p_notes: { type: 'string' },
          },
        },
      },
    },
    instructions: 'Budgets are per account_code per fiscal_year, either annual (omit period_month) or monthly (1–12). upsert overwrites the matching row. Pair with budget_vs_actual to report variance.',
  },
  {
    name: 'budget_vs_actual',
    description: 'Budget vs actual variance report per account for a fiscal year (or a single month). Use when: reviewing spend against plan, month-end/year-end variance analysis. NOT for: editing budgets (manage_budget).',
    category: 'commerce',
    handler: 'rpc:budget_vs_actual',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'budget_vs_actual',
        description: 'Per account_code: budget_cents vs actual net movement (Σ debit−credit, non-draft entries) and variance. period_month NULL = full-year against annual budgets.',
        parameters: {
          type: 'object',
          required: ['p_fiscal_year'],
          properties: {
            p_fiscal_year: { type: 'number' },
            p_period_month: { type: 'number', description: '1–12; omit for the annual view' },
          },
        },
      },
    },
    instructions: 'Annual view (omit p_period_month) compares annual budget rows to the whole year; passing a month compares that month\'s budget rows to that month\'s actuals. Actuals exclude draft journal entries. variance_cents = budget − actual.',
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
  processes: ['quote-to-cash', 'procure-to-pay', 'record-to-report'],
  maturity: 'L3',
  description: 'Double-entry bookkeeping with pluggable locale packs (chart of accounts, VAT rules, payroll, bank import). Default: BAS 2024 (Sweden); also supports IFRS-generic. Add new market packs in src/lib/locale-packs/.',
  capabilities: ['data:write', 'data:read'],
  tier: 'standard',
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
    'manage_analytic_account',
    'tag_journal_entry_analytics',
    'manage_vendor_defaults',
    'record_accounting_correction',
    'year_end_readiness',
    'run_year_end',
    'list_voucher_gaps',
    'explain_voucher_gap',
    'propose_accruals',
    'manage_budget',
    'budget_vs_actual',
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
