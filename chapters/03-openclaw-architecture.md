---
title: "From OpenClaw to Flowwink"
description: "The OpenClaw reference model — how it actually works — and how Flowwink adapted it for self-hosted business operations."
order: 5
icon: "cube"
---

> **TL;DR:** OpenClaw's architecture maps to five layers: Soul (identity), Skills (capabilities), Memory (continuity), Heartbeat (autonomy), and Reflection (learning). FlowPilot implements all five with PostgreSQL-backed persistence instead of file-based state.


# From OpenClaw to Flowwink — Reference Model and Adaptation

> **This chapter separates fact from design. Every claim about OpenClaw is verified against its source code. Every Flowwink extension is clearly marked.**

---

## What Is Flowwink?

Before diving into architecture, the reader needs context: **what does Flowwink actually do?**

Flowwink is a **Business Operating System (BOS)** — an open-source, self-hosted platform where an autonomous AI agent (FlowPilot) operates your entire business. Think Odoo meets Supabase, but with an autonomous operator built in. Each business runs its own isolated instance (self-hosted or in a managed cloud container), just like n8n or Supabase itself.

### The Three Eras of Business Software

1. **Tools era** (1990s–2010s) — Separate apps. You operate each one manually.
2. **SaaS era** (2010s–2020s) — Cloud platforms. Easier to use, still human-driven.
3. **Agent era** (2025–) — AI operators. You set direction, the agent runs the business.

FlowWink is built for the agent era. It bundles **25+ modules** that normally require 5-10 separate SaaS tools:

| Category | Modules |
|----------|---------|
| **Content** | CMS (pages), Blog, Knowledge Base, Forms, Content Hub |
| **Data** | Leads, Deals, Companies, Products, Orders, Bookings, Invoices, Inventory, Consultants |
| **Communication** | Newsletter, AI Chat, Live Support, Webinars |
| **Insights** | Analytics, Sales Intelligence |
| **System** | Global Elements, Federation (A2A), **Accounting**, **Expense Reporting**, **SLA Monitor** |

### Quote-to-Cash Lifecycle

FlowWink implements the full **Quote-to-Cash** lifecycle — from first contact to paid invoice:

```
Lead Capture → Qualification → Proposal/Quote → Deal Negotiation
                                                    ↓
Invoice ← Fulfillment ← Order ← Checkout ← Conversion
```

FlowPilot autonomously manages the entire pipeline: qualifying leads, drafting proposals, tracking deals, processing orders, managing inventory, and generating invoices.

**Without FlowPilot**, Flowwink works as a classic platform. An admin logs in, creates content, manages contacts, sends newsletters — all manually. The platform is a tool.

**With FlowPilot**, the same platform becomes autonomous. The agent operates the CMS, writes blog posts, qualifies leads, sends newsletters, analyzes performance — all without being asked. The platform becomes a digital employee.

This dual nature — **tool when you're driving, employee when you're not** — is what makes Flowwink unique. The rest of this chapter dissects how both modes work architecturally.

---

## The Core Insight

OpenClaw's fundamental insight — shared by all agentic systems that followed — is: **the agent is not the model. The agent is the system around the model.**

The LLM is a reasoning engine. The agent is the orchestration layer that decides what the LLM sees, what tools it can use, what it remembers, and when it acts.

```
┌─────────────────────────────────────────────────────┐
│                   THE AGENT SYSTEM                   │
│                                                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────────────┐    │
│  │ Memory  │  │ Skills  │  │   Prompt        │    │
│  │ System  │  │ Registry│  │   Compiler      │    │
│  └────┬────┘  └────┬────┘  └────────┬────────┘    │
│       │            │                │              │
│       └────────────┼────────────────┘              │
│                    │                               │
│                    ▼                               │
│           ┌───────────────┐                        │
│           │  LLM (reason) │                        │
│           └───────┬───────┘                        │
│                   │                               │
│                   ▼                               │
│           ┌───────────────┐                        │
│           │ Tool Router   │                        │
│           └───────┬───────┘                        │
│                   │                               │
│       ┌───────────┼───────────┐                    │
│       ▼           ▼           ▼                    │
│   Built-in    Skills      External                 │
│   Tools       (on-demand) (webhooks)               │
└─────────────────────────────────────────────────────┘
```

This architectural pattern — separating the reasoning core from skills, memory, surfaces, and infrastructure — is what both OpenClaw and Flowwink converge on. The implementation details differ significantly.

### The Breakthrough: Three Text Files

If there is one thing to take from this handbook, it is this:

> **Peter Steinberger defined an entire autonomous agent — its personality, its operating rules, and its daily routine — in three plaintext files: `SOUL.md`, `AGENTS.md`, and `HEARTBEAT.md`.**

That's the innovation. Not a framework. Not a database schema. Not a fine-tuned model. Three files that a human can read on a bus, edit in any text editor, and version-control in git.

- **`SOUL.md`** — who the agent *is*: values, tone, boundaries, personality
- **`AGENTS.md`** — how the agent *works*: operating rules, conventions, safety constraints
- **`HEARTBEAT.md`** — what the agent *does when nobody is watching*: the autonomous checklist

Everything else — the skill system, the memory tiers, the A2A protocols, the governance frameworks — builds on top of this foundation. When Flowwink moved from files to a database, when NemoClaw added sandboxing, when ClawStack added swarm orchestration — they all preserved this core abstraction: **an agent's identity and behavior are defined in human-readable documents that the operator can always inspect and change.**

This is why OpenClaw matters. Not because it's the best agent runtime. Because it established the *language* for defining agents.

---

## Part 1: The OpenClaw Reference Model

*All claims in this section are verified against the OpenClaw source code at `/Users/mafr/Code/github/openclaw`.*

### How OpenClaw's System Prompt Works

OpenClaw builds a system prompt from fixed sections. There is no "nine-layer" abstraction — the prompt is assembled directly:

| Section | Purpose | Verified Source |
|---------|---------|-----------------|
| **Tooling** | Current tool list + short descriptions | `docs/concepts/system-prompt.md:19` |
| **Safety** | Guardrail reminder against power-seeking behavior | `docs/concepts/system-prompt.md:20` |
| **Skills** | Compact list with file paths; model reads `SKILL.md` on demand | `docs/concepts/system-prompt.md:107-121` |
| **Self-Update** | How to run `config.apply` and `update.run` | `docs/concepts/system-prompt.md:22` |
| **Workspace** | Working directory path | `docs/concepts/system-prompt.md:23` |
| **Documentation** | Local path to docs + ClawHub reference | `docs/concepts/system-prompt.md:24` |
| **Workspace Files** | Injected: `AGENTS.md`, `SOUL.md`, `TOOLS.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md`, `BOOTSTRAP.md`, `MEMORY.md` | `docs/concepts/system-prompt.md:51-67` |
| **Sandbox** | Sandboxed runtime info (when enabled) | `docs/concepts/system-prompt.md:26` |
| **Current Date** | User-local time + timezone | `docs/concepts/system-prompt.md:27` |
| **Reply Tags** | Optional reply tag syntax | `docs/concepts/system-prompt.md:28` |
| **Heartbeats** | Heartbeat prompt + ack behavior | `docs/concepts/system-prompt.md:29` |
| **Runtime** | Host, OS, node, model, repo root | `docs/concepts/system-prompt.md:30` |
| **Reasoning** | Visibility level + reasoning toggle | `docs/concepts/system-prompt.md:31` |

**Key constraints:**
- Bootstrap files (workspace files) are capped at 20,000 chars per file, 150,000 chars total (`agents.defaults.bootstrapMaxChars`, `bootstrapTotalMaxChars`)
- Skills are NOT injected as full instructions — only name, description, and file path. The model reads `SKILL.md` on demand via the `read` tool
- Sub-agent sessions only inject `AGENTS.md` + `TOOLS.md` (no soul, identity, heartbeat, etc.)

### How OpenClaw's Skill System Works

Skills are **file-based**. Each skill is a directory containing a `SKILL.md` file:

```
~/.openclaw/workspace/skills/
  ├── weather/
  │   └── SKILL.md
  ├── github/
  │   └── SKILL.md
  └── canvas/
      └── SKILL.md
```

**Discovery:** OpenClaw watches `skills/*/SKILL.md` for changes and auto-discovers new skills (`src/agents/skills/refresh.ts:85-93`).

**Loading:** The system prompt includes a compact list:
```xml
<available_skills>
  <skill>
    <name>weather</name>
    <description>Check weather for any city</description>
    <location>~/.openclaw/workspace/skills/weather/SKILL.md</location>
  </skill>
</available_skills>
```

The model then uses the `read` tool to load `SKILL.md` when it decides the skill is relevant. This is **lazy loading by design** — the full skill instructions are never injected into the system prompt unless the model explicitly reads them.

**ClawHub:** OpenClaw integrates with [ClawHub](https://clawhub.ai), a skill/plugin marketplace. Skills can be installed via `openclaw plugins install clawhub:<package>`.

### How OpenClaw's Memory Works

OpenClaw uses **files on disk** as its memory system:

| File | Purpose | Verified Source |
|------|---------|-----------------|
| `AGENTS.md` | Operational rules, conventions, safety rules | `docs/concepts/system-prompt.md:55` |
| `SOUL.md` | Persona, values, tone | `docs/concepts/system-prompt.md:56` |
| `TOOLS.md` | Tool preferences, blocked tools | `docs/concepts/system-prompt.md:57` |
| `IDENTITY.md` | Name, role, emoji, avatar | `docs/concepts/system-prompt.md:58` |
| `USER.md` | User preferences, context | `docs/concepts/system-prompt.md:59` |
| `HEARTBEAT.md` | Heartbeat checklist (what to check on each cycle) | `docs/concepts/system-prompt.md:60` |
| `MEMORY.md` | Persistent memory (injected every turn) | `docs/concepts/system-prompt.md:62` |
| `memory/*.md` | Daily memory files (on-demand via tools, NOT auto-injected) | `docs/concepts/system-prompt.md:69-71` |

These files are **injected into the context window** on every agent turn. This means they consume tokens. OpenClaw's approach trades token efficiency for simplicity — no database, no vector search, just files.

### Working Memory and Skill Budget

Human operators have limited working memory: we can only juggle a handful of items at once before focus degrades. Agents have the same constraint, except the "working memory" is measured in tokens and tool definitions rather than tasks and conversations.

OpenClaw and Flowwink both encode this as explicit *skill budgets*:

- **OpenClaw** keeps skills lightweight in the prompt and lazy-loads full instructions via the `read` tool. Its skills loader enforces caps such as `maxSkillsInPrompt` and `maxSkillsPromptChars` (defaults ≈150 skills and 30,000 characters, configurable via `config.skills.limits`) so a large Skill Hub cannot silently blow up the context window.
- **Flowwink/FlowPilot** gives each autonomous heartbeat a fixed token budget and tracks how much of that budget has been consumed. As usage rises, it progressively trims and compacts tool definitions and narrows the visible skill set instead of letting every skill compete for attention on every loop.

The design lesson is simple: as your agent's capabilities grow from "a few tools" to "dozens or hundreds of skills," you must treat **skill selection and token budgeting** as first-class architecture. A powerful agent is not the one with the most skills installed — it is the one with a small, well-curated working set per decision.

### How OpenClaw's Heartbeat Works

- **Default interval:** 30 minutes (`docs/gateway/heartbeat.md:23`)
- **Mechanism:** The agent receives the prompt: *"Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK."*
- **Autonomy:** The agent reads its `HEARTBEAT.md` checklist and decides what to do. There is no fixed protocol — the model reasons about what needs attention.
- **Skip logic:** If `HEARTBEAT.md` is effectively empty (only headers/whitespace), the heartbeat is skipped to save API calls.

### How OpenClaw's A2A Works

OpenClaw provides **intra-process session coordination** via three tools:

| Tool | Purpose | Verified Source |
|------|---------|-----------------|
| `sessions_list` | List active sessions with metadata | `src/agents/tools/sessions-list-tool.ts:43` |
| `sessions_history` | Fetch transcript for another session | `src/agents/tools/sessions-history-tool.ts:178` |
| `sessions_send` | Send a message to another session | `src/agents/tools/sessions-send-tool.ts:99` |

This enables multi-agent coordination within a single OpenClaw instance. It is **NOT** Google's A2A protocol — it is OpenClaw's own session-level messaging system.

### How OpenClaw's Concurrency Works

- Queue-based: default lane (`main`) processes inbound + main heartbeats
- Configurable via `agents.defaults.maxConcurrent` for parallel sessions
- Sub-agents get isolated sessions with separate context

---

## Part 2: How Flowwink Adapts the Pattern

*Everything in this section is Flowwink's own design. It is inspired by OpenClaw but architecturally different.*

### The Self-Hosted Shift

OpenClaw is single-user: one human, one agent, files on disk. Flowwink is **self-hosted, one instance per business** — like Odoo, n8n, or Supabase itself. Each deployment is an isolated Supabase project with its own database, auth, and edge functions. In managed cloud mode, each tenant runs in isolated containers. This is not shared multi-tenancy — it is **instance-level isolation**.

Row-Level Security (RLS) still matters: within an instance, RLS isolates data between admin roles, public visitors, and internal system processes. But the trust boundary is the instance, not a shared database.

This deployment model changes several architectural decisions:

| Concern | OpenClaw | Flowwink |
|---------|----------|----------|
| Storage | Markdown files on disk | PostgreSQL tables with RLS (per instance) |
| Auth | Channel allowlists | Supabase Auth + JWT |
| Runtime | Node.js Gateway daemon | Deno Edge Functions (Supabase) |
| Protocol | WebSocket control plane | HTTP/SSE |
| Deployment | Single machine | Self-hosted or managed cloud container per business |
| Multi-agent | Session tools within one process | Separate edge functions per surface |

### Flowwink's Edge Functions

Flowwink runs on Supabase Edge Functions (Deno). Each function serves a specific role in the agent system:

| Edge Function | Trigger | Purpose |
|---------------|---------|---------|
| `agent-operate` | Admin sends message | Interactive session — admin talks to FlowPilot |
| `chat-completion` | Visitor sends message | Public chat — visitor talks to the public-facing agent |
| `flowpilot-heartbeat` | 12h cron | Autonomous cycle — 7-step protocol (self-heal, propose, plan, advance, automate, reflect, remember) |
| `agent-execute` | Called by reason core | Skill execution gateway — routes to correct handler, enforces approval gating |
| `agent-reason` | Called by any surface | Shared reasoning core — ReAct loop, prompt compilation, tool routing |
| `signal-ingest` | Webhook | External event ingestion — form submissions, payment events, etc. |
| `agent-card` | GET request | A2A discovery — publishes agent capabilities to peers |
| `a2a-ingest` | POST from peer | A2A gateway — authenticates peer, routes to skill or chat |
| `a2a-outbound` | Agent calls peer | A2A outbound — calls external agents |
| `a2a-discover` | Agent needs peer info | A2A discovery — fetches remote Agent Cards |
| `setup-flowpilot` | Admin triggers onboarding | Seeds soul, identity, skills, memory for a new agent |

**Key principle:** `agent-reason` is the shared module. `agent-operate`, `chat-completion`, and `flowpilot-heartbeat` all call it with different configurations — scope, streaming mode, and context. No logic duplication.

### The Dual-Agent Architecture

Flowwink runs **two separate agent surfaces** that share the same reasoning core but have different capabilities:

```
┌──────────────────────────────────────────────┐
│              agent-reason.ts                  │
│         (shared reasoning module)             │
└──────────────────┬───────────────────────────┘
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
┌───────────────┐    ┌──────────────────┐
│  FlowAgent    │    │  Public Chat     │
│  (admin)      │    │  (visitors)      │
│               │    │                  │
│  scope:       │    │  scope:          │
│  internal     │    │  external        │
│               │    │                  │
│  Can:         │    │  Can:            │
│  - Write blog │    │  - Answer FAQs   │
│  - Send email │    │  - Book meetings │
│  - Manage CRM │    │  - Capture leads │
│  - Run reports│    │  - Recommend     │
│  - Approve    │    │                  │
│    actions    │    │  Cannot:         │
│               │    │  - Modify data   │
│               │    │  - Access admin  │
│               │    │  - Send emails   │
└───────────────┘    └──────────────────┘
```

**FlowAgent** (admin-side, `agent-operate`):
- Triggered by the business owner via the admin UI
- Has access to ALL skills marked `internal` or `both`
- Can draft content, manage CRM, analyze data, send newsletters
- Destructive actions require approval (`requires_approval: true`)

**Public Chat** (visitor-side, `chat-completion`):
- Triggered by website visitors
- Only has access to skills marked `external` or `both`
- Can answer questions from knowledge base, book appointments, capture lead info
- Cannot modify any data — read-only + booking

**Why this matters:** The scope system (`internal`/`external`/`both`) enforces this separation at the architecture level. A visitor can never accidentally access admin tools. An admin can never accidentally expose internal operations to visitors.

### Flowwink's Prompt Architecture

Flowwink assembles its system prompt from 9 ordered layers. This is **Flowwink's design**, not OpenClaw's:

| # | Layer | Purpose | Source |
|---|-------|---------|--------|
| 1 | **Core Instructions** | Grounding rules, safety, mode identity | Hardcoded |
| 2 | **Tool Definitions** | What the agent can do | Built-in + DB skills |
| 3 | **Skills Registry** | Available capabilities | `agent_skills` table |
| 4 | **Model Aliases** | Provider routing | AI config resolver |
| 5 | **Protocol Specs** | Reply directives, output format | Parser rules |
| 6 | **Runtime Info** | Domain context (CMS schema, data counts) | Domain pack |
| 7 | **Workspace Files** | Soul, identity, operational rules | `agent_memory` keys |
| 8 | **Bootstrap Hooks** | Skill instructions (lazy loaded) | On-demand fetch |
| 9 | **Inbound Context** | Current conversation + objectives + memory | Session data |

**Loading strategy:**
- Layers 1-3: loaded at startup (static)
- Layers 4-6: loaded per-session (configurable)
- Layers 7-9: loaded per-turn (dynamic)

### Flowwink's ReAct Loop

The reasoning core uses a ReAct (Reason → Act → Observe) loop. The general pattern is shared with OpenClaw and other agentic systems, but the constants are Flowwink-specific:

```
Input (message / heartbeat / event)
        │
        ▼
┌─── reason() ────────────────────────────────────┐
│                                                  │
│  1. Build system prompt (9 layers)               │
│  2. Assemble tools (built-in + DB skills)        │
│  3. Call LLM                                     │
│                                                  │
│  4. LLM returns response:                        │
│     ├── Text only → return to surface            │
│     └── Tool calls → execute each:               │
│         ├── Built-in tool → handlers.ts          │
│         └── DB skill → handler router            │
│                                                  │
│  5. Append tool results to conversation          │
│  6. Budget check (tokens, iterations)            │
│  7. If budget OK and more tool calls → go to 3  │
│  8. Return final response                        │
│                                                  │
└──────────────────────────────────────────────────┘
        │
        ▼
   Response (text / SSE stream / tool results)
```

**Flowwink-specific constants:**
- `MAX_ITERATIONS = 6` (interactive) / `8` (heartbeat)
- `MAX_CONTEXT_TOKENS = 80,000`
- `SUMMARY_THRESHOLD = 60,000` (triggers compaction)

### Flowwink's Handler Abstraction

Flowwink decouples skill definitions from implementations using handler strings. This is **Flowwink's design** — OpenClaw does not use this pattern:

| Prefix | Implementation | Example |
|--------|---------------|---------|
| `edge:` | Supabase Edge Function | `edge:qualify-lead` |
| `module:` | In-process handler | `module:blog` |
| `db:` | Direct database query | `db:page_views` |
| `webhook:` | External HTTP call | `webhook:n8n` |
| `a2a:` | Agent-to-agent peer | `a2a:SoundSpace` |

This means you can change how a skill is implemented without changing the agent's understanding of what it does.

### Flowwink's Memory Architecture

Flowwink replaces OpenClaw's file-based memory with a 4-tier PostgreSQL system. This is **Flowwink's design** — OpenClaw uses files on disk:

| Tier | What | Storage | Access |
|------|------|---------|--------|
| **L1: Session** | Current conversation | In-memory / `chat_messages` | Linear scan |
| **L2: Working** | Recent memories (top 20-30) | `agent_memory` | Key/category filter |
| **L3: Long-term** | All persisted facts | `agent_memory` | Full-text search |
| **L4: Semantic** | Vector embeddings | `agent_memory.embedding` | pgvector cosine similarity |

The concept categories (`soul`, `identity`, `agents`, `facts`, `preferences`) mirror OpenClaw's workspace files but live in database rows instead of markdown files.

### Flowwink's Three Surfaces

| Surface | Trigger | Mode | Purpose |
|---------|---------|------|---------|
| **Interactive** | User message | Streaming | Real-time conversation |
| **Autonomous** | Cron/schedule | Non-streaming | Self-directed operation |
| **External** | Event/webhook | Non-streaming | Reactive processing |

In Flowwink:
- Interactive = `agent-operate` (admin) / `chat-completion` (visitor)
- Autonomous = `flowpilot-heartbeat` (12h cron)
- External = `signal-ingest` (webhook endpoint)

**All three surfaces share the same reasoning core.** This is LAW 10: Unified Reasoning Core. No logic duplication.

### Flowwink's Concurrency Model

Lane-based locking — **Flowwink's design:**

```
heartbeat    → lane: "heartbeat"           (TTL: 15 min)
operate      → lane: "operate:{convId}"    (TTL: 5 min)
```

Lane-based locking prevents:
- Two heartbeats running simultaneously
- Multiple operate sessions colliding
- Resource contention on shared state

The lock is time-boxed (TTL) — if the agent crashes, the lock auto-expires. No zombie locks.

### Flowwink's Safety Architecture

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| **Skill scope** | `internal` / `external` / `both` | Prevent visitor-facing agents from accessing admin tools |
| **Approval gating** | `requires_approval: true` | Human must approve destructive actions |
| **Self-healing** | Auto-quarantine after 3 failures | Prevent cascading failures |
| **Token budget** | Hard limit on context size | Prevent runaway costs |
| **Iteration cap** | Max 6-8 tool rounds | Prevent infinite loops |
| **Wall-clock timeout** | 120s hard abort | Prevent hung processes |
| **Grounding rules** | Hardcoded in prompt layer 1 | Safety rules that can never be overridden |

---

## Pattern Index — OpenClaw-Inspired Business Processes

The rest of this handbook uses the OpenClaw reference model and Flowwink adaptation to illustrate a handful of concrete business patterns you can copy or adapt:

- **Pattern 1: Specialist QA Claw for Your Product**  
  Use OpenClaw as a dedicated QA agent for your own SaaS or internal tools. Define a `SOUL.md` and `AGENTS.md` focused on audits, expose a typed `/v1/responses` endpoint, and have your system call it after changes. The FlowPilot + QA Claw loop in chapter 2 shows this in production.

- **Pattern 2: Agentic CMS/CRM (FlowPilot Pattern)**  
  Take the OpenClaw laws (soul, agents, heartbeat, skills, memory) and apply them to a self-hosted business platform. Flowwink/FlowPilot is one example: FlowPilot operates pages, blog, CRM, email, and analytics as a digital employee instead of a dashboard.

- **Pattern 3: Role-Based Swarms on ClawStack**  
  Run multiple specialist OpenClaw agents — QA, SEO, Dev, Research — as separate services on a VPS. Use ClawStack to provision and route them, and use `/v1/responses` + A2A to delegate work between them and your own systems.

- **Pattern 4: Company-Level Orchestrator with Paperclip**  
  Treat individual Claws as "employees" and use an orchestration layer (Paperclip) as the "company" that sets objectives, delegates tasks, and enforces budgets and governance across agents.

- **Pattern 5: Secure Perimeter and Governance (NemoClaw, DefenseClaw)**  
  Wrap personal or business agents in security and governance layers. NemoClaw adds sandboxing and policy controls around OpenClaw. DefenseClaw adds scanning, blocking, and audit logging for skills, MCP servers, and agent actions. This handbook references them as examples of how the ecosystem is hardening the same architectural patterns.

You do not need to adopt these specific projects to use the patterns. The point is that once you understand the OpenClaw laws and the Flowwink adaptation, you can design your own OpenClaw-inspired business processes along the same lines.

Taken together, these patterns form an operating system for OpenClaw-inspired business processes: agents for each function, a swarm layer to coordinate them, and a company layer to govern them.

---

## Open Questions for Agentic Layers

This handbook is opinionated, but it is not the final word. The OpenClaw ecosystem, Flowwink, and related projects are all still discovering what "good" looks like for agentic systems. A few questions keep showing up in code, issues, and production stories:

- **Memory architecture.** How do we give agents enough continuity to feel reliable, without turning every prompt into an unbounded dump of history or creating opaque, un-auditable vector stores? OpenClaw's file-based memory and Flowwink's tiered database memory are two different answers to the same tension.
- **Governance and self-modification.** How much freedom should an agent have to rewrite its own soul, skills, and protocols? Where should hard boundaries live (files, policies, approval flows), and how do we detect and roll back drift when it goes wrong?
- **Multi-agent coordination.** When you move from one agent to swarms and company-level orchestrators, how should objectives, budgets, and memory be shared? OpenClaw's session tools, ClawStack swarms, and Paperclip-style control planes all explore different compositions.
- **Model-agnostic orchestration.** If the agent layer is supposed to work across providers, how much normalization and fallback should it own? At what point does "supports any LLM" become too thin to be meaningful, and where is it worth specializing for a particular model's strengths?
- **Heartbeats, scheduling, and health.** How often should autonomous loops run, what token and time budgets are acceptable, and how do we detect when an agent is stuck in an unproductive pattern? Flowwink's heartbeat budgets and health logging are one attempt; OpenClaw operators are actively asking for richer dashboards and stagnation detection.
- **Observability and debugging.** What level of logging, tracing, and replay is needed so that operators can understand *why* an agent did something, not just *what* it did? Techniques from microservices (structured logs, traces, metrics) are only starting to be applied to agent runs.
- **Human-in-the-loop experience.** When should the agent act unilaterally, when should it ask for approval, and how should proposed actions be presented so that humans feel in control rather than out of the loop?

Clawable exists partly to host this conversation. The patterns in this chapter are a snapshot of what works today. The open questions above are an invitation for you—as a builder, operator, or leader—to push the architecture forward.

---

## Why This Architecture Works

This architecture works because it separates concerns:

1. **Surfaces** handle I/O (how the agent communicates)
2. **Reasoning core** handles cognition (how the agent thinks)
3. **Skills** handle capability (what the agent can do)
4. **Memory** handles continuity (what the agent knows)
5. **Infrastructure** handles reliability (how the agent runs)

Each layer can evolve independently. You can add new channels without touching the reasoning core. You can add new skills without changing the memory system. You can upgrade the LLM without rewriting the surfaces.

This is the principle that makes agentic systems maintainable: **separation of concerns at the architectural level.**

OpenClaw proved the pattern with a very large GitHub star count (hundreds of thousands as of the April 2026 snapshot cited in `SOURCES.md`) and production deployments worldwide. Flowwink adapted it for self-hosted business operations — same brain, different body.

---

*OpenClaw is the reference. Flowwink is the adaptation. Understanding both — and where they differ — is the foundation for building your own agentic system.*

*Next: the control plane layer — Claude Code, Cursor, thin wrappers, and what creates a real moat. [The Agentic Control Plane →](03b-control-plane.md)*
