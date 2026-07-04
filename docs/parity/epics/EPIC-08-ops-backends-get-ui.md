---
title: "EPIC-08 — Ops backends get their UI"
status: planned
sprint: R1
owner: unassigned
---

# EPIC-08 — Ops backends get their UI

## Why
The 2026-06-27 reconcile wave shipped a whole tier of operational backends —
work centers/routing/work orders, cycle counts, reconciliation rules, shipping
rate cards, budgets, expense policies, payroll pension/sick-pay — as
schema + RPC + skill, but **none of them got an admin surface**, so the
dual-surface law caps them all at `partial`. An agent can run them; a human
can neither configure nor follow them. That breaks the "titthål" principle
(the human must be able to verify what the agent did) and blocks three
processes: order-to-delivery (shipping), plan-to-produce (manufacturing) and
record-to-report (budgets/reconciliation/payroll).

This epic is UI + wiring only — the engines exist and several were
scratch-Postgres-verified in June. Odoo reference: each of these is a
first-class screen in Inventory/Manufacturing/Accounting.

## Outcome (Definition of Done for the whole epic)
- [ ] Every listed capability has an admin surface + its existing skill → done
      (Stage-3 verified live, same rule as EPIC-05)
- [ ] shipping ≥ 40%, manufacturing ≥ 65%, reconciliation ≥ 60%,
      payroll ≥ 55%, accounting ≥ 55%
- [ ] Expense policies actually evaluated in the expense-create path (not just
      via the standalone skill)
- [ ] `npx vitest run` + parity check green

## Capabilities delivered
| File | Capability id | From → To |
|---|---|---|
| `capabilities/shipping.json` | `weight_rate_calc`, `dimensional_weight` | partial → done |
| `capabilities/shipping.json` | `delivery_estimation` | missing → partial |
| `capabilities/inventory.json` | `cycle_count` | partial → done |
| `capabilities/manufacturing.json` | `work_centers_routing`, `work_orders`, `mrp_reorder` | partial → done |
| `capabilities/reconciliation.json` | `rule_engine`, `reconciliation_report` | partial → done |
| `capabilities/accounting.json` | `budgets` | partial → done |
| `capabilities/expenses.json` | `policy_limits` | partial → done |
| `capabilities/payroll.json` | `pension`, `sick_pay` | partial → done |

## Issues

- [ ] **08.1 — Shipping rate cards** *(shipping)*
  - Admin table for `shipping_rates` (weight bands, dim-factor); a rate-test
    widget calling `calc_shipping_rate`; show the chosen rate + ETA hint on
    the order fulfillment view (`delivery_estimation` missing → partial).

- [ ] **08.2 — Cycle counts** *(inventory)*
  - Count-session page: start a count from `manage_inventory_count`, enter
    counted quantities, post variances; variance list per session.

- [ ] **08.3 — Manufacturing floor surfaces** *(manufacturing)*
  - Work-center list + routing editor on ManufacturingPage; generate work
    orders from an MO and step them through; a reorder-suggestions panel
    surfacing `mrp_reorder_run` output with approve/reject.

- [ ] **08.4 — Reconciliation rules & report** *(reconciliation)*
  - Rules table (pattern → account) with test-against-history preview;
    "Apply rules" action; report tab rendering `reconciliation_report`.

- [ ] **08.5 — Finance finishes** *(accounting, expenses, payroll)*
  - Budgets: editor per account/period + budget-vs-actual variance view
    (RPCs exist). Expense policies: admin editor + evaluate on expense create
    with a clear block/needs-approval message. Payroll: apply pension +
    sick-pay in the run flow UI so the posted run reflects them.
