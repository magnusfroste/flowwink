/**
 * Shipping Module — Carriers + Shipments (parcels) for outbound orders.
 *
 * Carriers: PostNord, DHL, Bring (extensible).
 * One order can have many shipments (parcels). Each shipment can carry a
 * tracking number + label URL. Carrier-specific label generation is delegated
 * to edge functions per carrier (TODO: postnord-label).
 */

import { defineModule } from '@/lib/module-def';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import type { SkillSeed } from '@/lib/module-bootstrap';

const inputSchema = z.object({
  action: z.enum(['list_carriers', 'list_shipments', 'create_shipment']),
  order_id: z.string().uuid().optional(),
});
const outputSchema = z.object({ success: z.boolean(), data: z.unknown().optional(), message: z.string().optional() });
type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

const SKILLS: SkillSeed[] = [
  {
    name: 'manage_carrier',
    description:
      'CRUD for shipping carriers (PostNord, DHL, Bring, custom). Use when: enabling/disabling a carrier, updating tracking-URL templates, or rotating API credentials. NOT for: creating shipments (use manage_shipment).',
    category: 'commerce',
    handler: 'db:carriers',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_carrier',
        description: 'Create, list, update, or deactivate carriers',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'list', 'update', 'delete'] },
            id: { type: 'string' },
            code: { type: 'string', description: 'Lowercase identifier — postnord, dhl, bring, etc.' },
            name: { type: 'string' },
            tracking_url_template: { type: 'string', description: 'Use {tracking_number} placeholder' },
            api_credentials_secret_ref: { type: 'string', description: 'Edge-function secret name holding API key' },
            is_active: { type: 'boolean' },
          },
          required: ['action'],
          'x-action-required': { create: ['code', 'name'] },
        },
      },
    },
  },
  {
    name: 'manage_shipment',
    description:
      'Create/list/update shipments (parcels) for an order. Use when: warehouse books a parcel with a carrier and gets a tracking number. NOT for: marking the whole order as shipped (use manage_orders fulfillment_status).',
    category: 'commerce',
    handler: 'db:shipments',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_shipment',
        description: 'CRUD for shipments (parcels) attached to orders',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'list', 'get', 'update', 'delete'] },
            id: { type: 'string' },
            order_id: { type: 'string' },
            carrier_id: { type: 'string' },
            carrier_code: { type: 'string' },
            tracking_number: { type: 'string' },
            tracking_url: { type: 'string' },
            label_url: { type: 'string', description: 'Storage URL of generated PDF label' },
            status: { type: 'string', enum: ['pending', 'labeled', 'shipped', 'delivered', 'cancelled'] },
            weight_grams: { type: 'integer' },
            cost_cents: { type: 'integer' },
            shipped_at: { type: 'string' },
            delivered_at: { type: 'string' },
          },
          required: ['action'],
          'x-action-required': { create: ['order_id'] },
        },
      },
    },
    instructions:
      'After creating a shipment with a tracking_number, populate tracking_url by formatting the carrier.tracking_url_template (replace {tracking_number}). When status transitions to shipped/delivered, also update orders.fulfillment_status via manage_orders.',
  },
  {
    name: 'manage_shipping_rate',
    description: 'Manage a carrier\'s weight-band shipping rates (price per weight bracket). Use when: setting up shipping prices, editing rate cards. NOT for: computing a shipment cost (use calc_shipping_rate) or carrier records (manage_carrier).',
    category: 'commerce',
    handler: 'rpc:manage_shipping_rate',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_shipping_rate',
        description: 'List/create/update/delete weight-band rates for a carrier (min/max grams → price). NULL max = no upper bound. Bands can be scoped to destination countries.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['list', 'create', 'update', 'delete'] },
            p_rate_id: { type: 'string', format: 'uuid' },
            p_carrier_id: { type: 'string', format: 'uuid' },
            p_name: { type: 'string' },
            p_min_weight_grams: { type: 'number' },
            p_max_weight_grams: { type: 'number', description: 'Omit for no upper bound' },
            p_price_cents: { type: 'number' },
            p_currency: { type: 'string' },
            p_dim_divisor: { type: 'number', description: 'cm³/kg for dimensional weight (default 5000)' },
            p_countries: { type: 'array', items: { type: 'string' }, description: 'ISO-3166 alpha-2 destination codes this band serves (e.g. ["NO","DK"]). Omit for all destinations.' },
            p_allow_overlap: { type: 'boolean', description: 'Overlapping active bands (same carrier/currency/destination) are rejected by default; pass true for a deliberate secondary tier (e.g. express).' },
          },
        },
      },
    },
    instructions: 'Weight bands are [min_weight_grams, max_weight_grams] → price_cents per carrier. Leave p_max_weight_grams null for the top band. Overlapping active bands for the same carrier + currency + intersecting destination scope are rejected unless p_allow_overlap=true. Admin/service-role only for mutations.',
  },
  {
    name: 'calc_shipping_rate',
    description: 'Compute a shipment\'s price for a carrier from its weight bands, billing on the greater of actual and dimensional weight. Use when: quoting shipping at checkout, estimating a parcel cost. NOT for: editing rates (manage_shipping_rate).',
    category: 'commerce',
    handler: 'rpc:calc_shipping_rate',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'calc_shipping_rate',
        description: 'Pick the cheapest matching weight band for a carrier. Bills on max(actual grams, dimensional grams). Dimensions optional; dimensional weight = L×W×H(cm) / dim_divisor × 1000.',
        parameters: {
          type: 'object',
          required: ['p_carrier_id', 'p_weight_grams'],
          properties: {
            p_carrier_id: { type: 'string', format: 'uuid' },
            p_weight_grams: { type: 'number' },
            p_length_cm: { type: 'number' },
            p_width_cm: { type: 'number' },
            p_height_cm: { type: 'number' },
            p_dim_divisor: { type: 'number', description: 'cm³/kg (default 5000)' },
            p_country: { type: 'string', description: 'ISO-3166 alpha-2 destination (e.g. NO). Filters country-scoped bands; omit for worldwide bands only.' },
          },
        },
      },
    },
    instructions: 'Returns price_cents + billable_grams + billed_on (actual|dimensional). Give all three dimensions to trigger dimensional-weight billing (e.g. light but bulky parcels). Pass p_country to include destination-scoped bands. success:false with reason no_matching_rate when no band covers the weight.',
  },
  {
    name: 'list_shipping_options',
    description: 'Rate-shop across ALL active carriers: cheapest matching weight band per carrier for a parcel, sorted by price. Use when: comparing carriers for a shipment, quoting delivery options at checkout, picking the cheapest carrier. NOT for: a single known carrier (calc_shipping_rate) or editing rates (manage_shipping_rate).',
    category: 'commerce',
    handler: 'rpc:list_shipping_options',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_shipping_options',
        description: 'Returns {options:[{carrier_id, carrier_code, carrier_name, rate_id, rate_name, price_cents, currency}]} sorted cheapest first — one option per active carrier whose band covers the weight (and destination, when given).',
        parameters: {
          type: 'object',
          required: ['p_weight_grams'],
          properties: {
            p_weight_grams: { type: 'number', description: 'Total parcel weight in grams' },
            p_currency: { type: 'string', description: 'Only rates in this currency (e.g. SEK)' },
            p_country: { type: 'string', description: 'ISO-3166 alpha-2 destination; includes country-scoped bands' },
          },
        },
      },
    },
    instructions: 'The same RPC powers the storefront checkout delivery selector, so agent quotes always match what the customer sees. Empty options = no carrier covers the weight/destination (configure rates via manage_shipping_rate).',
  },
];

export const shippingModule = defineModule<Input, Output>({
  id: 'shipping' as any,
  name: 'Shipping',
  version: '1.0.0',
  processes: ['order-to-delivery'],
  maturity: 'L2',
  description:
    'Outbound shipping with multi-parcel support and carrier integrations. Built-in: PostNord, DHL, Bring. Tracking URLs are auto-rendered from per-carrier templates.',
  capabilities: ['data:read', 'data:write'],
  tier: 'extended',
  inputSchema,
  outputSchema,
  skills: ['manage_carrier', 'manage_shipment', 'manage_shipping_rate', 'calc_shipping_rate', 'list_shipping_options'],
  skillSeeds: SKILLS,
  data: {
    // children first (FK-safe order)
    tables: ['shipments', 'carriers'],
  },
  async publish(input: Input): Promise<Output> {
    const v = inputSchema.parse(input);
    logger.log('[shipping] action:', v.action);
    return { success: true };
  },
});
