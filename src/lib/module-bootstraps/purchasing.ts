/**
 * Purchasing Module Bootstrap
 * 
 * Skills: manage_vendor, create_purchase_order, send_purchase_order,
 *         receive_goods, purchase_reorder_check
 * Automation: Auto Reorder Check (daily low-stock → PO suggestion)
 */

import { registerBootstrap, type SkillSeed, type AutomationSeed } from '@/lib/module-bootstrap';

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
            name: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
            payment_terms: { type: 'string', enum: ['immediate', 'net15', 'net30', 'net45', 'net60'] },
            currency: { type: 'string' },
            search: { type: 'string' },
          },
          required: ['action'],
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
            vendor_id: { type: 'string' },
            order_date: { type: 'string' },
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
          required: ['vendor_id', 'lines'],
        },
      },
    },
    instructions: 'Always create POs in draft status. Calculate totals: subtotal = sum(qty * unit_price), tax = sum(qty * unit_price * tax_rate/100). Default tax_rate is 25% for Swedish vendors.',
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
          properties: {
            purchase_order_id: { type: 'string' },
          },
          required: ['purchase_order_id'],
        },
      },
    },
  },
  {
    name: 'receive_goods',
    description: 'Record goods receipt against a confirmed purchase order, updating received quantities and inventory. Use when: goods arrive from a vendor, admin marks items as received. NOT for: creating POs (use create_purchase_order), sending POs (use send_purchase_order).',
    category: 'commerce',
    handler: 'db:goods_receipts',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'receive_goods',
        description: 'Record goods receipt and update inventory',
        parameters: {
          type: 'object',
          properties: {
            purchase_order_id: { type: 'string' },
            receipt_date: { type: 'string' },
            notes: { type: 'string' },
            lines: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  po_line_id: { type: 'string' },
                  quantity_received: { type: 'number' },
                },
              },
            },
          },
          required: ['purchase_order_id', 'lines'],
        },
      },
    },
    instructions: 'After recording receipt, update purchase_order_lines.received_quantity. If all lines are fully received, set PO status to received. If partially received, set to partially_received. Optionally update product stock levels.',
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
          properties: {
            threshold_override: { type: 'number', description: 'Override default low-stock threshold' },
          },
        },
      },
    },
    instructions: 'Compare current stock_quantity against low_stock_threshold for each product. Group low-stock items by preferred vendor if available. Return structured suggestions with vendor_id, product_id, suggested_quantity (reorder to max(threshold * 3, 10)).',
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
];

registerBootstrap('purchasing', {
  skills: PURCHASING_SKILLS,
  automations: PURCHASING_AUTOMATIONS,
});
