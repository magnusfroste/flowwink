---
title: "EPIC-04 — Multi-step approval chains"
status: planned
sprint: 1
owner: unassigned
---

# EPIC-04 — Multi-step approval chains

## Why
`approvals` today does single-role threshold routing. Real ERP controls need
**sequential chains** (manager → director → CFO), **groups** (any-of-N),
**delegation**, and **expiry/escalation**. Because `approvals` is a shared
primitive, lifting it once back-fills `purchasing`, `quotes`, `expenses` and
`payroll` at the same time. Independent of the other epics — can run in parallel.

## Outcome (Definition of Done for the whole epic)
- [ ] Capabilities → `done` in `approvals.json`: `approval_chains`, `approval_groups`,
      `delegation`, `expiration`
- [ ] `approvals` parity ≥ 60%
- [ ] Chain management + approve/reject are dual-surface (skills + admin UI)
- [ ] At least two consumer modules (`purchasing`, `expenses`) routed through chains
- [ ] `npx vitest run` + `npm run lint` green

## Capabilities delivered
| File | Capability id | From → To |
|---|---|---|
| `capabilities/approvals.json` | `approval_chains` | missing → done |
| `capabilities/approvals.json` | `approval_groups` | missing → done |
| `capabilities/approvals.json` | `delegation` | missing → done |
| `capabilities/approvals.json` | `expiration` | missing → partial |

## Issues

- [ ] **04.1 — Chain & step data model**
  - **Migration:** `approval_chains` (id, entity_type, name), `approval_steps`
    (id, chain_id, sort_order, required_role | group_id, min_approvals). Extend
    `approval_requests` with `current_step`. Idempotent.

- [ ] **04.2 — Step advancement engine**
  - **Handler:** approving the current step advances `current_step`; request is
    `approved` only when the last step clears. Any rejection stops the chain.
  - Flips `approvals.json#approval_chains` → done.

- [ ] **04.3 — Approval groups (any-of-N)**
  - **Migration:** `approval_groups` + membership. A step satisfied when
    `min_approvals` members of the group sign.
  - Flips `approvals.json#approval_groups` → done.

- [ ] **04.4 — Delegation**
  - **Migration/handler:** `approval_delegations` (from_user, to_user, start, end).
    Current approver resolution honours active delegations.
  - Flips `approvals.json#delegation` → done.

- [ ] **04.5 — Expiry & escalation**
  - Step `deadline`; a sweep escalates to the next step or notifies on breach
    (reuse the `sla-check` sweep pattern). Scope: escalate-to-next only.
  - Flips `approvals.json#expiration` → partial.

- [ ] **04.6 — Route purchasing + expenses through chains**
  - `send_purchase_order` and `submit_expense_report` create chain-based requests
    when a matching `approval_chain` exists; fall back to single-rule routing otherwise.
  - **Verify:** a PO over threshold requires two sign-offs before `sent`.

## Dependencies & sequencing
04.1 → 04.2; 04.3/04.4/04.5 after 04.1; 04.6 last. Independent of EPIC-01/02/03.

## How we measure success
`parity-report.ts` shows `approvals` ≥ 60%. Integration test: a PO above the
two-step threshold cannot reach `sent` until both approvers sign.
