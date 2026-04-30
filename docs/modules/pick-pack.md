---
title: "Pick & Pack — Inventory v2.1"
module_id: "inventory"
version: "2.1.0"
category: "commerce"
autonomy: "agent-capable"
generated: false
generated_at: "2026-04-30"
---

# Pick & Pack (Inventory v2.1)

> Operativt orderfulfillment-flöde där en agent eller en operatör kan styra hela kedjan **paid order → pick-list → pick → ship** — med full lot/serial-spårbarhet och realtidsfeed.

## Varför

Detta är **handbokens primära show case för agentic orkestrering** över flera skills:

```
order.paid (event)
  → allocate_picking         (skapar pick-list + reserverar lager)
  → confirm_pick × N         (operatör/agent bekräftar varje rad, väljer lot)
  → ship_picking             (consumar reservations, skapar stock_moves, emittar picking.shipped)
```

Vid stockout failar `allocate_picking` mjukt och markerar raden `short` — vilket nattens MRP-scheduler (`procurement_run`) plockar upp och föreslår PO/MO för. **Fail-forward genom hela kedjan.**

## Datamodell

| Tabell | Syfte |
|--------|-------|
| `picking_orders` | Ett pick-uppdrag knutet till en order: status, source_location, ship_to, tracking |
| `picking_lines` | Rader i pick-uppdraget: produkt, qty_requested/picked, lot_id, reservation_id, status |

**Statusflöde för `picking_orders`:**
`draft` → `ready` → `in_progress` → `picked` → `shipped` (eller `cancelled`)

**Statusflöde för `picking_lines`:**
`pending` → `reserved` → (`picked` | `short`) → `cancelled`

## Skills (alla MCP-exposed, scope=both)

| Skill | RPC | Vad |
|-------|-----|-----|
| `allocate_picking` | `allocate_picking(p_order_id, p_source_location_id?)` | Skapar pick-list för en betald order. Idempotent — återanvänder öppna picking_orders. Reserverar lager per orderrad via `reserve_stock`. Stockouts markeras som `short`. |
| `confirm_pick` | `confirm_pick(p_line_id, p_qty_picked, p_lot_id?)` | Bekräftar plock på enskild rad. Auto-promotar picking_order till `in_progress` / `picked`. |
| `ship_picking` | `ship_picking(p_picking_order_id, p_tracking_number?, p_carrier?)` | Consumar reservations till verkliga stock_moves, sätter `order.status='shipped'`, emittar `picking.shipped`-event. |
| `cancel_picking` | `cancel_picking(p_picking_order_id, p_reason?)` | Avbryter och frigör reservations. Idempotent. |

Alla RPC:er är `SECURITY DEFINER` och kräver admin- eller employee-roll.

## Auto-allocation (event-driven)

När en order går till `status='paid'` triggas DB-trigger `tr_orders_emit_paid` som emittar event `order.paid` på platform-event-bussen. Modulens automation **"Auto-allocate picking on order paid"** lyssnar på det eventet och anropar `allocate_picking` automatiskt.

**Konfigurerbart i `/admin/automations`** — sätt `executor` till `flowpilot` om du vill att FlowPilot ska resonera kring varje allokering istället för deterministisk dispatch.

## Audit & realtime

Varje steg loggas i `audit_logs` med actions:
- `picking.allocated`
- `picking.picked`
- `picking.shipped`
- `picking.cancelled`
- `picking.consume_failed` (om reservation-konsumtion misslyckas)

UI:t på `/admin/inventory` (tab **Pick & Pack**) prenumererar på `postgres_changes` på `picking_orders` och visar toasts för nya picks, leveranser och avbrutna pickar i realtid.

## UI

`/admin/inventory` → tab **Pick & Pack**:
- KPI-strip: Ready / In Progress / Picked / Shipped
- Lista med filtrering per status
- Manuell allocate-trigger (klistra in order-UUID)
- Detaljdialog: bekräfta varje rad med qty + lot, ship med tracking/carrier, eller avbryt

## Demo-flöde för handboken

```bash
# 1. Skapa en testorder och sätt den som paid (UI eller SQL)
UPDATE orders SET status='paid' WHERE id='<order-uuid>';

# Trigger emittar order.paid → automation kör allocate_picking
# → picking_order skapas, lines reserveras

# 2. Operatör/agent bekräftar plock per rad
SELECT confirm_pick('<line-uuid>', 3, '<lot-uuid>');

# 3. Skicka
SELECT ship_picking('<picking-order-uuid>', 'TRK-12345', 'PostNord');
# → reservations consumas, stock_moves skapas, order.status='shipped',
#   picking.shipped event emittas
```

## Filer

| Syfte | Path |
|-------|------|
| Modul-manifest | `src/lib/modules/inventory-module.ts` |
| Hook | `src/hooks/usePickPack.ts` |
| UI-panel | `src/components/admin/inventory/PickPackPanel.tsx` |
| Sida | `src/pages/admin/InventoryPage.tsx` (tab `pickpack`) |
| Migration | `supabase/migrations/<timestamp>_pick_pack.sql` |

## Vad som INTE ingår (medvetet)

- **Barcode-scanning** — kräver hårdvara/extension; nästa iteration
- **Multi-warehouse routing** — skickar alltid från första aktiva internal location
- **Wave picking / batch picking** — en order = en picking_order
- **Pack-station UI med vågar/kameror** — kräver IoT-bridge

## Memory

Sparad som `mem://erp/pick-pack-fulfillment-flow`.
