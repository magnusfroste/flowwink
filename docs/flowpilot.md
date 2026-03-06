# FlowPilot — The First Autonomous Agentic CMS

> **Your website runs itself.** FlowPilot is not a chatbot. It is an autonomous AI agent that writes your content, qualifies your leads, runs your campaigns, and learns from every interaction. You set the objectives. It does the rest.

---

## 1. What FlowPilot Is

FlowPilot is an **autonomous digital operator** — an OpenClaw-inspired agent with persistent memory, self-evolving skills, goal-driven objectives, and a reactive automation layer. It sits above the entire platform — content, CRM, bookings, newsletters, analytics, knowledge base, e-commerce — and orchestrates them continuously, with or without a human present.

### The Paradigm Shift

| Traditional CMS | FlowPilot |
|-----------------|-----------|
| You manage pages | FlowPilot manages your digital presence |
| You write content | FlowPilot writes, you approve |
| You qualify leads | FlowPilot scores, enriches, and routes them |
| You send newsletters | FlowPilot segments, writes, and sends |
| You check analytics | FlowPilot reflects, learns, and adapts |
| Nothing happens while you sleep | FlowPilot keeps working |

### Two Agents, One Engine

| Agent | Audience | Purpose |
|-------|----------|---------|
| **Public Chat** | Website visitors | Intelligent concierge grounded in all site content, KB articles, and blog posts. Books appointments, captures leads, searches the web, checks orders. |
| **FlowPilot Operate** | Admins & employees | Autonomous operator with memory, objectives, self-improvement, multi-tool chaining, and human-in-the-loop approval gating. |

Both agents invoke skills through the same `agent-execute` edge function, share the same activity log, and respect the same scope and approval rules.

---

## 2. The Autonomous Loop

FlowPilot operates on a continuous cycle that never stops. This is the core value proposition — the machine that runs your business:

```
┌─────────────┐
│  HEARTBEAT  │ ← Triggers every 12 hours (configurable)
└──────┬──────┘
       ▼
┌─────────────┐
│   REFLECT   │ ← What happened since last cycle? What succeeded, what failed?
└──────┬──────┘
       ▼
┌─────────────┐
│    PLAN     │ ← Match objectives to available skills. Prioritize by impact.
└──────┬──────┘
       ▼
┌─────────────┐
│   EXECUTE   │ ← Write content, qualify leads, send campaigns, update CRM.
└──────┬──────┘
       ▼
┌─────────────┐
│     LOG     │ ← Every action recorded with full I/O audit trail.
└──────┬──────┘
       ▼
┌─────────────┐
│ LEARN/EVOLVE│ ← Update memory. Rewrite skill instructions. Evolve soul.
└──────┬──────┘
       │
       └──────────────▶ (repeat)
```

### Three Layers of Operation

| Layer | Trigger | Example |
|-------|---------|---------|
| **🟢 Visitor Layer** | User message in public chat | "Book me a demo" → books appointment via skill |
| **🔵 Admin Operate Layer** | Admin command in FlowPilot | "Write a blog post about our new feature" → drafts post |
| **🟣 Automation Layer** | System event or scheduled tick | New form submission → create lead → qualify → notify |

---

## 3. The Agent Brain — Six Core Capabilities

### 3.1 Skill Engine (20+ Skills)

Every capability is a **skill** — a database-driven, hot-reloadable tool definition in OpenAI function-calling format. FlowPilot can even create new skills for itself at runtime.

```json
{
  "name": "book_appointment",
  "description": "Book an appointment for a customer",
  "category": "automation",
  "scope": "both",
  "handler": "module:booking",
  "requires_approval": false,
  "instructions": "When booking, always confirm timezone...",
  "tool_definition": { ... }
}
```

**Handler routing** — the `handler` string decouples skill definition from implementation:

| Prefix | Route | Example |
|--------|-------|---------|
| `edge:` | Edge Function | `edge:qualify-lead` |
| `module:` | Module handler | `module:blog` |
| `db:` | Direct DB query | `db:page_views` |
| `webhook:` | External | `webhook:n8n` |

**Scope model** — controls who can invoke what:

| Scope | Access |
|-------|--------|
| `internal` | Only FlowPilot (admin) |
| `external` | Only Public Chat (visitors) |
| `both` | Either agent |

### 3.2 Persistent Memory

FlowPilot maintains a key-value memory store (`agent_memory`) that survives across sessions:

| Category | Purpose | Example |
|----------|---------|---------|
| `preference` | Learned preferences | `preferred_blog_tone: "conversational"` |
| `context` | Operational context | `last_campaign_date: "2025-01-15"` |
| `fact` | Learned facts & patterns | `lesson:reflect_2025-05-20: { learnings: [...] }` |
| `soul` | Agent personality & values | `purpose, values, tone, philosophy` |
| `identity` | Agent identity & boundaries | `name, role, boundaries` |

Memory is loaded into the system prompt at every conversation start. Built-in `memory_write` and `memory_read` tools let FlowPilot proactively save useful information.

### 3.3 Objectives & Goals

Objectives are high-level goals with structured tracking and success criteria:

```json
{
  "goal": "Increase blog output to 4 posts per month",
  "status": "active",
  "constraints": { "max_posts_per_week": 2, "tone": "professional" },
  "success_criteria": { "posts_per_month": 4 },
  "progress": { "posts_this_month": 2, "last_post_date": "2025-01-20" }
}
```

Active objectives are injected into every FlowPilot prompt. During heartbeat cycles, FlowPilot autonomously reviews progress and takes action to advance them.

### 3.4 Autonomous Heartbeat

The `flowpilot-heartbeat` edge function is the engine that drives autonomous operation. Every 12 hours (configurable), FlowPilot wakes up without any human prompt and:

1. **Calls `reflect`** to analyze the past 7 days of activity
2. **Reviews active objectives** — updates progress based on current data
3. **Takes autonomous actions** — writes blog posts, qualifies leads, sends campaigns
4. **Saves learnings** — persists new facts and patterns to memory
5. **Logs a summary** — full heartbeat report in the activity feed

```
HEARTBEAT PROTOCOL:
1. REFLECT — analyze performance and patterns
2. OBJECTIVES — review each goal, update progress, mark complete if criteria met
3. ACT — execute skills to advance objectives
4. REMEMBER — save new learnings to memory
5. SUMMARIZE — report what happened
```

### 3.5 Signal Automations

Event-driven reactions that execute through the same skill engine:

| Trigger Type | Mechanism | Example |
|-------------|-----------|---------|
| **Cron** | `pg_cron` → `automation-dispatcher` | Daily analytics digest |
| **Event** | `send-webhook` → event match | Form submitted → create lead → qualify |
| **Signal** | `signal-dispatcher` → condition eval | Lead score ≥ 50 → send notification |

Signal conditions support: `score_threshold`, `count_threshold`, `status_change`, `field_match`, and `compound` (AND/OR combinations).

### 3.6 Self-Evolution

The most radical capability. FlowPilot can modify its own behavior:

| Tool | What It Does |
|------|-------------|
| `soul_update` | Evolves personality, values, tone, and philosophy based on accumulated experience |
| `skill_instruct` | Rewrites skill instructions (the SKILL.md equivalent) — context, examples, edge cases that make execution smarter |
| `skill_create` | Registers entirely new skills at runtime (defaults to `requires_approval = true`) |
| `skill_update` | Modifies existing skill definitions, handlers, or scope |
| `skill_disable` | Disables problematic or unused skills |
| `reflect` | Analyzes performance, identifies patterns, auto-persists learnings to memory |

**Safety**: Newly created skills default to `requires_approval = true`. New automations default to `enabled = false`. Every modification is logged in the activity feed.

---

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA LAYER                               │
│  pages · blogs · KB articles · leads · bookings · orders · ...  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────────┐
│                    SKILL ENGINE                                  │
│                                                                  │
│  ┌──────────────┐    ┌──────────────────┐    ┌───────────────┐  │
│  │ agent_skills  │───▸│  agent-execute   │───▸│ agent_activity│  │
│  │  (registry)   │    │  (router)        │    │ (audit log)   │  │
│  └──────────────┘    └────────┬─────────┘    └───────────────┘  │
│                               │                                  │
│            ┌──────────┬───────┼────────┬──────────┐             │
│            ▼          ▼       ▼        ▼          ▼             │
│        edge:fn    module:x   db:tbl  webhook:url  local         │
│     (edge func)  (DB ops)  (queries) (external)  (memory/       │
│                                                   soul/         │
│                                                   objectives)   │
└─────────────────────────────────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                                 ▼
┌──────────────────┐             ┌──────────────────────┐
│   PUBLIC CHAT    │             │   FLOWPILOT OPERATE   │
│  (chat-completion)│             │   (agent-operate)     │
│                  │             │                        │
│ • Visitor-facing │             │ • Admin-facing         │
│ • Content-grounded│            │ • Multi-tool loop (6x) │
│ • External skills │            │ • Memory + Objectives  │
│ • Web search     │             │ • Self-modification    │
│ • Human handoff  │             │ • Soul + Identity      │
│ • Sentiment      │             │ • Reflection           │
└──────────────────┘             │ • Approval gating      │
                                 └──────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────────┐
│                   AUTOMATION LAYER                                │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  CRON            │  │  EVENT           │  │  SIGNAL          │ │
│  │  automation-     │  │  send-webhook    │  │  signal-         │ │
│  │  dispatcher      │  │  → event match   │  │  dispatcher      │ │
│  │  (pg_cron/1min)  │  │  → agent-execute │  │  → condition     │ │
│  │  → agent-execute │  │                  │  │    evaluation    │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  HEARTBEAT (flowpilot-heartbeat)                             │ │
│  │  Scheduled autonomous loop — reflect, plan, execute, learn   │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### OpenClaw Architecture Mapping

| OpenClaw Concept | FlowPilot Implementation | Storage |
|------------------|--------------------------|---------|
| **Skill Registry** | `agent_skills` table — DB-driven, hot-reloadable | PostgreSQL |
| **Tool Definition** | OpenAI function-calling JSON format | JSONB |
| **Tool Router** | `agent-execute` edge function — unified dispatcher | Edge Function |
| **Handler Routing** | `edge:`, `module:`, `db:`, `webhook:` prefixes | String convention |
| **Scope Model** | `internal`, `external`, `both` enum on each skill | DB enum |
| **Approval Gate** | `requires_approval` boolean → pending_approval status | DB flag |
| **Memory** | `agent_memory` table — persistent K-V with categories | PostgreSQL |
| **Soul / Identity** | `agent_memory` entries with keys `soul` and `identity` | JSONB |
| **Skill Knowledge** | `instructions` column on `agent_skills` — the SKILL.md | Text |
| **Objectives** | `agent_objectives` table — goals with progress + criteria | PostgreSQL |
| **Activity Log** | `agent_activity` table — full I/O audit trail | PostgreSQL |
| **Automations** | `agent_automations` table — cron/event/signal triggers | PostgreSQL |
| **Self-Modification** | `soul_update`, `skill_instruct`, `skill_create/update/disable`, `reflect` | In-process |
| **Heartbeat** | `flowpilot-heartbeat` edge function — scheduled autonomous loop | Edge Function |
| **Multi-Tool Loop** | Up to 6 iterations per turn, parallel tool_calls per round | Runtime |

---

## 5. What FlowPilot Manages — Six Channels

| Channel | Skills | What FlowPilot Does |
|---------|--------|---------------------|
| **Content & Blog** | `blog_write`, `blog_list` | Writes posts in brand voice, optimizes SEO/AEO, schedules publishing |
| **Lead CRM** | `lead_qualify`, `lead_enrich`, `company_enrich` | Captures from any touchpoint, scores, enriches with company data, routes to sales |
| **Email Campaigns** | `newsletter_create` | Segments audiences, writes copy, sends at optimal times, GDPR-compliant |
| **Bookings** | `book_appointment`, `availability_check` | Schedules meetings, sends confirmations and reminders, syncs with CRM |
| **E-commerce** | `order_lookup`, `product_search` | Manages products, processes orders, tracks revenue and conversion |
| **Analytics** | `analytics_query`, `reflect` | Monitors traffic, identifies trends, generates reports, suggests improvements |

---

## 6. Approval Gating & Human-in-the-Loop

Autonomous doesn't mean uncontrolled. Every skill can be configured for approval:

1. Agent calls skill → `agent-execute` intercepts
2. Activity logged with status `pending_approval`
3. Response returns `202` with `pending_approval` status
4. Admin sees pending action in Activity Feed
5. Admin approves → original args re-executed automatically
6. Result returned to conversation (if still active)

**Activity logging** — every execution produces an `agent_activity` row:

```
agent         → 'flowpilot' | 'chat'
skill_id      → FK to agent_skills
skill_name    → denormalized for fast display
input         → JSONB (arguments passed)
output        → JSONB (result returned)
status        → success | failed | pending_approval | approved | rejected
duration_ms   → execution time
conversation_id → links to chat session
error_message → if failed
```

---

## 7. Content as Knowledge — The Public Chat

### Knowledge Base Construction

The `buildKnowledgeBase` function in `chat-completion` constructs the AI's context:

1. Fetch published pages (optionally filtered by slug whitelist)
2. Extract text from every content block type (hero, text, accordion, contact, stats, etc.)
3. Fetch KB articles where `include_in_chat = true`
4. Combine into structured sections with token budget
5. Inject as system prompt context

### Configurable Context

| Setting | Effect |
|---------|--------|
| `includeContentAsContext` | Toggle page content inclusion |
| `contentContextMaxTokens` | Token budget for context window |
| `includedPageSlugs` | Whitelist specific pages (or `*` for all) |
| `includeKbArticles` | Include KB Q&A pairs |
| `allowGeneralKnowledge` | Let AI use its own knowledge beyond site content |

### AI Provider Flexibility

| Provider | Configuration | Tool Calling |
|----------|---------------|--------------|
| **OpenAI** | API key + model + optional base URL | ✅ Native |
| **Gemini** | API key + model | ✅ Native |
| **Local AI** | Endpoint + model + optional API key | ✅ If OpenAI-compatible (vLLM, Qwen3, Ollama) |
| **n8n** | Webhook URL | Via webhook response |

**Private AI first** — self-host with Ollama or any OpenAI-compatible endpoint. Data never leaves your infrastructure.

---

## 8. Data Flow Summary

### Visitor Journey
```
Visitor asks question
  → chat-completion loads site content + KB + skills
  → AI responds with grounded answer (or invokes skill)
  → Skill executes via agent-execute
  → Activity logged
  → Result returned to visitor
```

### Admin Operation
```
Admin gives instruction in FlowPilot Operate
  → agent-operate loads soul + identity + memory + objectives + skill instructions
  → AI plans multi-step execution
  → Each skill invoked via agent-execute
  → Approval-gated actions pause for admin
  → Activity feed shows real-time progress
  → Memory updated with new learnings
```

### Heartbeat (Autonomous)
```
Scheduled trigger fires (every 12h)
  → flowpilot-heartbeat loads objectives + stats + skills
  → FlowPilot reflects on past 7 days
  → Reviews each active objective
  → Takes autonomous actions to advance goals
  → Persists learnings to memory
  → Logs heartbeat summary to activity feed
```

### Automated Operation
```
Trigger fires (cron tick / webhook event / signal condition)
  → Dispatcher matches automation
  → agent-execute invoked with predefined arguments
  → Activity logged
  → Automation metadata updated (run_count, next_run_at)
```

---

## 9. Key Files Reference

| File | Purpose |
|------|---------|
| **Edge Functions** | |
| `supabase/functions/agent-execute/index.ts` | Unified skill executor — routing, scope, approval, logging |
| `supabase/functions/agent-operate/index.ts` | FlowPilot Operate — soul/identity, memory, objectives, multi-tool loop, self-evolution |
| `supabase/functions/chat-completion/index.ts` | Public chat — knowledge base, skill loading, AI provider routing |
| `supabase/functions/flowpilot-heartbeat/index.ts` | Autonomous heartbeat — scheduled reflect/plan/execute/learn cycle |
| `supabase/functions/automation-dispatcher/index.ts` | Cron automation executor (pg_cron → agent-execute) |
| `supabase/functions/signal-dispatcher/index.ts` | Signal condition evaluator (dynamic conditions → agent-execute) |
| `supabase/functions/qualify-lead/index.ts` | Lead scoring — emits signals for automation |
| `supabase/functions/gmail-inbox-scan/index.ts` | Gmail integration — email signals |
| **Types & Config** | |
| `src/types/agent.ts` | TypeScript types for skills, memory, objectives, activity, automations |
| `docs/flowpilot.md` | This document — definitive architecture reference |
| `.lovable/plan.md` | Phase-by-phase implementation log |
| **Frontend** | |
| `src/pages/CopilotPage.tsx` | FlowPilot UI — Operate/Migrate mode switcher |
| `src/components/copilot/OperateChat.tsx` | Chat interface with quick actions and skill badges |
| `src/components/copilot/ActivityFeed.tsx` | Real-time activity sidebar with approve/reject |
| `src/pages/admin/SkillHubPage.tsx` | Skill registry admin — CRUD, activity log, objectives |
| `src/components/admin/skills/SkillEditorSheet.tsx` | Skill editor with instructions field |
| `src/hooks/useAgentOperate.ts` | React hook — messages, skills, activity, approval flow |
| `src/hooks/useSkillHub.ts` | React hook — skill CRUD, activity queries |
| **Database Tables** | |
| `agent_skills` | Skill registry (name, handler, scope, instructions, tool_definition) |
| `agent_memory` | Persistent key-value memory (incl. soul & identity) |
| `agent_objectives` | Goal tracking with progress and success criteria |
| `agent_activity` | Full execution audit trail |
| `agent_automations` | Cron/event/signal trigger definitions |
| `agent_objective_activities` | Join table linking objectives to activities |

---

## 10. FlowWink Replaces Four Products

| Capability | Traditional CMS | AI Chatbot | Marketing Automation | CRM | **FlowWink** |
|-----------|----------------|-----------|---------------------|-----|-------------|
| Visual Page Builder | ✅ | ❌ | ❌ | ❌ | ✅ |
| Headless API | Some | ❌ | ❌ | ❌ | ✅ |
| Autonomous AI Agent | ❌ | ❌ | ❌ | ❌ | ✅ |
| Persistent Memory | ❌ | ❌ | ❌ | ❌ | ✅ |
| Self-Evolving Skills | ❌ | ❌ | ❌ | ❌ | ✅ |
| Lead CRM & Scoring | ❌ | ❌ | ✅ | ✅ | ✅ |
| AI Content Generation | ❌ | ✅ | ❌ | ❌ | ✅ |
| Email Campaigns | ❌ | ❌ | ✅ | ❌ | ✅ |
| Booking System | ❌ | ❌ | ❌ | ❌ | ✅ |
| E-commerce | ✅ | ❌ | ❌ | ❌ | ✅ |
| Knowledge Base | ❌ | ✅ | ❌ | ❌ | ✅ |
| Self-Hostable | Some | ❌ | ❌ | ❌ | ✅ |
| Private LLM | ❌ | ❌ | ❌ | ❌ | ✅ |
| Open Source | Some | ❌ | ❌ | ❌ | ✅ |

---

## 11. Maturity Roadmap

| Capability | Status |
|-----------|--------|
| Skill Engine | ✅ 100% |
| Persistent Memory | ✅ 100% |
| Objectives & Goals | ✅ 95% |
| Signal Automations | ✅ 90% |
| Self-Evolution (soul, skill_instruct) | ✅ 85% |
| Multi-Agent Orchestration | 🔧 40% |

---

*Stop managing. Start directing. — FlowPilot operates your entire digital presence so you can focus on what matters.*

*This document is the definitive reference for the FlowPilot agentic framework. Update it when new skills, handlers, or architectural changes are introduced.*
