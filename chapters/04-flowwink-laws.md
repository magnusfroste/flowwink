---
title: "The 10 Laws of Agentic Architecture"
description: "The constraints that emerged from building production agentic systems. Skills, memory, safety, heartbeat, and self-evolution."
order: 7
icon: "scale"
---

# The 10 Laws of Agentic Architecture

> **These laws aren't guidelines. They're constraints that emerged from building FlowPilot on top of the OpenClaw reference model. They are Flowwink-specific design decisions, validated in production.**

---

## The B2B Gap: Five Problems OpenClaw Doesn't Solve

OpenClaw is a brilliant personal agent. But if you try to run a business on it, you hit five walls fast:

| # | Problem | What happens |
|---|---------|-------------|
| 1 | **No cost control** | An autonomous agent calling GPT-4 every 30 minutes burns through API credits with no budget guardrails. OpenClaw has no token budget system — the model runs until it's done. |
| 2 | **No approval gates** | Every tool call executes immediately. In a business context, sending a newsletter to 5,000 subscribers or publishing a blog post needs human sign-off. OpenClaw's permission model is designed for a single trusted user, not organizational workflows. |
| 3 | **No role separation** | OpenClaw has one agent surface. A business needs at least two: an admin-facing operator (full access) and a public-facing assistant (read-only + booking). Scope isolation doesn't exist. |
| 4 | **No structured memory** | File-based memory works for one person. A business agent needs categorized, searchable, embeddable memory with decay and compression — and it needs to survive instance restarts and migrations. |
| 5 | **No autonomous planning** | OpenClaw's heartbeat is a checklist the model reads. A business agent needs structured objectives, plans with steps, progress tracking, and reflection — the difference between "check if anything needs attention" and "execute a quarterly growth strategy." |

These aren't criticisms of OpenClaw — they're consequences of its design philosophy (single-user, transparent, simple). The 10 Laws below are Flowwink's answers to these five problems. Each law addresses at least one of them.

---

## Law 1: Skills as Knowledge Containers

Every skill MUST have a rich `instructions` field containing: what it does, when to use it, how to think about parameters, provider knowledge, edge cases, and decision tables.

**Why:** The LLM doesn't understand your domain. The instructions field is how you teach it. A skill without rich instructions is a tool the agent doesn't know how to use properly.

**Implementation:**
```
instructions: "When booking appointments, always confirm timezone first.
Use the user's detected timezone from their browser. If unavailable,
ask explicitly. Never assume UTC. For recurring bookings, check the
service's availability rules before suggesting times..."
```

**The anti-pattern:** Skills with only a name and JSON schema. The agent will hallucinate usage patterns.

---

## Law 2: Free First, Paid When Necessary

Default to `auto` (free/cheap first). Use `preferred_provider` for override. Document tradeoffs in skill instructions.

**Why:** AI costs scale with usage. An autonomous agent that runs 48 times per day will burn through expensive model credits fast. Default to cheap models, upgrade for complex reasoning.

**Implementation:**
```
AI Tiers:
- fast: gpt-4.1-mini (default for most operations)
- reasoning: gpt-4.1 / gemini-2.5-pro (for complex planning)
```

**The anti-pattern:** Using the most expensive model for everything. Your agent will cost more than the employee it replaces.

---

## Law 3: Lazy Instruction Loading

Never inject all skill instructions into the prompt. Load only the instructions for skills the agent actually calls.

**Why:** Skill instructions are expensive (~500 tokens each). With 118 registered skills (plus 32 built-in tools), that's 59,000+ tokens just for instructions — nearly half the context window. Instead, load metadata only (~10 tokens per skill), then fetch full instructions on-demand.

**Implementation:**
```
Phase 1 (startup): Load name + description + schema (~10 tokens/skill)
Phase 2 (on-call): Load full instructions when LLM calls the skill (~500 tokens/skill)
Phase 3 (budget): Compress or drop skills as context fills up
```

**The anti-pattern:** Loading all 118 skill instructions into the system prompt. You'll hit context limits before the first tool call.

---

## Law 4: The Agent MUST Be Able to Evolve

Built-in tools for self-modification: `skill_create`, `skill_instruct`, `skill_update`, `skill_disable`, `soul_update`, `agents_update`, `reflect`, `propose_objective`, `automation_create`.

**Why:** A static agent is a dying agent. The value of autonomy is compound learning — the agent should get better at its job over time. Without self-modification tools, it's just a fancy script.

**Implementation:**
```json
{
  "name": "skill_create",
  "description": "Register a new skill at runtime",
  "parameters": {
    "name": "string",
    "handler": "string",
    "tool_definition": "object",
    "instructions": "string"
  }
}
```

**Safety:** New skills default to `requires_approval = true`. Every modification is logged.

**The anti-pattern:** An agent that can't modify itself. It will never improve beyond its initial configuration.

---

## Law 5: Handler Abstraction

Skills use handler strings, NOT direct function calls. The handler prefix determines execution path.

**Why:** Decouples the skill definition from its implementation. You can move a skill from an Edge Function to a module handler to a webhook without changing the agent's understanding.

**Implementation:**
| Prefix | Route |
|--------|-------|
| `edge:qualify-lead` | Supabase Edge Function |
| `module:blog` | In-process module handler |
| `db:page_views` | Direct database query |
| `webhook:n8n` | External HTTP call |
| `a2a:SoundSpace` | Agent-to-agent peer |

**The anti-pattern:** Hardcoding function names in skill definitions. Changing the implementation breaks the skill.

---

## Law 6: Scope-Based Permissions

Every skill MUST define scope: `internal`, `external`, or `both`.

**Why:** A visitor-facing chatbot should NOT have access to admin tools. An admin agent should NOT expose internal operations to visitors. Scope enforces this at the architecture level.

**Implementation:**
```
internal  → Only FlowAgent (admin) can use
external  → Only Public Chat (visitors) can use
both      → Either agent can use
```

**The anti-pattern:** One agent serving both visitors and admins with the same tool set. Security nightmare.

---

## Law 7: Approval Gating

Destructive or costly skills MUST set `requires_approval: true`. New agent-created automations are disabled by default.

**Why:** An autonomous agent that can send newsletters, delete content, or spend money without human oversight is a liability, not an asset.

**Implementation:**
1. Agent calls skill → `agent-execute` intercepts
2. If `requires_approval`: log with status `pending_approval`
3. Admin sees pending action in Activity Feed
4. Admin approves → original args re-executed automatically

**The anti-pattern:** Letting the agent do everything without approval. One bad LLM hallucination and your entire newsletter goes out with wrong content.

---

## Law 8: Self-Healing Protocol

Auto-quarantine skills after 3 consecutive failures. Linked automations are also disabled.

**Why:** A failing skill will be called again and again by the agent (it doesn't know it's broken). Without self-healing, failures cascade: skill fails → automation fails → heartbeat reports failure → agent tries again → repeat.

**Implementation:**
1. `runSelfHealing()` scans last 3 days of `agent_activity`
2. Skills with 3+ consecutive failures → auto-disable
3. Linked automations → also disabled with error annotation
4. Admin notified with one-click re-enable
5. Healing report injected into heartbeat system prompt

**The anti-pattern:** Manual monitoring of skill failures. By the time a human notices, the agent has been failing for days.

---

## Law 9: Heartbeat Protocol (7-Step Loop)

Every autonomous heartbeat follows: **Self-Heal → Propose → Plan → Advance → Automate → Reflect → Remember**.

**Why:** The heartbeat is the agent's autonomous operating cycle. Without a structured protocol, the agent will either do nothing or do random things. The 7-step loop ensures systematic operation.

**Implementation:**
```
1. SELF-HEAL    → Quarantine failing skills
2. PROPOSE      → Create objectives from patterns/stats
3. PLAN         → AI decomposes objectives into steps
4. ADVANCE      → Chain-execute plan steps (up to 4 per call)
5. AUTOMATE     → Execute DUE cron/event/signal automations
6. REFLECT      → Analyze 7-day performance, auto-persist learnings
7. REMEMBER     → Save insights to persistent memory
```

**The anti-pattern:** An agent with no structured heartbeat. It either sits idle or does random things with no systematic approach.

---

## Law 10: Unified Reasoning Core

All agent surfaces (interactive, autonomous, visitor chat) MUST share the same reasoning module. No logic duplication.

**Why:** If the interactive agent and the heartbeat agent use different reasoning code, they'll behave differently. Bugs fixed in one won't be fixed in the other. Features added to one won't appear in the other.

**Implementation:**
```
chat-completion ──┐
agent-operate   ──┼──→ agent-reason.ts (shared module)
heartbeat       ──┘
```

All three surfaces call the same `reason()` function with different configurations:
- `chat-completion`: scope=external, streaming
- `agent-operate`: scope=internal, streaming
- `heartbeat`: scope=internal, non-streaming

**The anti-pattern:** Separate reasoning logic for each surface. Maintenance nightmare, inconsistent behavior.

---

## The Laws in Practice

These laws aren't theoretical. They emerged from building FlowPilot, which implements all 10. They are **Flowwink's own architectural decisions**, inspired by the OpenClaw reference model but adapted for self-hosted business operations:

| Law | FlowPilot Implementation |
|-----|-------------------------|
| 1 | 118 registered skills (106 bundled + runtime-created) with rich `instructions` columns |
| 2 | `resolveAiConfig()` with `fast` and `reasoning` tiers |
| 3 | `loadSkillTools()` + `fetchSkillInstructions()` lazy loading |
| 4 | 32 built-in self-modification tools |
| 5 | Handler routing: `edge:`, `module:`, `db:`, `webhook:`, `a2a:` |
| 5a | **Three-Channel Architecture**: Skills (internal), A2A (federation), MCP (universal) |
| 6 | `scope` enum: `internal`, `external`, `both` |
| 7 | `requires_approval` column + approval workflow |
| 8 | `runSelfHealing()` in every heartbeat |
| 9 | 7-step heartbeat protocol in `flowpilot-heartbeat` |
| 10 | Single `agent-reason.ts` module shared by all surfaces |

---

*These laws aren't restrictions. They're the load-bearing walls of agentic architecture. Build without them and your system will collapse under its own complexity.*

*Next: the heartbeat — how an autonomous agent operates when no one is watching. [The Heartbeat Protocol →](05-heartbeat-protocol.md)*
