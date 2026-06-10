---
title: "EPIC-03 — Configurable pipeline / stage engine"
status: planned
sprint: 1
owner: unassigned
---

# EPIC-03 — Configurable pipeline / stage engine

## Why
`crm`, `deals`, `tickets` (and partly `projects`) each hardcode their stages as a
status enum. Odoo's core value is **user-defined stages with kanban + per-stage
probability**. Hardcoding also fights FlowPilot **Law 1** (no hardcoded routing).
We build one shared stage engine and back-fill all consumers, instead of bespoke
stages per module. Independent of EPIC-01/02 — can run fully in parallel.

## Outcome (Definition of Done for the whole epic)
- [ ] Shared `pipeline_stages` engine shipped and consumed by ≥ 3 modules
- [ ] Capabilities → `done`: `crm.json#custom_stages`, `crm.json#forecast`
- [ ] `crm` parity ≥ 55%; `deals` and `tickets` capability files updated
- [ ] No data loss migrating existing enum values into stage rows

## Capabilities delivered
| File | Capability id | From → To |
|---|---|---|
| `capabilities/crm.json` | `custom_stages` | missing → done |
| `capabilities/crm.json` | `forecast` | missing → done |
| `capabilities/deals.json` | `custom_stages` | (add) → done |
| `capabilities/tickets.json` | `stage_pipeline` | (add) → done |

## Issues

- [ ] **03.1 — Generic stage model**
  - **Migration:** `pipeline_stages` (id, entity_type, name, sort_order, probability,
    is_won, is_lost, fold). Seed defaults matching today's enums for `lead`, `deal`,
    `ticket`. Idempotent.
  - **Types:** `src/types/module-contracts.ts` — `PipelineStage` Zod schema.

- [ ] **03.2 — `manage_pipeline_stage` skill**
  - **Module:** new shared skill (decide host module: `crm` or a small `pipelines`
    module) — CRUD stages per entity_type. Passes `skill-linter.ts`.

- [ ] **03.3 — Migrate CRM to stage rows**
  - Replace `leads.status` enum reads with `stage_id` FK; keep a compatibility view.
  - Flips `crm.json#custom_stages` → done.

- [ ] **03.4 — Weighted forecast**
  - Pipeline report = Σ(deal value × stage.probability). Add to `lead_pipeline_review`.
  - Flips `crm.json#forecast` → done.

- [ ] **03.5 — Migrate deals & tickets to stage rows**
  - `deals.stage` and `tickets.status` read from `pipeline_stages`. Add `custom_stages`
    capability to `deals.json` and `stage_pipeline` to `tickets.json`, flip → done.

- [ ] **03.6 — Admin kanban reads stages from config**
  - `src/components/admin/crm/` and tickets kanban render columns from
    `pipeline_stages` (drag-drop sets `stage_id`).

## Dependencies & sequencing
03.1 → 03.2 → 03.3 → 03.4; 03.5/03.6 after 03.3. Independent of EPIC-01/02.

## How we measure success
`parity-report.ts` shows `crm` ≥ 55% and `deals`/`tickets` foundational gap cleared.
Manual check: adding a custom stage in admin makes it appear in the kanban with no
code change (proves it's config, not enum).
