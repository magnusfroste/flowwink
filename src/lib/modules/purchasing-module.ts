/**
 * Purchasing Module — Unified Definition
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { defineModule } from '@/lib/module-def';
import type { SkillSeed, AutomationSeed } from '@/lib/module-bootstrap';
import { getActivePack } from '@/lib/locale-packs';

const purchasingInputSchema = z.object({
  action: z.enum(['create_po', 'list_pos', 'list_vendors', 'get_vendor']),
  vendor_id: z.string().uuid().optional(),
  po_id: z.string().uuid().optional(),
  lines: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.number().int().positive(),
    unit_cost_cents: z.number().int(),
  })).optional(),
  notes: z.string().optional(),
});

const purchasingOutputSchema = z.object({
  success: z.boolean(),
  po_id: z.string().optional(),
  po_number: z.string().optional(),
  message: z.string().optional(),
});

type PurchasingInput = z.infer<typeof purchasingInputSchema>;
type PurchasingOutput = z.infer<typeof purchasingOutputSchema>;

const PURCHASING_SKILLS: SkillSeed[] = [
  {
    name: 'manage_vendor',
    description: 'Create, list, update, or deactivate vendors/suppliers. Use when: admin asks to add a new supplier, update vendor details, or review the vendor list. NOT for: creating purchase orders (use create_purchase_order).',
    category: 'commerce',
    handler: 'db:vendors',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_vendor',
        description: 'CRUD for vendor/supplier records',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'list', 'update', 'deactivate'] },
            name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' },
            payment_terms: { type: 'string', enum: ['immediate', 'net15', 'net30', 'net45', 'net60'] },
            currency: { type: 'string' }, search: { type: 'string' },
          },
          required: ['action'],
          'x-action-required': {
            create: ['name'],
          },
        },
      },
    },
  },
  {
    name: 'create_purchase_order',
    description: 'Create a new purchase order (draft) for a vendor with line items. Use when: stock is low and reorder is needed, admin requests a purchase, or purchase_reorder_check suggests items to order. NOT for: sending PO to vendor (use send_purchase_order), receiving goods (use receive_goods).',
    category: 'commerce',
    handler: 'db:purchase_orders',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'create_purchase_order',
        description: 'Create a draft purchase order with line items',
        parameters: {
          type: 'object',
          properties: {
            vendor_id: { type: 'string' }, order_date: { type: 'string' },
            expected_delivery: { type: 'string' }, notes: { type: 'string' },
            lines: { type: 'array', items: { type: 'object', properties: {
              product_id: { type: 'string' }, description: { type: 'string' },
              quantity: { type: 'number' }, unit_price_cents: { type: 'number' }, tax_rate: { type: 'number' },
            } } },
          },
          required: ['vendor_id', 'lines'],
        },
      },
    },
    instructions: `Always create POs in draft status. Calculate totals: subtotal = sum(qty * unit_price), tax = sum(qty * unit_price * tax_rate/100). Locale-specific: ${getActivePack().ai_instructions.purchasing}`,
  },
  {
    name: 'send_purchase_order',
    description: 'Mark a draft purchase order as sent to the vendor. Use when: admin approves a PO and wants to notify the vendor. NOT for: creating POs (use create_purchase_order).',
    category: 'commerce',
    handler: 'db:purchase_orders',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'send_purchase_order',
        description: 'Transition a PO from draft to sent status',
        parameters: {
          type: 'object',
          properties: { purchase_order_id: { type: 'string' } },
          required: ['purchase_order_id'],
        },
      },
    },
  },
  {
    name: 'receive_purchase_order',
    description: 'Record physical goods receipt against a confirmed/sent PO. Creates goods_receipt + lines, updates received quantities, generates stock_moves (vendor → internal location), optionally captures lot/serial numbers, and advances PO status (partially_received / received). Use when: shipment arrives, warehouse confirms receipt. NOT for: creating POs, matching invoices.',
    category: 'commerce',
    handler: 'rpc:receive_purchase_order',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'receive_purchase_order',
        description: 'Atomic goods receipt with stock_move generation and PO status update',
        parameters: {
          type: 'object',
          properties: {
            p_purchase_order_id: { type: 'string', description: 'PO UUID being received' },
            p_lines: {
              type: 'array',
              description: 'Lines being received',
              items: {
                type: 'object',
                properties: {
                  po_line_id: { type: 'string' },
                  quantity_received: { type: 'number' },
                  lot_number: { type: 'string', description: 'Optional lot/serial' },
                  expiration_date: { type: 'string', description: 'YYYY-MM-DD, optional' },
                },
                required: ['po_line_id', 'quantity_received'],
              },
            },
            p_to_location_id: { type: 'string', description: 'Destination internal location; defaults to first internal' },
            p_received_date: { type: 'string', description: 'YYYY-MM-DD, defaults to today' },
            p_notes: { type: 'string' },
          },
          required: ['p_purchase_order_id', 'p_lines'],
        },
      },
    },
    instructions: 'Quantities are capped at remaining (quantity - received_quantity) per line to prevent over-receipt. Emits goods.received event when complete.',
  },
  {
    name: 'match_invoice_to_receipt',
    description: 'Three-way match a vendor invoice against PO and physically received goods. Sets match_status = matched | partial | over_invoiced | under_invoiced | no_receipt | no_po. Configurable tolerance (default ±2%). Use when: vendor invoice registered, before approving payment. NOT for: approving (use auto_approve_vendor_invoice for matched).',
    category: 'commerce',
    handler: 'rpc:match_invoice_to_receipt',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'match_invoice_to_receipt',
        description: '3-way matching (PO ↔ Receipt ↔ Invoice) with variance detection',
        parameters: {
          type: 'object',
          properties: {
            p_invoice_id: { type: 'string', description: 'Vendor invoice UUID' },
            p_tolerance_pct: { type: 'number', description: 'Variance tolerance % (default 2.0)' },
          },
          required: ['p_invoice_id'],
        },
      },
    },
    instructions: 'Run after register_vendor_invoice. Emits invoice.matched event so automations can auto-approve matched or escalate variance.',
  },
  {
    name: 'auto_approve_vendor_invoice',
    description: 'Auto-approve a vendor invoice that already has match_status=matched. Sets status=approved + records approver. Use when: invoice matched within tolerance and policy allows auto-approval. NOT for: invoices with variance (those require human review).',
    category: 'commerce',
    handler: 'rpc:auto_approve_vendor_invoice',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'auto_approve_vendor_invoice',
        description: 'Approve invoice when match_status=matched',
        parameters: {
          type: 'object',
          properties: { invoice_id: { type: 'string', description: 'Vendor invoice UUID' } },
          required: ['invoice_id'],
        },
      },
    },
  },
  {
    name: 'purchase_reorder_check',
    description: 'Analyze current stock levels against reorder points and suggest purchase orders for low-stock items. Use when: heartbeat detects low inventory, admin asks for reorder suggestions, or as part of daily automation. NOT for: actual PO creation (use create_purchase_order after review).',
    category: 'commerce',
    handler: 'db:products',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'purchase_reorder_check',
        description: 'Check stock levels and suggest reorders',
        parameters: {
          type: 'object',
          properties: { threshold_override: { type: 'number', description: 'Override default low-stock threshold' } },
        },
      },
    },
    instructions: 'Compare current stock_quantity against low_stock_threshold for each product. Group low-stock items by preferred vendor if available. Return structured suggestions with vendor_id, product_id, suggested_quantity (reorder to max(threshold * 3, 10)).',
  },
  {
    name: 'update_purchase_order',
    description: 'General-purpose purchase order management. Use when: creating new POs, updating status (draft→sent→confirmed→received), changing expected delivery dates, adding notes, or processing vendor responses. Actions: create, update, get, list. NOT for: receiving goods (use receive_purchase_order). NOT for: stock checks (use purchase_reorder_check).',
    category: 'commerce',
    handler: 'db:purchase_orders',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'update_purchase_order',
        description: 'General-purpose purchase order management — create, update status/dates/notes, get details, or list POs.',
        parameters: {
          type: 'object',
          required: ['action'],
          properties: {
            action: { type: 'string', enum: ['create', 'update', 'get', 'list'] },
            purchase_order_id: { type: 'string' },
            vendor_id: { type: 'string' },
            status: { type: 'string', enum: ['draft', 'sent', 'confirmed', 'partially_received', 'received', 'cancelled'] },
            expected_delivery: { type: 'string' },
            notes: { type: 'string' },
            lines: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  product_id: { type: 'string' },
                  description: { type: 'string' },
                  quantity: { type: 'number' },
                  unit_price_cents: { type: 'number' },
                  tax_rate: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
  },
  {
    name: 'auto_generate_purchase_orders',
    description: 'Group reorder candidates by preferred vendor and auto-create one draft PO per vendor. Use when: nightly reorder run, "create purchase orders". Closes procure-to-pay loop. NOT for: single manual POs (use create_purchase_order).',
    category: 'commerce',
    handler: 'rpc:auto_generate_purchase_orders',
    scope: 'external',
    tool_definition: {
      type: 'function',
      function: {
        name: 'auto_generate_purchase_orders',
        description: 'Bulk-create draft POs from inventory reorder needs',
        parameters: {
          type: 'object',
          properties: {
            dry_run: { type: 'boolean', description: 'Preview without creating, default false' },
          },
        },
      },
    },
    instructions: 'Creates one PO per vendor in draft status. Reports skipped products without preferred vendor. Quantities respect min_order_quantity. Tax 25%. Admin reviews before sending.',
  },
];

const PURCHASING_AUTOMATIONS: AutomationSeed[] = [
  {
    name: 'Auto Reorder Check',
    description: 'Daily check for products below reorder threshold. FlowPilot reviews stock levels and creates draft POs for approval.',
    trigger_type: 'cron',
    trigger_config: { cron: '0 7 * * *', expression: '0 7 * * *' },
    skill_name: 'purchase_reorder_check',
    skill_arguments: {},
  },
  {
    name: 'Auto-match vendor invoice on registration',
    description: 'When a vendor invoice is registered, immediately run 3-way matching against PO + goods receipts.',
    trigger_type: 'event',
    trigger_config: { event: 'invoice.registered' },
    skill_name: 'match_invoice_to_receipt',
    skill_arguments: { p_invoice_id: '{{event.payload.invoice_id}}' },
  },
];

export const purchasingModule = defineModule<PurchasingInput, PurchasingOutput>({
  id: 'purchasing',
  name: 'Purchasing',
  version: '1.0.0',
  description: 'Procure-to-pay lifecycle: purchase orders, vendor management, and goods receipt',
  capabilities: ['data:write', 'data:read'],
  inputSchema: purchasingInputSchema,
  outputSchema: purchasingOutputSchema,

  skills: [
    'manage_vendor', 'create_purchase_order', 'send_purchase_order',
    'receive_purchase_order', 'match_invoice_to_receipt', 'auto_approve_vendor_invoice',
    'purchase_reorder_check',
    'register_vendor_invoice', 'match_po_to_invoice', 'flag_invoice_variance',
    'update_purchase_order', 'auto_generate_purchase_orders',
  ],
  skillSeeds: PURCHASING_SKILLS,
  automations: PURCHASING_AUTOMATIONS,

  async publish(input: PurchasingInput): Promise<PurchasingOutput> {
    const validated = purchasingInputSchema.parse(input);

    if (validated.action === 'list_vendors') {
      const { data, error } = await supabase.from('vendors').select('*').eq('is_active', true).order('name');
      if (error) { logger.error('[purchasing] list_vendors failed', error); return { success: false, message: error.message }; }
      return { success: true, message: `Found ${data.length} active vendors` };
    }

    if (validated.action === 'list_pos') {
      const { data, error } = await supabase.from('purchase_orders').select('*').order('created_at', { ascending: false }).limit(50);
      if (error) return { success: false, message: error.message };
      return { success: true, message: `Found ${data.length} purchase orders` };
    }

    return { success: false, message: 'Unsupported action' };
  },
});
