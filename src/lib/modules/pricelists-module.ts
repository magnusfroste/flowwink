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
            fixed_price_cents: { type: 'integer', description: 'Use either this OR discount_pct' },
            discount_pct: { type: 'number', description: '0–100 percent off product base price' },
            min_quantity: { type: 'number', description: 'Minimum qty for this rule to apply (default 1)' },
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
          },
          required: ['product_id'],
        },
      },
    },
    instructions:
      'Returns { price_cents, pricelist_id, pricelist_name, source }. source="pricelist" when matched, "product_base" when falling back to product.price_cents.',
  },
];

export const pricelistsModule = defineModule<Input, Output>({
  id: 'pricelists' as any,
  name: 'Pricelists',
  version: '1.0.0',
  description:
    'Versioned pricing per customer, company, or period — Odoo-style price lists with fixed prices or discount %. Resolves the best applicable price for any product+customer+date.',
  capabilities: ['data:read', 'data:write'],
  inputSchema,
  outputSchema,
  skills: ['manage_pricelist', 'manage_pricelist_item', 'resolve_pricelist_price'],
  skillSeeds: SKILLS,
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
