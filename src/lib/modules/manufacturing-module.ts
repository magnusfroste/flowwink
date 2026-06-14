/**
 * Manufacturing (MRP-light) Module
 * Spec: docs/modules/manufacturing.md
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { defineModule } from '@/lib/module-def';
import type { SkillSeed, AutomationSeed } from '@/lib/module-bootstrap';

const manufacturingInputSchema = z.object({
  action: z.enum(['list_mos', 'list_boms', 'get_mo', 'get_bom']),
  mo_id: z.string().uuid().optional(),
  bom_id: z.string().uuid().optional(),
  status: z.string().optional(),
});

const manufacturingOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

type ManufacturingInput = z.infer<typeof manufacturingInputSchema>;
type ManufacturingOutput = z.infer<typeof manufacturingOutputSchema>;

const MANUFACTURING_SKILLS: SkillSeed[] = [
  {
    name: 'manage_bom',
    description:
      'Create a new Bill of Materials (BOM) version for a product. Use when: defining what components make up a finished good, or adding a new versioned recipe. NOT for: planning a production run (use create_manufacturing_order). Reads go via universal CRUD on bom_headers / bom_lines.',
    category: 'commerce',
    handler: 'rpc:create_bom',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_bom',
        description: 'Create a Bill of Materials (BOM) header + lines in one transaction',
        parameters: {
          type: 'object',
          properties: {
            product_id: { type: 'string', description: 'Finished-good product UUID' },
            version: { type: 'string', description: 'BOM version label (e.g. v1, 2026-Q1)' },
            quantity_produced: { type: 'number', description: 'Units produced per BOM run (default 1)' },
            routing_notes: { type: 'string' },
            activate: { type: 'boolean', description: 'Set this version as the active BOM (default true)' },
            lines: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  component_product_id: { type: 'string' },
                  quantity: { type: 'number' },
                  unit: { type: 'string' },
                  scrap_pct: { type: 'number' },
                  position: { type: 'integer' },
                },
                required: ['component_product_id', 'quantity'],
              },
            },
          },
          required: ['product_id', 'lines'],
        },
      },
    },
  },
  {
    name: 'create_manufacturing_order',
    description:
      'Plan a production run for a finished good. Creates a draft Manufacturing Order (MO). Use when: stock of a manufacturable product is low, a sales order needs to be built, or admin requests a build. NOT for: confirming or starting work (use confirm_manufacturing_order / start_manufacturing_order).',
    category: 'commerce',
    handler: 'db:manufacturing_orders',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'create_manufacturing_order',
        description: 'Create a draft Manufacturing Order for a finished good',
        parameters: {
          type: 'object',
          properties: {
            product_id: { type: 'string' },
            quantity: { type: 'number', description: 'Units to build' },
            due_date: { type: 'string', description: 'YYYY-MM-DD' },
            source_type: {
              type: 'string',
              enum: ['manual', 'sales_order', 'reorder', 'agent'],
              description: 'What triggered this MO (default: manual)',
            },
            source_id: { type: 'string', description: 'UUID of the triggering entity (e.g. sales order id)' },
            notes: { type: 'string' },
          },
          required: ['product_id', 'quantity'],
        },
      },
    },
    instructions:
      'Always create as draft. mo_number is generated automatically (MO-YYYY-NNNN). After creation, call confirm_manufacturing_order to snapshot the BOM and check stock.',
  },
  {
    name: 'confirm_manufacturing_order',
    description:
      'Snapshot the active BOM into a draft MO and compute component availability. Use when: an MO has been created and is ready to be reserved. NOT for: starting work on the floor (use start_manufacturing_order).',
    category: 'commerce',
    handler: 'rpc:confirm_mo',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'confirm_manufacturing_order',
        description: 'Confirm an MO: snapshot components and compute shortages',
        parameters: {
          type: 'object',
          properties: { mo_id: { type: 'string' } },
          required: ['mo_id'],
        },
      },
    },
  },
  {
    name: 'check_mo_availability',
    description:
      'Re-compute component availability for a confirmed MO and return any shortages. Read-only against state but updates the per-component cache. Use when: re-checking after a goods receipt, or before deciding whether to start the MO. NOT for: triggering procurement (use trigger_procurement_for_mo).',
    category: 'commerce',
    handler: 'rpc:check_mo_availability',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'check_mo_availability',
        description: 'Recompute availability for an MO',
        parameters: {
          type: 'object',
          properties: { mo_id: { type: 'string' } },
          required: ['mo_id'],
        },
      },
    },
  },
  {
    name: 'trigger_procurement_for_mo',
    description:
      'For each component short on stock, mark as awaiting_po and return a list of procurement requests. Idempotent — skips components that already have an open PO referencing this MO. Use when: check_mo_availability reports shortages and the agent wants to start the procurement loop. NOT for: standalone POs (use create_purchase_order).',
    category: 'commerce',
    handler: 'rpc:trigger_procurement_for_mo',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'trigger_procurement_for_mo',
        description: 'Request procurement for shorted components on an MO',
        parameters: {
          type: 'object',
          properties: { mo_id: { type: 'string' } },
          required: ['mo_id'],
        },
      },
    },
    instructions:
      'After this call, follow up with create_purchase_order (purchasing skill) for each returned request, passing source_type="manufacturing" and source_id=<mo_id>.',
  },
  {
    name: 'start_manufacturing_order',
    description:
      'Transition a confirmed MO to in_progress and stamp started_at. Use when: floor operator (or agent with auto trust) confirms work has begun. NOT for: completing the MO (use complete_manufacturing_order).',
    category: 'commerce',
    handler: 'rpc:start_mo',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'start_manufacturing_order',
        description: 'Mark an MO as in_progress',
        parameters: {
          type: 'object',
          properties: { mo_id: { type: 'string' } },
          required: ['mo_id'],
        },
      },
    },
  },
  {
    name: 'complete_manufacturing_order',
    description:
      'Finish an in-progress MO: post mo_consumption stock moves for components, mo_production for the finished good, set status=done, emit mo.completed. Use when: build is finished. NOT for: cancelling (use cancel_manufacturing_order).',
    category: 'commerce',
    handler: 'rpc:complete_mo',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'complete_manufacturing_order',
        description: 'Complete an MO and post stock moves',
        parameters: {
          type: 'object',
          properties: {
            mo_id: { type: 'string' },
            actual_qty: { type: 'number', description: 'Actual produced quantity (defaults to planned quantity)' },
          },
          required: ['mo_id'],
        },
      },
    },
  },
  {
    name: 'cancel_manufacturing_order',
    description:
      'Cancel a draft, confirmed, or in-progress MO with a reason. Idempotent — safe to call on already-cancelled or done MOs. Use when: order is no longer needed or build is abandoned. NOT for: finishing successfully (use complete_manufacturing_order).',
    category: 'commerce',
    handler: 'rpc:cancel_mo',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'cancel_manufacturing_order',
        description: 'Cancel an MO with a reason',
        parameters: {
          type: 'object',
          properties: {
            mo_id: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['mo_id'],
        },
      },
    },
  },
  {
    name: 'list_manufacturing_orders',
    description:
      'List Manufacturing Orders, optionally filtered by status. Read-only. Use when: building a dashboard, triaging the queue, or summarizing factory load. NOT for: detailed component view (read mo_components for a single MO).',
    category: 'commerce',
    handler: 'db:manufacturing_orders',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_manufacturing_orders',
        description: 'List MOs with optional status filter',
        parameters: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['draft', 'planned', 'confirmed', 'in_progress', 'done', 'cancelled'],
            },
            limit: { type: 'integer' },
          },
        },
      },
    },
  },
  {
    name: 'manage_work_center',
    description: 'Manage work centers (production resources with an hourly cost + capacity). Use when: defining the shop floor (cutting, assembly, packing), setting labor rates. NOT for: routing steps (manage_routing_operation) or BOMs (manage_bom).',
    category: 'commerce',
    handler: 'rpc:manage_work_center',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_work_center',
        description: 'List/create/update/delete work centers (code, name, cost_per_hour_cents, capacity_per_hour).',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['list', 'create', 'update', 'delete'] },
            p_id: { type: 'string', format: 'uuid' },
            p_code: { type: 'string' },
            p_name: { type: 'string' },
            p_cost_per_hour_cents: { type: 'number' },
            p_capacity_per_hour: { type: 'number', description: 'Units/hour (optional)' },
          },
        },
      },
    },
    instructions: 'Work centers are the costed resources a routing operation runs at. cost_per_hour_cents drives planned labor cost in work orders. Admin/service-role only for mutations.',
  },
  {
    name: 'manage_routing_operation',
    description: 'Manage the ordered routing operations of a BOM (which work center, how many minutes per unit). Use when: defining how a product is made step by step. NOT for: work centers (manage_work_center) or generating a MO\'s work orders (generate_mo_work_orders).',
    category: 'commerce',
    handler: 'rpc:manage_routing_operation',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_routing_operation',
        description: 'List/create/update/delete routing operations on a BOM (sequence, name, work_center_id, duration_minutes per unit).',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['list', 'create', 'update', 'delete'] },
            p_id: { type: 'string', format: 'uuid' },
            p_bom_id: { type: 'string', format: 'uuid' },
            p_sequence: { type: 'number' },
            p_name: { type: 'string' },
            p_work_center_id: { type: 'string', format: 'uuid' },
            p_duration_minutes: { type: 'number', description: 'Minutes per produced unit' },
          },
        },
      },
    },
    instructions: 'Routing is the ordered list of operations per BOM. duration_minutes is per produced unit; generate_mo_work_orders scales it by MO quantity. Admin/service-role only for mutations.',
  },
  {
    name: 'generate_mo_work_orders',
    description: 'Materialise a manufacturing order\'s work orders from its BOM routing, with planned minutes and labor cost. Use when: a MO is confirmed and you need the shop-floor task list + labor cost. NOT for: defining routing (manage_routing_operation).',
    category: 'commerce',
    handler: 'rpc:generate_mo_work_orders',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'generate_mo_work_orders',
        description: 'Create mo_work_orders from the MO\'s BOM routing. planned_minutes = op.duration × MO.quantity; labor cost = minutes/60 × work-center rate. Idempotent (replaces existing).',
        parameters: {
          type: 'object',
          required: ['p_mo_id'],
          properties: { p_mo_id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    instructions: 'Run after confirming a MO. Returns work_orders_created + total_planned_minutes + total_planned_labor_cost_cents. Re-running replaces the MO\'s work orders. Admin/service-role only.',
  },
  {
    name: 'mrp_reorder_run',
    description: 'Scan manufactured products (those with an active BOM) at/below their reorder point and create draft manufacturing orders to replenish. Use when: MRP planning, auto-replenishing made-in-house stock. NOT for: purchased items (those go via purchasing reorder/procurement_run).',
    category: 'commerce',
    handler: 'rpc:mrp_reorder_run',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'mrp_reorder_run',
        description: 'Creates draft MOs (source_type=reorder, qty = reorder_point − on_hand) for products with an active BOM, below reorder point, and no open MO. dry_run returns candidates without creating.',
        parameters: {
          type: 'object',
          properties: {
            p_dry_run: { type: 'boolean', description: 'Default true — preview candidates without creating MOs' },
          },
        },
      },
    },
    instructions: 'Only manufactured products (active bom_headers) are considered — bought items are skipped. Idempotent: products that already have an open MO (not done/cancelled) are not re-ordered. Run with p_dry_run=false to actually create the draft MOs (admin/service-role).',
  },
];

const MANUFACTURING_AUTOMATIONS: AutomationSeed[] = [
  {
    name: 'MRP shortage → procurement',
    description:
      'When an MO reports component shortages, automatically trigger procurement requests so the agent can create draft POs.',
    trigger_type: 'event',
    trigger_config: { event: 'mo.shortage_detected' },
    skill_name: 'trigger_procurement_for_mo',
    skill_arguments: {},
  },
];

export const manufacturingModule = defineModule<ManufacturingInput, ManufacturingOutput>({
  id: 'manufacturing',
  name: 'Manufacturing',
  version: '1.0.0',
  processes: ['procure-to-pay', 'order-to-delivery'],
  maturity: 'L2',
  description:
    'MRP-light: Bills of Materials, Manufacturing Orders, component reservation, and the link from production demand to procurement.',
  capabilities: ['data:write', 'data:read'],
  tier: 'extended',
  inputSchema: manufacturingInputSchema,
  outputSchema: manufacturingOutputSchema,

  skills: [
    'manage_bom',
    'create_manufacturing_order',
    'confirm_manufacturing_order',
    'check_mo_availability',
    'trigger_procurement_for_mo',
    'start_manufacturing_order',
    'complete_manufacturing_order',
    'cancel_manufacturing_order',
    'list_manufacturing_orders',
    'manage_work_center',
    'manage_routing_operation',
    'generate_mo_work_orders',
    'mrp_reorder_run',
  ],
  skillSeeds: MANUFACTURING_SKILLS,
  automations: MANUFACTURING_AUTOMATIONS,

  async publish(input: ManufacturingInput): Promise<ManufacturingOutput> {
    const validated = manufacturingInputSchema.parse(input);

    if (validated.action === 'list_mos') {
      let q = supabase.from('manufacturing_orders').select('*').order('created_at', { ascending: false }).limit(100);
      if (validated.status) q = q.eq('status', validated.status as never);
      const { data, error } = await q;
      if (error) {
        logger.error('[manufacturing] list_mos failed', error);
        return { success: false, message: error.message };
      }
      return { success: true, message: `Found ${data?.length ?? 0} manufacturing orders` };
    }

    if (validated.action === 'list_boms') {
      const { data, error } = await supabase
        .from('bom_headers')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) {
        return { success: false, message: error.message };
      }
      return { success: true, message: `Found ${data?.length ?? 0} BOMs` };
    }

    return { success: false, message: 'Unsupported action' };
  },
});
