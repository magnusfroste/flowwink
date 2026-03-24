# OpenClaw Law — FlowWink Agentic Architecture Standard

> **This document is LAW.** All future development of the FlowAgent/FlowPilot system MUST follow these principles. They are **founded on** the [OpenClaw](https://github.com/openclaw/openclaw) reference architecture for autonomous AI agents — OpenClaw is the conceptual origin of this standard.
>
> *Revised 2026-03-24 against OpenClaw main branch (332k+ ★).*

---

## 1. The Nine-Layer System Prompt Architecture

OpenClaw assembles the system prompt from 9 ordered layers. Layers 1–6 are framework-controlled; Layers 7–8 are user-customizable; Layer 9 is auto-injected.

| # | OpenClaw Layer | What it does | FlowWink Equivalent | Status |
|---|----------------|-------------|---------------------|--------|
| 1 | **Core Instructions** | Immutable identity, behavioral guardrails, ethical rules | `GROUNDING_RULES` (hardcoded) + Mode Identity in `buildSystemPrompt` | ✅ |
| 2 | **Tool Definitions** | JSON Schema for every tool available to the agent | `getBuiltInTools()` + `loadSkillTools()` → OpenAI function-calling format | ✅ |
| 3 | **Skills Registry** | Auto-discovered capability modules from `~/skills/` | `agent_skills` table with `loadSkillTools(scope)` | ✅ |
| 4 | **Model Aliases** | Short names → provider model IDs (`flash → gemini-2.5-flash`) | `resolveAiConfig()` with provider-agnostic routing | ✅ |
| 5 | **Protocol Specs** | Reply tags, heartbeat signals, silent replies (`NO_REPLY`) | `REPLY_DIRECTIVES` in GROUNDING_RULES + `parseReplyDirectives()` utility | ✅ |
| 6 | **Runtime Info** | Current time, OS, model, environment snapshot | CMS Schema Awareness (modules, integrations, block types) | ✅ Adapted |
| 7 | **Workspace Files** | `SOUL.md`, `IDENTITY.md`, `AGENTS.md`, `USER.md`, `TOOLS.md`, `HEARTBEAT.md`, `MEMORY.md` | `agent_memory` table: keys `soul`, `identity`, `agents`, `heartbeat_protocol` + `visitor_profile` via `loadWorkspaceFiles()` | ✅ |
| 8 | **Bootstrap Hooks** | Dynamic injection scripts (`agent:bootstrap`, `before_prompt_build`) | Lazy skill instruction loading via `fetchSkillInstructions()` + idempotent bootstrap | ✅ Adapted |
| 9 | **Inbound Context** | Conversation history, user files, clipboard, tool results | `chat_messages` + conversation history + objectives + memory | ✅ |

### FlowWink's 6-Layer Compilation Order

Our `buildSystemPrompt(mode)` compiles these into 6 explicit layers:

```
Layer 1: Mode Identity        ← heartbeat / operate / chat (hardcoded, short)
Layer 2: SOUL + IDENTITY      ← from agent_memory (evolverbar via soul_update)
Layer 3: AGENTS                ← from agent_memory (evolverbar via agents_update)
         └── Fallback: CORE_INSTRUCTIONS if agents key missing
Layer 4: CMS Schema Awareness ← active modules, integrations, block types
Layer 5: GROUNDING RULES      ← ALWAYS hardcoded safety layer (can never be overridden)
Layer 6: Mode-specific Context ← objectives, memory, heartbeat protocol
```

---

## 2. The Five-Component Architecture

OpenClaw's runtime consists of five pillars:

### 2.1 Gateway (Message Router)

| OpenClaw | FlowWink |
|----------|----------|
| Single long-lived Node.js daemon | Supabase Edge Functions (stateless) |
| WebSocket-first protocol with typed JSON frames | HTTP/SSE via `chat-completion`, `agent-operate` |
| Channel bridges (WhatsApp, Telegram, Discord, Slack, Signal) | Single web channel (visitor chat + admin operate) |
| Device pairing + trust model | Supabase Auth (JWT-based) |
| Lane-based command queue (main, sub-agent, cron) | Atomic objective locking (`locked_at`, `locked_by`) |
| Session routing (`dmScope`: main, per-peer, per-channel-peer) | `chat_conversations` with `conversation_id` |

**Gap**: OpenClaw's command queue prevents concurrent agent runs with sophisticated lane routing. FlowWink only has objective-level locking — no queue for concurrent chat requests.

### 2.2 Brain (Agent Runtime)

| OpenClaw | FlowWink |
|----------|----------|
| Prompt assembly from 9 layers | `buildSystemPrompt(mode)` — 6-layer compiler |
| ReAct loop with tool execution | `agent-reason.ts` — iterative tool-call loop (max 6–8 iterations) |
| Streaming engine (text deltas + tool events) | SSE streaming via `chat-completion` and `agent-operate` |
| Sub-agent spawner (`sessions_spawn`) | A2A delegation via `delegate_task` (specialist sub-agents) |
| Compaction pipeline (summarize old context) | `pruneConversationHistory()` with AI-powered summarization |
| Skill loader (lazy, on-demand `read`) | `loadSkillTools()` + `fetchSkillInstructions()` |
| Sandbox manager (Docker isolation) | Edge Function isolation (Deno) |
| Model-agnostic (`resolveModel`) | `resolveAiConfig()` — OpenAI, Gemini, local, n8n |

### 2.3 Memory (Persistent Context)

OpenClaw's 4-layer memory stack:

| Layer | OpenClaw | FlowWink | Status |
|-------|----------|----------|--------|
| **L1: Session Context** | Current conversation in context window (JSONL transcript) | `chat_messages` in current conversation | ✅ |
| **L2: Daily Logs** | `memory/YYYY-MM-DD.md` (append-only) | `agent_memory` entries with timestamps | ✅ Adapted |
| **L3: Long-term Memory** | `MEMORY.md` (curated facts, manually maintained) | `agent_memory` table (categories: preference, context, fact) | ✅ |
| **L4: Semantic Vector Search** | SQLite + embeddings, hybrid BM25+vector (70/30) | pgvector with 768-dim embeddings, `search_memories_semantic()` | ⚠️ |

**Gap**: OpenClaw uses **hybrid search** (70% vector + 30% BM25 keyword). FlowWink only has vector similarity — no BM25 keyword fallback for exact matches (IDs, error strings, code symbols).

**Gap**: OpenClaw has **pre-compaction memory flush** — a silent agentic turn that saves important context to disk *before* the context window is summarized. FlowWink's `pruneConversationHistory()` just summarizes without a pre-flush step.

### 2.4 Skills (Capability Modules)

| OpenClaw | FlowWink |
|----------|----------|
| `~/skills/` directory with `SKILL.md` files | `agent_skills` table with `instructions` markdown field |
| 3-tier resolution: workspace → managed → bundled | Single tier: `agent_skills` table |
| Lazy loading: only metadata in prompt, model `read`s on demand | Lazy: `fetchSkillInstructions()` after first use |
| Gating: `requires.bins`, `requires.env`, `requires.config`, `os` | No gating — all enabled skills are available |
| Skills created by agent or user | `skill_create`, `skill_instruct`, `skill_update` tools |
| Handler: direct file execution | Handler strings: `edge:fn`, `module:name`, `db:table`, `webhook:url` |

### 2.5 Heartbeat (Proactive Loop)

| OpenClaw | FlowWink |
|----------|----------|
| Gateway timer (default 30min) fires periodic agent turns | `flowpilot-heartbeat` edge function (12h cron) |
| `HEARTBEAT.md` — editable checklist in workspace | Hardcoded 7-step protocol in edge function |
| `HEARTBEAT_OK` sentinel = suppress output | Activity log only |
| Cron system for exact-timing tasks | `agent_automations` with cron, event, signal triggers |
| Cron sessions are isolated (fresh context) | Automations share heartbeat context |

---

## 3. Workspace Files Mapping

OpenClaw's workspace is a directory of editable Markdown files. FlowWink stores these in `agent_memory`:

| OpenClaw File | Purpose | FlowWink Key | Status |
|---------------|---------|--------------|--------|
| `SOUL.md` | Personality, values, tone, behavioral boundaries | `agent_memory(key='soul')` | ✅ |
| `IDENTITY.md` | Name, role, goals, structured identity | `agent_memory(key='identity')` | ✅ |
| `AGENTS.md` | Operating instructions, procedures, workflows | `agent_memory(key='agents')` | ✅ |
| `USER.md` | User profile, preferences, personalization | Not implemented | ❌ |
| `TOOLS.md` | Local tool notes, custom tool documentation | Not implemented (skill instructions serve partial role) | ❌ |
| `HEARTBEAT.md` | Periodic task checklist | Hardcoded in `flowpilot-heartbeat` | ⚠️ |
| `MEMORY.md` | Curated long-term facts | `agent_memory` entries (fact/preference/context) | ✅ |
| `BOOT.md` | Startup script | `useFlowPilotBootstrap.ts` (code-level) | ⚠️ |
| `memory/YYYY-MM-DD.md` | Daily logs | `agent_memory` with created_at timestamps | ✅ Adapted |

---

## 4. Mandatory Laws

These are non-negotiable rules for all FlowWink development:

### LAW 1: Skills as Knowledge Containers
Every skill MUST have a rich `instructions` field (equivalent to OpenClaw's SKILL.md). Instructions contain:
- **What** the skill does
- **When** to use it vs alternatives
- **How** to think about parameters
- **Provider knowledge** (if multiple providers)
- **Edge cases** and failure modes
- **Decision tables** (scenario → action → why)

### LAW 2: Free First, Paid When Necessary
When multiple providers exist:
1. Default to `auto` — try free/cheap first
2. `preferred_provider` parameter for agent override
3. Provider preferences in `site_settings`
4. Document tradeoffs in skill instructions

### LAW 3: Lazy Instruction Loading
Never inject all skill instructions into the prompt. Use `fetchSkillInstructions()` to load only for skills the agent actually calls. This mirrors OpenClaw's pattern of listing skill metadata only (~97 chars per skill) and letting the model `read` on demand.

### LAW 4: The Agent MUST Be Able to Evolve
Built-in tools for self-modification:
- `skill_create` — create new skills
- `skill_instruct` — add/update knowledge
- `skill_update` — modify parameters
- `skill_disable` — remove broken skills
- `soul_update` — evolve personality
- `agents_update` — evolve operational rules
- `reflect` — self-assessment with auto-persisted learnings
- `propose_objective` — proactive goal creation
- `automation_create` — self-scheduling

### LAW 5: Handler Abstraction
Skills use handler strings, NOT direct function calls:
- `edge:function-name` → Edge Function invocation
- `module:module-name` → Module API operation
- `db:table-name` → Database query
- `webhook:url` → External HTTP call

### LAW 6: Scope-Based Permissions
Every skill MUST define scope: `internal`, `external`, or `both`.

OpenClaw equivalent: tool policy with layered allow/deny. FlowWink simplifies to scope-based filtering.

### LAW 7: Approval Gating
Destructive or costly skills MUST set `requires_approval: true`. The agent logs `pending_approval` activities. New agent-created automations are disabled by default.

### LAW 8: Self-Healing Protocol
Auto-quarantine skills after `SELF_HEAL_THRESHOLD` (3) consecutive failures. Linked automations also disabled. Admin must manually re-enable.

### LAW 9: Heartbeat Protocol (7-Step Loop)
Every autonomous heartbeat follows this order:
1. **Self-Heal** — quarantine failing skills
2. **Propose** — analyze stats, propose objectives
3. **Plan** — decompose objectives into steps
4. **Advance** — execute plan steps (highest priority first)
5. **Automate** — execute DUE automations
6. **Reflect** — periodic self-assessment
7. **Remember** — persist learnings to memory

### LAW 10: Unified Reasoning Core
All agent surfaces (interactive, autonomous, visitor chat) MUST share `agent-reason.ts`. No logic duplication. Surfaces are thin wrappers.

---

## 5. Gap Analysis vs OpenClaw (Revised)

### ✅ Fully Aligned
- 9-layer prompt architecture (mapped to DB-driven 6-layer compiler)
- ReAct reasoning loop with iterative tool calling
- Persistent multi-tier memory (soul, identity, agents, facts, preferences)
- Skill registry with auto-discovery and lazy instructions
- Self-healing with quarantine
- Plan decomposition and chained advancement
- Proactive objective proposals
- Automation system (cron, event, signal)
- Reflection with auto-persisted learnings
- Self-modification (skill CRUD, soul/agents evolution)
- Approval gating (human-in-the-loop)
- Activity audit trail
- Prompt compiler shared across all surfaces
- pgvector semantic memory search
- Context pruning with AI summarization
- Full CMS autonomy (28+ registered skills)
- Workflow DAGs with conditional branching
- A2A delegation with specialist sub-agents
- Skill Packs

### ⚠️ Partially Implemented

| Gap | OpenClaw Has | FlowWink Status | Impact |
|-----|-------------|-----------------|--------|
| **Protocol specs (L5)** | Structured reply tags, `NO_REPLY` sentinel, heartbeat signals | Basic SSE streaming, no reply tags | Less structured agent output parsing |
| **Tool policy** | Layered allow/deny system (global → per-agent) | Scope-based + trust_level (auto/notify/approve) | Less granular but sufficient for CMS scope |

### ✅ Previously Partial — Now Resolved

| Gap | Resolution |
|-----|-----------|
| **Hybrid memory search** | `search_memories_hybrid()` — pg_trgm + pgvector (70/30) |
| **Pre-compaction memory flush** | `preCompactionFlush()` extracts facts via AI before pruning |
| **Workspace: HEARTBEAT.md** | Protocol stored in `agent_memory(key='heartbeat_protocol')`, customizable via `heartbeat_protocol_update` tool |
| **Workspace: BOOT.md** | Idempotent bootstrap via `setup-flowpilot` edge function |
| **Skill gating** | `agent_skills.requires` JSONB + `filterGatedSkills()` — supports skill, integration, module prerequisites |
| **USER.md** | `chat_conversations.visitor_profile` JSONB + `loadVisitorContext()` + `save_visitor_profile` tool |
| **Command queue** | `agent_locks` table + `try_acquire_agent_lock()` / `release_agent_lock()` with TTL |
| **Workspace Files (L7)** | Enriched soul/identity/agents with structured markdown protocols (OpenClaw §5 memory, operational protocols) |

### ❌ Not Implemented (Intentional — Low Priority for CMS)

| Gap | OpenClaw Has | Impact | Priority |
|-----|-------------|--------|----------|
| **TOOLS.md** | Local tool documentation, custom notes | Skill instructions fully cover this | Low |
| **Session isolation** | `dmScope` modes, per-session sandboxing | All conversations share same memory pool | Low |
| **Thinking modes** | Reasoning budget control (fast vs deep) | Token budget serves similar purpose | Low |
| **Multi-channel gateway** | WhatsApp, Telegram, Discord, Slack, Signal bridges | Web-only (visitor chat + admin) | Low (CMS scope) |
| **Docker sandboxing** | Container isolation with workspace mount modes | Edge Functions provide Deno isolation | Low |
| **Hooks & plugins** | Event-driven scripts with lifecycle hooks | Signal Ingest API + automations | Low |

---

## 6. Recommended Next Steps (Priority Order)

1. ~~**Hybrid memory search**~~ ✅ Implemented — `search_memories_hybrid()` with pg_trgm + pgvector (70% vector, 30% keyword).
2. ~~**Pre-compaction memory flush**~~ ✅ Implemented — `preCompactionFlush()` extracts up to 5 discrete facts via AI before `pruneConversationHistory()` summarizes.
3. ~~**Editable HEARTBEAT config**~~ ✅ Implemented — Protocol stored in `agent_memory(key='heartbeat_protocol')`. Loaded by heartbeat, customizable via `heartbeat_protocol_update` tool (get/set/reset). Default hardcoded protocol used as fallback.
4. ~~**USER.md equivalent**~~ ✅ Implemented — `chat_conversations.visitor_profile` JSONB stores accumulated visitor context. `loadVisitorContext()` loads past conversations by email/session. `save_visitor_profile` chat tool lets AI persist learned preferences. Returning visitors get personalized context injected into the system prompt.
5. ~~**Command queue / concurrency guard**~~ ✅ Implemented — `agent_locks` table with lane-based TTL locking. Heartbeat uses `heartbeat` lane, operate uses `operate:{conversationId}`.
6. ~~**Skill gating**~~ ✅ Implemented — `agent_skills.requires` JSONB column with `filterGatedSkills()` in `loadSkillTools()`. Supports prerequisites: `{"type":"skill","name":"..."}`, `{"type":"integration","key":"..."}`, `{"type":"module","id":"..."}`.

---

## 7. Data Flow Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Gateway        │     │   Brain           │     │   Memory         │
│                  │     │                   │     │                  │
│ • chat-completion│────▶│ • agent-reason.ts │────▶│ • agent_memory   │
│ • agent-operate  │     │   (ReAct loop)    │     │   (soul/identity │
│ • signal-ingest  │     │ • resolveAiConfig │     │    /agents/facts) │
│ • heartbeat      │     │ • tool execution  │     │ • chat_messages  │
└─────────────────┘     └──────┬───────────┘     │ • pgvector search│
                               │                  └─────────────────┘
                    ┌──────────┴──────────────────────┐
                    │                                  │
              ┌─────▼──────┐     ┌───────▼────────┐  ┌▼──────────────┐
              │   Skills    │     │   Heartbeat     │  │  Workflows    │
              │             │     │                 │  │               │
              │ • agent_    │     │ • self-healing  │  │ • DAG steps   │
              │   skills    │     │ • plan decomp   │  │ • conditions  │
              │ • skill_    │     │ • advance_plan  │  │ • template    │
              │   packs     │     │ • automations   │  │   vars        │
              │ • a2a       │     │ • reflection    │  │ • on_failure  │
              │   delegates │     │ • proposals     │  │   branching   │
              └─────────────┘     └─────────────────┘  └───────────────┘
```

---

## 8. Key Architectural Differences

FlowWink is a **CMS-native** agentic system, not a general-purpose AI assistant. This shapes several deliberate deviations from OpenClaw:

| Decision | OpenClaw approach | FlowWink approach | Rationale |
|----------|------------------|-------------------|-----------|
| **Storage** | Markdown files on disk | PostgreSQL + Supabase | CMS needs relational data, RLS, multi-user access |
| **Transport** | WebSocket daemon | HTTP/SSE edge functions | Serverless, scales to zero, CDN-friendly |
| **Memory** | File-based (git-backable) | DB-based (pgvector) | Structured queries, RLS policies, no filesystem |
| **Skills** | File-based auto-discovery | DB table with handler routing | Admin UI (Skill Hub), no SSH access needed |
| **Channels** | Multi-platform bridges | Web-only (chat widget + admin) | CMS visitors interact via website |
| **Isolation** | Docker containers | Deno Edge Functions | Supabase-native, no Docker management |
| **Heartbeat** | 30-min timer in daemon | 12h cron via Supabase | CMS operations are less time-sensitive |

These are **intentional adaptations**, not gaps. FlowWink trades OpenClaw's file-based simplicity for database-backed multi-tenancy, admin UIs, and serverless scalability.

---

*This document supersedes all previous architectural descriptions. Revised: 2026-03-24.*
*Founded on: [github.com/openclaw/openclaw](https://github.com/openclaw/openclaw) (main branch, March 2026, 332k+ ★)*
