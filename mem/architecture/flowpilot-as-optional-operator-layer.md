---
name: FlowPilot as Optional Operator Layer (separation of concerns)
description: FlowWink SaaS = traditional SaaS + MCP + skills, no agent required. FlowPilot = optional autonomous operator layered on top with same access as external operators (OpenClaw) plus internal-vertical perks.
type: design
---

# FlowPilot as Optional Operator Layer

**Separation of concerns:**

- **FlowWink SaaS (kernel + shells)** = traditional SaaS. Admin UI for humans, FlowChat as web-CLI for humans, MCP as JSON shell for external agents. Skills, modules, automations (`executor='platform'`), event bus — all run without any agent. A customer can run FlowWink for years and never enable FlowPilot.
- **FlowPilot (operator)** = optional autonomous operator layered on top. Same skill catalog as everyone else, just *driven* differently: heartbeat loop, soul, objectives, reflection, automation execution.

## Operator parity rule

FlowPilot is **a peer of OpenClaw / external claws**, not a privileged super-admin.

- Same skills via the same `agent-execute` / MCP surface.
- Same trust/gating rules (`agent_skills.trust_level`).
- Same audit trail (`agent_activity`, `agent_events`).

What FlowPilot gets as an **internal vertical** (justified perks of being co-located):

| Perk | Why it's OK |
|---|---|
| In-process built-in tools (objectives, soul, reflect, planning, automations-exec) | Internal cognition; not useful to ship as MCP tools to others. |
| Direct `chat-completion` access without MCP round-trip | Latency. Same auth/policy applies. |
| Heartbeat-driven cron (`executor='flowpilot'` automations) | Scheduling layer, not extra capability. |
| Pre-warmed bootstrap (soul + briefing in memory) | Cache. External peers get the same via `flowwink://briefing`. |

What FlowPilot does **not** get over external operators:

- No hidden skills. Catalog is shared.
- No bypass of `trust_level`.
- No write paths that aren't reachable via MCP.

## Enforcement points

- `supabase/functions/agent-operate/index.ts` — FlowChat shell is **never gated** on `flowpilot.enabled`. When OFF, only FlowPilot-internal built-in tools (objectives/soul/reflect/planning/automations-exec) are stripped from the tool list. Skills and platform built-ins (memory-read, workflows, a2a, skill-packs) remain.
- `src/lib/module-bootstrap.ts` — module activation seeds skills with `mcp_exposed=true` regardless of FlowPilot state.
- `supabase/functions/automation-dispatcher/index.ts` — `executor='flowpilot'` automations are skipped when FP off; `executor='platform'` always runs.
- `supabase/functions/flowpilot-briefing/index.ts` — when FP off, briefing rebrands to FlowWink and shows neutral skill activity (You / External agents / Platform) without "autonomous actions" wording.

## Sales pitch

> *"FlowWink runs your business as a traditional SaaS. Add FlowPilot when you want it to run itself — same access an external agent would have, just living in the basement instead of next door."*

See also: `mem://architecture/flowwink-as-business-os-three-shells`, `mem://architecture/mcp-as-platform-not-flowpilot-feature`, `mem://architecture/automations-as-platform-layer`.
