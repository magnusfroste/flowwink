---
title: Process Gaps — which end-to-end flows we're missing
description: The process dimension of the parity program — which business processes to add, beyond the 8 we have.
category: concepts
---

# Process Gaps

The parity program has **two dimensions**:

1. **Module depth** — how deep each module is vs Odoo (tracked in `parity-matrix.md`).
2. **Process completeness** — can we run a whole business flow end-to-end? (this doc)

[`docs/processes/`](../processes/README.md) defines **8 core processes** today. This
doc lists the **end-to-end processes we are missing** and should add. A process is
worth adding when several modules already touch it but no document owns the *flow*,
the hand-offs, or the agent coverage — so today the flow only half-exists.

## The 8 we have

`lead-to-customer` (L4) · `quote-to-cash` (L3) · `procure-to-pay` (L3) ·
`order-to-delivery` (L3) · `hire-to-retire` (L3) · `content-to-conversion` (L4) ·
`record-to-report` (L3) · `support-to-resolution` (L3)

## Tell-tale: modules with no process of their own

Several modules are bolted onto a process that doesn't really describe them — a
sign the real process is missing:

| Module | Currently mapped to | Real process it needs |
|---|---|---|
| `subscriptions` | quote-to-cash | **Subscribe-to-Renew** |
| `returns` | order-to-delivery | **Return-to-Refund** |
| `manufacturing` | procure-to-pay, order-to-delivery | **Plan-to-Produce** |
| `fixed-assets` | record-to-report | **Acquire-to-Retire** |

## Proposed new processes (prioritised)

Priority weighs business value × how much of the flow already exists. Each is
**blocked** by specific module-depth gaps already tracked in the matrix — process
work and depth work reinforce each other.

### P1 — Subscribe-to-Renew (recurring revenue) — ✅ SHIPPED L3 (2026-06-12, see docs/processes/subscribe-to-renew.md)
*Signup → bill on cycle → dunning → churn/win-back → renew/expand.*
- **Modules:** subscriptions, invoicing, accounting, crm
- **Blocked by:** `invoicing#recurring` (weight 3), `subscriptions#proration`,
  `subscriptions#dunning_sequences`, `subscriptions#plan_templates`
- **Why P1:** recurring revenue is the dominant SaaS/SMB model; the module exists but
  the billing backbone (recurring invoices) is missing. High value, clear path.
- **Reachable maturity once unblocked:** L3 → L4 (agent runs dunning + win-back).

### P2 — Return-to-Refund (reverse logistics)
*Return request → approve → receive → inspect/QC → restock → refund/credit.*
- **Modules:** returns, inventory, invoicing, accounting, shipping
- **Blocked by:** `returns#inspection_qc`, `returns#partial_refund`,
  `returns#return_to_vendor`, `shipping#return_labels`
- **Why P2:** completes the commerce loop (order-to-delivery's mirror); RMA lifecycle
  already exists, gaps are well-scoped.
- **Reachable maturity:** L3.

### P3 — Plan-to-Produce (manufacturing end-to-end)
*Demand/MO → BOM → work orders → production → finished-goods stock + cost.*
- **Modules:** manufacturing, inventory, purchasing, products
- **Blocked by:** `manufacturing#work_centers_routing` (weight 3),
  `manufacturing#mrp_reorder`, `inventory#valuation` (EPIC-02), EPIC-01 variants
- **Why P3:** highest unblock cost (depends on EPIC-01 + EPIC-02 + manufacturing
  depth) but turns manufacturing from L2 stub into a real process.
- **Reachable maturity:** L2 → L3 after the blockers land.

### P4 — Forecast-to-Stock (demand & replenishment planning)
*Demand signal/forecast → reorder/MRP → PO or MO → receive → available-to-promise.*
- **Modules:** inventory, purchasing, products, (sales signals)
- **Blocked by:** demand forecasting (new), `inventory#multi_step_routes`,
  `inventory#interwarehouse`; reorder + procurement_run already exist
- **Why P4:** the planning front-end to procure-to-pay/plan-to-produce. Much already
  exists (procurement_run); needs a forecasting input.
- **Reachable maturity:** L3.

### P5 — Campaign-to-Lead (demand generation)
*Campaign → multi-channel send (email/SMS/social/ads) → capture → attribution → MQL.*
- **Modules:** growth, newsletter, email, forms, crm, analytics + new `sms-marketing`,
  `social-marketing`
- **Blocked by:** `crm#bulk_email`, breadth modules `sms-marketing`/`social-marketing`,
  campaign attribution
- **Why P5:** extends content-to-conversion's top-of-funnel into true multi-channel
  demand gen (Odoo Marketing Automation / Email / SMS / Social).
- **Reachable maturity:** L4 (agent already strong on content).

### P6 — Acquire-to-Retire (asset lifecycle)
*Acquire/capitalise → depreciate → revalue/impair → dispose.*
- **Modules:** fixed-assets, accounting, purchasing
- **Blocked by:** mostly documentation; `fixed-assets#impairment`,
  `fixed-assets#schedule_report` would lift depth
- **Why P6:** fixed-assets is already fairly deep; this is largely formalising the
  flow as its own process. Low cost.
- **Reachable maturity:** L3 now.

### P7 (optional) — Forecast-to-Plan (budgeting / FP&A)
*Budget → actuals → variance → reforecast.*
- **Modules:** accounting + new budgeting capability/module
- **Blocked by:** `accounting#budgets`, `accounting#cash_flow_forecast`
- **Why optional:** high value for finance maturity but needs net-new budgeting model;
  sequence after the commerce backbone.

### P8 (optional) — Register-to-Attend (events/webinars)
*Promote → register → remind → attend → follow-up → lead.*
- **Modules:** webinars, newsletter, crm, calendar
- **Why optional:** `webinars` exists but thin; lower business priority than P1–P6.

## Recommendation

Add **P1, P2, P6 now** (modules exist, gaps small) and write their process docs in
`docs/processes/` following the existing template. Sequence **P3, P4** behind
EPIC-01/EPIC-02 (they share the same structural blockers). Treat **P5** as the home
for the `sms-marketing` / `social-marketing` breadth modules. Defer **P7, P8**.

Every new process doc must, like the existing 8: state a maturity level, list
participating modules, mark agent coverage (👤 / 🤖 / 🔗), and link back to the
capability gaps that gate its next maturity bump.
