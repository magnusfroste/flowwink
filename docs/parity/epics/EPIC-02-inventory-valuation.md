---
title: "EPIC-02 — Inventory valuation & COGS"
status: planned
sprint: 2
owner: unassigned
---

# EPIC-02 — Inventory valuation & COGS

## Why
Without stock valuation, `accounting` can never reconcile to `inventory`: there is
no cost basis, no COGS posting, and the balance sheet's inventory line is fiction.
Odoo posts a valuation layer on every stock move and (in automated mode) a journal
entry. This epic makes inventory financially real. It depends on EPIC-01 because
COGS is computed per variant and posted per normalized order line.

## Outcome (Definition of Done for the whole epic)
- [ ] Capabilities → `done` in `inventory.json`: `valuation`, `landed_costs`
- [ ] `inventory` parity ≥ 60%
- [ ] Every shipped capability is dual-surface (MCP skill + admin UI)
- [ ] Inventory balance-sheet account ties out to Σ valuation layers (test query)
- [ ] `npx vitest run` + `npm run lint` green

## Capabilities delivered
| File | Capability id | From → To |
|---|---|---|
| `capabilities/inventory.json` | `valuation` | missing → done |
| `capabilities/inventory.json` | `landed_costs` | missing → partial |

## Issues

- [ ] **02.1 — Valuation layers (FIFO + weighted-average)**
  - **Migration:** `stock_valuation_layers` (id, product_id, variant_id, move_id,
    quantity, unit_cost_cents, value_cents, remaining_qty). Costing method on product
    category (`fifo` | `average`). Idempotent.
  - **Handler:** every `stock_move` of type `in` creates a layer; every `out`
    consumes layers per method and stamps unit cost.
  - Flips `inventory.json#valuation` → done (data layer).

- [ ] **02.2 — COGS journal posting**
  - **Edge fn / handler:** on `out` move tied to a sale, post Dt COGS / Cr Inventory
    using BAS accounts; on `in` (receipt), post Dt Inventory / Cr GRNI. Reuse the
    journal-entry posting pattern from `book_expense_report`.
  - **Verify:** a sale of a valued product produces a balanced JE; revenue and COGS
    appear in `accounting_reports` income_statement.

- [ ] **02.3 — Landed cost allocation**
  - **Migration/handler:** allocate freight/duty across received lines into the
    valuation layer (by value or by weight). Scope: allocation on receipt only.
  - Flips `inventory.json#landed_costs` → partial.

- [x] **02.4 — Valuation report + reconciliation check** *(inventory_valuation_report #30 + inventory_gl_reconciliation skill: GL 1460 vs Σ layers w/ unbooked-receipt breakdown; runtime-verified — EPIC-02 COMPLETE)*
  - **Admin UI / report:** stock valuation report by product/location.
  - **Test:** assert inventory GL account balance == Σ `remaining_qty × unit_cost`.

## Dependencies & sequencing
Requires EPIC-01 (variant_id on moves, normalized order lines). 02.1 → 02.2 → 02.4;
02.3 after 02.1.

## How we measure success
`parity-report.ts` shows `inventory` ≥ 60%. Reconciliation test passes: GL inventory
account equals the sum of open valuation layers within rounding tolerance.
