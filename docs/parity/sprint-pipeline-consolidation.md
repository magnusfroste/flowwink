---
title: "Sprint — EPIC-03 completion + view consolidation"
description: Migrate leads/deals/tickets to the shared stage engine and consolidate the duplicate pipeline + approval views.
category: concepts
status: planned
---

# Sprint — EPIC-03 completion + view consolidation

Lovable shipped new config-driven admin pages (`/admin/pipelines`, approval inbox/chains)
that now **coexist** with the older enum-driven views. This sprint finishes EPIC-03
(03.3–03.6) and, as a direct consequence, **removes the duplication**.

## Decisions (owner, 2026-06-11)

1. **Pipeline:** keep `/admin/deals` as the home; rework its existing `DealKanban` +
   `PipelineSummary` to read the shared `pipeline_stages` / `stage_id`. **Remove** the
   standalone `/admin/pipelines` page. Sellers keep their familiar view.
2. **Approvals:** merge `/admin/approvals` + `/admin/approvals/inbox` +
   `/admin/approvals/chains` into **one tabbed Approvals page** (Requests/Inbox ·
   Chains · Rules), single nav entry.

## The keystone that makes consolidation safe

Today `leads.status` / `deals.stage` / `tickets.status` (enums) are the read source;
`stage_id` is backfilled but unused. Flipping reads in one shot is risky (dozens of
call sites). So **S1 first ships a bidirectional sync** between the enum column and
`stage_id`, keeping both consistent. Then each UI can move to `stage_id` independently
with zero risk, and the enum stays valid as a compatibility column.

## Issues

### S1 — Stage sync keystone (backend) · prerequisite
- Trigger on `leads` / `deals` / `tickets`: when `stage_id` changes, set the enum
  column from `pipeline_stages.key`; when the enum changes (legacy writers), set
  `stage_id` from `(entity_type, key)`. Idempotent migration.
- Backfill any rows where `stage_id IS NULL`.
- **Verify (Stage-3, local):** update a deal's `stage_id` → enum follows; update the
  enum → `stage_id` follows. No call site breaks.

### S2 — Deals board reads the stage engine (UI · extend, don't duplicate)
- `DealKanban` + `PipelineSummary` + `DealsPage`: columns come from
  `pipeline_stages WHERE entity_type='deal'`; drag-drop sets `stage_id` (trigger syncs
  enum). Use `pipeline_stages.probability/is_won/is_lost/fold`.
- **Remove** `/admin/pipelines` (`PipelinesPage`) + its nav entry. Keep
  `PipelineStagesPage` as the stage admin, relocated under deals/CRM settings.
- Flips `deals.custom_stages` → done.

### S3 — Leads + tickets read the stage engine (UI)
- `LeadsPage` / `LeadKanban` / `CreateLeadDialog` / `LeadDetailPage` and the tickets
  board read `pipeline_stages` (entity_type lead / ticket), write `stage_id`.
- Flips `crm.custom_stages` + `tickets.stage_pipeline` → done.

### S4 — Weighted forecast (backend · 03.4)
- `lead_pipeline_review` returns Σ(deal value × `pipeline_stages.probability`),
  excluding `is_lost`. Surface in the deals dashboard.
- Flips `deals.probability_weighting` → done.

### S5 — Approvals consolidation (UI · extend, don't duplicate)
- One `ApprovalsPage` with tabs: **Requests/Inbox** (chain + pending_operations),
  **Chains** (chain/step/group editor), **Rules** (existing threshold rules). Merge
  `ApprovalInboxPage` + `ApprovalChainsPage` into tabs; single `/admin/approvals` nav
  entry (drop the two extra routes or redirect them).

## Sequencing

```
S1 (sync keystone, backend)  ──►  S2 (deals UI) ──► remove /admin/pipelines
                              └─►  S3 (leads/tickets UI)
S4 (forecast, backend) ── independent
S5 (approvals tabs, UI) ── independent
```

## Execution split

- **Backend (S1, S4):** migration + RPC, verified locally through the runtime
  (Stage-3) before fleet rollout — same discipline as EPIC-01/03/04.
- **UI (S2, S3, S5):** Lovable, **extending** existing components, never new parallel
  pages. Brief: read stages from `pipeline_stages`, write `stage_id`; merge approval
  routes into tabs; delete `/admin/pipelines`. Don't touch migrations / `src/lib/modules/*`
  / `module-skills.json`.

## Definition of done for the sprint

- One pipeline board per entity (no `/admin/pipelines` duplicate), driven by config
- One Approvals page (tabs), single nav entry
- `deals.custom_stages`, `crm.custom_stages`, `tickets.stage_pipeline`,
  `deals.probability_weighting` → `done`
- Stage-3 verified locally, then rolled out to demo + www (liteit/autoversio by fork owner)
