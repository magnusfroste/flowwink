# Pilot — OpenClaw Agent Engine for Deno + Supabase

> **Pilot** is a domain-agnostic, self-improving AI agent runtime built on Deno Edge Functions and PostgreSQL. It implements the [OpenClaw](https://github.com/openclaw/openclaw) architecture pattern — but swaps the Node.js daemon + filesystem model for a serverless, database-backed design.

---

## Why Pilot?

OpenClaw is brilliant but tightly coupled to a long-lived Node.js process with filesystem-based state. Pilot reimagines it for the serverless world:

| OpenClaw | Pilot |
|----------|-------|
| Node.js daemon (always-on) | Deno Edge Functions (stateless, scales to zero) |
| Markdown files on disk | PostgreSQL tables with RLS |
| WebSocket protocol | HTTP/SSE |
| Docker sandboxing | Deno isolate sandboxing |
| Single-user local agent | Multi-tenant, auth-aware |

**Same brain, different body.**

---

## Quick Architecture

```
┌─────────────────────────────────────────────────────┐
│  SURFACES (thin wrappers)                           │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────┐ │
│  │ chat-        │ │ agent-       │ │ flowpilot-  │ │
│  │ completion   │ │ operate      │ │ heartbeat   │ │
│  │ (visitor)    │ │ (admin/SSE)  │ │ (cron)      │ │
│  └──────┬───────┘ └──────┬───────┘ └──────┬──────┘ │
│         └────────────────┼────────────────┘         │
│                          ▼                          │
│  ┌──────────────────────────────────────────────┐   │
│  │  PILOT CORE  (_shared/pilot/)                │   │
│  │  ┌────────────────┐  ┌────────────────────┐  │   │
│  │  │ reason.ts      │  │ prompt-compiler.ts │  │   │
│  │  │ (ReAct loop)   │  │ (6-layer prompt)   │  │   │
│  │  ├────────────────┤  ├────────────────────┤  │   │
│  │  │ handlers.ts    │  │ built-in-tools.ts  │  │   │
│  │  │ (40+ handlers) │  │ (tool schemas)     │  │   │
│  │  └────────────────┘  └────────────────────┘  │   │
│  └──────────────────────────────────────────────┘   │
│                          ▼                          │
│  ┌──────────────────────────────────────────────┐   │
│  │  DOMAIN PACKS  (_shared/domains/)            │   │
│  │  └── cms-context.ts  (FlowWink CMS pack)     │   │
│  └──────────────────────────────────────────────┘   │
│                          ▼                          │
│  ┌──────────────────────────────────────────────┐   │
│  │  SHARED INFRA                                │   │
│  │  types.ts · ai-config.ts · concurrency.ts    │   │
│  │  token-tracking.ts · trace.ts                │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## File Map

```
supabase/functions/_shared/
├── pilot/                          ← GENERIC CORE (domain-agnostic)
│   ├── index.ts                    Barrel re-exports
│   ├── reason.ts            (871L) ReAct loop, skill loading, context pruning
│   ├── prompt-compiler.ts   (298L) 6-layer system prompt assembly
│   ├── handlers.ts         (1401L) 40+ built-in tool handlers
│   └── built-in-tools.ts   (241L)  Tool JSON schemas
│
├── domains/                        ← DOMAIN PACKS (vertical-specific)
│   └── cms-context.ts       (246L) CMS schema, insights, maturity detection
│
├── agent-reason.ts          (107L) Backward-compat facade (re-exports pilot/)
├── types.ts                        Shared TypeScript interfaces
├── ai-config.ts                    Model routing (OpenAI, Gemini, local, n8n)
├── concurrency.ts                  Lane-based lock manager
├── token-tracking.ts               Token extraction & budget tracking
└── trace.ts                        Correlation IDs for observability
```

---

## How Reasoning Works

Pilot uses a **ReAct loop** (Reason → Act → Observe → Repeat):

```
User message / Heartbeat trigger
        │
        ▼
┌─── reason() ────────────────────────────────────┐
│  1. Build system prompt (6 layers)              │
│  2. Assemble tools (built-in + DB skills)       │
│  3. Call LLM                                    │
│  4. If LLM returns tool_calls:                  │
│     ├── Built-in tool? → handlers.ts            │
│     └── DB skill? → skill handler router        │
│  5. Append results to conversation              │
│  6. Loop (max 6-8 iterations)                   │
│  7. Budget check → stop if over token limit     │
└─────────────────────────────────────────────────┘
        │
        ▼
   Response (text / SSE stream)
```

**Key constants:**
- `MAX_CONTEXT_TOKENS = 80,000` — hard context ceiling
- `SUMMARY_THRESHOLD = 60,000` — triggers AI-powered summarization
- `MEMORY_FLUSH_THRESHOLD = 0.80` — pre-compaction memory extraction
- Max iterations: 6 (operate) / 8 (heartbeat)

---

## The 6-Layer Prompt Compiler

`prompt-compiler.ts` assembles the system prompt in strict order:

| Layer | Content | Source |
|-------|---------|--------|
| 1 | **Mode Identity** | Hardcoded per surface (heartbeat / operate / chat) |
| 2 | **SOUL + IDENTITY** | `agent_memory` keys: `soul`, `identity` |
| 3 | **AGENTS** (operational rules) | `agent_memory` key: `agents` (fallback: `CORE_INSTRUCTIONS`) |
| 4 | **Domain Context** | Injected by domain pack (e.g. CMS schema awareness) |
| 5 | **GROUNDING RULES** | Hardcoded safety — **can never be overridden** |
| 6 | **Mode Context** | Objectives, memory, heartbeat protocol, stats |

Each section has a character cap (`MAX_SOUL_CHARS`, `MAX_AGENTS_CHARS`, etc.) to prevent prompt bloat.

---

## Built-in Tools (40+)

Grouped by capability:

| Group | Tools | What they do |
|-------|-------|-------------|
| **Memory** | `memory_write`, `memory_read`, `memory_delete` | Persistent vector-searchable memory |
| **Objectives** | `objective_update_progress`, `objective_complete`, `objective_delete` | Goal tracking |
| **Planning** | `decompose_objective`, `advance_plan`, `propose_objective` | AI-powered plan decomposition |
| **Skills** | `skill_create/update/list/disable/enable/delete/instruct/read` | Self-modification |
| **Automations** | `automation_create/list/update/delete`, `execute_automation` | Scheduled/triggered tasks |
| **Workflows** | `workflow_create/execute/list/update/delete` | Multi-step DAGs with conditional branching |
| **A2A** | `delegate_task` | Agent-to-agent delegation (specialist sub-agents) |
| **Self-evolution** | `soul_update`, `agents_update`, `heartbeat_protocol_update` | Personality & rules evolution |
| **Reflection** | `reflect` | Self-assessment with auto-persisted learnings |
| **Outcomes** | `evaluate_outcomes`, `record_outcome` | Score past actions |
| **Packs** | `skill_pack_list`, `skill_pack_install` | Bundle installation |
| **Chaining** | `chain_skills` | Execute multiple skills sequentially |

---

## Domain Packs

The Pilot core knows nothing about CMS, e-commerce, or any vertical. **Domain packs** inject context:

```typescript
// domains/cms-context.ts exports:
cmsDomainPack = {
  loadSchema:    loadCMSSchema,      // Data counts, modules, integrations
  loadInsights:  loadCrossModuleInsights,  // Deals, leads, bookings, views
  detectMaturity: detectSiteMaturity,      // Fresh site vs established
  playbook:      CMS_DAY_1_PLAYBOOK,      // Bootstrap guidance
}
```

**To create your own domain pack** (e.g. for a helpdesk, ERP, or IoT platform):

```typescript
// domains/helpdesk-context.ts
export async function loadHelpdeskSchema(supabase) { ... }
export const helpdeskDomainPack = {
  loadSchema: loadHelpdeskSchema,
  loadInsights: loadTicketInsights,
  detectMaturity: detectHelpdeskMaturity,
  playbook: HELPDESK_ONBOARDING,
};
```

Then wire it into your surface's `reason()` call.

---

## Memory Architecture

4-tier memory system backed by PostgreSQL + pgvector:

| Tier | What | Storage | Search |
|------|------|---------|--------|
| **L1: Session** | Current conversation | `chat_messages` table | Linear scan |
| **L2: Working** | Recent memories (top 20) | `agent_memory` (ordered by `updated_at`) | Key/category filter |
| **L3: Long-term** | All persisted facts | `agent_memory` | `search_memories_hybrid()` |
| **L4: Semantic** | Vector embeddings | `agent_memory.embedding` (768d) | pgvector cosine + pg_trgm keyword (70/30) |

**Embedding providers** (auto-fallback):
1. OpenAI `text-embedding-3-small` (768d)
2. Gemini `text-embedding-004` (768d)

---

## Concurrency

Lane-based locking via `agent_locks` table:

```
heartbeat    → lane: "heartbeat"           (TTL: 15 min)
operate      → lane: "operate:{convId}"    (TTL: 5 min)
```

Functions: `tryAcquireLock(lane, owner, ttl)` / `releaseLock(lane, owner)`

Auto-expires via TTL — no zombie locks.

---

## Self-Healing

After `SELF_HEAL_THRESHOLD` (3) consecutive failures, a skill is **quarantined** (disabled). Linked automations are also disabled. Admin must manually re-enable.

`runSelfHealing()` runs at the start of every heartbeat.

---

## Heartbeat Protocol

The 7-step autonomous loop (customizable via `heartbeat_protocol_update`):

1. **Self-Heal** — quarantine failing skills
2. **Evaluate** — score past actions (`evaluate_outcomes`)
3. **Plan** — decompose new objectives
4. **Advance** — execute plan steps (highest priority first)
5. **Automate** — run due automations
6. **Propose** — suggest new objectives based on data patterns
7. **Reflect** — self-assessment, persist learnings

---

## Building Your Own OpenClaw Agent

Pilot is designed to be forked. To build a non-CMS agent:

1. **Keep** `_shared/pilot/` as-is (it's domain-agnostic)
2. **Replace** `_shared/domains/cms-context.ts` with your domain pack
3. **Create surfaces** (edge functions) that call `reason()` with your domain context
4. **Seed workspace files** (soul, identity, agents) via a setup function
5. **Register skills** in `agent_skills` with appropriate handlers

The only CMS-specific code is in `domains/` and `agent-reason.ts` (the facade). Everything in `pilot/` is generic.

---

## Key Database Tables

| Table | Purpose |
|-------|---------|
| `agent_memory` | Soul, identity, agents, facts, preferences + vector embeddings |
| `agent_skills` | Skill registry (name, handler, tool_definition, instructions) |
| `agent_objectives` | Goals with plan decomposition, priority scoring, progress tracking |
| `agent_automations` | Cron/event/signal-triggered skill executions |
| `agent_workflows` | Multi-step DAGs with conditional branching |
| `agent_activity` | Audit trail of all agent actions |
| `agent_locks` | Lane-based concurrency guards |
| `a2a_peers` / `a2a_activity` | Agent-to-agent delegation registry |
| `chat_messages` / `chat_conversations` | Conversation history |

---

*See also: [Architecture Deep Dive](./architecture.md) · [Handler Reference](./handlers-reference.md) · [OpenClaw Law](../OPENCLAW-LAW.md)*
