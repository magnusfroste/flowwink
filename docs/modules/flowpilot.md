---
id: flowpilot
name: FlowPilot
manual: true
description: The autonomous AI operator at the heart of FlowWink. Soul + objectives + skills + memory + heartbeat + reflection — modeled after OpenClaw.
title: "FlowPilot"
category: modules
---

# FlowPilot

> **Status:** Flagship module — manually maintained.
> **Source of truth:** `src/lib/modules/flowpilot-module.ts` + this file.
> _The auto-generator skips this file because of `manual: true`._

FlowPilot is **the agent that runs the business**. It is not a chatbot, not a copilot, not a workflow engine. It is a continuously-running operator that perceives the platform, reasons about objectives, executes skills, and reflects on outcomes — modeled after the [OpenClaw](mem://philosophy/openclaw-law) reference architecture.

Where most "AI features" are stitched into individual buttons, FlowPilot is the **single reasoning layer** every business action flows through. Blocks, automations, slash commands, and federated peers all converge on `chat-completion`. See [Law 3](mem://philosophy/flowpilot-development-laws).

---

## The five pillars (OpenClaw model)

| Pillar | What it is | Where it lives |
|---|---|---|
| **Soul** | Personality, voice, values, refusal policies | `agent_memory` (bootstrap files) |
| **Objectives** | Ranked goals with progress + KPIs | `agent_objectives` |
| **Skills** | Self-describing capabilities (MCP-exposed) | `agent_skills` |
| **Memory** | Working + episodic + semantic | `agent_memory`, `agent_messages`, `agent_events` |
| **Heartbeat** | Autonomous loop driving continuous operation | `flowpilot-heartbeat` edge function |
| **Reflection** | Post-action critique + memory updates | `agent_reflections` |

See `mem://architecture/openclaw-workspace-prompt-architecture` for the 6-layer bootstrap.

---

## The reasoning loop

```
Trigger (event / cron / user message / slash command)
   ↓
chat-completion (the ONLY reasoning entry point)
   ↓
ReAct loop:
   1. Perceive  — load context (briefing, KB, recent events)
   2. Reason    — pick objective, score skills against intent
   3. Act       — invoke skill via agent-execute
   4. Observe   — capture result + side effects
   5. Reflect   — update memory, escalate if needed
   ↓
Response (to user, automation, peer, or silent log)
```

**Skill selection is metadata-driven.** No regex, no keyword routing, no `if (msg.includes('order'))`. The scoring algorithm reads `description`, `Use when:`, and `NOT for:` markers from `agent_skills` and ranks candidates. See [Law 1 & 2](mem://philosophy/flowpilot-development-laws).

---

## The heartbeat engine

A 7-step loop runs on cron (default: every 5 minutes when objectives are pending):

1. **Wake** — load active soul + open objectives
2. **Scan briefing** — pull `flowwink://briefing` MCP resource (sales, ops, alerts)
3. **Pick objective** — highest-priority unfulfilled goal
4. **Plan** — decompose into skill calls
5. **Execute** — through `agent-execute` (one skill per heartbeat to keep latency bounded)
6. **Reflect** — write to `agent_reflections`, update objective progress
7. **Sleep** — schedule next heartbeat or yield to event-driven triggers

Hard limit: **5-minute timeout per heartbeat** (Supabase edge constraint). Long-running work uses fire-and-forget patterns. See `mem://architecture/flowpilot-heartbeat-engine` and `mem://constraints/supabase-edge-function-timeouts`.

---

## Trust & gating

Every skill has a trust level on `agent_skills.trust_level`:

| Level | Behavior |
|---|---|
| `auto` | Executes immediately. Logged. |
| `notify` | Executes, then sends a notification card. |
| `approve` | Pauses and creates an HIL (human-in-the-loop) card. Awaits click. |
| `blocked` | Disabled. Will not appear in skill scoring. |

Trust is per-deployment policy. New customers default to `notify` for write-skills, `auto` for reads. See `mem://architecture/agent-trust-and-gating-logic`.

---

## Federation

FlowPilot is the operator **built in**; it is not the only one. The agents people
bring (Claude, ChatGPT, Cursor, OpenClaw, Hermes…) operate the same instance over
MCP, each as its owner and within the owner's module access — see
[`federation.md`](./federation.md) and
[`../operators/connect-your-agent.md`](../operators/connect-your-agent.md).

- FlowPilot runs skills in-process (`executeSkill`); it does not go through the MCP gateway.
- `delegate_task` is an **internal** specialist hand-off (seo, content, sales, analytics, email), logged in `a2a_activity`.
- Outbound to OpenClaw goes through `openclaw-responses` (`dispatch_claw_mission`, `openclaw_exchange`).

---

## Cockpit & Engine Room

The UI splits into two surfaces:

| Surface | Audience | Path |
|---|---|---|
| **Cockpit** | Day-to-day ops — briefing, HIL cards, slash commands, conversation | `/admin/flowpilot` |
| **Engine Room** | Internals — soul, objectives, skills, memory, reflections, autonomy tests | `/admin/flowpilot/engine` |

See `mem://architecture/flowpilot-cockpit-and-engine-room-ui`.

The `/admin/developer` area owns skills inspection (skills are platform-level, not FlowPilot-only). See `mem://architecture/mcp-as-platform-not-flowpilot-feature`.

---

## Module manifest

FlowPilot is itself a module — opt-in, with a manifest like every other module. See `mem://architecture/flowpilot-unified-module-manifest` and `mem://architecture/flowpilot-opt-in-module-strategy`.

When disabled:
- The reasoning hub (`chat-completion`) still works for utilities (text transforms, workspace chat).
- Automations with `executor='flowpilot'` are skipped (or fall back to `executor='platform'` if defined).
- Skills remain registered + MCP-exposed (skills are platform). External peers can still call them.
- The Cockpit + Engine Room UI are hidden.

See `mem://architecture/automations-as-platform-layer`.

---

## Development laws (inviolable)

1. **No hardcoded intent detection.** Improve skill metadata, not routing logic.
2. **Skills are self-describing.** If FlowPilot picks the wrong skill, fix the description.
3. **Blocks are interfaces, not pipelines.** All AI flows through `chat-completion`.
4. **Fail forward, don't gate.** If credentials exist, the feature works.

See `mem://philosophy/flowpilot-development-laws` (full canonical version with examples).

---

## Extending FlowPilot

### Add a new skill
1. Create the handler — either an `edge:` function or `internal:` action in `agent-execute`.
2. Register in module's `skillSeeds` (or seed directly into `agent_skills` for cross-cutting skills).
3. Write description with explicit `Use when:` and `NOT for:` markers.
4. Run `bun run lint:skills` (Agent Contract Integrity check). See `mem://architecture/skill-linter`.
5. Set initial `trust_level` — default `notify` for writes, `auto` for reads.

### Add a new objective type
1. Insert into `agent_objectives` with KPI definition.
2. Define progress-update trigger (event-based or cron).
3. Soul bootstrap automatically references active objectives in every reasoning turn.

### Add a new bootstrap layer
The 6-layer `agent_memory` bootstrap (identity → constraints → objectives → skills index → recent events → working notes) is appended to every system prompt. To add a layer:
1. Create the resource (file, view, or computed bundle).
2. Register in soul-loader sequence.
3. Test token budget — bootstrap is the largest cost driver.

---

## Development context

- **`chat-completion` is the only reasoning entry point.** Never call OpenAI/Gemini directly from a module. See `mem://architecture/unified-ai-orchestration-and-fallback`.
- **`resolveAiConfig()` resolves provider + model + key** — supports OpenAI, Gemini, local AI, n8n. Bring your own key — there is no bundled AI provider.
- **One skill per heartbeat.** Multi-step plans become multiple heartbeats with state in `agent_objectives.progress_json`.
- **Reflections are mandatory after write-skills.** Drives the feedback loop. See `mem://architecture/proactive-conversational-intelligence-ux`.
- **MCP exposure is opt-in via module activation.** A skill from a disabled module is invisible to external peers. See `mem://architecture/mcp-module-aware-filtering`.

See also: `mem://persona/autonomous-digital-operator-protocols`, `mem://philosophy/always-in-the-loop-architecture`, `mem://architecture/sensors-vs-reasoning-vision-boundary`.

<!-- generated:skills:start — written by scripts/generate-module-docs.ts, edits here are overwritten -->
## Skills

These skills are seeded into `agent_skills` when the module is enabled and exposed via MCP.
External operators (FlowPilot, OpenClaw, Claude Desktop, custom MCP clients) can call them directly.

| Skill | Scope | Description |
|-------|-------|-------------|
| `create_objective` | internal | Create a new high-level objective for FlowPilot to work toward. Use when: defining a new strategic goal; initiating a new project; setting a long-term target for operations. NOT for: creating CRM t… |
| `list_objectives` | internal | List FlowPilot\ |
| `manage_objective` | internal | Pause, resume, complete or edit a FlowPilot objective. Pausing stops the loop from acting on it without losing it; resume restarts it; complete closes it ONLY on evidence (the same rule FlowPilot i… |
| `learn_from_data` | internal | Analyze page views, chat feedback, and lead conversions to distill learnings into persistent memory. Use when: heartbeat learning cycle; extracting insights from operational data; building institut… |
| `manage_automations` | internal | Create and manage agent automations (cron jobs, event triggers, signal handlers). Use when: setting up recurring tasks; defining automatic event responses; implementing signal processing logic. NOT… |
| `users_list` | internal | List platform users with their roles. Shows email, role, and last sign-in. Use when: admin needs to review team members; checking user access levels; auditing platform users. NOT for: managing user… |
| `update_autonomy_cadence` | internal | Re-register FlowPilot's pg_cron heartbeat jobs from the current autonomy_schedule setting. Use when: the admin changed the autonomy cadence and the cron schedule must be refreshed. Takes no argumen… |

<!-- generated:skills:end -->
