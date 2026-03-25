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
│  SURFACES (thin wrappers — edge functions)           │
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
│  │  token-tracking.ts · trace.ts · integrity.ts │   │
│  │  sales-context.ts                            │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## File Map

```
supabase/functions/_shared/
├── pilot/                          ← GENERIC CORE (domain-agnostic)
│   ├── index.ts                    Barrel re-exports
│   ├── reason.ts                   ReAct loop, skill loading, context pruning
│   ├── prompt-compiler.ts          6-layer system prompt assembly
│   ├── handlers.ts                 40+ built-in tool handlers
│   └── built-in-tools.ts           Tool JSON schemas
│
├── domains/                        ← DOMAIN PACKS (vertical-specific)
│   └── cms-context.ts              CMS schema, insights, maturity detection
│
├── agent-reason.ts                 Backward-compat facade (re-exports pilot/)
├── types.ts                        Shared TypeScript interfaces
├── ai-config.ts                    Model routing (OpenAI, Gemini, local, n8n)
├── concurrency.ts                  Lane-based lock manager
├── token-tracking.ts               Token extraction & budget tracking
├── trace.ts                        Correlation IDs for observability
├── integrity.ts                    Drift detection & health scoring
└── sales-context.ts                Sales intelligence context loader
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

Tool groups are selectable per surface via `BuiltInToolGroup`:
`'memory' | 'objectives' | 'self-mod' | 'reflect' | 'soul' | 'planning' | 'automations-exec' | 'workflows' | 'a2a' | 'skill-packs'`

---

## Surfaces (Edge Functions)

Three primary surfaces call into the Pilot core:

| Surface | Edge Function | Mode | Streaming | Lock Lane |
|---------|--------------|------|-----------|-----------|
| **Visitor Chat** | `chat-completion` | `chat` | SSE | None |
| **Admin Operate** | `agent-operate` | `operate` | SSE | `operate:{convId}` |
| **Heartbeat** | `flowpilot-heartbeat` | `heartbeat` | No | `heartbeat` |

Supporting edge functions:

| Function | Purpose |
|----------|---------|
| `setup-flowpilot` | Idempotent bootstrap: seeds soul, skills, objectives, cron |
| `agent-execute` | Direct skill execution (no reasoning loop) |
| `signal-ingest` | Receives external signals → triggers matching automations |
| `signal-dispatcher` | Routes signals to `automation-dispatcher` |
| `automation-dispatcher` | Executes due automations on schedule |
| `instance-health` | Drift detection + integrity scoring |
| `a2a-ingest` | Receives inbound A2A delegation requests |
| `flowpilot-briefing` | Generates daily/weekly AI briefings |
| `system-integrity-check` | Full system health check |

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

> **Note:** `sales-context.ts` is NOT a domain pack — it's a standalone context loader used by sales-specific edge functions (`prospect-research`, `prospect-fit-analysis`, `sales-profile-setup`). It loads company profile, user pitch, and CMS page summaries for sales AI prompts.

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

## Shared Infrastructure

### AI Config (`ai-config.ts`)

Resolves which AI provider to use based on `site_settings.system_ai` + available env vars.

**Priority:** OpenAI → Gemini → Local → n8n

**Model migration:** Legacy model names are auto-mapped to current versions:
- `gpt-4o` → `gpt-4.1`, `gpt-4o-mini` → `gpt-4.1-mini`
- `gemini-1.5-pro` → `gemini-2.5-pro`, `gemini-1.5-flash` → `gemini-2.5-flash`

**Tiers:** `fast` (default: gpt-4.1-mini) and `reasoning` (gpt-4.1 / gemini-2.5-pro).

### Concurrency (`concurrency.ts`)

Lane-based locking via `agent_locks` table:

```
heartbeat    → lane: "heartbeat"           (TTL: 15 min)
operate      → lane: "operate:{convId}"    (TTL: 5 min)
```

Functions: `tryAcquireLock(supabase, lane, owner, ttl)` / `releaseLock(supabase, lane)`

Auto-expires via TTL — no zombie locks.

### Integrity (`integrity.ts`)

Drift detection and health scoring, used by `setup-flowpilot` and `instance-health`:

- `computeSkillHash(skills)` — deterministic SHA-256 of skill names + instruction snippets
- `runIntegrityChecks(supabase)` — validates: skills have instructions, descriptions, valid tool_definitions, critical memory keys exist, automations reference valid skills
- Returns `{ score, issues, totalChecks, passedChecks }`

### Token Tracking (`token-tracking.ts`)

- `extractTokenUsage(aiResponse)` → `{ prompt_tokens, completion_tokens, total_tokens }`
- `accumulateTokens(running, delta)` → merged totals
- `isOverBudget(usage, budget)` → boolean

### Trace (`trace.ts`)

- `generateTraceId(prefix)` → `fp_m2x7k9_abc123`
- Format: `{prefix}_{timestamp_base36}_{random}` — human-readable, sortable, unique

---

## Concurrency

Lane-based locking via `agent_locks` table. See [Shared Infrastructure](#concurrency-concurrencyts) above.

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

## Key TypeScript Interfaces

From `types.ts`:

```typescript
type PromptMode = 'operate' | 'heartbeat' | 'chat';

interface ReasonConfig {
  scope: 'internal' | 'external';     // Skill filtering
  maxIterations?: number;              // Default: 6 (operate) / 8 (heartbeat)
  systemPromptOverride?: string;       // Bypass prompt compiler
  extraContext?: string;               // Additional context injection
  builtInToolGroups?: BuiltInToolGroup[]; // Which tool groups to include
  additionalTools?: any[];             // Extra tool definitions
  tier?: AiTier;                       // 'fast' | 'reasoning'
  lockLane?: string;                   // Concurrency lock lane
  lockOwner?: string;                  // Lock owner identifier
  traceId?: string;                    // Correlation ID
  tokenBudget?: number;               // Token limit for run
  skillCategories?: string[];          // Filter skills by category
}

interface ReasonResult {
  response: string;
  actionsExecuted: string[];
  skillResults: Array<{ skill: string; status: string; result: any }>;
  durationMs: number;
  tokenUsage?: TokenUsage;
  skippedDueToLock?: boolean;
  traceId?: string;
}

type BuiltInToolGroup =
  | 'memory' | 'objectives' | 'self-mod' | 'reflect'
  | 'soul' | 'planning' | 'automations-exec'
  | 'workflows' | 'a2a' | 'skill-packs';
```

---

## Runtime Skill Loading Pipeline

Understanding how skills flow from database to LLM context at runtime is critical for debugging and extending the system.

### Phase 1: Tool Assembly (`loadSkillTools`)

At the start of each `reason()` call, skills are loaded from `agent_skills`:

```
loadSkillTools(supabase, scope, categories?, budgetTier?)
  │
  ├── 1. Query agent_skills WHERE enabled=true AND scope IN [...]
  │      └── Optional: filter by categories (e.g. ['content', 'crm'])
  │
  ├── 2. Load tool_policy from agent_memory
  │      └── Blocked skills (admin-defined) are excluded
  │
  ├── 3. filterGatedSkills()
  │      └── Check each skill's `requires[]` array:
  │          ├── { type: 'skill', name } → is that skill enabled?
  │          ├── { type: 'integration', key } → is integration active?
  │          └── { type: 'module', id } → is module enabled?
  │
  ├── 4. Apply budget tier compression:
  │      ├── 'full'    → include all, full descriptions
  │      ├── 'compact' → truncate descriptions to 80 chars, drop param docs
  │      └── 'drop'    → keep only top-20 most-used skills (by recent activity)
  │
  ├── 5. Normalize JSON schemas (fix missing types, array items, etc.)
  │
  └── Return: tool_definition[] (OpenAI function-calling format)
```

**Key detail:** At this phase, `instructions` are NOT loaded — only `name`, `tool_definition`, `scope`, `requires`, and `category`. This is the "list metadata only" pattern from OpenClaw LAW 3.

### Phase 2: Lazy Instruction Loading (`fetchSkillInstructions`)

Instructions are loaded **on-demand** when the LLM actually calls a skill:

```
reason() loop iteration N:
  │
  ├── LLM returns tool_calls: [{ name: 'generate_blog_post', ... }]
  │
  ├── executeBuiltInTool() or skill handler executes the call
  │
  ├── fetchSkillInstructions(['generate_blog_post'], alreadyLoaded)
  │   ├── Skip if already loaded this session
  │   ├── SELECT name, instructions FROM agent_skills WHERE name IN [...]
  │   └── Append to conversation as system message:
  │       "SKILL CONTEXT (instructions for skills you just used): ..."
  │
  └── LLM sees instructions on NEXT iteration (informs follow-up decisions)
```

This saves ~97% of instruction tokens — a skill with 2000-char instructions only costs ~10 chars (name + description) until actually invoked.

### Phase 3: Dynamic Budget Degradation

As token usage grows during a `reason()` session, skills are progressively compressed:

```
Token Usage    Tier       Behavior
───────────    ────       ────────
< 50%          full       All skills with full tool_definitions
50–75%         compact    Descriptions truncated, param docs removed
> 75%          drop       Only top-20 recently-used skills remain

resolveSkillBudgetTier(budget, currentUsage) → 'full' | 'compact' | 'drop'
```

The tier is re-evaluated on **every iteration**. When it changes, `loadSkillTools` is called again with the new tier, dynamically shrinking the tool set mid-session.

### Phase 4: Tool Execution Routing

When the LLM calls a tool, `reason()` routes it:

```
tool_call.function.name
  │
  ├── isBuiltInTool(name)?
  │   └── YES → executeBuiltInTool() → switch/case to handler
  │
  └── NO → DB skill handler routing:
      ├── Load skill from agent_skills by name
      ├── Parse handler string:
      │   ├── 'edge:function-name'  → invoke Supabase Edge Function
      │   ├── 'module:module-name'  → module API operation
      │   ├── 'db:table-name'      → database query
      │   └── 'webhook:url'        → external HTTP POST
      └── Execute with parsed arguments + log to agent_activity
```

### Full Lifecycle Summary

```
DB: agent_skills (73+ rows)
  │
  │ loadSkillTools() — Phase 1
  ▼
Tool Definitions (name + JSON schema only, ~10 tokens/skill)
  │
  │ LLM decides to call a skill — Phase 2
  ▼
fetchSkillInstructions() — load full instructions on-demand (~500 tokens/skill)
  │
  │ Budget grows — Phase 3
  ▼
resolveSkillBudgetTier() — compress or drop skills dynamically
  │
  │ LLM emits tool_call — Phase 4
  ▼
Handler Router — execute via edge function / module / DB / webhook
  │
  ▼
agent_activity — audit log with duration, tokens, status
```

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
| `agent_skill_packs` | Installable skill bundles |
| `a2a_peers` / `a2a_activity` | Agent-to-agent delegation registry |
| `chat_messages` / `chat_conversations` | Conversation history |

---

*See also: [Architecture Deep Dive](./architecture.md) · [Handler Reference](./handlers-reference.md) · [OpenClaw Law](../OPENCLAW-LAW.md)*
