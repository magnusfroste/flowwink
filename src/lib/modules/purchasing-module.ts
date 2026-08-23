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
    name: 'pay_vendor_invoice',
    description: 'Record the OUTGOING payment of an approved vendor invoice: posts Dt leverantörsskuld / Cr bank and marks the invoice paid. Use when: a supplier bill is due/approved and being paid — the final P2P step. NOT for: customer/AR payments (record_invoice_payment) or registering the incoming bill (register_vendor_invoice). GATED: the database refuses the payment unless the bill carries an approval stamp AND passes a three-way match recomputed at the moment of payment — received → paid is not a legal step. An over-invoiced bill (a second bill for a delivery already billed) cannot be paid at all until it is corrected or a human overrules it with request_entity_approval("vendor_invoice", ...) + advance_approval_step.',
    category: 'commerce',
    handler: 'rpc:pay_vendor_invoice',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {"type":"function","function":{"name":"pay_vendor_invoice","description":"Pay an approved vendor invoice: posts Dt 2440 / Cr bank and marks it paid. Rejects an already-paid invoice.","parameters":{"type":"object","required":["p_vendor_invoice_id"],"properties":{"p_vendor_invoice_id":{"type":"string","description":"UUID of the vendor_invoices row"},"p_pay_date":{"type":"string","description":"Payment date YYYY-MM-DD (default today)"},"p_bank_account":{"type":"string","description":"BAS bank account credited, default 1930"}}}}} as SkillSeed['tool_definition'],
    instructions: 'Pays the full total_cents of the vendor invoice. Find the invoice via manage_record/list on vendor_invoices (status approved, paid_at null). Posts a balanced journal entry (payables debit, bank credit) and sets status=paid. Already-paid invoices are rejected. The refusal path is self-correcting: when the gate blocks the payment the error names what is missing and the exact next skill — match_invoice_to_receipt, receive_purchase_order, auto_approve_vendor_invoice, or request_entity_approval + advance_approval_step for a deliberate overrule. Do not try to route around it by writing vendor_invoices.status directly; the guard sits on the table, not in this function.',
  },
  {
    name: 'register_vendor_invoice',
    description: 'Register an incoming vendor invoice (AP inbox). Use when: a vendor bill arrives that needs 3-way matching against a PO before payment. NOT for: customer invoices (use manage_invoice).',
    category: 'commerce',
    handler: 'db:vendor_invoices',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {"type":"function","function":{"name":"register_vendor_invoice","parameters":{"type":"object","required":["vendor_id","invoice_number","total_cents"],"properties":{"currency":{"type":"string"},"due_date":{"type":"string"},"tax_cents":{"type":"number"},"vendor_id":{"type":"string"},"total_cents":{"type":"number"},"invoice_date":{"type":"string"},"invoice_number":{"type":"string"},"subtotal_cents":{"type":"number"},"purchase_order_id":{"type":"string"}}},"description":"Register an incoming vendor invoice for 3-way matching"}} as SkillSeed['tool_definition'],
  },
  {
    name: 'match_po_to_invoice',
    description: '3-way match a vendor invoice against its PO and goods receipts within tolerance. Use when: a registered vendor invoice needs validation before approval. NOT for: customer reconciliation or listing variances (flag_invoice_variance).',
    category: 'commerce',
    handler: 'rpc:match_po_to_invoice',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {"type":"function","function":{"name":"match_po_to_invoice","parameters":{"type":"object","required":["invoice_id"],"properties":{"invoice_id":{"type":"string"},"variance_tolerance_pct":{"type":"number","default":2}}},"description":"Run 3-way match for a vendor invoice"}} as SkillSeed['tool_definition'],
  },
  {
    name: 'flag_invoice_variance',
    description: 'List vendor invoices flagged with price/quantity variance against their PO that need manual review. Use when: admin wants to see what failed automated 3-way matching. NOT for: inspecting a single invoice (use manage_invoice) or auto-approving (use auto_approve_vendor_invoice).',
    category: 'commerce',
    handler: 'db:vendor_invoices',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {"type":"function","function":{"name":"flag_invoice_variance","parameters":{"type":"object","properties":{}},"description":"List vendor invoices flagged with price/quantity variance against their PO that need manual review."}} as SkillSeed['tool_definition'],
  },
  {
    name: 'list_reorder_candidates',
    description: 'List products below their reordering rule, with the resolved vendor and price. THE replenishment engine: it counts VIRTUAL stock (on hand − reserved + incoming purchase orders), so goods already on order are not ordered twice, and every row carries reserved_qty/incoming_qty/virtual_qty/vendor_source as its own proof. The threshold is reorder_rules.min_qty — only rules with procurement_method=buy; manufactured items go to mrp_reorder_run. A product with no rule falls back to products.low_stock_threshold; a product with no threshold at all is NOT listed (there is no default reorder point). Optional p_threshold_override replaces every threshold for an ad-hoc "what is at or below N" question. Use when: reviewing what needs reordering, "vad behöver beställas?". NOT for: actually placing orders (use auto_generate_purchase_orders). NOT for: changing the thresholds (use manage_reorder_rule).',
    category: 'commerce',
    handler: 'rpc:list_reorder_candidates',
    scope: 'external',
    trust_level: 'notify',
    tool_definition: {"type":"function","function":{"name":"list_reorder_candidates","parameters":{"type":"object","properties":{"p_threshold_override":{"type":"number","description":"Ad-hoc reorder point that replaces every configured threshold"}}},"description":"List products needing reorder (virtual stock) with vendor pricing"}} as SkillSeed['tool_definition'],
  },
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
    description: 'Create a new purchase order (draft) for a vendor with line items. Use when: stock is low and reorder is needed, admin requests a purchase, or purchase_reorder_check suggests items to order. NOT for: sending PO to vendor (use send_purchase_order), receiving the delivered goods (use receive_purchase_order).',
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
            currency: { type: 'string', description: "ISO code the order is placed in (e.g. EUR). Omit to take the vendor's own currency." },
            exchange_rate: { type: 'number', description: 'Accounting-currency units per unit of `currency`. Omit to stamp the stored rate for the order date.' },
            lines: { type: 'array', items: { type: 'object', properties: {
              product_id: { type: 'string' }, description: { type: 'string' },
              quantity: { type: 'number' }, unit_price_cents: { type: 'number' }, tax_rate: { type: 'number' },
            } } },
          },
          required: ['vendor_id', 'lines'],
        },
      },
    },
    instructions: `Always create POs in draft status. vendor_id MUST be a vendor UUID — look it up first with manage_vendor (action:list); passing a vendor NAME fails with "vendor_id and lines are required". Each line is {description, quantity, unit_price_cents} (unit_price_cents = integer cents, e.g. 5000 = 50.00 kr; product_id optional). Line total_cents and the PO subtotal/tax/total are computed automatically — do NOT pass them.
CURRENCY: omit \`currency\` and the order takes the vendor's own currency; pass it only to place the order in a different one. \`exchange_rate\` is accounting-currency units per unit of the order currency (EUR→SEK ≈ 11.4) and is stamped from the stored rates for the order date when omitted. A foreign-currency order with no stored rate is REFUSED, not booked at 1 — register the rate first with set_exchange_rate. That rate is what values the goods in stock at receipt, so the order carries it all the way to the books.
VAT: \`tax_rate\` is a PERCENT per line (25 = 25 %). 0 is a real value (EU acquisition / reverse charge) and is respected — the order total is computed from the line rates.
PRICE: pass the vendor's purchase price. resolve_vendor_price gives it, including the quantity tier for the quantity you are ordering. A line priced at the product's SALES price while a cheaper purchase price is on file is refused.
Any parameter this skill does not declare is bounced with the valid list — it is never accepted and ignored. Locale-specific: ${getActivePack().ai_instructions.purchasing}`,
  },
  {
    name: 'send_purchase_order',
    description: 'Mark a draft purchase order as sent to the vendor. Use when: admin approves a PO and wants to notify the vendor. NOT for: creating POs (use create_purchase_order).',
    category: 'commerce',
    // Dedicated RPC (not generic db:purchase_orders CRUD): "send" is a status
    // transition the generic verb-inference can't infer a target state for, so it
    // silently listed instead of transitioning. The RPC enforces draft→sent, has a
    // service-role escape, and is an idempotent no-op if already sent.
    handler: 'rpc:send_purchase_order',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'send_purchase_order',
        description: 'Transition a PO from draft to sent status',
        parameters: {
          type: 'object',
          properties: { purchase_order_id: { type: 'string', description: 'UUID of the draft PO to send' } },
          required: ['purchase_order_id'],
        },
      },
    },
    instructions: 'If the PO amount exceeds the approval threshold this returns a "requires chain approval" error — call request_entity_approval("purchase_order", id, amount_cents) then advance_approval_step until approved, then retry send.',
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
            purchase_order_id: { type: 'string', description: 'PO UUID being received' },
            lines: {
              type: 'array',
              description: 'Lines being received. Get po_line_id from the PO lines first.',
              items: {
                type: 'object',
                properties: {
                  po_line_id: { type: 'string', description: 'UUID of an existing PO line' },
                  quantity_received: { type: 'number' },
                  lot_number: { type: 'string', description: 'Optional lot/serial' },
                  expiration_date: { type: 'string', description: 'YYYY-MM-DD, optional' },
                },
                required: ['po_line_id', 'quantity_received'],
              },
            },
            to_location_id: { type: 'string', description: 'Destination internal location; defaults to first internal' },
            received_date: { type: 'string', description: 'YYYY-MM-DD, defaults to today' },
            notes: { type: 'string' },
          },
          required: ['purchase_order_id', 'lines'],
        },
      },
    },
    instructions: 'Quantities are capped at remaining (quantity - received_quantity) per line to prevent over-receipt. Emits goods.received event when complete.',
  },
  {
    name: 'match_invoice_to_receipt',
    description: 'Three-way match a vendor invoice against PO and physically received goods. Measures the bill against what is STILL billable — the received (or ordered, per the bill control policy) value on the PO minus what other live invoices already claimed — so a second bill for the same delivery lands as over_invoiced, never matched. Sets match_status = matched | over_invoiced | under_invoiced | no_receipt | no_po. Configurable tolerance (default ±2%). Use when: vendor invoice registered, before approving payment. NOT for: approving (use auto_approve_vendor_invoice for matched).',
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
    instructions: 'Run after register_vendor_invoice. Emits invoice.matched event so automations can auto-approve matched or escalate variance. The response carries already_invoiced_cents, billable_value_cents, control_policy and other_invoices — read those before concluding a variance is a supplier error; "nothing left to invoice" means the delivery has already been billed. The bill control policy comes from site_settings key "purchasing", value.bill_control_policy ∈ received|ordered (default received).',
  },
  {
    name: 'auto_approve_vendor_invoice',
    description: 'Auto-approve a vendor invoice, re-running the three-way match first and approving only if it still comes out matched. Sets status=approved + records approver. Use when: a registered bill should be released for payment. NOT for: invoices with variance — it refuses them and returns the reason plus the next step (a stale "matched" label from before a sibling invoice arrived will not get past it).',
    category: 'commerce',
    handler: 'rpc:auto_approve_vendor_invoice',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'auto_approve_vendor_invoice',
        description: 'Re-match, then approve the invoice if the three-way match is clean',
        parameters: {
          type: 'object',
          properties: { invoice_id: { type: 'string', description: 'Vendor invoice UUID' } },
          required: ['invoice_id'],
        },
      },
    },
    instructions: 'Idempotent: an already-approved invoice returns already_approved=true. On refusal the response carries match_status, variance_cents, a reason and a next step. There is no force flag — a bill that will not match is either corrected (credit memo / dispute) or overruled by a human through request_entity_approval("vendor_invoice", <invoice_id>, <total_cents>) followed by advance_approval_step.',
  },
  {
    name: 'purchase_reorder_check',
    description: 'Analyze stock against the reordering rules and suggest (or auto-create draft) purchase orders for low-stock items. Stock means VIRTUAL stock — on hand − reserved + incoming purchase orders — so a product that already has enough on order is NOT suggested again. The threshold is reorder_rules.min_qty (the same rule procurement_run reads), falling back to products.low_stock_threshold; a product with no threshold anywhere is not suggested. Use when: heartbeat detects low inventory, admin asks for reorder suggestions, or as part of daily automation. NOT for: actual PO creation (use create_purchase_order after review). NOT for: changing the thresholds (use manage_reorder_rule).',
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
    instructions: 'Delegates to list_reorder_candidates — there is ONE replenishment engine, in SQL, and this skill does not compute anything of its own. Stock is VIRTUAL stock from stock_virtual_available (on hand − reserved + incoming open PO lines): a product with 0 on hand and 120 kg already on order is not low. Every returned item carries current_stock, reserved, incoming and virtual_stock so the answer can be checked without re-running anything. Threshold source, in priority order: threshold_override (if given, it replaces every threshold and asks the plain question "what is at or below N") → the active reorder_rules with procurement_method=buy, summed per product → product_stock.reorder_point (legacy) → products.low_stock_threshold. A rule is a MINIMUM: a rule-backed product is low when virtual stock is BELOW min_qty, not at it; the legacy threshold keeps its at-or-below meaning. A product whose only rules are procurement_method=manufacture belongs to mrp_reorder_run and is skipped. A product with no rule and no threshold is not suggested — there is no default reorder point. Reordering rules are set with manage_reorder_rule (action=set) — no UI needed. The vendor comes from reorder_preferred_vendor (reorder_rules.preferred_vendor_id wins, vendor_products.is_preferred fills in); with auto_create it groups by that vendor and creates one DRAFT PO each for an admin to review.',
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
            currency: { type: 'string', description: "ISO code the order is placed in. Omit to take the vendor's own currency." },
            exchange_rate: { type: 'number', description: 'Accounting-currency units per unit of `currency`. Omit to stamp the stored rate for the order date.' },
            order_date: { type: 'string' },
            status: { type: 'string', enum: ['draft', 'sent', 'confirmed', 'partially_received', 'received', 'cancelled'] },
            expected_delivery: { type: 'string' },
            notes: { type: 'string' },
            limit: { type: 'number' },
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
    description: 'Group reorder candidates by resolved vendor and auto-create one draft PO per vendor. Every line comes from list_reorder_candidates, so quantities are computed from VIRTUAL stock (on hand − reserved + incoming) and goods already on order are never ordered again. Use when: nightly reorder run, "create purchase orders". Closes the procure-to-pay loop. Run with p_dry_run=true first to preview the orders and their totals. NOT for: single manual POs (use create_purchase_order). NOT for: changing the thresholds (use manage_reorder_rule).',
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
  processes: ['procure-to-pay'],
  maturity: 'L3',
  description: 'Procure-to-pay lifecycle: purchase orders, vendor management, and goods receipt',
  capabilities: ['data:write', 'data:read'],
  tier: 'extended',
  inputSchema: purchasingInputSchema,
  outputSchema: purchasingOutputSchema,

  skills: [
    'manage_vendor', 'create_purchase_order', 'send_purchase_order',
    'receive_purchase_order', 'match_invoice_to_receipt', 'auto_approve_vendor_invoice',
    'purchase_reorder_check',
    'register_vendor_invoice', 'match_po_to_invoice', 'flag_invoice_variance',
    'update_purchase_order', 'auto_generate_purchase_orders', 'pay_vendor_invoice',
  ],
  data: {
    tables: [
      'goods_receipt_lines',
      'goods_receipts',
      'purchase_order_lines',
      'purchase_orders',
      'rfq_bids',
      'rfq_lines',
      'rfqs',
      'vendor_invoices',
      'vendor_products',
      'procurement_suggestions',
      'tolerance_policies',
      'vendors',
    ],
  },
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
