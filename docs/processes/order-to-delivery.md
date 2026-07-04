# Order-to-Delivery

> From customer order to delivered product. The core e-commerce flow.

**Problem it solves:** Orders arrive faster than the back office can track them — paid-but-never-picked slips through and stock counts drift — this process keeps every order's status honest from checkout to doorstep and warns when a step gets stuck.

**Maturity level:** L3 — Operational
**Status:** ✅ Happy path works; SLA monitor covers manual steps

---

## Modules involved

| Module | Role in the process |
|--------|---------------------|
| **Products** | Order records (`manage_orders`, `place_order`, `lookup_order`), catalog, pricing, cart recovery |
| **Inventory** | Stock reservation, picking (`allocate_picking`/`confirm_pick`/`ship_picking`), adjustments |
| **POS** | In-store sales channel that emits `stock.movement` events into the same fulfillment pipe |
| **SLA** | Monitors that manual steps happen on time |
| **Documents** | Delivery notes, shipping labels |
| **Newsletter** | Order confirmations, delivery notifications |

---

## Step-by-step flow

```mermaid
flowchart TD
    A["Customer checkout (Stripe)"] --> B["Order created — status: unfulfilled"]
    B --> C["Stripe webhook → order.paid"]
    C --> D["Stock reservation (Inventory)<br/>check_stock"]
    D --> E["Picking (manual) — status: picked"]
    E --> F["Packing (manual) — status: packed"]
    F --> G["Shipping (manual) — status: shipped + tracking"]
    G --> H["Delivery — status: delivered<br/>manage_orders"]
    H --> I["SLA monitor warns if a step gets stuck"]

    classDef agent fill:#eef2ff,stroke:#6366f1,color:#312e81;
    class B,C,D,H,I agent
```

*🟦 = agent-runnable step (see Agent coverage below)*

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
