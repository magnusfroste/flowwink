---
name: Pick & Pack Fulfillment Flow
description: Inventory v2.1 operativt orderfulfillment via 4 MCP-skills, event-driven från order.paid med fail-forward till MRP
type: feature
---

# Pick & Pack Fulfillment Flow (Inventory v2.1)

Operativt flöde ovanpå Inventory v2 reservations + lots. **Handbokens primära show case för agentic skill-orkestrering.**

## Skills (alla MCP-exposed, scope=both)

| Skill | RPC | Roll i flödet |
|-------|-----|---------------|
| `allocate_picking(p_order_id, p_source_location_id?)` | rpc | Skapar `picking_orders` + `picking_lines`, reserverar via `reserve_stock`. Idempotent. Stockouts → `status='short'`. |
| `confirm_pick(p_line_id, p_qty_picked, p_lot_id?)` | rpc | Bekräftar enskild plock-rad, sätter lot. Auto-promotar `picking_orders.status` till `in_progress` / `picked`. |
| `ship_picking(p_picking_order_id, p_tracking_number?, p_carrier?)` | rpc | Consumar reservations (→ stock_moves), `orders.status='shipped'`, emittar `picking.shipped`. |
| `cancel_picking(p_picking_order_id, p_reason?)` | rpc | Avbryter och frigör alla reservations. Idempotent. |

## Event-driven kedja

`order.status='paid'` → DB-trigger `tr_orders_emit_paid` → emit `order.paid` → automation **"Auto-allocate picking on order paid"** → `allocate_picking({{event.payload.order_id}})`.

Vid stockout: rad blir `short` → nästa nattliga `procurement_run` plockar upp och föreslår PO/MO. **Fail-forward, ingen blockering.**

## Datamodell

- `picking_orders`: status enum `draft|ready|in_progress|picked|shipped|cancelled`, source_location, ship_to, tracking, assigned_to
- `picking_lines`: status enum `pending|reserved|picked|short|cancelled`, lot_id, reservation_id, qty_requested/qty_picked

## Audit

`picking.allocated`, `picking.picked`, `picking.shipped`, `picking.cancelled`, `picking.consume_failed` i `audit_logs`. UI prenumererar på `postgres_changes` på `picking_orders` med toast-feed.

## Filer

- Migration: `supabase/migrations/<ts>_pick_pack.sql`
- Hook: `src/hooks/usePickPack.ts`
- UI: `src/components/admin/inventory/PickPackPanel.tsx` (tab på `/admin/inventory`)
- Modul: `src/lib/modules/inventory-module.ts` (skillSeeds + INVENTORY_AUTOMATIONS)
- Docs: `docs/modules/pick-pack.md`

## Behörighet

RPC:er gated på `has_role(admin)` eller `has_role(employee)`. RLS på tabellerna: admin full, employee read, operatör (assigned_to=auth.uid()) read+update på sina egna picks.
