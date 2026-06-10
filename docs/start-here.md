---
title: Start Here
description: 5-minute orientation to FlowWink — what it is, how to run it, and where to go next.
category: concepts
order: 0
---

# Start Here

FlowWink is a **self-hosted Business Operating System**: CMS + CRM + ERP + helpdesk + bookings + accounting in one codebase. Every module is **agent-operable over MCP** from day one. You can run it three ways:

| Mode | Who drives | When to pick it |
|---|---|---|
| **SaaS** | Humans only | You want a clean, modular admin. No AI needed. |
| **Agent-operated** | External MCP agent (Claude Desktop, OpenClaw, custom) | You already have an agent stack and want it to operate your business. |
| **Autonomous** | Built-in **FlowPilot** module | You want autonomy out of the box — soul, heartbeat, objectives. |

You can switch modes anytime. Same modules, same skills, same data.

---

## In 5 minutes

1. **Install** — [`guides/setup.md`](./guides/setup.md) (Supabase Cloud + Vercel, ~10 minutes)
2. **Configure** — log in, finish `/admin/onboarding`, walk through [`operators/system-settings.md`](./operators/system-settings.md)
3. **Pick modules** — toggle in `/admin/modules`. Start with CRM, Pages, Blog. Add the rest later.
4. **Pick an operator** — see [`concepts/operator-strategy.md`](./concepts/operator-strategy.md)
   - Connect an external agent: [`mcp/getting-started.md`](./mcp/getting-started.md)
   - Or enable the FlowPilot module: [`modules/flowpilot.md`](./modules/flowpilot.md)

---

## What to read next

| You are… | Go to |
|---|---|
| Running FlowWink for a business | [`operators/README.md`](./operators/README.md) |
| Extending the codebase | [`builders/README.md`](./builders/README.md) |
| Connecting an MCP client | [`mcp/getting-started.md`](./mcp/getting-started.md) |
| Curious about the architecture | [`concepts/elevator-pitch.md`](./concepts/elevator-pitch.md) → [`architecture/mcp-as-platform.md`](./architecture/mcp-as-platform.md) |
| Working on Odoo parity (the depth roadmap) | [`parity/README.md`](./parity/README.md) → [`parity/pipeline.md`](./parity/pipeline.md) |

---

## The core idea, in one sentence

> Modules + MCP are the platform. FlowPilot is one operator among many. Disabling the operator never reduces what the platform can do.

See [`architecture/mcp-as-platform.md`](./architecture/mcp-as-platform.md) for the law that enforces this, and [`architecture/flowwink-control-model.md`](./architecture/flowwink-control-model.md) for the complete architecture — how FlowChat, FlowPilot, and external agents all consume the same skill catalog via the same intent scorer.
