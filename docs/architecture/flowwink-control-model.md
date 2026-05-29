---
title: "FlowWink Control Model — With and Without FlowPilot"
status: "core architecture"
last_updated: "2026-05-29"
---

# FlowWink Control Model

> **One sentence:** FlowWink is a **skill-first business platform** that works as a
> traditional SaaS with or without its autonomous operator (FlowPilot). MCP and
> skills are platform primitives — not FlowPilot features.

---

## The Mental Model

```
┌─────────────────────────────────────────────────────────────┐
│                     FLOWWINK PLATFORM                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │
│  │   MODULES   │  │   SKILLS    │  │   MCP GATEWAY       │   │
│  │  (62 real   │  │  (280+ in   │  │  (?groups= /        │   │
│  │   SaaS      │  │   DB)       │  │   ?mode=dispatch)   │   │
│  │   tables)   │  │             │  │                     │   │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘   │
│         │                │                    │                │
│         └────────────────┴────────────────────┘                │
│                          │                                    │
│              ┌───────────┴───────────┐                        │
│              │   INTENT SCORER     │  ← platform primitive   │
│              │  _shared/skills/    │    (NOT FlowPilot)     │
│              └───────────┬───────────┘                        │
│                          │                                    │
│     ┌────────────────────┼────────────────────┐              │
│     │                    │                    │              │
│     ▼                    ▼                    ▼              │
│  ┌─────────┐        ┌──────────┐        ┌──────────┐        │
│  │FlowChat │        │ FlowPilot│        │ External │        │
│  │(reactive│        │(autonome│        │  Agents  │        │
│  │ admin   │        │ ous)     │        │ (MCP)    │        │
│  │  chat)  │        │          │        │          │        │
│  └─────────┘        └──────────┘        └──────────┘        │
│       │                   │                   │               │
│       └───────────────────┴───────────────────┘               │
│                           │                                  │
│                    ┌──────┴──────┐                           │
│                    │ agent-execute│  ← skill execution       │
│                    │   (RPC/edge) │    engine                 │
│                    └─────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

**Key insight:** The Intent Scorer and Skill Engine sit *between* the platform
and its consumers. They are **not inside FlowPilot**. This is deliberate.

---

## Three Operating Modes

### 1. Pure SaaS — FlowPilot OFF, no external agents

- Admin uses the web UI for everything
- Modules work as normal (CRM, E-commerce, Accounting, etc.)
- **Skills are still seeded** in `agent_skills` with `mcp_exposed=true`
- **FlowChat works** — admin can chat with the reactive operator
- No heartbeat, no objectives, no autonomy

**Why this works:** FlowChat calls `agent-operate` → which calls the platform
scorer → which picks relevant skills → which execute via `agent-execute`. No
FlowPilot involvement.

### 2. FlowPilot ON — autonomous operator

- Everything from Mode 1, PLUS:
- Heartbeat runs on schedule (every 15 min)
- Objectives drive proactive work
- Briefings appear in the Cockpit
- Self-healing monitors skill health

**Architecture note:** FlowPilot's ReAct loop (`pilot/reason.ts`) imports the
**same** `scoreSkillsByIntent` from `_shared/skills/intent-scorer.ts` that
FlowChat uses. They share the scoring engine; only the *caller* differs.

### 3. External Agent — FlowPilot OFF, MCP client connected

- External agent (Claude Desktop, OpenClaw, custom claw) connects via MCP
- Uses `?mode=dispatch` for 2-tool surface (`search_skills` + `execute_skill`)
- Or uses `?groups=sales,crm` for specialist toolkit
- **Same skill catalog** as FlowChat and FlowPilot

**Architecture note:** The MCP gateway calls the same `scoreSkillsByIntent`
function that FlowChat and FlowPilot use. Three consumers, one engine.

---

## File Locations — Proof of Decoupling

| Component | Location | What it proves |
|-----------|----------|----------------|
| **Intent Scorer** | `supabase/functions/_shared/skills/intent-scorer.ts` | NOT under `_shared/pilot/` — platform primitive |
| **FlowChat operator** | `supabase/functions/agent-operate/index.ts` | Separate edge function, imports scorer directly |
| **FlowPilot ReAct** | `supabase/functions/_shared/pilot/reason.ts` | Also imports scorer from `../skills/` |
| **MCP Gateway** | `supabase/functions/mcp-server/index.ts` | Calls scorer in `search_skills` tool |
| **Skill Execution** | `supabase/functions/agent-execute/index.ts` | Single RPC engine used by all callers |

**If the scorer lived under `_shared/pilot/`**, disabling FlowPilot would break
FlowChat and MCP. It doesn't — because it's in `_shared/skills/`.

---

## Why This Architecture Matters

### For customers
1. **Start simple** — turn on modules, use as SaaS, chat with FlowChat
2. **Add autonomy later** — enable FlowPilot when ready, no migration
3. **Swap operators** — replace FlowPilot with OpenClaw/Claude without losing skills
4. **Hybrid mode** — FlowPilot internally + external department claw on same data

### For developers
1. **Skills are the interface** — new capability = new skill row in DB, no routing code
2. **No hardcoded intent** — Law 1: scorer + metadata handles all routing
3. **Testable in isolation** — score a query against skills without booting FlowPilot
4. **One execution engine** — `agent-execute` handles all skill types (edge, db, webhook)

---

## What FlowPilot Owns (and nobody else)

These are **genuinely FlowPilot-only** — they make no sense for external agents:

| Capability | Why FlowPilot-only |
|-----------|-------------------|
| `objectives` | Autonomous planning requires soul + identity + heartbeat state |
| `automations` | Cron/event triggers are FlowPilot's scheduler |
| `reflect` | Self-assessment needs access to full activity history |
| `soul_update` | Personality evolution is internal cognition |
| `heartbeat` | 7-step loop with dreaming, compaction, self-healing |
| `workflow_execute` | DAG runner with persistent state |

These live in the `agent` skill category which is **filtered out** of MCP
exposure (`SKILL_CATEGORY_MODULES['agent'] = ['flowpilot']`).

---

## Common Misconceptions — Corrected

| Misconception | Reality |
|--------------|---------|
| "FlowChat uses `pilot/reason.ts`" | **No.** FlowChat uses `agent-operate` which imports from `_shared/skills/` directly. `pilot/reason.ts` is FlowPilot's ReAct loop only. |
| "The scorer is FlowPilot's" | **No.** `intent-scorer.ts` is a platform primitive. FlowPilot is one of 3+ consumers. |
| "MCP needs FlowPilot enabled" | **No.** MCP gateway reads `agent_skills` directly. Only `automations` need FlowPilot. |
| "Skills are FlowPilot skills" | **No.** Skills are **platform skills**. FlowPilot executes them; so does FlowChat; so do external agents. |
| "Disabling FlowPilot breaks AI chat" | **No.** FlowChat (`agent-operate`) works independently. Only proactive autonomy stops. |

---

## Verification — How to Prove It

### Test 1: FlowPilot OFF, FlowChat works
1. Disable FlowPilot module
2. Open `/admin/flowchat`
3. Ask "list my leads" → leads appear (via `list_leads` skill)
4. Check Network tab → calls `agent-operate`, NOT `agent-reason`

### Test 2: Same scorer, different callers
```bash
# FlowChat path (reactive)
POST /functions/v1/agent-operate
→ scoreSkillsByIntent() from _shared/skills/
→ execute_skill() via agent-execute

# FlowPilot path (autonomous)
POST /functions/v1/agent-reason
→ scoreSkillsByIntent() from _shared/pilot/../skills/
→ execute_skill() via agent-execute

# MCP path (external)
POST /functions/v1/mcp-server?mode=dispatch
→ search_skills → scoreSkillsByIntent()
→ execute_skill → agent-execute
```

### Test 3: MCP with FlowPilot disabled
1. Disable FlowPilot
2. Create MCP key at `/admin/developer → MCP Keys`
3. Connect Claude Desktop
4. Ask "create a blog post" → works via `create_blog_post` skill
5. FlowPilot remains off; blog post is created

---

## Related Documentation

- `docs/architecture/mcp-as-platform.md` — MCP as platform layer
- `mem://architecture/mcp-as-platform-not-flowpilot-feature` — Constraint: skills seed regardless of FlowPilot
- `mem://architecture/skill-engine-and-intent-logic` — Scorer algorithm details
- `mem://philosophy/flowpilot-development-laws` — Law 1: no hardcoded intent
- `docs/pilot/architecture.md` — FlowPilot internals (for contrast)
- `docs/agents/agent-setup.md` — External agent onboarding

---

## Summary

> **FlowWink = Skill Platform + Optional Autonomy Layer**
>
> Skills are the platform. FlowPilot is a consumer. FlowChat is another consumer.
> External agents are a third. They all eat from the same skill catalog, scored by
> the same intent engine, executed by the same RPC layer.
>
> FlowPilot adds **proactive intelligence** (heartbeat, objectives, reflection).
> It does not add **capability** — that's in the skills.
