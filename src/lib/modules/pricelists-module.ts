/**
 * Pricelists Module — Odoo-style versioned pricing.
 *
 * Lets sales/admin define per-customer or per-company pricelists with date validity,
 * fixed prices or discount percentages. Used by quote/invoice creation flows via
 * the SQL function `resolve_pricelist_price`.
 */

import { defineModule } from '@/lib/module-def';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import type { SkillSeed } from '@/lib/module-bootstrap';

const inputSchema = z.object({
  action: z.enum(['resolve_price', 'list', 'list_items']),
  product_id: z.string().uuid().optional(),
  lead_id: z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
  quantity: z.number().optional(),
  pricelist_id: z.string().uuid().optional(),
});
const outputSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  message: z.string().optional(),
});
type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

const SKILLS: SkillSeed[] = [
  {
    name: 'manage_pricelist',
    description:
      'CRUD for versioned pricelists (per customer/company/period). Use when: setting up customer-specific pricing, seasonal discounts, or volume-based tiers. NOT for: applying prices to a quote line (use resolve_pricelist_price) or editing the product base price (use manage_product).',
    category: 'commerce',
    handler: 'db:pricelists',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_pricelist',
        description: 'Create, list, update, or delete versioned pricelists',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'list', 'get', 'update', 'delete'] },
            id: { type: 'string', description: 'Pricelist UUID (required for get/update/delete)' },
            name: { type: 'string' },
            description: { type: 'string' },
            currency: { type: 'string', description: 'ISO currency, defaults to SEK' },
            valid_from: { type: 'string', description: 'YYYY-MM-DD start of validity' },
            valid_until: { type: 'string', description: 'YYYY-MM-DD end of validity' },
            company_id: { type: 'string', description: 'Optional — restrict to one company' },
            lead_id: { type: 'string', description: 'Optional — restrict to one lead/customer' },
            is_default: { type: 'boolean' },
            priority: { type: 'number', description: 'Lower = higher priority when multiple match (default 100)' },
            is_active: { type: 'boolean' },
            segment: { type: 'string', description: 'Optional customer segment — matches companies.tags (e.g. "vip", "wholesale")' },
            country: { type: 'string', description: 'Optional ISO-2 country — matches companies.country' },
          },
          required: ['action'],
          'x-action-required': { create: ['name'] },
        },
      },
    },
    instructions:
      'Workflow: 1) create pricelist with optional company_id or lead_id (both null = global). 2) Use manage_pricelist_item to add per-product prices or discount %. 3) resolve_pricelist_price returns the best applicable price for a product+customer+date.',
  },
  {
    name: 'manage_pricelist_item',
    description:
      'Add/remove/update line items in a pricelist (product → fixed price or discount %). Use when: populating a pricelist after creating it. NOT for: creating the pricelist itself (use manage_pricelist).',
    category: 'commerce',
    handler: 'db:pricelist_items',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_pricelist_item',
        description: 'CRUD for pricelist line items',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'list', 'update', 'delete'] },
            id: { type: 'string' },
            pricelist_id: { type: 'string' },
            product_id: { type: 'string', description: 'Optional — null = applies to all products in pricelist' },
            fixed_price_cents: { type: 'integer', description: 'Use either this OR discount_pct OR formula_base' },
            discount_pct: { type: 'number', description: '0–100 percent off product base price' },
            formula_base: { type: 'string', enum: ['cost', 'list'], description: 'Formula pricing: compute from product cost_cents or list price' },
            margin_pct: { type: 'number', description: 'Formula: margin % on top of the base (e.g. 40 = base × 1.4)' },
            surcharge_cents: { type: 'integer', description: 'Formula: fixed surcharge added after margin' },
            rounding_cents: { type: 'integer', description: 'Formula: round the result to the nearest N cents (e.g. 100 = whole kronor)' },
            min_quantity: { type: 'number', description: 'Minimum qty for this rule to apply (default 1)' },
            days_of_week: { type: 'array', items: { type: 'integer' }, description: 'Time-based rule: ISO weekdays 1(Mon)–7(Sun) when the rule applies' },
            time_start: { type: 'string', description: 'Time-based rule: HH:MM start of the daily window (requires time_end)' },
            time_end: { type: 'string', description: 'Time-based rule: HH:MM end of the daily window' },
            notes: { type: 'string' },
          },
          required: ['action'],
          'x-action-required': { create: ['pricelist_id'] },
        },
      },
    },
  },
  {
    name: 'resolve_pricelist_price',
    description:
      'Returns the best applicable price for a product given an optional lead/company and quantity. Use when: building a quote/invoice line and wanting customer-specific pricing. NOT for: editing pricelists (use manage_pricelist).',
    category: 'commerce',
    handler: 'rpc:resolve_pricelist_price',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'resolve_pricelist_price',
        description: 'Look up best matching pricelist price for product/customer/date',
        parameters: {
          type: 'object',
          properties: {
            product_id: { type: 'string' },
            lead_id: { type: 'string' },
            company_id: { type: 'string' },
            quantity: { type: 'number', default: 1 },
            currency: { type: 'string', default: 'SEK' },
            at: { type: 'string', description: 'YYYY-MM-DD resolution date (default today)' },
            at_time: { type: 'string', description: 'HH:MM wall-clock time for time-window rules (defaults to now when resolving for today)' },
          },
          required: ['product_id'],
        },
      },
    },
    instructions:
      'Returns { price_cents, pricelist_id, pricelist_name, source }. source="pricelist" when matched, "product_base" when falling back to product.price_cents. Resolution honors segment/country pricelists (via the lead\'s company tags/country), qty tiers (deepest break wins), time-window rules (days_of_week/time_start), and formula (cost+margin) items.',
  },
  {
    name: 'resolve_vendor_price',
    description:
      'Returns the best supplier/vendor purchase price for a product+quantity from vendor_products. The DEEPEST qualifying quantity tier wins (60 kg break beats the 1-unit price), within the product\'s preferred vendor when it has one; the price comes back in the vendor\'s own currency. Use when: choosing a vendor for a purchase order, checking replenishment cost, pricing a reorder. NOT for: customer sales prices (use resolve_pricelist_price).',
    category: 'commerce',
    handler: 'rpc:resolve_vendor_price',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'resolve_vendor_price',
        description: 'Best valid vendor price for a product/quantity/date, with alternatives per vendor.',
        parameters: {
          type: 'object',
          required: ['p_product_id'],
          properties: {
            p_product_id: { type: 'string', format: 'uuid' },
            p_quantity: { type: 'number', default: 1 },
            p_vendor_id: { type: 'string', format: 'uuid', description: 'Restrict to one vendor' },
            p_at: { type: 'string', description: 'YYYY-MM-DD (default today)' },
          },
        },
      },
    },
    instructions:
      'Ordering, in this order: the preferred VENDOR of the product first (its one is_preferred row names it, and its qty tiers are honoured through it), then the deepest qualifying price_tier_min_qty, then the lowest price. Same rule as Odoo\'s supplierinfo (_order = sequence, min_qty DESC, price). tier_min_qty in the answer tells you which break was used — if it says 1 for a large quantity, no deeper tier is on file. `unit_price_cents` is in `currency`, which is the vendor\'s, not necessarily the books\'. Returns success:false with reason no_vendor_price when nothing matches — add a vendor price via manage_vendor_price.',
  },
  {
    name: 'manage_vendor_price',
    description:
      'CRUD for supplier/vendor pricelist rows (vendor_products): per-vendor product prices with validity dates, qty tiers, lead time and MOQ. Use when: recording a negotiated purchase price or supplier price change. NOT for: customer pricelists (manage_pricelist) or vendor master data (manage_vendor).',
    category: 'commerce',
    handler: 'rpc:manage_vendor_price',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_vendor_price',
        description: 'create/update/list/delete vendor price rows. Multiple rows per vendor+product = qty tiers (p_price_tier_min_qty).',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['create', 'update', 'list', 'delete'] },
            p_id: { type: 'string', format: 'uuid', description: 'Row id (update/delete)' },
            p_vendor_id: { type: 'string', format: 'uuid' },
            p_product_id: { type: 'string', format: 'uuid' },
            p_unit_price_cents: { type: 'integer' },
            p_currency: { type: 'string', description: "ISO code. Omit to take the vendor's own currency — never assume the instance's." },
            p_lead_time_days: { type: 'integer' },
            p_min_order_quantity: { type: 'integer' },
            p_price_tier_min_qty: { type: 'integer', description: 'Qty break this price applies from (default 1). A second row for the same vendor+product with a higher break IS the qty tier.' },
            p_vendor_sku: { type: 'string' },
            p_is_preferred: { type: 'boolean' },
            p_valid_from: { type: 'string', description: 'YYYY-MM-DD' },
            p_valid_until: { type: 'string', description: 'YYYY-MM-DD' },
            p_notes: { type: 'string' },
          },
        },
      },
    },
    instructions:
      'A qty tier is simply a SECOND row for the same vendor+product with a higher p_price_tier_min_qty (e.g. 1 → 18.50, 60 → 17.50); resolve_vendor_price then uses the deepest row the ordered quantity qualifies for. Leave p_price_tier_min_qty out for the base row — it defaults to 1. p_is_preferred marks the preferred VENDOR and only ONE row per product may carry it, so tier rows of that same vendor are created with p_is_preferred false; they still win through the vendor preference. create is an upsert on (vendor, product, tier): calling it again with a new price updates that tier instead of failing. Omit p_currency and the row takes the vendor\'s currency.',
  },
  {
    name: 'get_pricelist_history',
    description:
      'Version history for pricelists: every create/update/delete of a pricelist or its items is captured as a revision snapshot. Use when: auditing who changed a price and when, or reviewing how a pricelist evolved. NOT for: current prices (resolve_pricelist_price).',
    category: 'commerce',
    handler: 'rpc:get_pricelist_history',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'get_pricelist_history',
        description: 'List revision snapshots (pricelists + pricelist_items), newest first.',
        parameters: {
          type: 'object',
          properties: {
            p_pricelist_id: { type: 'string', format: 'uuid', description: 'Filter to one pricelist (omit for all)' },
            p_limit: { type: 'integer', default: 50, description: 'Max 200' },
          },
        },
      },
    },
  },
];

export const pricelistsModule = defineModule<Input, Output>({
  id: 'pricelists' as any,
  name: 'Pricelists',
  version: '1.0.0',
  processes: ['quote-to-cash', 'order-to-delivery'],
  maturity: 'L4',
  description:
    'Versioned pricing per customer, company, segment, country, or period — Odoo-style price lists with fixed prices, discount %, formula (cost+margin) rules, qty tiers, and time-window rules. Resolves the best applicable price for any product+customer+date, applies to POS sales and subscriptions, resolves supplier prices from vendor pricelists, and keeps a full revision history.',
  capabilities: ['data:read', 'data:write'],
  tier: 'extended',
  inputSchema,
  outputSchema,
  skills: ['manage_pricelist', 'manage_pricelist_item', 'resolve_pricelist_price', 'resolve_vendor_price', 'manage_vendor_price', 'get_pricelist_history'],
  skillSeeds: SKILLS,
  data: {
    // children first (FK-safe order)
    tables: ['pricelist_items', 'pricelists'],
  },
  async publish(input: Input): Promise<Output> {
    const v = inputSchema.parse(input);
    if (v.action === 'resolve_price' && v.product_id) {
      const { data, error } = await supabase.rpc('resolve_pricelist_price', {
        p_product_id: v.product_id,
        p_lead_id: v.lead_id ?? null,
        p_company_id: v.company_id ?? null,
        p_quantity: v.quantity ?? 1,
      });
      if (error) return { success: false, message: error.message };
      return { success: true, data };
    }
    logger.log('[pricelists] action:', v.action);
    return { success: true };
  },
});
