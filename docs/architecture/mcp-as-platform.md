---
title: "MCP as Platform (not a FlowPilot feature)"
status: "core architecture"
last_updated: "2026-04-22"
---

# MCP as Platform

FlowWink is a traditional SaaS first, an autonomous-agent platform second. The
**Model Context Protocol (MCP) surface is a platform-level capability** — it
belongs to the same layer as REST APIs, webhooks and the database, not to any
single agent module.

FlowPilot is **one of many possible MCP consumers**, alongside OpenClaw,
ClawWink, Claude Desktop and any custom client that speaks MCP. Disabling
FlowPilot must never reduce what an external agent can see or call.

## The rule

> Activating a module seeds its skills into `agent_skills` with
> `enabled=true` and `mcp_exposed=true`, **regardless of FlowPilot's enabled state**.
> Only `automations` (cron/event triggers that FlowPilot itself runs) require
> FlowPilot to be on.

Enforced by:

- `src/lib/module-bootstrap.ts` — `flowpilotEnabled` is checked **only** before the automations step (step 5). Steps 3 + 4 (skill enable, skill seed) always run.
- `supabase/functions/mcp-server/index.ts` — `SKILL_CATEGORY_MODULES`:
  - `automation: []` — platform-level, available to any MCP client.
  - `search: ["browserControl"]` — depends on the browser-control module, not FlowPilot.
  - `agent: ["flowpilot"]` — the **only** category that requires FlowPilot. Holds FlowPilot-internal skills (objectives, soul, reflect) that don't make sense for external callers.
- Guardrail tests:
  - `src/lib/__tests__/mcp-flowpilot-decoupling.test.ts`
  - `src/lib/__tests__/recruitment-module.e2e.test.ts`

## Admin UX consequence

Skills and MCP exposure live under **Developer**, not Engine Room:

| Page | Owns |
|---|---|
| `/admin/developer` → **MCP Skills** | Catalog, MCP exposure toggle, enable/disable, search/filter by module |
| `/admin/developer` → **MCP Activity** | External MCP call log (`agent='mcp'`) |
| `/admin/developer` → **MCP Keys** | API keys for external MCP clients |
| `/admin/federation` | A2A peers, MCP collaborators, agent invites |
| `/admin/skills` (FlowPilot Engine) | Objectives, automations, workflows, evolution, autonomy schedule |

Admins managing MCP never need to enter FlowPilot UI. Admins running FlowPilot
see a banner pointing to the shared catalog under Developer.

## Why this matters

Customers often want to:

1. **Run FlowWink as a pure SaaS** with manual humans — MCP off-loads automation to
   any orchestrator they choose, no in-house autonomy needed.
2. **Replace FlowPilot** with a faster-evolving external agent (OpenClaw,
   ClawWink, Claude Desktop) without losing access to module skills.
3. **Run multiple agents in parallel** — FlowPilot internally + an external
   collaborator on the same skill catalog.

All three patterns require that **modules + MCP are independent of FlowPilot**.

## What FlowPilot still owns

- Objectives, automations, workflows, evolution, autonomy schedule (intelligence + scheduling layer)
- The `agent` skill category (objectives, soul, reflect, planning) — internal cognition tools that don't make sense as MCP tools
- Heartbeat, briefings, dreaming, self-healing
- Convenience shortcuts (in-memory context, KB grounding, identity prompts) that external agents can replicate via the `flowwink://briefing` MCP resource

## Migration notes

The `/admin/skills` route still resolves (back-compat) but is now titled
**FlowPilot Engine**. The Skills + Activity tabs were moved to Developer; old
deeplinks like `?tab=skills` redirect users to `/admin/developer?tab=mcp-skills`
via the banner, but no automatic redirect is in place to avoid breaking
bookmarks.

## Related

- [`architecture/flowwink-control-model.md`](./flowwink-control-model.md) — Full architecture diagram showing how the platform, modules, skills, and three operating modes (SaaS, FlowPilot, External Agent) interact. Includes file locations proving decoupling.
