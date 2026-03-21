# OpenClaw Law — FlowWink Agentic Architecture Standard

> **This document is LAW.** All future development of the FlowAgent/FlowPilot system MUST follow these principles. They are aligned with the [OpenClaw](https://github.com/openclaw/openclaw) reference architecture for autonomous AI agents.
>
> *Revised 2026-03-20 against OpenClaw main branch (326k+ ★).*

---

## 1. The Nine-Layer System Prompt Architecture

OpenClaw assembles the system prompt from 9 ordered layers. Layers 1–6 are framework-controlled; Layers 7–8 are user-customizable; Layer 9 is auto-injected.

| # | OpenClaw Layer | What it does | FlowWink Equivalent | Status |
|---|----------------|-------------|---------------------|--------|
| 1 | **Core Instructions** | Immutable identity, behavioral guardrails, ethical rules | `GROUNDING_RULES` (hardcoded) + Mode Identity in `buildSystemPrompt` | ✅ |
| 2 | **Tool Definitions** | JSON Schema for every tool available to the agent | `getBuiltInTools()` + `loadSkillTools()` → OpenAI function-calling format | ✅ |
| 3 | **Skills Registry** | Auto-discovered capability modules from `~/skills/` | `agent_skills` table with `loadSkillTools(scope)` | ✅ |
| 4 | **Model Aliases** | Short names → provider model IDs (`flash → gemini-2.5-flash`) | `resolveAiConfig()` with provider-agnostic routing | ✅ |
| 5 | **Protocol Specs** | Reply tags, heartbeat signals, silent replies (`NO_REPLY`) | SSE streaming, heartbeat edge function, tool-call JSON format | ⚠️ Partial |
| 6 | **Runtime Info** | Current time, OS, model, environment snapshot | CMS Schema Awareness (modules, integrations, block types) | ✅ Adapted |
| 7 | **Workspace Files** | `SOUL.md`, `IDENTITY.md`, `AGENTS.md`, `USER.md`, `TOOLS.md`, `HEARTBEAT.md`, `MEMORY.md` | `agent_memory` table: keys `soul`, `identity`, `agents` via `loadWorkspaceFiles()` | ⚠️ Partial |
| 8 | **Bootstrap Hooks** | Dynamic injection scripts (`agent:bootstrap`, `before_prompt_build`) | Lazy skill instruction loading via `fetchSkillInstructions()` | ⚠️ Partial |
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
| ~~**Hybrid memory search**~~ | ~~BM25 + vector (70/30 weighted)~~ | ✅ `search_memories_hybrid()` — pg_trgm + pgvector (70/30) | ~~Exact keyword matches (IDs, errors) may be missed~~ **RESOLVED** |
| **Pre-compaction memory flush** | Silent agentic turn saves context before summarization | No pre-flush — just summarize and truncate | Risk of losing important context during pruning |
| **Protocol specs (L5)** | Structured reply tags, `NO_REPLY` sentinel, heartbeat signals | Basic SSE streaming, no reply tags | Less structured agent output parsing |
| **Workspace: HEARTBEAT.md** | Editable checklist file the agent reads each heartbeat | Hardcoded 7-step protocol in edge function | Admin can't customize heartbeat behavior without code deploy |
| **Workspace: BOOT.md** | Startup hook script | Code-level bootstrap in `useFlowPilotBootstrap.ts` | Same limitation — not admin-editable |
| **Skill gating** | `requires.bins`, `requires.env`, `requires.config`, `os` checks | No gating — enabled = available | Skills may be offered when prerequisites aren't met |
| **Tool policy** | Layered allow/deny system (global → per-agent) | Scope-based only (internal/external/both) | Less granular access control |

### ❌ Not Implemented

| Gap | OpenClaw Has | Impact | Priority |
|-----|-------------|--------|----------|
| **USER.md** | Per-user context, preferences, personalization layer | Agent doesn't know user-specific preferences in visitor chat | Medium |
| **TOOLS.md** | Local tool documentation, custom notes | Skill instructions partially cover this | Low |
| **Command queue** | Lane-based FIFO (main/sub-agent/cron, concurrency limits) | No protection against concurrent agent runs on same context | Medium |
| **Session isolation** | `dmScope` modes, per-session sandboxing, MEMORY.md security boundary | All conversations share same memory pool | Low |
| **Thinking modes** | Reasoning budget control (fast vs deep) | Always same model depth | Low |
| **Multi-channel gateway** | WhatsApp, Telegram, Discord, Slack, Signal bridges | Web-only (visitor chat + admin) | Low (CMS scope) |
| **Docker sandboxing** | Container isolation with workspace mount modes | Edge Functions provide partial isolation | Low |
| **Hooks & plugins** | Event-driven scripts with lifecycle hooks | Signal Ingest API + automations (different model) | Low |

---

## 6. Recommended Next Steps (Priority Order)

1. ~~**Hybrid memory search**~~ ✅ Implemented — `search_memories_hybrid()` with pg_trgm + pgvector (70% vector, 30% keyword).
2. **Pre-compaction memory flush** — Before `pruneConversationHistory()` summarizes, trigger a silent step that extracts and persists key facts to `agent_memory`.
3. **Editable HEARTBEAT config** — Move the 7-step protocol to `agent_memory(key='heartbeat')` so admin can customize via Skill Hub.
4. **USER.md equivalent** — Store per-visitor context in `agent_memory` or `chat_conversations.metadata` so the agent remembers returning users.
5. **Command queue / concurrency guard** — Prevent overlapping agent runs on the same conversation.
6. **Skill gating** — Add `requires` field to `agent_skills` for prerequisite checks.

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

*This document supersedes all previous architectural descriptions. Revised: 2026-03-20.*
*Source: [github.com/openclaw/openclaw](https://github.com/openclaw/openclaw) (main branch, March 2026)*
