---
title: Odoo Parity Program
description: How FlowWink closes the functional-depth gap to Odoo — measured, sprinted, and agent-executable.
category: concepts
order: 50
---

# Odoo Parity Program

FlowWink covers **~80% of Odoo's processes** in breadth, but at **~45–65% of the
functional depth** per module. **Program goal: lift every module to ≥ 80% Odoo
parity.** This program closes that gap **systematically**: every gap is recorded,
scored, assigned to an epic, and verified by a measurable Definition of Done. It is
built so that **dev agents can pick up an issue cold** and ship it without tribal
knowledge.

## Working agreement: decide first, code later

No more vibe coding. **Every module change starts with a written decision** — a
capability entry (what + why) and, for anything non-trivial, an issue spec (how +
how we verify). The spec is the contract; the PR satisfies it. If it isn't written
down here first, it doesn't get built.

And the third leg: **verify locally, then deploy** — a capability is `done` only
when it has been **run through the real runtime** and observed to do the right
thing, never on the strength of "the code looks right". See
[`verification-loop.md`](./verification-loop.md). (This is how we found payroll
and fixed-assets marked `done` but dead over MCP.)

## Dual-surface law: every capability is UI **and** MCP

FlowWink is an **agent-operable Business OS**: every module must be operable by a
human in the admin UI **and** by an external agent over MCP. A capability that
only ships an admin screen — or only a skill — is **not done**. This is not new
(it's the platform's core promise: "operable by any agent, ships with one"), but
the parity program makes it a hard gate so growth doesn't quietly break it.

Therefore a capability counts as `done` only when **both** surfaces exist:

| Surface | What it means | Where |
|---|---|---|
| 🤖 **MCP / skill** | Registered in `agent_skills`, `mcp_exposed=true`, self-describing metadata (`Use when:` / `NOT for:`), flat OpenAI-strict schema | `skillSeeds` in `src/lib/modules/<module>-module.ts` |
| 👤 **Human / UI** | Admin (and where relevant account-portal) screen for the same operation | `src/components/admin/<area>/…` |

The skill is the AI-native entry point that lets OpenClaw, Claude Desktop, or any
MCP client run FlowWink as SaaS — without it the module is invisible to the agent
ecosystem. Keep the *intelligence* in the operator (Law 1–3); the skill is the
**interface**, not a private AI pipeline.

It builds *on top of* the existing **L1–L5 maturity scale**
([`docs/processes/README.md`](../processes/README.md)) — it does not replace it.
Maturity answers "can a customer run this process?"; parity answers "how deep is
each module vs Odoo's equivalent app?".

The program has **two dimensions**: **module depth** (this matrix) and **process
completeness** — which end-to-end flows we can run. The processes we're still missing
are in [`process-gaps.md`](./process-gaps.md).

## The three artifacts

| Artifact | Path | Role |
|---|---|---|
| **Capability files** | `capabilities/<module>.json` | Machine-readable source of truth. One line per gap. |
| **Parity matrix** | `parity-matrix.md` | **Generated** dashboard. Never edit by hand. |
| **Roadmap + epics** | `roadmap.md`, `epics/*.md` | Sprint sequencing and atomic, agent-ready issues. |

## How we measure (so "%" is a fact, not an opinion)

Each capability is scored `done` (1.0) / `partial` (0.5) / `missing` (0.0),
weighted `1` (normal) / `2` (important) / `3` (foundational). Parity % is the
weighted ratio over Odoo-relevant capabilities only — see
[`capabilities/_schema.md`](./capabilities/_schema.md).

```bash
bun run scripts/parity-report.ts          # recompute + regenerate the matrix
bun run scripts/parity-report.ts --check   # CI: fail if the matrix is stale
```

> **Why these numbers look lower than a gut "50%".** The score weights
> foundational gaps (weight 3) heavily on purpose, so a module that has 20 nice
> features but lacks its structural backbone (e.g. products without variants)
> scores low. That is the point: it forces the critical work to the top.

A PR that ships a capability flips one `status` field; CI recomputes the score.
**Progress is a diff in the matrix, not a discussion.**

## Workflow for a dev agent

1. Open `roadmap.md`, pick the current sprint's epic.
2. Open the epic file, pick an unchecked issue. Each issue is self-contained:
   context · exact files · acceptance criteria · test command · DoD.
3. Implement on the feature branch. Migrations must be **idempotent**
   (see `docs/contributing/contributing.md`).
4. Flip the capability `status` in `capabilities/<module>.json`.
5. Run `bun run scripts/parity-report.ts` and commit the regenerated matrix.
6. Open a **draft PR**. The DoD checklist is the review gate.

## Prioritisation principle

**Structural first, verticals later.** Capabilities that block *several* modules
at once (variants, inventory valuation, the stage engine, approval chains) are
done in-house because a bad data model cannot be fixed by the community after the
fact. Self-contained verticals (carrier integrations, country payroll, MRP work
centers) are opened to the community as parallel breadth work.

## Index

- [`pipeline.md`](./pipeline.md) — the 3-stage pipeline: spec → build (CI gates) → verify & release
- [`roadmap.md`](./roadmap.md) — sprints, epic sequencing, exit criteria
- [`ui-backlog.md`](./ui-backlog.md) — admin UI per capability + deploy/Stage-3 steps to reach done
- [`parity-matrix.md`](./parity-matrix.md) — live scorecard (generated)
- [`process-gaps.md`](./process-gaps.md) — end-to-end processes we should add
- [`capabilities/_schema.md`](./capabilities/_schema.md) — capability file format
- [`templates/epic-template.md`](./templates/epic-template.md) · [`templates/issue-template.md`](./templates/issue-template.md)
- Epics: [EPIC-01](./epics/EPIC-01-product-variants-order-lines.md) ·
  [EPIC-02](./epics/EPIC-02-inventory-valuation.md) ·
  [EPIC-03](./epics/EPIC-03-pipeline-engine.md) ·
  [EPIC-04](./epics/EPIC-04-approval-chains.md)
