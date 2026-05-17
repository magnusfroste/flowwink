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
];

export const shippingModule = defineModule<Input, Output>({
  id: 'shipping' as any,
  name: 'Shipping',
  version: '1.0.0',
  description:
    'Outbound shipping with multi-parcel support and carrier integrations. Built-in: PostNord, DHL, Bring. Tracking URLs are auto-rendered from per-carrier templates.',
  capabilities: ['data:read', 'data:write'],
  inputSchema,
  outputSchema,
  skills: ['manage_carrier', 'manage_shipment'],
  skillSeeds: SKILLS,
  async publish(input: Input): Promise<Output> {
    const v = inputSchema.parse(input);
    logger.log('[shipping] action:', v.action);
    return { success: true };
  },
});
