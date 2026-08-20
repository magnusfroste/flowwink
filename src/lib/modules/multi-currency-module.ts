/**
 * Multi-Currency Module — Unified Definition
 *
 * Three optional layers:
 *  L1 Display     — currency + exchange_rate columns on transactional tables
 *  L2 Daily FX    — currencies + exchange_rates tables, ECB cron, set_exchange_rate
 *  L3 Revaluation — revalue_open_balances posts FX gain/loss to BAS 3960/7960
 *
 * All layers ship enabled together when the module is on; each can be ignored
 * by simply not using the UI/skill.
 */

import { z } from 'zod';
import { defineModule } from '@/lib/module-def';
import type { SkillSeed, AutomationSeed } from '@/lib/module-bootstrap';

const inputSchema = z.object({
  action: z.enum(['get_rate', 'set_rate', 'fetch_ecb', 'revalue', 'list_currencies']),
  base_currency: z.string().optional(),
  quote_currency: z.string().optional(),
  rate: z.number().optional(),
  rate_date: z.string().optional(),
});

const outputSchema = z.object({
  success: z.boolean(),
  result: z.unknown().optional(),
  error: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

const SKILLS: SkillSeed[] = [
  {
    name: 'set_exchange_rate',
    description:
      'Manually set or override an exchange rate for a base→quote pair on a given date. Use when: admin enters a custom rate, locking a contract rate, fixing a bad ECB pull. NOT for: automatic daily ECB fetch (handled by fetch_ecb_rates cron) or for converting amounts inline.',
    category: 'commerce',
    handler: 'rpc:mcp_set_exchange_rate',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'set_exchange_rate',
        description: 'Insert or update an exchange rate row in exchange_rates.',
        parameters: {
          type: 'object',
          properties: {
            base_currency: { type: 'string', description: 'ISO code (e.g. EUR)' },
            quote_currency: { type: 'string', description: 'ISO code (e.g. SEK)' },
            rate: { type: 'number', description: 'How many quote per 1 base.' },
            rate_date: { type: 'string', description: 'YYYY-MM-DD. Defaults to today.' },
            source: { type: 'string', enum: ['manual', 'ecb', 'riksbank'], default: 'manual' },
          },
          required: ['base_currency', 'quote_currency', 'rate'],
        },
      },
    },
  },
  {
    name: 'fetch_ecb_rates',
    description:
      'Pull the latest daily exchange rates from the European Central Bank reference feed and upsert them into exchange_rates. Use when: scheduled daily refresh, admin clicks "Refresh rates now". Idempotent.',
    category: 'commerce',
    handler: 'internal:fetch_ecb_rates',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'fetch_ecb_rates',
        description: 'Fetch and upsert ECB daily reference rates.',
        parameters: { type: 'object', properties: {} },
      },
    },
  },
  {
    name: 'revalue_open_balances',
    description:
      'Compute unrealized FX gain/loss on all open AR (invoices) and AP (purchase orders) in non-base currencies, then post a single journal entry per BAS 2024 (Dt/Cr 3960 gain / 7960 loss vs 1510 AR / 2440 AP). Use when: month-end close, before generating period reports. NOT for: realized FX on payments (handled by payment booking).',
    category: 'commerce',
    handler: 'rpc:mcp_revalue_open_balances',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'revalue_open_balances',
        description: 'Post FX revaluation journal entry for open AR/AP.',
        parameters: {
          type: 'object',
          properties: {
            revaluation_date: { type: 'string', description: 'YYYY-MM-DD. Defaults to today.' },
            fx_gain_account: { type: 'string', default: '3960' },
            fx_loss_account: { type: 'string', default: '7960' },
            ar_account: { type: 'string', default: '1510' },
            ap_account: { type: 'string', default: '2440' },
          },
        },
      },
    },
    instructions:
      'Run on the last day of each accounting period before close_accounting_period. Idempotent per date — re-running creates a new JE if rates have changed since last run.',
  },
  {
    name: 'import_exchange_rates',
    description:
      'Bulk import historical exchange rates (upsert per base/quote/date). Use when: backfilling rate history before revaluation, migrating from another system, loading a year of ECB/Riksbank data. NOT for: a single rate (set_exchange_rate) or the daily automatic fetch (fetch_ecb_rates).',
    category: 'commerce',
    handler: 'rpc:import_exchange_rates',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'import_exchange_rates',
        description: 'Upsert an array of rate rows into exchange_rates. Invalid rows are skipped and reported.',
        parameters: {
          type: 'object',
          required: ['p_rates'],
          properties: {
            p_rates: {
              type: 'array',
              description: 'Array of { base_currency, quote_currency, rate, rate_date (YYYY-MM-DD), source? }',
              items: {
                type: 'object',
                properties: {
                  base_currency: { type: 'string' },
                  quote_currency: { type: 'string' },
                  rate: { type: 'number' },
                  rate_date: { type: 'string' },
                  source: { type: 'string' },
                },
              },
            },
            p_source: { type: 'string', default: 'import', description: 'Default source label for rows without one' },
          },
        },
      },
    },
    instructions:
      'Each row needs base_currency, quote_currency, rate (>0) and rate_date. Existing rows for the same pair+date are overwritten. Returns imported/skipped counts plus the first 5 row errors.',
  },
  {
    name: 'manage_fx_forward',
    description:
      'Hedging: manage FX forward contracts — create, list, mark-to-market against the latest spot, settle (posts realized gain/loss to BAS 3960/7960), cancel. Use when: locking a future currency exchange rate, valuing open hedges at month-end, settling a matured forward. NOT for: spot rate entry (set_exchange_rate) or AR/AP revaluation (revalue_open_balances).',
    category: 'commerce',
    handler: 'rpc:manage_fx_forward',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_fx_forward',
        description: 'create/list/get/settle/cancel/mark_to_market FX forward contracts. amount_cents is in the base (bought/sold) currency; gains are in quote-currency cents.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['create', 'list', 'get', 'settle', 'cancel', 'mark_to_market'] },
            p_contract_id: { type: 'string', format: 'uuid' },
            p_direction: { type: 'string', enum: ['buy', 'sell'], description: 'buy = we buy the base currency at the forward rate' },
            p_base_currency: { type: 'string', description: 'Currency being bought/sold (e.g. USD)' },
            p_quote_currency: { type: 'string', default: 'SEK' },
            p_amount_cents: { type: 'integer', description: 'Notional in base-currency cents' },
            p_forward_rate: { type: 'number' },
            p_value_date: { type: 'string', description: 'YYYY-MM-DD maturity' },
            p_counterparty: { type: 'string' },
            p_settled_rate: { type: 'number', description: 'settle: actual spot; defaults to the stored rate on the value date' },
            p_contract_ref: { type: 'string' },
            p_notes: { type: 'string' },
          },
        },
      },
    },
    instructions:
      'settle books the realized gain/loss journal (gain: Dt 1930 / Cr 3960; loss: Dt 7960 / Cr 1930) and stamps the contract. mark_to_market is read-only and returns unrealized gain per open contract using the latest spot from exchange_rates.',
  },
  {
    name: 'manage_subsidiary',
    description:
      'Manage subsidiaries (local-currency entities) and tag journal entries to a subsidiary ledger. Use when: setting up a foreign subsidiary, booking an entry into its local-currency ledger. NOT for: consolidated reporting (consolidation_report) or reading a ledger (subsidiary_ledger_report).',
    category: 'commerce',
    handler: 'rpc:manage_subsidiary',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_subsidiary',
        description: 'create/list/update/tag_entry subsidiaries. Journal lines on a subsidiary-tagged entry are denominated in that subsidiary\'s local currency.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['create', 'list', 'update', 'tag_entry'] },
            p_subsidiary_id: { type: 'string', format: 'uuid' },
            p_code: { type: 'string', description: 'Short unique code, e.g. "DE01" (usable instead of the id)' },
            p_name: { type: 'string' },
            p_currency: { type: 'string', description: 'Functional/local currency ISO code' },
            p_country: { type: 'string' },
            p_notes: { type: 'string' },
            p_is_active: { type: 'boolean' },
            p_journal_entry_id: { type: 'string', format: 'uuid', description: 'tag_entry: journal entry to assign to the subsidiary ledger' },
          },
        },
      },
    },
  },
  {
    name: 'subsidiary_ledger_report',
    description:
      'Per-account ledger totals for one subsidiary in its local currency (posted journal entries tagged to it). Use when: reviewing a subsidiary\'s books, preparing local statutory reporting. NOT for: group consolidation (consolidation_report).',
    category: 'commerce',
    handler: 'rpc:subsidiary_ledger_report',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'subsidiary_ledger_report',
        description: 'Debit/credit/net per account for a subsidiary, optional date range. Amounts are local currency.',
        parameters: {
          type: 'object',
          required: ['p_subsidiary_code'],
          properties: {
            p_subsidiary_code: { type: 'string' },
            p_from: { type: 'string', description: 'YYYY-MM-DD' },
            p_to: { type: 'string', description: 'YYYY-MM-DD' },
          },
        },
      },
    },
  },
  {
    name: 'consolidation_report',
    description:
      'Group consolidation with currency translation: translates each entity\'s trial balance (HQ base ledger + every active subsidiary) into a presentation currency at the closing rate. Use when: month/year-end group reporting across currencies. NOT for: single-entity ledgers (subsidiary_ledger_report) or FX revaluation postings (revalue_open_balances).',
    category: 'commerce',
    handler: 'rpc:consolidation_report',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'consolidation_report',
        description: 'Closing-rate translation of per-account nets for HQ + subsidiaries into one presentation currency.',
        parameters: {
          type: 'object',
          properties: {
            p_presentation_currency: { type: 'string', description: 'Defaults to the base currency' },
            p_as_of: { type: 'string', description: 'YYYY-MM-DD closing date (default today)' },
          },
        },
      },
    },
    instructions:
      'Uses fx_rate_at (latest stored rate on/before the closing date, inverse pairs supported). Entities whose rate is missing are listed in missing_rates with untranslated amounts — import rates first (import_exchange_rates).',
  },
];

const AUTOMATIONS: AutomationSeed[] = [
  {
    name: 'fetch-fx-rates-daily',
    description: 'Pull ECB daily reference rates each morning at 06:15 UTC.',
    trigger_type: 'cron',
    trigger_config: { cron: '15 6 * * *' },
    skill_name: 'fetch_ecb_rates',
    skill_arguments: {},
  },
];

export const multiCurrencyModule = defineModule<Input, Output>({
  id: 'multiCurrency',
  name: 'Multi-Currency',
  version: '1.0.0',
  processes: ['quote-to-cash', 'record-to-report'],
  maturity: 'L4',
  description:
    'Sell and bill in multiple currencies with daily ECB rates, bulk historical rate import, FX revaluation of open AR/AP, realized FX on payment, FX forward contracts (hedging with mark-to-market and settlement postings), local-currency subsidiary ledgers, and group consolidation with closing-rate currency translation.',
  capabilities: ['data:read', 'data:write'],
  tier: 'standard',
  inputSchema,
  outputSchema,
  skills: ['set_exchange_rate', 'fetch_ecb_rates', 'revalue_open_balances', 'import_exchange_rates', 'manage_fx_forward', 'manage_subsidiary', 'subsidiary_ledger_report', 'consolidation_report'],
  data: {
    tables: ['exchange_rates', 'currencies', 'fx_forward_contracts', 'subsidiaries'],
  },
  skillSeeds: SKILLS,
  automations: AUTOMATIONS,
  async publish(input: Input): Promise<Output> {
    return { success: true, result: { action: input.action } };
  },
});
