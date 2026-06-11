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

- ~~03.3 / 03.5 / 03.4 / 04.4–04.6~~ — shipped 2026-06-11 (stage-engine boards,
  forecast, delegation/escalation/DB gates).
- 01.7 — richer variant editor polish (bulk price/stock per variant).
- Approvals polish: bulk-select in `ApprovalInboxPage` (skill `bulk_advance_approvals`
  exists), listener wiring for the `approval.assigned` event (email/automation).
- EPIC-02 polish: valuation reconciliation check (GL 1460 vs Σ layers), landed-cost
  entry UI (skill `allocate_landed_cost` exists).
- `manage_kb_article` get: auto-resolve `title` → slug (wiki already does this) —
  found by the Hermes operator 2026-06-11.

## Scroll-reveal & block loading (landing pages) — make it a setting

**Observed (2026-06-11):** blocks fade in as you scroll (deliberate `AnimatedBlock`
default `fade-up`), but two sharp edges make fast scrolling feel like the page
"isn't ready":
1. `useScrollAnimation` uses `rootMargin: '0px 0px -50px 0px'` — the reveal triggers
   only once a block is 50px *inside* the viewport, so fast scrolling outruns it.
2. 40 block types are `lazy()`-loaded with `Suspense fallback={null}` — un-fetched
   chunks render *nothing* until loaded, then the fade starts on top (double delay).
   The site-settings cache only covers `get-page` JSON, not JS chunks.

**Backlog item — site-wide setting** (`site_settings` → appearance):
`scroll_animations: 'on' | 'eager' | 'off'`

- `on` — today's behavior (per-block `animation.type` still wins)
- `eager` — flip rootMargin to `'0px 0px 200px 0px'` so reveals pre-trigger and the
  fade is already done when the block enters view (recommended default)
- `off` — render everything immediately (forces `animation: none` globally); also
  always honor `prefers-reduced-motion`

Admin UI: a select in Site Settings → Appearance. Per-block `animation.type` in the
editor remains the fine-grained override.

**Companion (no setting needed):** idle-time chunk prefetch — after LCP,
`requestIdleCallback` imports the block types the current page actually contains,
eliminating the `fallback={null}` gap on fast scroll.
