# Order-to-Delivery

> From customer order to delivered product. The core e-commerce flow.

**Maturity level:** L3 — Operational
**Status:** ✅ Happy path works; SLA monitor covers manual steps

---

## Modules involved

| Module | Role in the process |
|--------|---------------------|
| **E-commerce** | Order records, fulfillment stages |
| **Products** | Product catalog, variants, pricing |
| **Inventory** | Stock reservation, picking, adjustments |
| **SLA** | Monitors that manual steps happen on time |
| **Documents** | Delivery notes, shipping labels |
| **Newsletter** | Order confirmations, delivery notifications |

---

## Step-by-step flow

```
Customer checkout (Stripe integration)
       ↓
Order created — status: unfulfilled (E-commerce)
       ↓
Stripe webhook → order.paid
       ↓
Stock reservation (Inventory)
       ↓
[Manual] Picking → status: picked
       ↓
[Manual] Packing → status: packed
       ↓
[Manual] Shipping → status: shipped + tracking
       ↓
Delivery → status: delivered
       ↓
SLA monitor warns if a step gets stuck
```

---

## Agent coverage

| Step | 👤 Manual | 🤖 FlowPilot | 🔗 External agent |
|------|----------|-------------|-------------------|
| Order intake | — | ✅ Auto (Stripe webhook) | — |
| Stock check | ✅ | ✅ (`check_stock`) | — |
| Cart recovery | — | ✅ (`cart_recovery_check`) | — |
| Pick/pack/ship | ✅ | — | — |
| Order status updates | ✅ | ✅ (`manage_orders`) | — |
| Customer notifications | ✅ | ✅ (Newsletter automation) | — |
| SLA escalation | — | ✅ (SLA module) | — |

---

## Known gaps (missing for L5)

- ❌ Integrations with WMS / carriers (Postnord, DHL APIs)
- ❌ Returns / RMA flow
- ❌ Multi-warehouse fulfillment routing
- ❌ Pre-orders / backorder handling (partly via `back_in_stock_requests`)
- ❌ Picklists / pack stations in the UI

---

## Webhook events

`order.created`, `order.paid`, `order.fulfilled`, `stock.low`, `stock.adjusted`

---

## Best for

D2C / e-commerce with physical products, moderate volume (< 1000 orders/day), self-fulfillment or simple 3PL.

## Not for

Marketplaces with many sellers, or highly automated fulfillment centers (require WMS).
