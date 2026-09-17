---
title: "Plan-to-Produce"
category: processes
description: Light-assembly SMBs: craft producers, electronics kitting, food/beverage batch makers — anyone whose 'manufacturing' is a BOM and a bench, not a factory line.
---

# Plan-to-Produce

> From "we need to make more" to finished goods on the shelf: BOM → availability
> check → manufacturing order → work orders → complete → finished-goods stock.
> The making mirror of Order-to-Delivery.

**Problem it solves:** What a product is made of lives in someone's head, nobody knows if components suffice before starting, and finished quantities never match the stock system — this process gives every product a bill of materials, checks component availability before committing, and posts component consumption + finished goods to inventory automatically.

**Maturity level:** L3 — Operational (agent path verified E2E; shop-floor UI is the gap)
**Status:** ✅ PO → goods receipt → MO → confirm → start → complete → finished-goods stock validated live, uncoached, by an external operator (2026-06)

---

## Modules involved

| Module | Role in the process |
|--------|---------------------|
| **Manufacturing** | BOMs, manufacturing orders, work centers, routing operations, work orders |
| **Products** | The finished good + component catalog (UoM per product) |
| **Inventory** | Component reservation/consumption, finished-goods receipt, valuation layers; inter-warehouse replenishment (`transfer_stock`) + reorder rules (`reorder_rules`) |
| **Purchasing** | Procurement of missing components (`trigger_procurement_for_mo`); reorder review (`list_reorder_candidates`) → MRP draft-MO run (`mrp_reorder_run`, a manufacturing-module skill) |

---

## Step-by-step flow

```mermaid
flowchart TD
    A["BOM defined per product<br/>manage_bom"]
    A --> B["Demand — manual, reorder rule or MRP run<br/>mrp_reorder_run"]
    B --> C["MO created (number auto-generated)<br/>create_manufacturing_order"]
    C --> D["Component availability check<br/>check_mo_availability"]
    D -->|shortage| E["Procurement triggered → PO → goods receipt<br/>trigger_procurement_for_mo"]
    E --> D
    D -->|available| F["Confirmed — components snapshotted and reserved in the warehouse<br/>confirm_manufacturing_order"]
    F --> G["Work orders generated per routing operation<br/>generate_mo_work_orders"]
    G --> H["Started<br/>start_manufacturing_order"]
    H --> I["Completed — components consumed FEFO, finished goods into stock at material + labor cost<br/>complete_manufacturing_order"]

    classDef agent fill:#eef2ff,stroke:#6366f1,color:#312e81;
    class A,B,C,D,E,F,G,H,I agent
```

*🟦 = agent-runnable step (see Agent coverage below)*

---

## Participating modules & skills

| Step | Module | Skills |
|---|---|---|
| Define | manufacturing | `manage_bom` (components + qty per unit), `manage_work_center`, `manage_routing_operation` |
| Plan | manufacturing + purchasing | `mrp_reorder_run`, `trigger_procurement_for_mo` |
| Order | manufacturing | `create_manufacturing_order`, `list_manufacturing_orders`, `check_mo_availability` |
| Execute | manufacturing | `confirm_manufacturing_order` (reserves components) → `generate_mo_work_orders` → `start_manufacturing_order` → `complete_manufacturing_order` (refuses open work orders and short components) — `cancel_manufacturing_order` exits and releases the reservations |
| Stock effects | inventory | availability is read from `stock_quants` less other orders' reservations (the product mirror when no quant exists); completion consumes components FEFO out of WH/MAIN (`mo_consumption` moves priced from the layers) and receives the finished goods into WH/MAIN at material + labor cost (`mo_production` move → valuation layer) |

---

## Agent coverage

| Actor | What they run |
|---|---|
| 👤 Manual | Manufacturing admin (BOMs, MO list/detail) |
| 🤖 FlowPilot | MRP reorder runs, availability checks, MO lifecycle |
| 🔗 External agent | full loop over MCP — the whole PO → GR → MO → complete → stock chain was run uncoached by OpenClaw |

---

## Known gaps (parity scorecards)

- ✅ **Shop-floor execution** (2026-08-02) — `progress_work_order` (start/pause/done/cancel) writes `started_at`, `completed_at`, `actual_minutes` and `actual_labor_cost_cents`; the MO card's work-order panel shows actual-vs-planned variance per operation and totals. Still ❌: per-operator work logs and capacity scheduling (`manufacturing#capacity_scheduling`)
- ❌ Backorder/partial MO completion (produce 80 of 100, keep the rest open)
- ❌ Scrap reporting + quality checks (Odoo Quality)
- ❌ By-products / co-products on the BOM
- ❌ Subcontracted manufacturing
- ⚠️ UoM on BOM lines — components consume in the product's unit; per-line purchase-vs-consume UoM conversion is tracked under products#uom depth

---

## Webhook events

(None dedicated yet — candidates: `mo.created`, `mo.completed`, `stock.produced`)

---

## Best for

Light-assembly SMBs: craft producers, electronics kitting, food/beverage batch makers — anyone whose "manufacturing" is a BOM and a bench, not a factory line.

## Not for

Multi-level MRP with capacity finite-scheduling, subcontracting chains, or process manufacturing with formulas/yields — that is Odoo MRP/PLM territory.
