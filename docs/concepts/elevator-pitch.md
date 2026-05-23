# FlowWink — Elevator Pitch

---

## One-liner

> **FlowWink is a self-hosted Business Operating System — CMS, CRM and ERP in one — where every module is agent-operable out of the box. Run it as traditional SaaS, plug in an external AI operator over MCP, or turn on the built-in FlowPilot.**

---

## What it is, in one paragraph

FlowWink is one codebase that replaces the usual stack of CMS + CRM + ERP + helpdesk + bookings + accounting. It's modular (toggle what you need), single-tenant (your data stays on your server), and every action a human can take in the admin UI is also exposed as a **skill** any agent can call over the **Model Context Protocol (MCP)**. That means you can keep operating the business by hand, hand it to Claude Desktop / OpenClaw / a custom agent, or enable the optional **FlowPilot** module and let it run autonomously.

---

## Three ways to run it

```
1. Pure SaaS         Humans → Admin UI → Modules           (no agent at all)
2. Agent-operated    Humans + External agent → MCP → Modules (Claude, OpenClaw, custom)
3. Autonomous        Humans set goals → FlowPilot → Modules (built-in operator)
```

All three use the **same modules, same skills, same data**. Switching modes is a toggle, not a migration.

---

## Why it matters

Most SaaS hands the work back to a human. Most "AI products" bolt a chatbot onto a fixed surface. FlowWink starts from the opposite end: the platform is the surface, the surface is callable, and the operator (human or agent) is pluggable.

| | Traditional SaaS | "AI features" bolted on | FlowWink |
|---|---|---|---|
| Modules work without AI | ✅ | ✅ | ✅ |
| Every action callable by an agent | ❌ | Partial | ✅ (MCP) |
| Bring-your-own agent | ❌ | ❌ | ✅ |
| Built-in autonomous operator | ❌ | ❌ | ✅ (FlowPilot, opt-in) |
| Self-hosted, single-tenant | Rarely | Never | Always |

---

## The MCP bet

MCP is becoming the USB-C of agent tooling. Rather than building a closed assistant, FlowWink **exposes every module as MCP skills by default** — grouped (`?groups=marketing|sales|operations`) so external orchestrators can pull only the toolset they need without context bloat. Onboarding an external agent is minutes, not weeks.

See [`../architecture/mcp-as-platform.md`](../architecture/mcp-as-platform.md) and [`../mcp/getting-started.md`](../mcp/getting-started.md).

---

## FlowPilot — the optional built-in operator

If you don't want to wire up an external agent, enable FlowPilot:

- Soul, memory, heartbeat, 70+ skills tuned to FlowWink's modules
- Runs on OpenAI, Gemini or a local private model — no vendor lock-in
- Same skill catalog any MCP client sees — nothing FlowPilot-only on the data side
- Turn it off and the platform keeps working as plain SaaS

FlowPilot is a **module**, not the core. See [`operator-strategy.md`](./operator-strategy.md).

---

## Who it's for

- **SMBs and agencies** who want a single system instead of 8 SaaS subscriptions
- **Self-hosters** in regulated industries (healthcare, finance, legal) where data sovereignty is non-negotiable
- **Agent builders** who want a real business backend their agent can actually operate

---

## The trajectory

1. **Today** — Self-hosted Business OS. MCP-native. FlowPilot ships with it.
2. **Next** — Skill marketplace. Federated agents across deployments.
3. **Endgame** — The default operating system for agent-operated businesses.

---

*"Bring your own operator — or use ours."*

*Updated: 2026-05-23*
