/**
 * Returns / RMA Module — Odoo-style return-merchandise-authorization flow.
 *
 * Flow: requested → approved → received (auto restock event) → refunded
 */

import { defineModule } from '@/lib/module-def';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import type { SkillSeed } from '@/lib/module-bootstrap';

const inputSchema = z.object({
  action: z.enum(['create', 'approve', 'receive', 'refund', 'list', 'get']),
  return_id: z.string().uuid().optional(),
  order_id: z.string().uuid().optional(),
  reason: z.string().optional(),
  refund_cents: z.number().int().optional(),
  refund_method: z.string().optional(),
  notes: z.string().optional(),
});
const outputSchema = z.object({ success: z.boolean(), data: z.unknown().optional(), message: z.string().optional() });
type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

const SKILLS: SkillSeed[] = [
  {
    name: 'create_return',
    description:
      'Create a new return (RMA) for an order. Use when: customer or support agent requests a return/refund. NOT for: approving (use approve_return) or processing the refund (use refund_return).',
    category: 'commerce',
    handler: 'db:returns',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'create_return',
        description: 'Create a draft RMA in requested status',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create'], default: 'create' },
            order_id: { type: 'string' },
            rma_number: { type: 'string', description: 'Optional — auto-generated if omitted' },
            reason: { type: 'string' },
            customer_notes: { type: 'string' },
          },
          required: ['order_id'],
        },
      },
    },
    instructions:
      'Use generate_rma_number() if rma_number omitted. After creating, add return_items via manage_return_item, then call approve_return.',
  },
  {
    name: 'manage_return_item',
    description:
      'Add/edit/remove line items on an existing return. Use when: specifying which order items are being returned and in what condition.',
    category: 'commerce',
    handler: 'db:return_items',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_return_item',
        description: 'CRUD for return line items',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'list', 'update', 'delete'] },
            id: { type: 'string' },
            return_id: { type: 'string' },
            order_item_id: { type: 'string' },
            product_id: { type: 'string' },
            quantity: { type: 'number' },
            unit_refund_cents: { type: 'integer' },
            condition: { type: 'string', enum: ['unopened', 'opened', 'damaged', 'defective'] },
            restock: { type: 'boolean', description: 'true = put back on shelf on receive_return' },
            notes: { type: 'string' },
          },
          required: ['action'],
          'x-action-required': { create: ['return_id'] },
        },
      },
    },
  },
  {
    name: 'approve_return',
    description:
      'Approve a requested return so the customer can ship it back. Use when: support/admin signs off on the RMA. NOT for: actually receiving goods (use receive_return).',
    category: 'commerce',
    handler: 'rpc:approve_return',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'approve_return',
        description: 'Transition return from requested → approved',
        parameters: {
          type: 'object',
          properties: {
            return_id: { type: 'string' },
            notes: { type: 'string', description: 'Internal note appended to the return' },
          },
          required: ['return_id'],
        },
      },
    },
  },
  {
    name: 'receive_return',
    description:
      'Mark an approved return as received. Auto-emits stock.movement event for items flagged restock=true. Use when: warehouse confirms the package arrived.',
    category: 'commerce',
    handler: 'rpc:receive_return',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'receive_return',
        description: 'Transition return from approved → received and restock items',
        parameters: { type: 'object', properties: { return_id: { type: 'string' } }, required: ['return_id'] },
      },
    },
  },
  {
    name: 'refund_return',
    description:
      'Process the refund for a received return. Use when: payment is being returned to the customer (Stripe, manual, or store-credit).',
    category: 'commerce',
    handler: 'rpc:refund_return',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'refund_return',
        description: 'Transition return from received → refunded',
        parameters: {
          type: 'object',
          properties: {
            return_id: { type: 'string' },
            refund_cents: { type: 'integer' },
            method: { type: 'string', enum: ['stripe', 'manual', 'store_credit'], default: 'manual' },
          },
          required: ['return_id', 'refund_cents'],
        },
      },
    },
    instructions:
      'For Stripe-paid orders, prefer method="stripe" so an actual refund is recorded. For card-not-present or offline orders use "manual".',
  },
];

export const returnsModule = defineModule<Input, Output>({
  id: 'returns' as any,
  name: 'Returns / RMA',
  version: '1.0.0',
  description:
    'Return-merchandise-authorization flow with line-item tracking, approval, restock-on-receive, and refund processing. Customers see their own returns; staff manages all.',
  requires: ['ecommerce'],
  capabilities: ['data:read', 'data:write'],
  inputSchema,
  outputSchema,
  skills: ['create_return', 'manage_return_item', 'approve_return', 'receive_return', 'refund_return'],
  skillSeeds: SKILLS,
  async publish(input: Input): Promise<Output> {
    const v = inputSchema.parse(input);
    if (v.action === 'approve' && v.return_id) {
      const { data, error } = await supabase.rpc('approve_return', { p_return_id: v.return_id, p_notes: v.notes ?? null });
      if (error) return { success: false, message: error.message };
      return { success: true, data };
    }
    if (v.action === 'receive' && v.return_id) {
      const { data, error } = await supabase.rpc('receive_return', { p_return_id: v.return_id });
      if (error) return { success: false, message: error.message };
      return { success: true, data };
    }
    if (v.action === 'refund' && v.return_id && v.refund_cents) {
      const { data, error } = await supabase.rpc('refund_return', {
        p_return_id: v.return_id,
        p_refund_cents: v.refund_cents,
        p_method: v.refund_method ?? 'manual',
      });
      if (error) return { success: false, message: error.message };
      return { success: true, data };
    }
    logger.log('[returns] action:', v.action);
    return { success: true };
  },
});
