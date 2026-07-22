---
title: "Program 80 — every module ≥ 80% parity, SMB-weighted"
status: active
owner: unassigned
---

# Program 80 — every module ≥ 80% parity, SMB-weighted

**Goal:** every scored module reaches ≥ 80% Odoo parity **on the capabilities
that matter for a small business** — or carries an explicit, motivated
non-goal marking for what we deliberately skip. Mean parity is the trend
metric; the exit criterion is per-module.

## SMB weighting (decided 2026-07-04)

FlowWink is an agent-driven BOS for small businesses — not an enterprise ERP.
Parity effort is weighted by process proximity to an SMB's daily cash loop:

| Tier | Clusters | Policy |
|---|---|---|
| **P1 — core** | CMS/content (pages, blog, kb, media, templates, global-blocks, forms), CRM (crm, deals, companies, tickets), E-commerce (ecommerce, products, orders/checkout), **Quote→Contract→Sign** (quotes, contracts, e-signature), invoicing | Drive to ≥ 80% first; grounding reference required before building |
| **P2 — supporting** | booking, email, newsletter, subscriptions, accounting (SMB depth), expenses, inventory (SMB depth), shipping (SMB depth: rates, labels-via-integration, tracking links — **not WMS**), pos, sla, live-support/contact-center | Lift opportunistically (verify & surface rounds); ≥ 80% target stands |
| **P3 — enterprise-heavy** | manufacturing/MRP depth, field-service depth, payroll beyond SE basics, fixed-assets depth, multi-currency consolidation, wave/batch WMS picking | **De-weighted.** Only lift when a real customer process demands it. Capabilities that exist purely for enterprise scale get marked as non-goals instead of chased |

**Non-goal rule:** a capability we deliberately will not build is flipped to
`"odoo": false` with a `notes` motivation ("enterprise-scale, out of SMB
scope — decided YYYY-MM-DD"), which removes it from the parity denominator.
This keeps 80% honest instead of unreachable. Non-goals require a dated
motivation — never silent deletion.

## The grounding rule (no guessing)

Before building against any P1/P2 module, a **reference card** must exist at
`docs/parity/references/<module>-odoo.md`, produced from two verifiable
sources:

1. **Odoo official documentation** (odoo.com/documentation, 18.0) — the
   functional workflow: documents, states, screens, postings.
2. **Odoo community source** (github.com/odoo/odoo, addons/<app>) — the data
   model and state machines, for community-edition apps. Enterprise-only
   apps (Sign, full Accounting, Payroll) are docs-only: mark the card
   `source: docs-only` and treat behavioral claims with more caution.

Cards cite what they claim (doc page / source path). Scorecard capabilities
reference the card in `verify`/`notes`. We borrow Odoo's **process skeleton**
(documents → states → postings), never its surface complexity — "less is
more" applies to what we build, not to what we understand.

## The round loop (one command per round)

Each round ("kör nästa parity-runda") executes:

1. **Measure** — `bun run scripts/parity-report.ts`; pick targets by
   (SMB tier, lowest parity, process gating) — not by score alone.
2. **Ground** — ensure reference cards exist for the targets (research
   agents; docs + source; cited).
3. **Build & verify** — dual-surface law (skill + admin UI), Stage-3 rule
   (live runtime evidence before `done`), guardrail tests green.
4. **Flip & regenerate** — scorecards with dated evidence; matrix via the
   generator; CI `--check` gate keeps it honest.
5. **Re-measure & log** — the matrix diff is the round's report.

Autonomy note: rounds are driven by an operator session (Claude) end-to-end;
there is no standing daemon. For scheduled cadence, trigger a session weekly
via GitHub Actions. The program state lives entirely in this repo (matrix,
scorecards, epics, reference cards) so any session can resume it.

## Current state (2026-07-21)

- Mean parity **89%** · 55 benchmarked modules · 10 differentiators (no Odoo
  benchmark) · worst: contact-center 41%, accounting 58%, analytics 58%,
  chat 58% (see [`parity-matrix.md`](./parity-matrix.md) for the live table).
- The three sprints spawned by this program — floor wave 1, P1
  Subscribe-to-Renew, EPIC-03 completion + view consolidation — are all
  **completed** (statuses + outcome notes in their respective docs).
- Remaining below-80 modules are mostly P2/P3 tier (contact-center,
  accounting depth, manufacturing) where the non-goal rule and community
  handoff apply; lift happens opportunistically per the round loop above.
- Earlier blockers (missing `sanitizeOrTerm`, stale operator MCP session,
  migration-ledger drift) are resolved; drift detection is now structural via
  the instance manifest (`supabase/seed/instance-manifest.json` +
  `instance_sync_status()` + the Observability sync card).
