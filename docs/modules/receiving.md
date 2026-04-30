# Receiving & 3-Way Matching

Closes the procure-to-pay loop: physical goods arrive → receipts post stock → vendor invoices auto-match against PO + received quantities → matched invoices auto-approve.

## Flow

```
PO (sent/confirmed)
   │
   ▼
receive_purchase_order ──► goods_receipts (+ lines)
                       ├─► purchase_order_lines.received_quantity ↑
                       ├─► stock_moves (vendor → internal location)
                       ├─► product_stock.quantity_on_hand ↑   (legacy fallback)
                       └─► PO.status → partially_received | received
                       └─► emit event: goods.received

vendor_invoices.INSERT  ──► automation: invoice.registered
                       └─► match_invoice_to_receipt
                              ├─► sums received_qty × unit_price across all receipts on PO
                              ├─► variance = invoice.subtotal - received_value
                              └─► match_status ∈ { matched | over_invoiced | under_invoiced
                                                 | no_receipt | no_po }
                              └─► emit event: invoice.matched

invoice.matched (status=matched) ──► auto_approve_vendor_invoice
                                  └─► status='approved', approved_at, approved_by
                                  └─► emit event: invoice.approved
```

## Skills (all MCP-exposed)

| Skill | Handler | Purpose |
|---|---|---|
| `receive_purchase_order` | `rpc:receive_purchase_order` | Atomic goods receipt with stock_move + lot/serial capture |
| `match_invoice_to_receipt` | `rpc:match_invoice_to_receipt` | 3-way match with configurable tolerance (default ±2%) |
| `auto_approve_vendor_invoice` | `rpc:auto_approve_vendor_invoice` | Approve when match_status=matched |

## SECURITY DEFINER RPCs

All three are `SECURITY DEFINER SET search_path = public`, granted to `authenticated` and `service_role`.

### `receive_purchase_order(p_purchase_order_id, p_lines, p_to_location_id?, p_received_date?, p_notes?)`

`p_lines` is a JSONB array:
```json
[
  {"po_line_id": "uuid", "quantity_received": 5, "lot_number": "L-2026-A", "expiration_date": "2027-04-30"}
]
```

- Caps `quantity_received` at `quantity - received_quantity` per line (no over-receipt).
- Skips zero-quantity lines.
- Creates a lot row (`stock_lots`) when `lot_number` is provided.
- Falls back to `product_stock.quantity_on_hand` update when row exists (keeps legacy hook in sync alongside v2 stock_moves).
- Throws if PO is not in `sent | confirmed | partially_received`.

### `match_invoice_to_receipt(p_invoice_id, p_tolerance_pct?)`

Default tolerance: `2.0` percent. Returns:
```json
{ "success": true, "match_status": "matched", "variance_cents": 0, "variance_pct": 0.0,
  "received_value_cents": 1000000, "po_total_cents": 1000000, "notes": "Within 2.00% tolerance" }
```

### `auto_approve_vendor_invoice(p_invoice_id)`

Refuses if `match_status <> 'matched'`. Idempotent on already-approved invoices.

## Automations

- **Auto-match vendor invoice on registration** — `event: invoice.registered` → `match_invoice_to_receipt({ p_invoice_id: '{{event.payload.invoice_id}}' })`.

The `invoice.registered` event needs to be emitted by `register_vendor_invoice` (or by a DB trigger on `vendor_invoices.INSERT`) — left to the vendor-invoice flow to wire.

## UI

`/admin/inventory` → **Receiving** tab:
- 3 KPI cards: Awaiting receipt, Partially received, Receipts today
- Table of open POs (`sent | confirmed | partially_received`)
- Receive dialog: per-line quantity + optional lot/serial, "Fill all remaining" shortcut
- Recent receipts table (last 15) with realtime invalidation on `goods_receipts.INSERT`

## Events emitted

- `goods.received` — payload: `receipt_id, purchase_order_id, po_number, vendor_id, lines_received, total_quantity, po_status`
- `invoice.matched` — payload: `invoice_id, purchase_order_id, match_status, variance_cents, variance_pct`
- `invoice.approved` — payload: `invoice_id, auto: true`

Downstream consumers (FlowPilot or other automations) can subscribe via `trigger_type='event'`.
