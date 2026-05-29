/**
 * Fixed Assets Module
 *
 * Track property/equipment, run monthly depreciation, dispose at end-of-life.
 * Posts journal entries per BAS 2024:
 *  - Acquisition: Dt 1210 (asset) / Cr 1930 (bank) — overridable
 *  - Monthly depr: Dt 7832 (depreciation expense) / Cr 1219 (accumulated)
 *  - Disposal: reverse cost + accum, Dt 1930 proceeds, Dt/Cr 7970/3970 loss/gain
 */

import { z } from 'zod';
import { defineModule } from '@/lib/module-def';
import type { SkillSeed, AutomationSeed } from '@/lib/module-bootstrap';

const inputSchema = z.object({
  action: z.enum(['register', 'depreciate', 'dispose', 'list']),
});
const outputSchema = z.object({ success: z.boolean(), result: z.unknown().optional() });
type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

const SKILLS: SkillSeed[] = [
  {
    name: 'register_fixed_asset',
    description:
      'Register a new fixed asset (equipment, furniture, vehicles, IT) and post the acquisition journal entry. Use when: a new piece of equipment is purchased and capitalized rather than expensed. NOT for: small consumables (use expenses), software subscriptions (use bills), or intangibles (separate flow).',
    category: 'commerce',
    handler: 'rpc:mcp_register_fixed_asset',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'register_fixed_asset',
        description: 'Create a fixed_assets row + acquisition journal entry.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Asset name (e.g. "MacBook Pro 16 — Anna").' },
            description: { type: 'string' },
            cost_cents: { type: 'integer', description: 'Acquisition cost in cents (excl VAT).' },
            useful_life_months: { type: 'integer', description: 'Depreciation period in months. 36–60 typical for IT, 60–84 for furniture.' },
            purchase_date: { type: 'string', description: 'YYYY-MM-DD. Defaults today.' },
            in_service_date: { type: 'string', description: 'YYYY-MM-DD. Defaults to purchase_date. Depreciation only starts after this date.' },
            salvage_cents: { type: 'integer', description: 'Residual value in cents. Default 0.' },
            depreciation_method: { type: 'string', enum: ['straight_line', 'declining'], default: 'straight_line' },
            declining_rate: { type: 'number', description: 'Annual declining-balance rate (e.g. 0.30 = 30%/yr). Required only when method=declining.' },
            asset_account: { type: 'string', default: '1210' },
            depreciation_account: { type: 'string', default: '7832' },
            accumulated_account: { type: 'string', default: '1219' },
            credit_account: { type: 'string', default: '1930', description: 'Counter-account for the acquisition (1930 bank, or 2440 if vendor bill).' },
            create_journal_entry: { type: 'boolean', default: true },
          },
          required: ['name', 'cost_cents', 'useful_life_months'],
        },
      },
    },
  },
  {
    name: 'run_monthly_depreciation',
    description:
      'Compute and post depreciation for one accounting month across all active fixed assets. Idempotent per (asset, period) — re-running the same period skips already-booked assets. Use when: month-end close, before generating P&L. Auto-marks assets as fully_depreciated when NBV reaches salvage value.',
    category: 'commerce',
    handler: 'rpc:mcp_run_monthly_depreciation',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'run_monthly_depreciation',
        description: 'Post one month of depreciation across all active assets.',
        parameters: {
          type: 'object',
          properties: {
            period_date: { type: 'string', description: 'YYYY-MM-DD anywhere in the target month. Defaults to current month.' },
          },
        },
      },
    },
  },
  {
    name: 'dispose_fixed_asset',
    description:
      'Dispose of a fixed asset (sale, scrap, write-off). Reverses cost + accumulated depreciation, books any sale proceeds, and posts gain (3970) or loss (7970) on disposal. Use when: an asset is sold, retired, stolen, or destroyed. NOT for: temporary out-of-service (mark idle in UI instead).',
    category: 'commerce',
    handler: 'rpc:mcp_dispose_fixed_asset',
    scope: 'internal',
    trust_level: 'approve',
    tool_definition: {
      type: 'function',
      function: {
        name: 'dispose_fixed_asset',
        description: 'Retire or sell a fixed asset and post the disposal entry.',
        parameters: {
          type: 'object',
          properties: {
            asset_id: { type: 'string', description: 'UUID of the fixed_assets row.' },
            sale_amount_cents: { type: 'integer', description: 'Sale proceeds in cents. 0 for scrap/write-off.', default: 0 },
            disposal_date: { type: 'string', description: 'YYYY-MM-DD. Defaults today.' },
            proceeds_account: { type: 'string', default: '1930' },
            gain_account: { type: 'string', default: '3970' },
            loss_account: { type: 'string', default: '7970' },
          },
          required: ['asset_id'],
        },
      },
    },
  },
];

const AUTOMATIONS: AutomationSeed[] = [
  {
    name: 'fixed-assets-monthly-depreciation',
    description: 'Post monthly depreciation across all active fixed assets on the 1st of each month at 03:00 UTC.',
    trigger_type: 'cron',
    trigger_config: { cron: '0 3 1 * *' },
    skill_name: 'run_monthly_depreciation',
    skill_arguments: {},
  },
];

export const fixedAssetsModule = defineModule<Input, Output>({
  id: 'fixedAssets',
  name: 'Fixed Assets',
  version: '1.0.0',
  processes: ['record-to-report'],
  maturity: 'L3',
  description:
    'Capitalize equipment, run monthly depreciation, and post disposals — all to BAS 2024 accounts (1210/1219/7832 + 3970/7970).',
  requires: ['accounting'],
  capabilities: ['data:read', 'data:write'],
  inputSchema,
  outputSchema,
  skills: ['register_fixed_asset', 'run_monthly_depreciation', 'dispose_fixed_asset', 'propose_annual_depreciation'],
  skillSeeds: SKILLS,
  automations: AUTOMATIONS,
  async publish(input: Input): Promise<Output> {
    return { success: true, result: { action: input.action } };
  },
});
