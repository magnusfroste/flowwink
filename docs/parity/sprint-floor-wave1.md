---
title: "Sprint — Raise the floor, wave 1 (companies, returns, handbook, calendar)"
description: Lift the four cheapest bottom-of-matrix modules with column+skill work; defer integration-heavy gaps to community.
category: concepts
status: planned
---

# Sprint — Raise the floor, wave 1

With EPIC-01–04 complete, the fastest path toward "every module ≥ 80%" is the
bottom of the matrix. This wave targets the modules whose gaps are **cheap
backend** (columns + skill extensions + small RPCs), skipping integration-heavy
ones (per the prioritisation principle: structural/cheap in-house, integrations
to community).

**In scope:** companies 21%, returns 25%, handbook 13%, calendar 17% (partial).
**Deferred:** shipping (rate shopping/carriers = integrations → community),
workspace-chat (design question: it is an AI RAG chat, not Discuss — owner should
decide whether Discuss-parity is even the right benchmark before we build).

## Issues

### F1 — Companies B2B fields + hierarchy (21% → ~60%)
- **Migration:** `companies` ADD `org_number` (VAT/org-nr) + `vat_number`,
  `parent_company_id` (FK self, hierarchy), `employee_count` int,
  `annual_revenue_cents` bigint, `credit_limit_cents` bigint, `account_owner` uuid
  (sales-rep), `tags` text[].
- **Skill:** extend `manage_company` tool_definition with the new fields; add
  `find_duplicate_companies` (name/domain similarity, read-only).
- Flips: `vat_tax_id`, `company_hierarchy`, `employee_count`, `revenue_tracking`,
  `credit_limit`, `preferred_contact`, `company_tags` → done/partial;
  `dup_detection` → partial (skill, merge UI later).
- **UI (Lovable, later):** the new fields in the company dialog.

### F2 — Returns depth (25% → ~55%)
- **Migration:** `returns` ADD `reason_code` (enum-ish text + CHECK:
  defective/wrong_item/not_as_described/changed_mind/damaged_in_transit/other),
  `restocking_fee_cents` bigint default 0, `inspected_at`/`inspection_notes`
  (QC state between received→refunded); `refund_return` v2: honors restocking fee
  (refund = amount − fee) and supports **partial refunds** (per-call amount ≤
  remaining), accumulating `refund_amount_cents`.
- **Skill:** `return_reason_report` (read-only analytics: counts/value per
  reason_code) — gives reason_analytics its surface.
- Flips: `reason_codes`, `restocking_fee`, `partial_refund`, `inspection_qc` →
  done/partial; `reason_analytics` → partial.
- Feeds process-gap **P2 Return-to-Refund**.

### F3 — Handbook gets a skill surface (13% → ~60%)
- **Skill:** `manage_handbook_section` (list/get/create/update/publish) over the
  existing handbook tables — the module's UI exists; the MCP half is missing
  (dual-surface law).
- Flips: `section_crud`, `publishing` → done; `search` stays partial.

### F4 — Calendar event CRUD completion (17% → ~45%)
- **Skill:** complete `manage_calendar_event` (create/update/delete/list w/
  attendees jsonb) — `event_crud` partial→done, `invitees` → partial.
- external_sync/reminders stay deferred (integration).

## Quality bar (additions for this wave)

1. **Repeatable verification** — every scenario I run during Stage-3 is committed as
   a versioned smoke file (`scripts/smoke/floor-wave1.sql`) so verification becomes
   regression, re-runnable by any agent against any instance.
2. **Additive-only schema** — new columns nullable/defaulted; `reason_code` is
   text + CHECK (not a Postgres enum) so the community can extend without
   migration pain.
3. **Agent-gotcha docs** — new agent-facing fields/semantics (org_number, partial
   refunds, restocking fee) documented in skill `instructions` and CLAUDE.md's
   gotcha section; ask the external operator (Hermes) for a re-test after deploy.

## Execution
Backend (me): F1→F2→F3→F4, each verified on the real local schema + runtime per
the verification loop, then fleet (demo+www; forks on owner sync). UI bits
bundled into ONE Lovable brief at the end of the wave (company fields, returns
reason/fee/inspection in the RMA dialog).

## Targets
companies ≥55%, returns ≥50%, handbook ≥55%, calendar ≥40% · mean 49% → ~52%.
