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
      'Manually set or override an exchange rate for a base→quote pair on a given date. Use when: admin enters a custom rate, locking a contract rate, fixing a bad ECB pull. NOT for: automatic daily ECB fetch (handled by fetch_ecb_rates cron) or for converting amounts inline (use get_exchange_rate).',
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
    handler: 'edge:fetch-fx-rates',
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
  maturity: 'L2',
  description:
    'Sell and bill in multiple currencies with daily ECB rates and FX revaluation of open AR/AP.',
  capabilities: ['data:read', 'data:write'],
  tier: 'standard',
  inputSchema,
  outputSchema,
  skills: ['set_exchange_rate', 'fetch_ecb_rates', 'revalue_open_balances'],
  data: {
    tables: ['exchange_rates', 'currencies'],
  },
  skillSeeds: SKILLS,
  automations: AUTOMATIONS,
  async publish(input: Input): Promise<Output> {
    return { success: true, result: { action: input.action } };
  },
});
