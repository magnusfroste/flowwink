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
      'Create a new return (RMA) for an existing order. Use when: creating a return, an RMA or a return authorization for an order; a customer or support agent requests a return, a refund or an exchange of delivered goods. NOT for: approving (use approve_return); processing the refund (use refund_return); purchase orders to a vendor (use create_purchase_order).',
    category: 'commerce',
    handler: 'db:returns',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'create_return',
        description: 'Create a draft RMA (return authorization) in requested status for an existing customer order. Use when: creating a return, an RMA or a return authorization for an order; a customer requests a refund or exchange of delivered goods.',
        parameters: {
          type: 'object',
          properties: {
            reason_code: { type: 'string', enum: ['defective','wrong_item','not_as_described','changed_mind','damaged_in_transit','other'], description: 'Categorized return reason (free-text reason field still available)' },
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
      'rma_number is auto-generated if omitted (DB trigger) — you do NOT need to pass it or call generate_rma_number. Set reason_code (defective|wrong_item|not_as_described|changed_mind|damaged_in_transit|other) so return_reason_report can aggregate. Full RMA flow: create_return → add lines via manage_return_item → approve_return → receive_return → inspect_return (sets restocking fee) → refund_return.',
  },
  {
    // Customer self-service (identity ladder rung 2, dial 2). Unlike
    // create_return (internal, staff), this is scope 'external' so the
    // authenticated portal assistant can offer it — but it acts ONLY on the
    // signed-in customer's OWN order. Ownership is enforced server-side in the
    // handler from the JWT-verified caller email, never from model arguments.
    // It only creates a 'requested' RMA; approval and refund stay staff-gated.
    name: 'request_return',
    description:
      "Request a return for one of the signed-in customer's OWN orders. Use when: an authenticated customer wants to return/send back something they bought. NOT for: staff-side RMA management (create_return), approving or refunding (staff only), or anonymous visitors (they must sign in first).",
    category: 'commerce',
    handler: 'internal:request_return',
    scope: 'external',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'request_return',
        description: "Open a return request on the signed-in customer's own order. Only works for the authenticated customer's orders.",
        parameters: {
          type: 'object',
          properties: {
            order_reference: { type: 'string', description: "The order the customer wants to return, as they refer to it (the order id or its short prefix shown in their account, e.g. '977bda28'). Resolved against the caller's own orders only." },
            reason_code: { type: 'string', enum: ['defective','wrong_item','not_as_described','changed_mind','damaged_in_transit','other'], description: 'Categorized return reason' },
            reason: { type: 'string', description: "The customer's description of why they want to return it" },
          },
          required: ['order_reference'],
        },
      },
    },
    instructions:
      "Customer-facing self-service. The customer identity is taken from their verified session — do NOT ask for or pass an email/customer id; the platform resolves the order against the caller's own orders. Pass order_reference as the customer names it (short id is fine). If no matching order is found for their account, tell them you can't find that order on their account and offer to list their orders. This only OPENS the return (status 'requested'); a person reviews and processes the refund.",
  },
  {
    name: 'manage_return_item',
    description:
      'Add/edit/remove line items on an existing return. Use when: specifying which order items are being returned and in what condition. The lines carry the refund ceiling (qty × unit_refund_cents), so refund_return refuses an RMA with no lines. Once the return is refunded its lines are frozen — update/delete are refused; book a correction on a new return.',
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
            p_final: { type: 'boolean', description: 'Mark the refund as final even if below the expected total (closes the RMA)' },
            return_id: { type: 'string' },
            refund_cents: { type: 'integer' },
            method: { type: 'string', enum: ['stripe', 'manual', 'store_credit'], default: 'manual' },
          },
          required: ['return_id', 'refund_cents'],
        },
      },
    },
    instructions:
      'Only valid when the return is in received or approved status (run receive_return first). Params: return_id, refund_cents (positive integer cents — partial refunds ACCUMULATE across calls), method, p_final. Expected total = Σ(return_items qty × unit_refund_cents) − restocking_fee_cents (set via inspect_return); over-refund is rejected, and so is an RMA with no priced lines — add them via manage_return_item first. The RMA closes (status=refunded) when the running total reaches the expected total OR you pass p_final:true. p_final closes early but never over-pays; to close an RMA that is already past its expected total, call with refund_cents 0 and p_final true. For Stripe-paid orders prefer method="stripe" (records an actual refund); for card-not-present or offline orders use "manual".',
  },
  {
    name: 'inspect_return',
    description: 'QC-inspect a received return: record inspection notes and set the restocking fee before refunding. Use when: goods arrived back and need checking; deciding a restocking fee. NOT for: refunding (refund_return) or receiving (receive_return).',
    category: 'commerce',
    handler: 'rpc:inspect_return',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'inspect_return',
        description: 'Record QC inspection on a received return and optionally set restocking_fee_cents.',
        parameters: {
          type: 'object',
          required: ['p_return_id'],
          properties: {
            p_return_id: { type: 'string', format: 'uuid' },
            p_notes: { type: 'string' },
            p_restocking_fee_cents: { type: 'number', description: 'Deducted from the refundable total' },
          },
        },
      },
    },
    instructions: 'Only valid in status=received. The expected refund becomes Σ(return_items qty × unit_refund_cents) − restocking_fee_cents; refund_return enforces it. A fee that would push the expected total below what has ALREADY been refunded on the RMA is rejected — the error names the maximum fee still available.',
  },
  {
    name: 'return_reason_report',
    description: 'Return-reason analytics: counts and refunded value per reason_code over a period. Use when: spotting product quality issues, monthly returns review. NOT for: managing a single RMA (create_return/refund_return).',
    category: 'commerce',
    handler: 'rpc:return_reason_report',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'return_reason_report',
        description: 'Counts + refunded cents grouped by reason_code for the last N days (default 90).',
        parameters: {
          type: 'object',
          properties: { p_days: { type: 'number' } },
        },
      },
    },
    instructions: 'Read-only. Returns with no reason_code are grouped as "unspecified" — encourage setting reason_code on create_return.',
  },
];

export const returnsModule = defineModule<Input, Output>({
  id: 'returns' as any,
  name: 'Returns / RMA',
  version: '1.0.0',
  processes: ['order-to-delivery', 'return-to-refund'],
  maturity: 'L2',
  description:
    'Return-merchandise-authorization flow with line-item tracking, approval, restock-on-receive, and refund processing. Customers see their own returns; staff manages all.',
  requires: ['ecommerce'],
  capabilities: ['data:read', 'data:write'],
  tier: 'extended',
  inputSchema,
  outputSchema,
  skills: ['create_return', 'manage_return_item', 'approve_return', 'receive_return', 'refund_return', 'inspect_return', 'return_reason_report'],
  data: {
    tables: ['return_items', 'returns'],
  },
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
