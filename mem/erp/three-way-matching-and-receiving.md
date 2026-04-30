---
name: three-way-matching-and-receiving
description: Closes P2P loop. receive_purchase_order RPC + match_invoice_to_receipt + auto_approve_vendor_invoice with ±2% tolerance. Emits goods.received / invoice.matched / invoice.approved.
type: feature
---

# Receiving & 3-Way Matching

Closes the procure-to-pay loop on top of `purchasing-module` and inventory v2.

## Three SECURITY DEFINER RPCs (all MCP-exposed)

1. **`receive_purchase_order(p_purchase_order_id, p_lines jsonb, p_to_location_id?, p_received_date?, p_notes?)`** — atomic goods receipt:
   - Inserts `goods_receipts` + `goods_receipt_lines`
   - Caps qty at `quantity - received_quantity` (no over-receipt)
   - Creates `stock_lots` row when `lot_number` provided
   - Posts `stock_moves` (vendor → internal location, `move_type='in'`, `state='done'`)
   - Updates legacy `product_stock.quantity_on_hand` if row exists
   - Advances PO status: `partially_received` | `received`
   - Emits `goods.received` event
2. **`match_invoice_to_receipt(p_invoice_id, p_tolerance_pct=2.0)`** — 3-way match:
   - Sums `received_qty × unit_price_cents` across all receipts on the PO
   - Variance = `invoice.subtotal_cents - received_value`
   - Sets `vendor_invoices.match_status` ∈ `matched | over_invoiced | under_invoiced | no_receipt | no_po`
   - Emits `invoice.matched`
3. **`auto_approve_vendor_invoice(p_invoice_id)`** — approves only when `match_status='matched'`. Idempotent. Emits `invoice.approved`.

## Automation seeded in purchasing-module

- `Auto-match vendor invoice on registration` — `event: invoice.registered` → `match_invoice_to_receipt({ p_invoice_id: '{{event.payload.invoice_id}}' })`.

The `invoice.registered` event is NOT yet emitted automatically. To wire it: emit from `register_vendor_invoice` or add an `AFTER INSERT` trigger on `vendor_invoices` calling `emit_platform_event('invoice.registered', ...)`. Left as TODO.

## UI

`/admin/inventory` → **Receiving** tab. KPI cards + open-PO table + per-line receive dialog with lot/serial. Realtime via `goods_receipts.INSERT` postgres_changes.

## Hook

`src/hooks/useReceiving.ts` exports: `useOpenPurchaseOrders`, `useOpenPoLines(poId)`, `useRecentGoodsReceipts(limit)`, `useReceivePurchaseOrder()`, `useReceivingRealtime()`.

## Replaced

The previous `receive_goods` skill (handler `db:goods_receipts`, no transactional integrity, no lot capture) is replaced by `receive_purchase_order` (handler `rpc:receive_purchase_order`). Old `useCreateGoodsReceipt` hook in `usePurchasing.ts` still exists and is non-transactional — should be migrated to the RPC over time.

## Files

- Migration: `supabase/migrations/20260430150441_*.sql`
- Module: `src/lib/modules/purchasing-module.ts` (skills + automation)
- Hook: `src/hooks/useReceiving.ts`
- UI: `src/components/admin/inventory/ReceivingPanel.tsx`
- Page: `src/pages/admin/InventoryPage.tsx` (Receiving tab)
- Docs: `docs/modules/receiving.md`
