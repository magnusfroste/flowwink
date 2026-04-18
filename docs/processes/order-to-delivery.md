# Order-to-Delivery

> Från kundorder till levererad produkt. E-handelns kärnflöde.

**Mognadsnivå:** L3 — Operational
**Status:** ✅ Happy path fungerar; SLA-monitor täcker manuella steg

---

## Moduler som ingår

| Modul | Roll i processen |
|-------|------------------|
| **E-commerce** | Order-records, fulfillment-stadier |
| **Products** | Produktkatalog, varianter, pris |
| **Inventory** | Lagerreservation, plockning, justering |
| **SLA** | Övervakar att manuella steg sker i tid |
| **Documents** | Följesedel, fraktetiketter |
| **Newsletter** | Order-bekräftelser, leveransnotiser |

---

## Steg-för-steg flöde

```
Customer checkout (Stripe-integration)
       ↓
Order skapas — status: unfulfilled (E-commerce)
       ↓
Stripe webhook → order.paid
       ↓
Lagerreservation (Inventory)
       ↓
[Manuell] Plockning → status: picked
       ↓
[Manuell] Packning → status: packed
       ↓
[Manuell] Frakt → status: shipped + tracking
       ↓
Leverans → status: delivered
       ↓
SLA-monitor varnar om något steg fastnar
```

---

## Agent-täckning

| Steg | 👤 Manuell | 🤖 FlowPilot | 🔗 Extern agent |
|------|-----------|-------------|-----------------|
| Order-mottagning | — | ✅ Auto (Stripe webhook) | — |
| Stock-check | ✅ | ✅ (`check_stock`) | — |
| Cart recovery | — | ✅ (`cart_recovery_check`) | — |
| Plock/pack/ship | ✅ | — | — |
| Order status-uppdatering | ✅ | ✅ (`manage_orders`) | — |
| Kundnotiser | ✅ | ✅ (Newsletter automation) | — |
| SLA-eskalering | — | ✅ (SLA-modulen) | — |

---

## Kända luckor (saknas för L5)

- ❌ Integration mot WMS / fraktbolag (Postnord, DHL APIs)
- ❌ Returer / RMA-flöde
- ❌ Multi-warehouse fulfillment-routing
- ❌ Pre-orders / backorder-hantering (delvis via `back_in_stock_requests`)
- ❌ Picklists / pack-stationer i UI

---

## Webhook-events

`order.created`, `order.paid`, `order.fulfilled`, `stock.low`, `stock.adjusted`

---

## Bäst för

D2C / e-handel med fysiska produkter, måttlig volym (< 1000 ordrar/dag), egen fulfillment eller enkel 3PL.

## Inte för

Marketplace med många säljare, eller höggradigt automatiserade fulfillment-centers (kräver WMS).
