import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { defineModule } from '@/lib/module-def';
import type { SkillSeed, AutomationSeed } from '@/lib/module-bootstrap';
import { z } from 'zod';

const inventoryInputSchema = z.object({
  action: z.enum(['check_stock', 'list_low_stock', 'get_movements']),
  product_id: z.string().uuid().optional(),
  threshold: z.number().int().optional(),
});

const inventoryOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

type InventoryInput = z.infer<typeof inventoryInputSchema>;
type InventoryOutput = z.infer<typeof inventoryOutputSchema>;

const INVENTORY_SKILLS: SkillSeed[] = [
  {
    name: 'transfer_stock',
    description:
      'Move stock between two locations (e.g. WH/MAIN → WH/PRODUCTION). Use when: relocating goods, fulfilling internal pick lists, or moving items to scrap. NOT for: receiving from vendor (use receive_goods) or shipping to customer (use consume_reservation).',
    category: 'commerce',
    handler: 'rpc:transfer_stock',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'transfer_stock',
        description: 'Transfer stock between two locations',
        parameters: {
          type: 'object',
          properties: {
            p_product_id: { type: 'string' },
            p_from_location_id: { type: 'string' },
            p_to_location_id: { type: 'string' },
            p_quantity: { type: 'number' },
            p_lot_id: { type: 'string' },
            p_notes: { type: 'string' },
          },
          required: ['p_product_id', 'p_from_location_id', 'p_to_location_id', 'p_quantity'],
        },
      },
    },
  },
  {
    name: 'reserve_stock',
    description:
      'Soft-reserve quantity at a location for an MO or sales order. Decrements available stock without moving it. Use when: confirming an MO, allocating stock to a sales order. NOT for: physically moving stock (use transfer_stock or consume_reservation).',
    category: 'commerce',
    handler: 'rpc:reserve_stock',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'reserve_stock',
        description: 'Reserve stock for an MO/SO',
        parameters: {
          type: 'object',
          properties: {
            p_product_id: { type: 'string' },
            p_location_id: { type: 'string' },
            p_quantity: { type: 'number' },
            p_reference_type: { type: 'string', description: 'mo, sales_order, etc.' },
            p_reference_id: { type: 'string' },
            p_lot_id: { type: 'string' },
            p_notes: { type: 'string' },
          },
          required: ['p_product_id', 'p_location_id', 'p_quantity'],
        },
      },
    },
  },
  {
    name: 'cancel_reservation',
    description:
      'Release a previously reserved quantity back to available stock. Use when: an MO or SO is cancelled. Idempotent on already-cancelled reservations.',
    category: 'commerce',
    handler: 'rpc:cancel_reservation',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'cancel_reservation',
        description: 'Release a stock reservation',
        parameters: {
          type: 'object',
          properties: { p_reservation_id: { type: 'string' } },
          required: ['p_reservation_id'],
        },
      },
    },
  },
  {
    name: 'consume_reservation',
    description:
      'Convert a reservation into an actual stock-out: moves the reserved qty out of the source location to a destination (default WH/CUSTOMERS). Use when: shipping the SO or finishing the MO consumption. NOT for: cancelling (use cancel_reservation).',
    category: 'commerce',
    handler: 'rpc:consume_reservation',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'consume_reservation',
        description: 'Consume a reservation as a real outbound move',
        parameters: {
          type: 'object',
          properties: {
            p_reservation_id: { type: 'string' },
            p_to_location_code: { type: 'string', description: 'Default WH/CUSTOMERS' },
          },
          required: ['p_reservation_id'],
        },
      },
    },
  },
  {
    name: 'adjust_quant',
    description:
      'Manual stock adjustment at a specific location (positive or negative delta). Use when: stocktake correction, breakage, or initial seed. NOT for: vendor receipts (use receive_goods).',
    category: 'commerce',
    handler: 'rpc:adjust_quant',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'adjust_quant',
        description: 'Manual quantity adjustment with audit trail',
        parameters: {
          type: 'object',
          properties: {
            p_product_id: { type: 'string' },
            p_location_id: { type: 'string' },
            p_qty_delta: { type: 'number' },
            p_lot_id: { type: 'string' },
            p_reason: { type: 'string' },
          },
          required: ['p_product_id', 'p_location_id', 'p_qty_delta'],
        },
      },
    },
  },
  {
    name: 'procurement_run',
    description:
      'Run the MRP scheduler: scans all active reorder rules, computes virtual stock (on_hand − reserved + incoming PO), and creates pending procurement_suggestions for products below min_qty. Skips products with an existing pending suggestion. Use when: nightly cron, after a bulk stock-out, or on demand.',
    category: 'commerce',
    handler: 'rpc:procurement_run',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'procurement_run',
        description: 'Run MRP scheduler — generates procurement suggestions',
        parameters: { type: 'object', properties: {} },
      },
    },
  },
  {
    name: 'approve_procurement_suggestion',
    description:
      'Materialize a pending procurement suggestion into a real Purchase Order (buy) or Manufacturing Order (manufacture). Use when: admin/agent has reviewed a suggestion and wants to act on it. Admin-only.',
    category: 'commerce',
    handler: 'rpc:approve_procurement_suggestion',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'approve_procurement_suggestion',
        description: 'Approve and materialize a procurement suggestion',
        parameters: {
          type: 'object',
          properties: { p_id: { type: 'string' } },
          required: ['p_id'],
        },
      },
    },
  },
  {
    name: 'reject_procurement_suggestion',
    description:
      'Reject a pending procurement suggestion with an optional reason. Admin-only.',
    category: 'commerce',
    handler: 'rpc:reject_procurement_suggestion',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'reject_procurement_suggestion',
        description: 'Reject a procurement suggestion',
        parameters: {
          type: 'object',
          properties: { p_id: { type: 'string' }, p_reason: { type: 'string' } },
          required: ['p_id'],
        },
      },
    },
  },
  // ── Pick & Pack flow ──
  {
    name: 'allocate_picking',
    description:
      'Create a pick-list for a paid order: generates a picking_order, reserves stock per order line, and flags stockouts. Idempotent — reuses existing open picking_order for the same order. Use when: an order moves to paid and needs fulfillment. NOT for: shipping (use ship_picking) or manual stock moves (use transfer_stock).',
    category: 'commerce',
    handler: 'rpc:allocate_picking',
    scope: 'both',
    tool_definition: {
      type: 'function',
      function: {
        name: 'allocate_picking',
        description: 'Allocate stock and create a pick-list for an order',
        parameters: {
          type: 'object',
          properties: {
            p_order_id: { type: 'string', description: 'Order UUID to allocate' },
            p_source_location_id: { type: 'string', description: 'Optional source location; defaults to first internal location' },
          },
          required: ['p_order_id'],
        },
      },
    },
  },
  {
    name: 'confirm_pick',
    description:
      'Operator confirms a single pick line: records picked quantity and optional lot/serial. Auto-advances the picking_order status when all lines are picked or short. Use when: warehouse operator scans/confirms an item.',
    category: 'commerce',
    handler: 'rpc:confirm_pick',
    scope: 'both',
    tool_definition: {
      type: 'function',
      function: {
        name: 'confirm_pick',
        description: 'Confirm a picked line with qty and optional lot',
        parameters: {
          type: 'object',
          properties: {
            p_line_id: { type: 'string' },
            p_qty_picked: { type: 'number' },
            p_lot_id: { type: 'string', description: 'Optional lot/serial id' },
          },
          required: ['p_line_id', 'p_qty_picked'],
        },
      },
    },
  },
  {
    name: 'ship_picking',
    description:
      'Ship a fully-picked picking_order: consumes reservations into real outbound stock_moves, sets order.status=shipped, emits picking.shipped event with tracking info. Use when: package leaves the warehouse. NOT for: cancelling (use cancel_picking).',
    category: 'commerce',
    handler: 'rpc:ship_picking',
    scope: 'both',
    tool_definition: {
      type: 'function',
      function: {
        name: 'ship_picking',
        description: 'Mark picking_order as shipped and consume reservations',
        parameters: {
          type: 'object',
          properties: {
            p_picking_order_id: { type: 'string' },
            p_tracking_number: { type: 'string' },
            p_carrier: { type: 'string' },
          },
          required: ['p_picking_order_id'],
        },
      },
    },
  },
  {
    name: 'cancel_picking',
    description:
      'Cancel an open picking_order and release all its reservations. Use when: order is cancelled or stock is unavailable. Idempotent.',
    category: 'commerce',
    handler: 'rpc:cancel_picking',
    scope: 'both',
    tool_definition: {
      type: 'function',
      function: {
        name: 'cancel_picking',
        description: 'Cancel a picking_order and release reservations',
        parameters: {
          type: 'object',
          properties: {
            p_picking_order_id: { type: 'string' },
            p_reason: { type: 'string' },
          },
          required: ['p_picking_order_id'],
        },
      },
    },
  },
];

const INVENTORY_AUTOMATIONS: AutomationSeed[] = [
  {
    name: 'Nightly MRP run',
    description: 'Runs the procurement scheduler every night to generate fresh PO/MO suggestions for products below their reorder point.',
    trigger_type: 'cron',
    trigger_config: { cron: '0 3 * * *', expression: '0 3 * * *' },
    skill_name: 'procurement_run',
    skill_arguments: {},
  },
  {
    name: 'Auto-allocate picking on order paid',
    description: 'When an order moves to paid, automatically create a pick-list and reserve stock so the warehouse can start picking immediately.',
    trigger_type: 'event',
    trigger_config: { event: 'order.paid' },
    skill_name: 'allocate_picking',
    skill_arguments: { p_order_id: '{{event.payload.order_id}}' },
  },
];

export const inventoryModule = defineModule<InventoryInput, InventoryOutput>({
  id: 'inventory',
  name: 'Inventory',
  version: '2.1.0',
  description: 'Multi-location inventory: locations, lots/serials, quants, reservations, transfers, MRP scheduler, and a full Pick & Pack flow that fulfills paid orders end-to-end.',
  capabilities: ['data:read', 'data:write'],
  inputSchema: inventoryInputSchema,
  outputSchema: inventoryOutputSchema,

  skills: [
    'check_stock',
    'adjust_stock',
    'low_stock_report',
    'list_reorder_candidates',
    'transfer_stock',
    'reserve_stock',
    'cancel_reservation',
    'consume_reservation',
    'adjust_quant',
    'procurement_run',
    'approve_procurement_suggestion',
    'reject_procurement_suggestion',
    'allocate_picking',
    'confirm_pick',
    'ship_picking',
    'cancel_picking',
  ],
  skillSeeds: INVENTORY_SKILLS,
  automations: INVENTORY_AUTOMATIONS,

  webhookEvents: [
    { event: 'stock.adjusted', description: 'Stock was adjusted' },
    { event: 'stock.low', description: 'Stock fell below threshold' },
  ],

  async publish(input: InventoryInput): Promise<InventoryOutput> {
    const validated = inventoryInputSchema.parse(input);

    if (validated.action === 'list_low_stock') {
      const threshold = validated.threshold ?? 5;
      const { data, error } = await supabase
        .from('product_stock')
        .select('product_id, quantity_on_hand, reorder_point')
        .lt('quantity_on_hand', threshold)
        .limit(50);

      if (error) {
        logger.error('[inventory] list_low_stock failed', error);
        return { success: false, message: error.message };
      }
      return { success: true, message: `Found ${data.length} products below threshold ${threshold}` };
    }

    if (validated.action === 'get_movements') {
      let query = supabase
        .from('stock_moves')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (validated.product_id) {
        query = query.eq('product_id', validated.product_id);
      }

      const { data, error } = await query;
      if (error) {
        return { success: false, message: error.message };
      }
      return { success: true, message: `Found ${data.length} stock movements` };
    }

    return { success: false, message: 'Unsupported action' };
  },
});
