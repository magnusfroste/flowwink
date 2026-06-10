---
title: Parity UI backlog & deploy state
description: Which admin UIs exist for each EPIC capability, and what remains to flip partial → done.
category: reference
---

# Parity UI backlog & deploy state

The admin UIs for EPIC-01/03/04 were built (Lovable, 2026-06-10) against the
already-shipped RPCs/tables. This tracks the UI surface per capability and the
**deploy + Stage-3** steps still required before any capability becomes `done`.

## Working agreement for UI work

- **UI only** — stay in `src/components/admin/` and `src/pages/admin/`. Never touch
  `supabase/migrations/`, `src/lib/modules/*`, `supabase/seed/module-skills.json`, or
  `docs/parity/` from a UI session.
- **Extend, don't duplicate** — build into existing components rather than parallel
  views: `orders/FulfillmentStepper.tsx` (+ per-line), `deals/PipelineSummary.tsx`
  (drive from `pipeline_stages`), `PendingOperationsList.tsx` (chains/groups).
- Only **Stage-3** (running the skill through the real runtime) flips `partial → done`.

## Shipped UI → capability map

| Capability | UI | Backend it calls |
|---|---|---|
| `products.variants` / `attribute_templates` | `products/ProductVariantsPanel.tsx` + `ProductDialog` | `manage_product_variant` |
| `products.uom` | `pages/admin/UnitsOfMeasurePage.tsx` + `products/SalesUomSelect.tsx` | `uoms`, `uom_categories`, `products.sales_uom_id` |
| `products.partial_shipments` | `orders/OrderLineFulfillment.tsx` (in OrdersPage) | `fulfill_order_line`, `order_items.qty_fulfilled` |
| `crm/deals/tickets` stages | `pages/admin/PipelinesPage.tsx` + `PipelineStagesPage.tsx` | `pipeline_stages`, `manage_pipeline_stage` |
| `approvals.approval_chains` / `approval_groups` | `pages/admin/ApprovalChainsPage.tsx` + `ApprovalInboxPage.tsx` | `manage_approval_chain`, `advance_approval_step` |

## Remaining to reach `done` (Stage-3 / local session)

1. **`supabase db push`** per instance — the EPIC-01/03/04 migrations exist as files
   but are **not on the live DB** yet; the new pages error against prod until then.
2. **Regenerate types** (`src/integrations/supabase/types.ts`) and **remove the
   `(supabase as any)` shims** the UI added on top of the new tables/RPCs.
3. **Stage-3 verification** — run each skill through the runtime (see
   [`verification-loop.md`](./verification-loop.md)); confirm UI + MCP both work.
4. **Flip** the matching `capabilities/*.json` entries `partial → done`, regenerate
   the matrix.

## Follow-up UI/back-end (not yet built)

- 03.3 / 03.5 — migrate CRM/deals/tickets **reads** to `stage_id` so `PipelineSummary`
  and the kanban share one source (removes the dual-view).
- 03.4 — weighted forecast surfaced in `lead_pipeline_review`.
- 04.4 / 04.5 / 04.6 — approval delegation, expiry/escalation sweep, and routing
  `send_purchase_order` / `submit_expense_report` through chains.
- 01.7 — richer variant editor polish (bulk price/stock per variant).
