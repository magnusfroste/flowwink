---
title: "FlowWink Documentation"
description: Map of the FlowWink docs — start here, pick your path (operator, builder, agent developer), then go deep per module or process.
category: general
---

# FlowWink Documentation

> A modular, self-hosted **Business Operating System**. Modules, skills, automations and MCP work standalone — the autonomous operator (**FlowPilot**, OpenClaw, Claude Desktop, or any MCP client) is opt-in.

> **New here?** Read [`start-here.md`](./start-here.md) — a 5-minute orientation.

---

## Pick your path

| You are… | Start here |
|---|---|
| **Operator** — running FlowWink for a business | [`operators/`](./operators/README.md) → install, configure modules, drive day-to-day work |
| **Builder** — extending or contributing to FlowWink | [`builders/`](./builders/README.md) → add modules, blocks, skills, templates |
| **Agent developer** — connecting an MCP client | [`mcp/getting-started.md`](./mcp/getting-started.md) → 5-minute setup for Claude / OpenClaw / custom |

All three paths share the concepts below.

---

## Concepts — read these first

| Doc | Why |
|---|---|
| [`concepts/elevator-pitch.md`](./concepts/elevator-pitch.md) | One-page positioning |
| [`concepts/operator-strategy.md`](./concepts/operator-strategy.md) | Why FlowPilot is a module, not the core |
| [`concepts/openclaw-law.md`](./concepts/openclaw-law.md) | The inviolable agentic laws |
| [`concepts/flowchat-vs-flowpilot.md`](./concepts/flowchat-vs-flowpilot.md) | Utility AI vs operator AI |
| [`architecture/agent-harness.md`](./architecture/agent-harness.md) | The named platform spine — loop, skill selection, policy, verify, self-correct, escalate, learn, observe — that FlowPilot *and* external agents run on |
| [`architecture/agent-resumption.md`](./architecture/agent-resumption.md) | How a paused multi-step run continues from its checkpoint |
| [`architecture/ownership-and-coverage.md`](./architecture/ownership-and-coverage.md) | The one ownership map, inheritance down the chain, the Mine/All lens, vacation coverage — and why ownership is never RLS |
| [`architecture/customer-spine.md`](./architecture/customer-spine.md) | The party register (Odoo's `res.partner`) that replaces five dialects for "who is the customer" — one table, three lenses, and the commercial party the ledger books on |
| [`operators/users-access-and-invites.md`](./operators/users-access-and-invites.md) | Invites over your own email rail, functional roles, route gating, deleting a user |
| [`operators/comparison.md`](./operators/comparison.md) | FlowWink vs Odoo / HubSpot / NetSuite |
| [`concepts/prd.md`](./concepts/prd.md) | Full system reference — modules, processes, scope |

---

## Folder map

| Folder | Contents | Audience |
|---|---|---|
| [`concepts/`](./concepts/) | Vision, laws, positioning | both |
| [`operators/`](./operators/README.md) | Install, configure, run, provision instances | operators |
| [`builders/`](./builders/README.md) | Extend, contribute, test | builders |
| [`guides/`](./guides/) | Docker, deploy, migrate, maintain, integrations | operators |
| [`modules/`](./modules/index.md) | **[Module catalog](./modules/index.md)** + one page per module, generated from `defineModule()` | both |
| [`processes/`](./processes/README.md) | End-to-end business flows (lead-to-customer, quote-to-cash, …) | both |
| [`pilot/`](./pilot/) | FlowPilot internals — prompt compiler, memory, heartbeat, failover | builders |
| [`architecture/`](./architecture/) | Platform layers — MCP, event bus, retrieval, locale packs, tiers | builders |
| [`parity/`](./parity/README.md) | Odoo-parity programme — scorecard, epics, roadmap | builders |
| [`reference/`](./reference/README.md) | [Developer commands](./reference/developer-commands.md), module API, headless REST, skill registry, slash commands | both |
| [`mcp/`](./mcp/) | MCP surface for external agents | builders |
| [`agents/`](./agents/README.md) | Department-claw playbooks + the agent invite payload | operators |
| [`contributing/`](./contributing/) | How to contribute, run tests, build a module | builders |

---

## What's in here, in numbers

- **67 modules** in `src/lib/modules/` — every one has a page, listed in the [module catalog](./modules/index.md)
- **15 business processes** in [`processes/`](./processes/README.md) — the end-to-end flows the platform supports
- **6 department-claw playbooks** in [`agents/`](./agents/README.md) for external MCP operators
- Public docs portal: [/docs](https://flowwink.com/docs) — auto-synced from this folder, with embedded AI chat

---

## Keeping docs true

Three commands, all safe to re-run:

| Command | What it does |
|---|---|
| `bun run scripts/generate-module-docs.ts` | Regenerates every `modules/<id>.md` **and** the module catalog from code. Files with `manual: true` in frontmatter are left alone. |
| `bun run scripts/check-doc-drift.ts` | Fails on a module without a doc, and on any dead relative link inside `docs/`. |
| `bun run scripts/normalize-doc-frontmatter.ts --write` | Fills missing `title` / `description` / `category` frontmatter — the fields the docs portal indexes. |

`npx vitest run src/lib/__tests__/advertised-counts.guardrails.test.ts` guards the
"N+ skills / N+ modules" claims against the generated skill artifact, so marketing
numbers cannot age silently.

**Conventions**

- Docs describe **the current state** and are updated in place — we don't archive.
  Plan and sprint documents carry `status` in frontmatter (`planned` / `active` /
  `completed`) and are deleted once their outcome is folded into the permanent docs.
- Prefer **deepening an existing page** over adding a new one. Duplicate pages are
  how a docs tree rots.
- Never commit instance URLs, MCP keys or tokens. Use `<INSTANCE_URL>` / `<MCP_KEY>`.

*Edit any page on GitHub → push → an admin runs the sync from `/admin/docs` (or waits for the scheduled sync).*
