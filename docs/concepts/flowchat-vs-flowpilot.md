# FlowChat vs FlowPilot

A guiding principle for FlowWink. **FlowChat is the chat surface. FlowPilot is the autonomous agent layer that runs on top of it.** They are not two competing brains — they are one stack with the operator layer being opt-in.

## TL;DR (Tesla analogy)

- **Platform** = the car. Always on. Owns skills, MCP, automations, event bus.
- **FlowChat** = the built-in chat with the car. Always on. Reactive — you ask, it picks a skill via `chat-completion` and replies.
- **FlowPilot** = Autopilot. Opt-in. Adds soul, objectives, heartbeat, memory, reflection, trust gating, proactive UX **on top of** the same FlowChat reasoning loop.

When FlowPilot is **off**, FlowChat still works — you can chat, it calls skills, you get answers. You just lose autonomy (no heartbeat, no Morning Briefing, no objective-driven action, no reflection).

When FlowPilot is **on**, FlowChat is the same chat surface — but now there is a colleague behind it that also acts when nobody is typing.

## Layering

```
┌─────────────────────────────────────────────┐
│  FlowPilot (opt-in operator layer)          │  soul · objectives · heartbeat
│   ↑ drives the same chat-completion loop    │  memory · reflection · trust gating
├─────────────────────────────────────────────┤
│  FlowChat (always on)                       │  /admin/flowchat · /chat
│   reasoning entry point: chat-completion    │  ReAct: read → skill → reply
├─────────────────────────────────────────────┤
│  Platform                                   │  agent_skills · MCP · automations
│   skills, modules, event bus, RLS           │  event bus · RLS · DB
└─────────────────────────────────────────────┘
```

Same `agent_skills`. Same MCP surface. Same `chat-completion` endpoint. The difference is **who initiated the turn**: a human typing into FlowChat, or FlowPilot's heartbeat acting on an objective.

## Hard boundaries (must be guarded)

1. **FlowChat must not run heartbeats**, scheduled jobs, or background loops. Those belong to FlowPilot.
2. **FlowChat must not store long-term agent state** (objectives, reflections, soul). Conversation history only.
3. **FlowChat must not act proactively** ("I noticed that…"). Only on user prompt.
4. **FlowPilot must not build its own content/AI pipelines** — it drives the same `chat-completion` reasoning loop FlowChat uses (Law 3).
5. **Skills live on the platform layer.** Neither FlowChat nor FlowPilot owns them.

## What FlowPilot uniquely adds

Capabilities you lose if you turn FlowPilot off (and that FlowChat must never try to replace):

- **Soul & objectives** — drives decisions without a prompt
- **Heartbeat** — runs when nobody is looking
- **Reflection & memory** — learns over time
- **Trust gating** — knows what it may do itself vs. ask
- **Cross-skill orchestration over time** — chains spanning hours/days
- **Proactive UX** — Morning Briefing, HIL cards, peer delegation

FlowChat without FlowPilot is a great chat interface to your business skills. FlowPilot adds the colleague who works while you sleep.

## Concrete example

A new law takes effect. The user wants a knowledge base article.

- **FlowChat path (no FlowPilot needed):** User asks → `chat-completion` picks `manage_kb_article` → `action=create` → done.
- **FlowPilot path:** Heartbeat notices the lead pipeline has GDPR/security questions + the law just took effect → drives the same `chat-completion` loop to draft a KB article + blog post + LinkedIn post → submits for approval per trust gating.

Same chat reasoning loop. Same `manage_kb_article` skill. Different initiator.

## Why this matters

Without this discipline, two things break:

1. **Customers who turn FlowPilot off** still have a fully working FlowChat. The platform is independently useful.
2. **External operators** (OpenClaw, Claude Desktop, department claws) can replace FlowPilot entirely — they drive the same MCP surface FlowChat uses. The platform stays intact.

This is why the layering is explicit: **Platform → FlowChat (always on) → FlowPilot (opt-in operator on top)**, with skills on the platform. See [`platform-modules-operators-layering`](../../mem/architecture/platform-modules-operators-layering.md), [`flowpilot-as-optional-operator-layer`](../../mem/architecture/flowpilot-as-optional-operator-layer.md), and [`internal-flowchat-and-noise-separation`](../../mem/features/internal-flowchat-and-noise-separation.md).

## Related

- [FlowPilot Development Laws](./openclaw-law.md) — Law 3: blocks/skills are interfaces, not pipelines
- [Operator Strategy](./operator-strategy.md) — swappable operator shells
- [AI Utility vs Skill](../../mem/architecture/ai-utility-vs-skill-classification.md) — pure text transforms vs context-aware skills
