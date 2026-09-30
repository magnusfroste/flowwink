---
title: "Operations Department — External Claw Playbook"
audience: "external operators (OpenClaw, ClawThree, Claude Desktop, custom MCP claws)"
last_updated: "2026-05-04"
description: This playbook lets an external claw act as FlowWink's operations department — running inventory, purchasing, order fulfillment, manufacturing, and field service — without FlowPi…
category: agents
---

# Operations Department Playbook

This playbook lets an **external claw** act as FlowWink's operations department —
running inventory, purchasing, order fulfillment, manufacturing, and field service
— **without FlowPilot involvement**.

## Connect

```http
POST https://<your-site>/functions/v1/mcp-server
Authorization: Bearer <MCP_API_KEY>
```

## Pull only the operations toolkit

```http
GET /rest/tools?groups=operations
```

`operations` expands to:

| Category | What you get | Example skills |
|----------|--------------|----------------|
| `commerce` | Orders, products, stock, vendors, POs | `manage_orders`, `manage_product`, `adjust_quant`, `manage_vendor`, `update_purchase_order`, `record_pos_sale_v2` |
| `analytics` | Stock levels, throughput | `analytics_dashboard` |
| `automation` | Utilities | `process_signal`, `extract_pdf_text`, `upload_document` |

## End-to-end ops loop

### 1. Order fulfillment

```jsonc
// Fetch unfulfilled orders
{"tool":"manage_order","arguments":{"action":"list","status":"unfulfilled"}}

// Allocate stock & mark for picking
{"tool":"manage_order","arguments":{
  "action":"update",
  "id":"<order_id>",
  "status":"picking"
}}

// Confirm shipment
{"tool":"manage_order","arguments":{
  "action":"ship",
  "id":"<order_id>",
  "tracking_number":"...",
  "carrier":"postnord"
}}
```

Lifecycle: `unfulfilled → picking → packed → shipped → delivered`.
See `mem://ecommerce/order-fulfillment-lifecycle`.

### 2. Stock monitoring

```jsonc
{"tool":"manage_stock","arguments":{"action":"list","below_reorder_point":true}}
// → list of SKUs needing reorder
```

### 3. Auto-reorder (procure-to-pay)

```jsonc
// Pick a vendor
{"tool":"manage_vendor","arguments":{
  "action":"list",
  "supplies_product_id":"<product_id>"
}}

// Draft a PO
{"tool":"manage_purchase_order","arguments":{
  "action":"create",
  "vendor_id":"<vendor_id>",
  "lines":[
    {"product_id":"<id>","quantity":50,"unit_cost_cents":12000}
  ],
  "expected_delivery":"2026-05-15"
}}
// → draft PO, awaits human approve before sending
```

### 4. Goods receipt

When the shipment arrives:

```jsonc
{"tool":"manage_purchase_order","arguments":{
  "action":"receive",
  "id":"<po_id>",
  "received":[
    {"product_id":"<id>","quantity":48}   // partial OK
  ]
}}
// → emits stock.movement event → stock_quants updated automatically
```

See `mem://erp/stock-event-listener` — never write `stock_quants` directly.

### 5. Manufacturing (if module enabled)

```jsonc
// Bill of materials → production order
{"tool":"manage_production_order","arguments":{
  "action":"create",
  "product_id":"<finished_good>",
  "quantity":100,
  "due_date":"2026-05-20"
}}

// Mark complete (consumes components, produces output)
{"tool":"manage_production_order","arguments":{
  "action":"complete",
  "id":"<mo_id>",
  "actual_quantity":98,
  "scrap":2
}}
```

### 6. Field service dispatch

```jsonc
// List open service orders
{"tool":"manage_service_order","arguments":{"action":"list","status":"unassigned"}}

// Assign technician
{"tool":"manage_service_order","arguments":{
  "action":"assign",
  "id":"<so_id>",
  "technician_id":"<user_id>",
  "scheduled_at":"2026-05-08T09:00:00Z"
}}
```

### 7. POS reconciliation (if POS in use)

```jsonc
// Close the day's POS session — emits batch journal
{"tool":"close_pos_session_v2","arguments":{"session_id":"<id>"}}
```

### 8. Daily ops digest

```jsonc
{"tool":"analytics_query","arguments":{"metric":"orders_shipped","period":"day"}}
{"tool":"analytics_query","arguments":{"metric":"stock_value","date":"today"}}
{"tool":"analytics_query","arguments":{"metric":"pending_pos","period":"week"}}
```

## Approval gating

| Skill | trust_level | Why |
|-------|-------------|-----|
| `manage_orders` (status updates) | `notify` | Standard fulfillment flow. |
| `adjust_quant` (adjust) | **`approve`** | Inventory write-down — gated. |
| `update_purchase_order` (create draft) | `notify` | Drafts only. |
| `update_purchase_order` (send to vendor) | **`approve`** | Commits cost. |
| `update_purchase_order` (receive) | `notify` | Goods-receipt is operational. |
| `record_pos_sale_v2`, `close_pos_session_v2` | `notify` | Operational. |

## What's NOT exposed

| Skill | Why hidden |
|-------|------------|
| Direct `stock_quants` write | Always go through `stock.movement` events. |
| `a2a_*`, `openclaw_*` | FlowPilot peer-comms primitives. |
| `manage_objective`, agent objectives | Cognition layer. |

## Audit & limits

- **Rate limits**: ~60 req/min per MCP key.
- **Audit**: `agent_executions` + every stock change tracked via
  `agent_events` (event_name='stock.movement').
- **Idempotency**: Order status transitions are guarded — calling `ship` twice
  is safe.

## Related

- `mem://ecommerce/order-fulfillment-lifecycle`
- `mem://erp/stock-event-listener`
- `mem://erp/purchasing-and-procure-to-pay-loop`
- `mem://ecommerce/pos-v2-odoo-style`
- `docs/modules/inventory.md`, `docs/modules/purchasing.md`,
  `docs/modules/manufacturing.md`, `docs/modules/field-service.md`,
  `docs/modules/pos.md`
