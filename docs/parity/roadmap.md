---
title: Odoo Parity Roadmap
description: Sprint sequencing for closing the depth gap to Odoo.
category: concepts
---

# Odoo Parity Roadmap

**Program goal: every module ≥ 80% Odoo parity.** Sequenced so that **structural
foundations land before the features that depend on them**, and so independent tracks
run in parallel. Sprints are ~2 weeks; an "agent-week" is the unit, not calendar
time — run as many issues concurrently as there are free agents.

## Sequencing rationale

```
EPIC-01 (variants + order lines)  ──►  EPIC-02 (inventory valuation)
        products / inventory / pos          needs normalized order lines + variants
        / commerce all unblocked            to compute COGS per move

EPIC-03 (pipeline engine)  ──────────────►  back-fills crm, deals, tickets, projects
        independent of 01/02 — can run in parallel

EPIC-04 (approval chains)  ──────────────►  back-fills purchasing, quotes, expenses, payroll
        independent — can run in parallel

Breadth track (community)  ──────────────►  continuous; never blocks the above
```

## Sprint plan

| Sprint | Theme | Epics | Exit criteria |
|---|---|---|---|
| **S0** | Measurement & guardrails | — | `parity-report.ts` in CI (`--check`); all 30 core modules have a capability file; baseline matrix committed |
| **S1** | Commerce backbone | EPIC-01 | `products`, normalized order lines, variants shipped; products parity ≥ 60% |
| **S2** | Money matches stock | EPIC-02 | Inventory valuation + COGS posting; inventory parity ≥ 60%; accounting reconciles to stock |
| **S1–S2 (parallel)** | Sales pipelines | EPIC-03 | Shared stage engine; crm/deals/tickets read stages from config; crm parity ≥ 55% |
| **S1–S2 (parallel)** | Controls | EPIC-04 | Approval chains as a shared primitive; consumed by ≥ 2 modules; approvals parity ≥ 60% |
| **S3** | Breadth wave 1 | — | Scaffold `attendance`, `maintenance` modules (see breadth backlog) at L2 |
| **S3+** | Community track | — | Open issues for carrier integrations, country payroll, MRP work centers |

## Sprint 0 — must happen first

S0 is the smallest sprint and the highest leverage: it makes every later sprint
*self-measuring*. Issues:

- [x] **S0.1** — Add `bun run scripts/parity-report.ts --check` to CI (`.github/workflows`)
      and to `package.json` as `parity:check`. Fail the build on a stale matrix.
- [x] **S0.2** — Author a capability file for **every** module (all 62: 31 core from
      the audit + 23 benchmarked + 8 differentiators). No module is invisible.
- [x] **S0.3** — Add a `parity` link to `docs/start-here.md` and `docs/README.md`.
- [ ] **S0.4** — Wire parity % into the existing `inject-process-maturity.ts` output
      so the process docs and the parity matrix cross-reference each other.

## How we measure the program (not just an issue)

| Metric | Source | Target by end of S2 | Program target |
|---|---|---|---|
| Mean parity of the 4 critical modules | `parity-report.ts` | 29% → **≥ 60%** | **≥ 80%** |
| Mean parity, all scored modules | `parity-report.ts` | baseline → **+15pp** | **≥ 80%** |
| Foundational gaps (weight 3) still open | matrix "Foundational gaps" table | 5 → **0** | **0** |
| Modules with a capability file | `parity-report.ts` (scored vs unscored) | 4 → **30** | **all** |
| Process maturity bumps | `docs/processes` L-levels | ≥ 2 processes move up one level | — |

Run `bun run scripts/parity-report.ts` at the end of every sprint and paste the
summary into the sprint review. The trend line *is* the report.

## Breadth backlog (new modules, lower priority than depth)

From the breadth analysis — scaffold with `bun run scripts/new-module.ts`,
target L2 (manual CRUD), then let depth/community follow:

~~`attendance`~~ (covered by hr: attendance_entries + clock_in, done since S0) · ~~`maintenance`~~ (shipped 2026-06-12) · `quality` · `planning` (shift scheduling) ·
`rental` · `elearning` · `forum` · `membership` · `fleet` · `appraisals` (lift
from `hr`) · `time-off` (lift `manage_leave` to its own module) · `sms-marketing` ·
`social-marketing`
