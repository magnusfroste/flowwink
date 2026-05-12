# FlowChat vs FlowPilot

A guiding principle for FlowWink. FlowChat (platform admin chat) and FlowPilot (autonomous operator module) **never compete** — they have strictly different roles. Both call the same skills, via the same MCP surface. The difference is *who thought the thought*.

## TL;DR

- **FlowChat = the hand.** Reactive. You ask, it does.
- **FlowPilot = the brain.** Proactive. It runs while you sleep.

## Role matrix

|                | FlowChat (platform)               | FlowPilot (operator)                                |
|----------------|-----------------------------------|-----------------------------------------------------|
| Role           | Hand — does what you say, now     | Brain — decides on its own, when needed             |
| Trigger        | Your chat message                 | Heartbeat, events, objectives, scheduler            |
| Time horizon   | Seconds (one conversation)        | Hours/days (loop with reflection)                   |
| Memory         | The conversation                  | Soul, objectives, agent_memory, reflections        |
| Initiative     | Reactive                          | Proactive (Morning Briefing, autonomous actions)    |
| Reasoning      | Short ReAct: read → skill → reply | Long loop: observe → reason → act → reflect → learn |
| Acts on its own | Never                            | Within trust limits (auto/notify/approve)           |
| Module state   | Always on (admin feature)         | Opt-in operator module                              |

## Shared foundation

Both use the same building blocks:

- The same `agent_skills` registry (platform layer)
- The same MCP surface — every external claw, Claude Desktop, OpenClaw, FlowPilot, and FlowChat see the same tools
- The same `chat-completion` reasoning endpoint
- The same providers (OpenAI / Gemini / local)

This means: **if a skill works for FlowPilot, it works for FlowChat (and vice versa).** No duplicated logic. No shadow brains.

## Hard boundaries (must be guarded)

These keep them from drifting into each other's territory:

1. **FlowChat must not run heartbeats**, scheduled jobs, or background loops.
2. **FlowChat must not store long-term memory**, objectives, or reflections beyond the conversation.
3. **FlowChat must not act proactively** ("I noticed that…"). Only on prompt.
4. **FlowPilot must not build its own content/AI pipelines** — it must call skills (Law 3).
5. **Skills live on the platform layer.** Neither FlowChat nor FlowPilot owns them.

## What FlowPilot uniquely adds

These are the capabilities you lose if you turn FlowPilot off (and that FlowChat must never try to replace):

- **Soul & objectives** — drives decisions without a prompt
- **Heartbeat** — runs when nobody is looking
- **Reflection & memory** — learns over time
- **Trust gating** — knows what it may do itself vs. ask
- **Cross-skill orchestration over time** — chains spanning hours/days
- **Proactive UX** — Morning Briefing, HIL cards, peer delegation

FlowChat gives none of this. It is a great **hand**. FlowPilot is **a colleague who works while you sleep**.

## Concrete example

A new law takes effect. The user wants a knowledge base article.

- **FlowChat path:** User asks → reasoning loop drafts the article → calls `manage_kb_article` with `action=create`, `title`, `question`, `answer` → done.
- **FlowPilot path:** Heartbeat notices the lead pipeline has GDPR/security questions + the law just took effect → drafts KB article + blog post + LinkedIn post → submits for approval per trust gating.

Same `manage_kb_article` skill. Different brain behind it.

## Why this matters

Without this discipline, two things break:

1. **Customers who turn FlowPilot off** lose nothing they need from FlowChat — and vice versa. Each is independently useful.
2. **External operators** (OpenClaw, Claude Desktop, department claws) can replace FlowPilot entirely without losing FlowChat or vice versa. The platform stays intact.

This is why the layering is explicit: **Platform → Modules → Operators**, with skills on the platform and operator behavior in operator modules. See [`platform-modules-operators-layering`](../../mem/architecture/platform-modules-operators-layering.md) and [`mcp-as-platform`](../architecture/mcp-as-platform.md).

## Related

- [FlowPilot Development Laws](./openclaw-law.md) — Law 3: blocks/skills are interfaces, not pipelines
- [Operator Strategy](./operator-strategy.md) — swappable operator shells
- [AI Utility vs Skill](../../mem/architecture/ai-utility-vs-skill-classification.md) — pure text transforms vs context-aware skills
