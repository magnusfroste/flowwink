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
- [ ] Stage management is dual-surface: `manage_pipeline_stage` skill + admin kanban UI
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

- [x] **03.1 — Generic stage model** *(migration `20260610190000`)*
  - `pipeline_stages` (entity_type, key, name, sort_order, probability, is_won,
    is_lost, fold) seeded to match `lead_status` / `deal_stage` / `ticket_status`;
    nullable `stage_id` FK added to leads/deals/tickets and **backfilled** from the enum.
  - Verified on scratch Postgres: 4 lead + 7 deal + 6 ticket stages seeded, backfill
    matches every enum value, idempotent re-run. (PipelineStage Zod contract: follow-up.)

- [x] **03.2 — `manage_pipeline_stage` skill** *(crm-module)*
  - Shared skill `rpc:manage_pipeline_stage` — list/create/update/delete per
    entity_type, writer-gated. Verified: create→list(8)→delete→list(7) round-trip;
    auto-derives `key` from name.

- [x] **03.3 — CRM reads stage rows** *(Stage-3 2026-06-11)*
  - LeadKanban reads `pipeline_stages`; enum↔`stage_id` sync trigger live.
    → `crm.json#custom_stages` = done.

- [x] **03.4 — Weighted forecast** *(Stage-3 2026-06-11)*
  - `lead_pipeline_review` returns Σ(deal value × stage probability) + per-stage
    breakdown (agent-execute ~L4546); runtime-verified (weighted=1800000 matches SQL).
    → `crm.json#forecast` = done.

- [x] **03.5 — Deals & tickets read stage rows** *(Stage-3 2026-06-11)*
  - DealKanban reads `pipeline_stages`; enum↔`stage_id` sync trigger live.
    → `deals.json#custom_stages` + `tickets.json#stage_pipeline` = done.

- [x] **03.6 — Admin kanban reads stages from config** *(Lovable S2/S3)*
  - CRM + deals kanban render columns from `pipeline_stages`; drag-drop sets `stage_id`.

## Dependencies & sequencing
03.1 → 03.2 → 03.3 → 03.4; 03.5/03.6 after 03.3. Independent of EPIC-01/02.

## How we measure success
`parity-report.ts` shows `crm` ≥ 55% and `deals`/`tickets` foundational gap cleared.
Manual check: adding a custom stage in admin makes it appear in the kanban with no
code change (proves it's config, not enum).
