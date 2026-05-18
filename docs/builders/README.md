---
title: For Builders — Extending FlowWink
description: Add modules, blocks, skills, templates, and AI handlers. Contribute back upstream.
---

# Building on FlowWink

You're a builder if you want to **extend** FlowWink — add a new module, a new block, a new skill, a new template, or improve FlowPilot itself.

---

## 1. Understand the architecture (mandatory)

Read in order:

1. [`../concepts/openclaw-law.md`](../concepts/openclaw-law.md) — the 10 inviolable laws (no hardcoded intent routing, skills self-describe, blocks are interfaces, fail forward, …)
2. [`../concepts/operator-strategy.md`](../concepts/operator-strategy.md) — why modules and operators are separate
3. [`../architecture/mcp-as-platform.md`](../architecture/mcp-as-platform.md) — MCP is a platform layer, not a FlowPilot feature
4. [`../architecture/event-bus.md`](../architecture/event-bus.md) — platform event bus & dispatcher
5. [`../architecture/module-tiers.md`](../architecture/module-tiers.md) — `core` / `standard` / `extended` / `experimental` budgets
6. [`../concepts/flowchat-vs-flowpilot.md`](../concepts/flowchat-vs-flowpilot.md) — utility AI vs operator AI

---

## 2. Build a module

A module is a `defineModule()` manifest plus skill seeds, tables, RLS, an admin UI, and (usually) a docs page.

| Step | Doc |
|---|---|
| Module API reference | [`../reference/module-api.md`](../reference/module-api.md) |
| Step-by-step build guide | [`../contributing/building-a-module.md`](../contributing/building-a-module.md) |
| New-module scaffolder | `bun run scripts/new-module.ts <id>` |
| Doc-drift guardrail | `bun run check:doc-drift` (every module needs `docs/modules/<id>.md`) |
| Module skill linter | `bun run lint:skills` |

**Conventions:**

- Skills MUST be self-describing (`description`, `Use when:`, `NOT for:`). Don't add regex intent routing.
- Skills exposed to MCP need `mcp_exposed=true`. See [`../architecture/mcp-as-platform.md`](../architecture/mcp-as-platform.md).
- DB writes go through SECURITY DEFINER RPCs — never let agents write raw via generic CRUD when domain logic exists.
- Always emit lifecycle events to the platform event bus (`emit_platform_event`).

---

## 3. Build a block

Blocks are React components with two responsibilities: **capture intent** and **render the operator's response**. They never build their own AI pipelines.

- Architecture: see "Core Architecture Principle" in the project root `CLAUDE.md`
- Public renderer: `src/components/public/blocks/[Name]Block.tsx`
- Admin editor: `src/components/admin/blocks/[Name]BlockEditor.tsx`
- Register in both `BlockRenderer.tsx` and `BlockEditor.tsx`

---

## 4. Build an AI feature

Decide first: utility or skill?

| Class | Example | Implementation |
|---|---|---|
| **Utility** (pure text transform, no context) | improve / translate / summarize / continue | `useAITextGeneration` → `chat-completion` directly. Always on. |
| **Skill** (needs business context — KB, identity, CRM, policy) | "draft outreach to lead X", "reconcile bank txn" | Register in `agent_skills`. Run via FlowPilot or `agent-execute`. |

Full classification: [`mem://architecture/ai-utility-vs-skill-classification`](../../mem/architecture/ai-task-pattern.md).

FlowPilot internals (handlers, memory, heartbeat, model failover):

- [`../pilot/architecture.md`](../pilot/architecture.md)
- [`../pilot/handlers-reference.md`](../pilot/handlers-reference.md)
- [`../pilot/memory.md`](../pilot/memory.md), [`../pilot/compaction.md`](../pilot/compaction.md), [`../pilot/dreaming.md`](../pilot/dreaming.md)
- [`../pilot/sensors-vs-reasoning.md`](../pilot/sensors-vs-reasoning.md)
- [`../pilot/model-failover.md`](../pilot/model-failover.md)

---

## 5. Build a template

Templates seed pages, blog posts, KB articles, products, consultant profiles, and FlowPilot objectives.

- Guide: [`../contributing/template-authoring.md`](../contributing/template-authoring.md)
- Location: `src/data/templates/`
- Regenerate JSON after edits: `bun run scripts/templates-to-json.ts`

---

## 6. Test & ship

| Doc | Why |
|---|---|
| [`../contributing/test-suite.md`](../contributing/test-suite.md) | Master spec — every test, guardrail, snapshot, regression |
| [`../contributing/running-tests.md`](../contributing/running-tests.md) | Quick reference — run tests locally + refresh snapshots |
| [`../contributing/contributing.md`](../contributing/contributing.md) | PR conventions, idempotent migrations |

Pre-merge checklist:

```bash
npm run lint
npx vitest run
bun run lint:skills
bun run check:doc-drift
```

---

## 7. Federate & integrate

| Doc | Why |
|---|---|
| [`../concepts/a2a-communication-model.md`](../concepts/a2a-communication-model.md) | Agent-to-Agent federation protocol |
| [`../mcp/resource-briefing.md`](../mcp/resource-briefing.md) | MCP briefing resource for external agents |
| [`../reference/headless-api.md`](../reference/headless-api.md) | REST/GraphQL content API |
| [`../reference/skills-source.md`](../reference/skills-source.md) | Live skill registry |

---

## What you do not need to read

[`operators/`](../operators/README.md), the deployment guides, and the department-claw playbooks. Those are for people running FlowWink, not building it.
