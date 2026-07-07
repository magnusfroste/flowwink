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
    name: 'propose_annual_depreciation',
    description: 'Compute proposed annual depreciation for all active fixed assets (straight_line and declining). Returns one proposal per asset with account codes and amount. Use when: running year-end close. NOT for: monthly depreciation (run_monthly_depreciation) or registering an asset (register_fixed_asset).',
    category: 'commerce',
    handler: 'rpc:propose_annual_depreciation',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {"type":"function","function":{"name":"propose_annual_depreciation","parameters":{"type":"object","required":["p_year"],"properties":{"p_year":{"type":"integer","description":"Fiscal year, e.g. 2025"}}},"description":"Compute proposed annual depreciation for all active fixed assets."}} as SkillSeed['tool_definition'],
  },
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
  {
    name: 'revalue_fixed_asset',
    description:
      'Impair or revalue a fixed asset to a new value (nedskrivning/återföring). Below NBV posts an impairment loss (Dt 7720 / Cr accumulated); above NBV reverses prior depreciation/impairment (Dt accumulated / Cr 7788), capped at original cost. Use when: an asset lost value (damage, obsolescence) or a prior impairment no longer applies. NOT for: normal periodic depreciation (run_monthly_depreciation) or selling the asset (dispose_fixed_asset).',
    category: 'commerce',
    handler: 'rpc:revalue_fixed_asset',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'revalue_fixed_asset',
        description: 'Post an impairment or impairment-reversal journal entry and adjust the asset NBV.',
        parameters: {
          type: 'object',
          properties: {
            asset_id: { type: 'string', description: 'UUID of the fixed_assets row. REQUIRED.' },
            new_value_cents: { type: 'integer', description: 'Target net book value in cents. REQUIRED.' },
            reason: { type: 'string', description: 'Why the asset is being revalued.' },
            revaluation_date: { type: 'string', description: 'YYYY-MM-DD. Defaults today.' },
            impairment_account: { type: 'string', default: '7720' },
            reversal_account: { type: 'string', default: '7788' },
          },
          required: ['asset_id', 'new_value_cents'],
        },
      },
    },
    instructions: 'Response kind tells you what was posted: impairment (value below NBV) or reversal. Revaluing above original cost is rejected. History lands in asset_revaluations.',
  },
  {
    name: 'post_manual_depreciation',
    description:
      'Post a manual depreciation adjustment for one asset outside the monthly sweep (catch-up after a missed period, correction, accelerated write-down). Use when: the computed schedule needs a one-off override. NOT for: regular monthly posting (run_monthly_depreciation) or value changes from impairment (revalue_fixed_asset).',
    category: 'commerce',
    handler: 'rpc:post_manual_depreciation',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'post_manual_depreciation',
        description: 'Post an extra depreciation amount + journal entry for one asset (flagged is_manual).',
        parameters: {
          type: 'object',
          properties: {
            asset_id: { type: 'string', description: 'UUID of the fixed_assets row. REQUIRED.' },
            amount_cents: { type: 'integer', description: 'Depreciation amount in cents (>0). REQUIRED.' },
            period_date: { type: 'string', description: 'YYYY-MM-DD the adjustment belongs to. Defaults today.' },
            reason: { type: 'string', description: 'Why the manual adjustment is needed.' },
          },
          required: ['asset_id', 'amount_cents'],
        },
      },
    },
    instructions: 'Rejected when the amount would take NBV below salvage value — the error echoes the remaining depreciable base.',
  },
  {
    name: 'post_units_depreciation',
    description:
      'Post usage-based depreciation for a units_of_production asset: amount = (cost − salvage) × units / total_expected_units. Use when: recording a period\'s machine-hours/units for a UOP asset. NOT for: calendar-based assets (run_monthly_depreciation handles those; the monthly sweep skips UOP assets).',
    category: 'commerce',
    handler: 'rpc:post_units_depreciation',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'post_units_depreciation',
        description: 'Depreciate a units_of_production asset by actual units used this period.',
        parameters: {
          type: 'object',
          properties: {
            asset_id: { type: 'string', description: 'UUID of a fixed asset with depreciation_method=units_of_production. REQUIRED.' },
            units: { type: 'integer', description: 'Units produced/hours run this period (>0). REQUIRED.' },
            period_date: { type: 'string', description: 'YYYY-MM-DD. Defaults today.' },
            notes: { type: 'string' },
          },
          required: ['asset_id', 'units'],
        },
      },
    },
    instructions: 'The asset needs total_expected_units set first (update_fixed_asset). Amount is capped at the remaining depreciable base.',
  },
  {
    name: 'update_fixed_asset',
    description:
      'Update fixed-asset metadata: name, description, physical location, parent asset (component tracking — e.g. an engine as a component of a machine) and total expected units for UOP depreciation. Use when: an asset moves, is renamed, or should be linked as a component. NOT for: financial changes (revalue_fixed_asset, dispose_fixed_asset).',
    category: 'commerce',
    handler: 'rpc:update_fixed_asset',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'update_fixed_asset',
        description: 'Partial update of a fixed asset (only supplied fields change). Returns the asset incl. its component children.',
        parameters: {
          type: 'object',
          properties: {
            asset_id: { type: 'string', description: 'UUID of the fixed_assets row. REQUIRED.' },
            name: { type: 'string' },
            description: { type: 'string' },
            location: { type: 'string', description: 'Physical location, e.g. "HQ Stockholm — Floor 2".' },
            parent_asset_id: { type: 'string', description: 'UUID of the parent asset (self-parent rejected).' },
            total_expected_units: { type: 'integer', description: 'Lifetime units for units_of_production depreciation.' },
          },
          required: ['asset_id'],
        },
      },
    },
  },
  {
    name: 'get_depreciation_schedule',
    description:
      'Forward-looking depreciation schedule report: simulates each remaining month per asset (straight-line, declining, sum-of-years; UOP estimated as even spread) with amount, accumulated and NBV. Use when: "show the depreciation plan", audit prep, budgeting future depreciation. NOT for: posting anything (read-only) or past entries (query depreciation_entries).',
    category: 'analytics',
    handler: 'rpc:get_depreciation_schedule',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'get_depreciation_schedule',
        description: 'Compute the remaining monthly depreciation schedule for one asset or all active assets.',
        parameters: {
          type: 'object',
          properties: {
            asset_id: { type: 'string', description: 'UUID of one asset. Omit for all non-disposed assets.' },
            months: { type: 'integer', description: 'Max months to project (default 120, cap 600).' },
          },
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
  processes: ['record-to-report', 'acquire-to-retire'],
  maturity: 'L3',
  description:
    'Capitalize equipment, run monthly depreciation, and post disposals — all to BAS 2024 accounts (1210/1219/7832 + 3970/7970).',
  requires: ['accounting'],
  capabilities: ['data:read', 'data:write'],
  tier: 'extended',
  inputSchema,
  outputSchema,
  skills: [
    'register_fixed_asset', 'run_monthly_depreciation', 'dispose_fixed_asset', 'propose_annual_depreciation',
    'revalue_fixed_asset', 'post_manual_depreciation', 'post_units_depreciation',
    'update_fixed_asset', 'get_depreciation_schedule',
  ],
  data: {
    tables: ['depreciation_entries', 'fixed_assets', 'asset_revaluations'],
  },
  skillSeeds: SKILLS,
  automations: AUTOMATIONS,
  async publish(input: Input): Promise<Output> {
    return { success: true, result: { action: input.action } };
  },
});
