# FlowAgent — Autonomous Agentic Intelligence Engine

> **Your website runs itself.** FlowAgent is not a chatbot. It is an autonomous AI operator that writes your content, qualifies your leads, runs your campaigns, and learns from every interaction. You set the objectives. It does the rest.

---

## 1. What FlowAgent Is

FlowAgent is the **heart and brain** of FlowWink — an autonomous digital operator inspired by the OpenClaw agentic framework. It features persistent memory, self-evolving skills, goal-driven objectives with plan decomposition, self-healing, and a reactive automation layer. It sits above the entire platform — content, CRM, bookings, newsletters, analytics, knowledge base, e-commerce — and orchestrates them continuously, with or without a human present.

### The Paradigm Shift

| Traditional CMS | FlowAgent |
|-----------------|-----------|
| You manage pages | FlowAgent manages your digital presence |
| You write content | FlowAgent writes, you approve |
| You qualify leads | FlowAgent scores, enriches, and routes them |
| You send newsletters | FlowAgent segments, writes, and sends |
| You check analytics | FlowAgent reflects, learns, and adapts |
| Nothing happens while you sleep | FlowAgent keeps working |

### Two Agents, One Engine

| Agent | Audience | Purpose |
|-------|----------|---------|
| **Public Chat** | Website visitors | Intelligent concierge grounded in all site content, KB articles, and blog posts. Books appointments, captures leads, searches the web, checks orders. |
| **FlowAgent Operate** | Admins & employees | Autonomous operator with memory, objectives, self-improvement, multi-tool chaining, plan decomposition, self-healing, and human-in-the-loop approval gating. |

Both agents invoke skills through `agent-execute`, share the activity log, and respect the same scope and approval rules.

### Unified Interface with @-Commands

FlowPilot uses a single `UnifiedChat` component for both admin and visitor scopes. The only difference is the `scope` prop (`admin` vs `visitor`), which determines available skills and UI features.

**@-Command System** — Typing `@` in the chat input opens a floating command palette (similar to Claude's `/` commands):

- Commands are **auto-generated from `agent_skills`** in the database
- Admin scope sees all internal + both-scoped skills
- Visitor scope sees external + both-scoped skills
- Built-in commands: `@help`, `@objectives`, `@activity`, `@migrate`
- Selecting a command prefixes the message: `@blog Write about AI trends`

**Key files:**
- `src/components/chat/UnifiedChat.tsx` — Single chat component for both scopes
- `src/components/chat/UnifiedChatInput.tsx` — Input with @-detection
- `src/components/chat/CommandPalette.tsx` — Floating skill command menu
- `src/pages/admin/CopilotPage.tsx` — Admin page using `UnifiedChat scope="admin"`
- `src/components/chat/ChatConversation.tsx` — Thin wrapper using `UnifiedChat scope="visitor"`

**A2A readiness:** Future agent-to-agent communication uses the same pattern — `@a2a:agent-name message`.

---

## 2. The Autonomous Loop

FlowAgent operates on a continuous cycle. This is the core value proposition — the machine that runs your business:

```
┌─────────────┐
│  HEARTBEAT  │ ← Triggers every 12 hours (configurable)
└──────┬──────┘
       ▼
┌─────────────┐
│ SELF-HEAL   │ ← Auto-disable skills with 3+ consecutive failures
└──────┬──────┘
       ▼
┌─────────────┐
│  PROPOSE    │ ← Proactively create objectives from patterns/stats
└──────┬──────┘
       ▼
┌─────────────┐
│   PLAN      │ ← AI decomposes objectives into 3-7 ordered steps
└──────┬──────┘
       ▼
┌─────────────┐
│  ADVANCE    │ ← Chain-execute plan steps (up to 4 per call)
└──────┬──────┘
       ▼
┌─────────────┐
│ AUTOMATE    │ ← Execute DUE cron/event/signal automations
└──────┬──────┘
       ▼
┌─────────────┐
│  REFLECT    │ ← Analyze 7-day performance, auto-persist learnings
└──────┬──────┘
       ▼
┌─────────────┐
│  REMEMBER   │ ← Save insights to persistent memory
└──────┬──────┘
       │
       └──────────────▶ (repeat)
```

### Three Layers of Operation

| Layer | Trigger | Example |
|-------|---------|---------|
| **🟢 Visitor Layer** | User message in public chat | "Book me a demo" → books appointment via skill |
| **🔵 Admin Operate Layer** | Admin command in FlowAgent | "Write a blog post about our new feature" → drafts post |
| **🟣 Automation Layer** | System event or scheduled tick | New form submission → create lead → qualify → notify |

---

## 3. Architecture — The Reasoning Core

The central innovation is `agent-reason` — a **shared importable module** (not a standalone Edge Function) that eliminates logic duplication across all FlowAgent surfaces.

```
┌─────────────────────────────────────────────────────────────────┐
│                    AGENT-REASON (Core Module)                    │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ AI Config    │  │ Soul/Identity│  │ Memory + Objectives  │  │
│  │ Resolution   │  │ Loader       │  │ Context Loader       │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              26 Built-in Tools (7 groups)                 │   │
│  │                                                          │   │
│  │  memory: memory_write, memory_read                       │   │
│  │  objectives: objective_update_progress, objective_complete│   │
│  │  self-mod: skill_create/update/list/disable/instruct     │   │
│  │  reflect: reflect (7-day analysis + auto-persist)        │   │
│  │  soul: soul_update (purpose/values/tone/philosophy)      │   │
│  │  planning: decompose_objective, advance_plan,            │   │
│  │            propose_objective                              │   │
│  │  automations-exec: execute_automation                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Self-Healing │  │ Plan Decomp  │  │ Priority Scoring     │  │
│  │ Engine       │  │ (AI-powered) │  │ (deadline/momentum)  │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  reason() — Non-streaming loop (heartbeat, learn)        │   │
│  │  Tool Execution Router → built-in OR agent-execute       │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                     ▼
┌──────────────────┐ ┌──────────────────┐ ┌─────────────────────┐
│  agent-operate   │ │ flowpilot-       │ │  flowpilot-learn    │
│  (SSE streaming) │ │ heartbeat        │ │  (daily 03:00 UTC)  │
│  Interactive     │ │ (12h autonomous) │ │  Feedback analysis  │
└──────────────────┘ └──────────────────┘ └─────────────────────┘
                               │
┌──────────────────────────────┼──────────────────────────────────┐
│                       SKILL ENGINE                               │
│                                                                  │
│  ┌──────────────┐    ┌──────────────────┐    ┌───────────────┐  │
│  │ agent_skills  │───▸│  agent-execute   │───▸│ agent_activity│  │
│  │  (registry)   │    │  (router)        │    │ (audit log)   │  │
│  └──────────────┘    └────────┬─────────┘    └───────────────┘  │
│                               │                                  │
│            ┌──────────┬───────┼────────┬──────────┐             │
│            ▼          ▼       ▼        ▼          ▼             │
│        edge:fn    module:x   db:tbl  webhook:url  local         │
└─────────────────────────────────────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                                         ▼
┌──────────────────┐                     ┌──────────────────────┐
│  PUBLIC CHAT     │                     │  AUTOMATION LAYER    │
│  (chat-completion)│                     │                      │
│  • Visitor-facing │                     │  cron-dispatcher     │
│  • Content-       │                     │  signal-dispatcher   │
│    grounded       │                     │  signal-ingest       │
│  • External skills│                     │  send-webhook        │
└──────────────────┘                     └──────────────────────┘
```

### Consumers of `agent-reason`

| Consumer | Mode | Tool Groups | Purpose |
|----------|------|-------------|---------|
| `agent-operate` | SSE streaming | memory, objectives, self-mod, reflect, soul | Interactive admin assistant |
| `flowpilot-heartbeat` | Non-streaming | memory, objectives, reflect, planning, automations-exec | Autonomous 12h loop |
| `flowpilot-learn` | Non-streaming | memory, reflect | Daily feedback distillation |

---

## 4. The Seven Core Capabilities

### 4.1 Skill Engine (19 Default Skills + Runtime Creation)

Every capability is a **skill** — a database-driven, hot-reloadable tool definition in OpenAI function-calling format. FlowAgent can create new skills at runtime.

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

**Handler routing** — the `handler` string decouples skill from implementation:

| Prefix | Route | Example |
|--------|-------|---------|
| `edge:` | Edge Function | `edge:qualify-lead` |
| `module:` | Module handler in `agent-execute` | `module:blog` |
| `db:` | Direct DB query | `db:page_views` |
| `webhook:` | External | `webhook:n8n` |

**Scope model** — controls access:

| Scope | Access |
|-------|--------|
| `internal` | Only FlowAgent (admin) |
| `external` | Only Public Chat (visitors) |
| `both` | Either agent |

### 4.2 Persistent Memory

Key-value store (`agent_memory`) that survives across sessions:

| Category | Purpose | Example |
|----------|---------|---------|
| `preference` | Learned preferences | `preferred_blog_tone: "conversational"` |
| `context` | Operational context | `last_campaign_date: "2025-01-15"` |
| `fact` | Learned facts & patterns | `lesson:reflect_2025-05-20: { learnings: [...] }` |
| `soul` | Agent personality & values | `purpose, values, tone, philosophy` |
| `identity` | Agent identity & boundaries | `name, role, boundaries` |

Memory is loaded into the system prompt at every conversation start. Built-in `memory_write` and `memory_read` tools let FlowAgent proactively save useful information. Limited to 30 most recent entries per context window.

### 4.3 Objectives & Plan Decomposition

Objectives are high-level goals with **AI-powered plan decomposition** and **priority scoring**:

```json
{
  "goal": "Increase blog output to 4 posts per month",
  "status": "active",
  "constraints": { "max_posts_per_week": 2, "priority": "high", "deadline": "2026-04-01" },
  "success_criteria": { "posts_per_month": 4 },
  "progress": {
    "plan": {
      "steps": [
        { "id": "s1", "description": "Research trending topics", "skill_name": "search_web", "status": "done" },
        { "id": "s2", "description": "Draft first blog post", "skill_name": "write_blog_post", "status": "pending" }
      ],
      "total_steps": 5,
      "current_step": 2
    }
  }
}
```

**Priority Scoring** (automatic, computed per heartbeat):

| Factor | Score |
|--------|-------|
| Overdue deadline | +50 |
| Deadline < 1 day | +40 |
| Deadline < 3 days | +25 |
| Priority: critical | +35 |
| Priority: high | +20 |
| In-progress plan (>0%, <100%) | +15 |
| Near completion (>70%) | +10 |
| No update in 3+ days | +8 |
| No update in 7+ days | +12 |
| Plan has failures | +10 |

Objectives are sorted by score and advanced in order during heartbeat.

**Plan Decomposition Flow:**
1. `decompose_objective` → AI analyzes goal + available skills → produces 3-7 ordered steps
2. `advance_plan` → Chains up to 4 steps per call via `agent-execute`
3. Steps persist between heartbeats — FlowAgent picks up where it left off
4. Failed steps are noted; agent continues to next objective

### 4.4 Self-Healing

Automatic fault detection and skill quarantine (ported from ClawCMS):

1. `runSelfHealing()` scans last 3 days of `agent_activity`
2. Skills with **3+ consecutive failures** are auto-disabled
3. Linked automations are also disabled with error annotation
4. Frontend `SelfHealingAlert` component notifies admin with one-click re-enable
5. Healing report injected into heartbeat system prompt

### 4.5 Autonomous Heartbeat

The `flowpilot-heartbeat` Edge Function drives autonomous operation. Every 12 hours:

```
HEARTBEAT PROTOCOL (7 steps):
1. PROACTIVE REASONING — Analyze stats + patterns → propose_objective if gap found
2. PLAN — decompose_objective for objectives without plans
3. ADVANCE — advance_plan on highest-priority objectives (chain=true)
4. AUTOMATE — execute_automation for DUE (⏰) automations
5. REFLECT — 7-day performance analysis with auto-persisted learnings
6. REMEMBER — Save new insights to memory
7. SUMMARIZE — Brief heartbeat report logged to agent_activity
```

Context loaded in parallel before reasoning:
- Soul & Identity
- Memories (30 most recent)
- Objectives (priority-sorted)
- Recent activity (24h)
- Site stats (7 days: views, leads, posts, subscribers)
- Enabled automations (with DUE markers)
- Self-healing report

Max 8 tool iterations per heartbeat. Top 2-3 objectives prioritized.

### 4.6 Signal Automations

Event-driven reactions through the same skill engine:

| Trigger Type | Mechanism | Example |
|-------------|-----------|---------|
| **Cron** | `automation-dispatcher` | Daily analytics digest |
| **Event** | `send-webhook` → event match | Form submitted → create lead |
| **Signal** | `signal-dispatcher` → condition eval | Lead score ≥ 50 → notify |
| **External** | `signal-ingest` endpoint | Chrome extension → save research |

Signal conditions support: `score_threshold`, `count_threshold`, `status_change`, `field_match`, and `compound` (AND/OR).

**Signal Ingest** — token-authenticated endpoint for external triggers:
```bash
curl -X POST https://<project>.supabase.co/functions/v1/signal-ingest \
  -H "Authorization: Bearer <signal_ingest_token>" \
  -d '{"url":"https://...", "title":"Research", "content":"...", "source_type":"web"}'
```
Signals stored in both `agent_activity` and `agent_memory` for heartbeat processing.

### 4.7 Self-Evolution

FlowAgent can modify its own behavior:

| Tool | What It Does |
|------|-------------|
| `soul_update` | Evolves personality, values, tone, and philosophy |
| `skill_instruct` | Rewrites skill instructions (rich knowledge, examples, edge cases) |
| `skill_create` | Registers new skills at runtime (defaults to `requires_approval = true`) |
| `skill_update` | Modifies existing skill definitions, handlers, or scope |
| `skill_disable` | Disables problematic or unused skills |
| `reflect` | Analyzes 7-day performance → suggestions + auto-persisted learnings |
| `propose_objective` | Proactively creates objectives from detected patterns |

**Safety**: New skills default `requires_approval = true`. New automations default `enabled = false`. Every modification logged in activity feed.

---

## 5. Complete Skill Inventory (19 Default Skills)

### Content & Research

| Skill | Handler | Scope | Approval | Description |
|-------|---------|-------|----------|-------------|
| `write_blog_post` | `module:blog` | internal | ❌ | Create draft blog post with title, topic, tone |
| `research_content` | `edge:research-content` | internal | ❌ | Deep AI topic research — angles, hooks, competitive landscape |
| `generate_content_proposal` | `edge:generate-content-proposal` | internal | ✅ | Multi-channel content generation (blog, newsletter, LinkedIn, X) |
| `publish_scheduled_content` | `edge:publish-scheduled-pages` | internal | ❌ | Auto-publish pages/posts past their scheduled date |
| `search_web` | `edge:firecrawl-search` | internal | ❌ | Web search for research and content ideas |

### CRM & Sales Intelligence

| Skill | Handler | Scope | Approval | Description |
|-------|---------|-------|----------|-------------|
| `add_lead` | `module:crm` | both | ❌ | Add lead to CRM from any source |
| `qualify_lead` | `edge:qualify-lead` | internal | ❌ | AI lead scoring — analyzes activities, company data, engagement |
| `enrich_company` | `edge:enrich-company` | internal | ❌ | Domain-based company enrichment via Firecrawl + AI |
| `prospect_research` | `edge:prospect-research` | internal | ❌ | Company research + Hunter.io contact discovery |
| `prospect_fit_analysis` | `edge:prospect-fit-analysis` | internal | ❌ | AI prospect-company fit scoring against ICP |

### Communication

| Skill | Handler | Scope | Approval | Description |
|-------|---------|-------|----------|-------------|
| `send_newsletter` | `module:newsletter` | internal | ✅ | Create newsletter draft or schedule |
| `execute_newsletter_send` | `edge:newsletter-send` | internal | ✅ | Actually send newsletter to subscribers via Resend |
| `scan_gmail_inbox` | `edge:gmail-inbox-scan` | internal | ❌ | Scan Gmail for business signals (leads, inquiries) |

### Operations

| Skill | Handler | Scope | Approval | Description |
|-------|---------|-------|----------|-------------|
| `book_appointment` | `module:booking` | both | ❌ | Create booking for customer |
| `lookup_order` | `module:orders` | both | ❌ | Look up order by ID or email |
| `create_objective` | `module:objectives` | internal | ❌ | Create high-level goal for autonomous operation |

### Analytics & Learning

| Skill | Handler | Scope | Approval | Description |
|-------|---------|-------|----------|-------------|
| `analyze_analytics` | `db:page_views` | internal | ❌ | Page view analytics by period |
| `weekly_business_digest` | `edge:business-digest` | internal | ❌ | Cross-module business summary (views, leads, bookings, orders) |
| `learn_from_data` | `edge:flowpilot-learn` | internal | ❌ | Distill platform data into persistent memory insights |

### Objective Progress Auto-Tracking

Every skill execution is automatically matched against active objectives via `SKILL_OBJECTIVE_MAP`. When a skill like `write_blog_post` succeeds, objectives containing keywords like "blog" or "content" automatically get their progress incremented — creating a closed-loop system where actions visibly advance business goals.

---

## 6. Approval Gating & Human-in-the-Loop

1. Agent calls skill → `agent-execute` intercepts
2. If `requires_approval`: activity logged with status `pending_approval`, `202` returned
3. Admin sees pending action in Activity Feed
4. Admin approves → original args re-executed automatically
5. Result returned to conversation (if still active)

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

`buildKnowledgeBase` in `chat-completion` constructs the AI's context:
1. Fetch published pages (optionally filtered by slug whitelist)
2. Extract text from every content block type
3. Fetch KB articles where `include_in_chat = true`
4. Combine into structured sections with token budget

### AI Provider Flexibility

| Provider | Configuration | Tool Calling |
|----------|---------------|--------------|
| **OpenAI** | API key + model + optional base URL | ✅ Native |
| **Gemini** | API key + model | ✅ Native |
| **Local AI** | Endpoint + model + optional API key | ✅ If OpenAI-compatible |

**Private AI first** — self-host with Ollama or any OpenAI-compatible endpoint. Data never leaves your infrastructure.

---

## 8. Key Files Reference

### Edge Functions (Backend)

| File | Purpose |
|------|---------|
| `agent-reason/index.ts` | **Core module** — AI config, soul/identity, memory, objectives, 26 built-in tools, self-healing, plan decomposition, priority scoring, reasoning loop. NOT a serve() handler. |
| `agent-execute/index.ts` | Unified skill executor — handler routing (`edge:`, `module:`, `db:`, `webhook:`), scope validation, approval gating, activity logging, auto-module activation, objective progress tracking |
| `agent-operate/index.ts` | Interactive SSE streaming wrapper around agent-reason. Token-by-token output with tool iteration status events. |
| `flowpilot-heartbeat/index.ts` | 7-step autonomous loop — self-heal → propose → plan → advance → automate → reflect → remember |
| `flowpilot-learn/index.ts` | Daily feedback distillation (03:00 UTC) — page views, chat feedback, lead conversion → memory |
| `chat-completion/index.ts` | Public chat — knowledge base construction, skill loading, AI provider routing |
| `signal-ingest/index.ts` | Token-authenticated external signal endpoint for webhooks/extensions |
| `automation-dispatcher/index.ts` | Cron automation executor (pg_cron → agent-execute) |
| `signal-dispatcher/index.ts` | Signal condition evaluator (dynamic conditions → agent-execute) |
| `setup-flowpilot/index.ts` | Bootstrap — seeds skills, soul, identity for new instances |

### Frontend

| File | Purpose |
|------|---------|
| `src/pages/CopilotPage.tsx` | FlowAgent UI — Operate/Migrate mode switcher |
| `src/components/copilot/OperateChat.tsx` | Chat interface with quick actions and skill badges |
| `src/components/copilot/ActivityFeed.tsx` | Real-time activity sidebar with approve/reject |
| `src/components/admin/skills/SelfHealingAlert.tsx` | Auto-disabled skill notifications with re-enable |
| `src/pages/admin/SkillHubPage.tsx` | Skill registry admin — CRUD, activity log, objectives |
| `src/hooks/useAgentOperate.ts` | React hook — messages, skills, activity, approval flow |

### Database Tables

| Table | Purpose |
|-------|---------|
| `agent_skills` | Skill registry (name, handler, scope, instructions, tool_definition) |
| `agent_memory` | Persistent K-V memory (incl. soul & identity) |
| `agent_objectives` | Goal tracking with plan decomposition, priority scoring, progress |
| `agent_activity` | Full execution audit trail |
| `agent_automations` | Cron/event/signal trigger definitions with run tracking |
| `agent_objective_activities` | Join table linking objectives to activities |

### Types

| File | Purpose |
|------|---------|
| `src/types/agent.ts` | TypeScript types for skills, memory, objectives, activity, automations |

---

## 9. OpenClaw Architecture Mapping

> **⚠️ Full architecture law documented in [`docs/OPENCLAW-LAW.md`](./OPENCLAW-LAW.md).** That document is the canonical reference for all OpenClaw-aligned development decisions, gap analysis, and mandatory laws.

| OpenClaw Concept | FlowAgent Implementation | Location |
|------------------|--------------------------|----------|
| **Skill Registry** | `agent_skills` table — DB-driven, hot-reloadable | PostgreSQL |
| **Tool Definition** | OpenAI function-calling JSON format | JSONB |
| **Tool Router** | `agent-execute` — unified dispatcher | Edge Function |
| **Handler Routing** | `edge:`, `module:`, `db:`, `webhook:` prefixes | String convention |
| **Scope Model** | `internal`, `external`, `both` enum | DB enum |
| **Approval Gate** | `requires_approval` boolean → pending_approval status | DB flag |
| **Memory** | `agent_memory` — persistent K-V with categories | PostgreSQL |
| **Soul / Identity** | `agent_memory` entries (keys: `soul`, `identity`) | JSONB |
| **Skill Knowledge** | `instructions` column on `agent_skills` | Text |
| **Objectives** | `agent_objectives` with plan decomposition & priority scoring | PostgreSQL |
| **Plan Decomposition** | `decompose_objective` → AI-generated 3-7 step plans | agent-reason |
| **Plan Execution** | `advance_plan` → chain up to 4 steps per call | agent-reason |
| **Proactive Goals** | `propose_objective` → agent creates its own objectives | agent-reason |
| **Self-Healing** | `runSelfHealing` → auto-disable after 3+ failures | agent-reason |
| **Activity Log** | `agent_activity` — full I/O audit trail | PostgreSQL |
| **Automations** | `agent_automations` — cron/event/signal triggers | PostgreSQL |
| **Signal Ingest** | `signal-ingest` — external webhook/extension signals | Edge Function |
| **Self-Modification** | `soul_update`, `skill_instruct`, `skill_create/update/disable`, `reflect` | Built-in tools |
| **Heartbeat** | `flowpilot-heartbeat` — 7-step autonomous loop | Edge Function |
| **Learning Loop** | `flowpilot-learn` — daily feedback → memory distillation | Edge Function |
| **Multi-Tool Loop** | Up to 8 iterations per heartbeat, 6 per interactive session | Runtime |

---

## 10. FlowWink Replaces Four Products

| Capability | CMS | Chatbot | Marketing | CRM | **FlowWink** |
|-----------|-----|---------|-----------|-----|-------------|
| Visual Page Builder | ✅ | ❌ | ❌ | ❌ | ✅ |
| Autonomous AI Agent | ❌ | ❌ | ❌ | ❌ | ✅ |
| Self-Healing Skills | ❌ | ❌ | ❌ | ❌ | ✅ |
| Plan Decomposition | ❌ | ❌ | ❌ | ❌ | ✅ |
| Proactive Goal Setting | ❌ | ❌ | ❌ | ❌ | ✅ |
| Persistent Memory | ❌ | ❌ | ❌ | ❌ | ✅ |
| Self-Evolving Skills | ❌ | ❌ | ❌ | ❌ | ✅ |
| Lead CRM & Scoring | ❌ | ❌ | ✅ | ✅ | ✅ |
| AI Content Generation | ❌ | ✅ | ❌ | ❌ | ✅ |
| Email Campaigns | ❌ | ❌ | ✅ | ❌ | ✅ |
| Booking System | ❌ | ❌ | ❌ | ❌ | ✅ |
| E-commerce | ✅ | ❌ | ❌ | ❌ | ✅ |
| Knowledge Base | ❌ | ✅ | ❌ | ❌ | ✅ |
| Signal Ingest API | ❌ | ❌ | ❌ | ❌ | ✅ |
| Self-Hostable | Some | ❌ | ❌ | ❌ | ✅ |
| Private LLM | ❌ | ❌ | ❌ | ❌ | ✅ |
| Open Source | Some | ❌ | ❌ | ❌ | ✅ |

---

## 11. Maturity Roadmap

| Capability | Status |
|-----------|--------|
| Skill Engine | ✅ 100% |
| Persistent Memory | ✅ 100% |
| Objectives & Plan Decomposition | ✅ 100% |
| Priority Scoring | ✅ 100% |
| Self-Healing | ✅ 100% |
| Signal Automations | ✅ 95% |
| Signal Ingest (External) | ✅ 90% |
| Self-Evolution (soul, skill_instruct, propose_objective) | ✅ 90% |
| Proactive Goal Setting | ✅ 85% |
| Multi-Agent Orchestration (A2A) | 🔧 40% |

---

*Stop managing. Start directing. — FlowAgent operates your entire digital presence so you can focus on what matters.*

*This document is the definitive reference for the FlowAgent agentic framework. Update it when new skills, handlers, or architectural changes are introduced.*
