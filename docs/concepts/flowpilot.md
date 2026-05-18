# FlowPilot — Conceptual Overview

> **FlowPilot is FlowWink's local, opt-in autonomous operator module.** It implements the OpenClaw agentic pattern (soul, skills, memory, heartbeat, reflection) on top of the platform's modules and skill catalog.

FlowPilot is **one of several possible operators** for FlowWink — the local one, shipped in-tree. The platform (modules, skills, automations, MCP) runs regardless of whether FlowPilot is enabled.

---

## Where to go next

This page is intentionally short. The substance lives in dedicated docs:

| You want to… | Read |
|---|---|
| Decide whether to enable FlowPilot vs an external operator (OpenClaw, Claude Desktop, …) | [`operator-strategy.md`](./operator-strategy.md) |
| Understand utility AI vs operator AI | [`flowchat-vs-flowpilot.md`](./flowchat-vs-flowpilot.md) |
| See the 10 inviolable agentic laws | [`openclaw-law.md`](./openclaw-law.md) |
| Configure & operate FlowPilot in a live site | [`../modules/flowpilot.md`](../modules/flowpilot.md) |
| Build on FlowPilot internals (heartbeat, memory, handlers, sensors, model failover) | [`../pilot/`](../pilot/README.md) |
| Browse all skills FlowPilot can call | [`../reference/skills-source.md`](../reference/skills-source.md) and each module's page in [`../modules/`](../modules/) |
| Federate FlowPilot with peer agents | [`a2a-communication-model.md`](./a2a-communication-model.md) |

---

## The one-paragraph mental model

A site visitor or admin types a message → FlowPilot's **reasoning loop** (`chat-completion` → ReAct) picks a **skill** from `agent_skills` based on its self-describing metadata → executes via `agent-execute` (edge handler, module RPC, generic CRUD, or A2A delegation) → renders the response back into the originating **block** or chat surface. Between requests, the **heartbeat** advances objectives, runs reflection/dreaming, and emits events to the platform event bus. No hardcoded intent routing, ever (Law 1).
