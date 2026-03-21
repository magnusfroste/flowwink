# FlowAgent — Autonomous Agentic Intelligence Engine

> **Your website runs itself.** FlowAgent is not a chatbot. It is an autonomous AI operator that writes your content, qualifies your leads, runs your campaigns, orchestrates multi-agent workflows, and learns from every interaction. You set the objectives. It does the rest.

> **Version:** 3.0 | **Updated:** March 2026 | **Skills:** 73 registered + 32 built-in tools | **Autonomy:** 10/10

---

## 1. What FlowAgent Is

FlowAgent is the **heart and brain** of FlowWink — an autonomous digital operator inspired by the OpenClaw agentic framework. It features persistent pgvector memory, self-evolving skills, goal-driven objectives with AI plan decomposition, self-healing, Workflow DAGs, Agent-to-Agent (A2A) delegation, Skill Packs, and a reactive automation layer. It sits above the entire platform — content, CRM, bookings, newsletters, analytics, knowledge base, e-commerce, consultant profiles — and orchestrates them continuously, with or without a human present.

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
│  HEARTBEAT  │ ← Triggers on admin-configured schedule (default: twice daily)
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
│  │              32 Built-in Tools (9 groups)                 │   │
│  │                                                          │   │
│  │  memory: memory_write, memory_read                       │   │
│  │  objectives: objective_update_progress, objective_complete│   │
│  │  self-mod: skill_create/update/list/disable/instruct     │   │
│  │  reflect: reflect (7-day analysis + auto-persist)        │   │
│  │  soul: soul_update (purpose/values/tone/philosophy)      │   │
│  │  planning: decompose_objective, advance_plan,            │   │
│  │            propose_objective                              │   │
│  │  workflows: workflow_create, workflow_execute,            │   │
│  │             workflow_list                                 │   │
│  │  delegation: delegate_task                                │   │
│  │  skill-packs: skill_pack_list, skill_pack_install         │   │
│  │  automations: execute_automation                          │   │
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
│  (SSE streaming) │ │ heartbeat        │ │  (daily, configurable)│
│  Interactive     │ │ (12h, config.)   │ │  Feedback analysis  │
└──────────────────┘ └──────────────────┘ └─────────────────────┘
                               │
┌──────────────────────────────┼──────────────────────────────────┐
│                       SKILL ENGINE                               │
│                                                                  │
│  ┌──────────────┐    ┌──────────────────┐    ┌───────────────┐  │
│  │ agent_skills  │───▸│  agent-execute   │───▸│ agent_activity│  │
│  │  (73 skills)  │    │  (router)        │    │ (audit log)   │  │
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
| `agent-operate` | SSE streaming | memory, objectives, self-mod, reflect, soul, workflows, delegation, skill-packs | Interactive admin assistant |
| `flowpilot-heartbeat` | Non-streaming | memory, objectives, reflect, planning, automations-exec, workflows | Autonomous 12h loop |
| `flowpilot-learn` | Non-streaming | memory, reflect | Daily feedback distillation |

---

## 4. The Seven Core Capabilities

### 4.1 Skill Engine (73 Registered Skills + 32 Built-in Tools)

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
| `a2a:` | Agent-to-Agent peer | `a2a:SoundSpace` |

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

The `flowpilot-heartbeat` Edge Function drives autonomous operation. Frequency is fully configurable via the Autonomy Schedule in Engine Room (default: twice daily at 00:00 and 12:00 local time):

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

## 5. Complete Skill Inventory — VERIFIED FROM DATABASE

> **Source of truth**: `SELECT name, handler, scope, category FROM agent_skills ORDER BY category, name;`
> **Last verified**: 2026-03-19 | **Total**: 73 registered skills

### Content Skills (21 skills)

| # | Skill | Handler | Scope | Approval | Status |
|---|-------|---------|-------|----------|--------|
| 1 | `browse_blog` | `module:blog` | external | ❌ | ✅ Verified |
| 2 | `create_campaign` | `edge:generate-content-proposal` | internal | ❌ | ✅ Verified |
| 3 | `create_page_block` | `edge:copilot-action` | internal | ❌ | ✅ Verified |
| 4 | `extract_pdf_text` | `edge:extract-pdf-text` | internal | ❌ | ✅ Verified |
| 5 | `generate_content_proposal` | `edge:generate-content-proposal` | internal | ✅ | ✅ Verified |
| 6 | `generate_site_from_identity` | `edge:generate-site-from-identity` | both | ✅ | ✅ Verified |
| 7 | `generate_social_post` | `edge:generate-social-post` | internal | ❌ | ✅ Verified |
| 8 | `manage_blog_categories` | `module:blog` | internal | ❌ | ✅ Verified |
| 9 | `manage_blog_posts` | `module:blog` | internal | ❌ | ✅ Verified |
| 10 | `manage_consultant_profile` | `module:resume` | internal | ❌ | ✅ Verified |
| 11 | `manage_global_blocks` | `module:globalElements` | internal | ❌ | ✅ Verified |
| 12 | `manage_kb_article` | `module:kb` | internal | ❌ | ✅ Verified |
| 13 | `manage_page` | `module:pages` | internal | ❌ | ✅ Verified |
| 14 | `manage_page_blocks` | `module:pages` | internal | ❌ | ✅ Verified |
| 15 | `manage_product` | `module:products` | internal | ❌ | ✅ Verified |
| 16 | `match_consultant` | `module:resume` | both | ❌ | ✅ Verified |
| 17 | `media_browse` | `module:media` | internal | ❌ | ✅ Verified |
| 18 | `migrate_url` | `edge:copilot-action` | internal | ❌ | ✅ Verified |
| 19 | `publish_scheduled_content` | `edge:publish-scheduled-pages` | internal | ❌ | ✅ Verified |
| 20 | `research_content` | `edge:research-content` | internal | ❌ | ✅ Verified |
| 21 | `write_blog_post` | `module:blog` | internal | ❌ | ✅ Verified |

### CRM Skills (23 skills)

| # | Skill | Handler | Scope | Approval | Status |
|---|-------|---------|-------|----------|--------|
| 1 | `add_lead` | `module:crm` | both | ❌ | ✅ Verified |
| 2 | `book_appointment` | `module:booking` | both | ❌ | ✅ Verified |
| 3 | `browse_products` | `module:products` | external | ❌ | ✅ Verified |
| 4 | `browse_services` | `module:booking` | external | ❌ | ✅ Verified |
| 5 | `check_availability` | `module:booking` | external | ❌ | ✅ Verified |
| 6 | `check_order` | `module:orders` | external | ❌ | ✅ Verified |
| 7 | `contact_finder` | `edge:contact-finder` | internal | ❌ | ✅ Verified |
| 8 | `enrich_company` | `edge:enrich-company` | internal | ❌ | ✅ Verified |
| 9 | `lead_nurture_sequence` | `module:newsletter` | internal | ❌ | ✅ Verified |
| 10 | `lookup_order` | `module:orders` | both | ❌ | ✅ Verified |
| 11 | `manage_booking_availability` | `module:booking` | internal | ❌ | ✅ Verified |
| 12 | `manage_bookings` | `module:booking` | internal | ❌ | ✅ Verified |
| 13 | `manage_company` | `module:companies` | internal | ❌ | ✅ Verified |
| 14 | `manage_deal` | `module:deals` | internal | ❌ | ✅ Verified |
| 15 | `manage_form_submissions` | `module:forms` | internal | ❌ | ✅ Verified |
| 16 | `manage_inventory` | `module:products` | internal | ❌ | ✅ Verified |
| 17 | `manage_leads` | `module:crm` | internal | ❌ | ✅ Verified |
| 18 | `manage_orders` | `module:orders` | internal | ❌ | ✅ Verified |
| 19 | `prospect_fit_analysis` | `edge:prospect-fit-analysis` | internal | ❌ | ✅ Verified |
| 20 | `prospect_research` | `edge:prospect-research` | internal | ❌ | ✅ Verified |
| 21 | `qualify_lead` | `edge:qualify-lead` | internal | ❌ | ✅ Verified |
| 22 | `sales_profile_setup` | `edge:sales-profile-setup` | internal | ❌ | ✅ Verified |
| 23 | `manage_site_settings` | `db:site_settings` | internal | ❌ | ✅ Verified |

### Communication Skills (8 skills)

| # | Skill | Handler | Scope | Approval | Status |
|---|-------|---------|-------|----------|--------|
| 1 | `execute_newsletter_send` | `edge:newsletter-send` | internal | ✅ | ✅ Verified |
| 2 | `manage_newsletter_subscribers` | `module:newsletter` | internal | ❌ | ✅ Verified |
| 3 | `manage_webinar` | `module:webinars` | internal | ❌ | ✅ Verified |
| 4 | `newsletter_subscribe` | `edge:newsletter-subscribe` | external | ❌ | ✅ Verified |
| 5 | `register_webinar` | `module:webinars` | external | ❌ | ✅ Verified |
| 6 | `scan_gmail_inbox` | `edge:gmail-inbox-scan` | internal | ❌ | ✅ Verified |
| 7 | `send_newsletter` | `module:newsletter` | internal | ✅ | ✅ Verified |
| 8 | `generate_social_post` | `edge:generate-social-post` | internal | ❌ | ✅ Verified |

### Automation Skills (9 skills)

| # | Skill | Handler | Scope | Approval | Status |
|---|-------|---------|-------|----------|--------|
| 1 | `a2a_request` | `a2a:SoundSpace` | internal | ❌ | ✅ Verified |
| 2 | `create_automation` | `module:automations` | internal | ❌ | ✅ Verified |
| 3 | `create_objective` | `module:objectives` | internal | ❌ | ✅ Verified |
| 4 | `manage_automations` | `module:automations` | internal | ❌ | ✅ Verified |
| 5 | `memory_read` | `builtin:memory_read` | internal | ❌ | ✅ Verified |
| 6 | `memory_write` | `builtin:memory_write` | internal | ❌ | ✅ Verified |
| 7 | `process_signal` | `edge:signal-ingest` | internal | ❌ | ✅ Verified |
| 8 | `remove_duplicate_resumes` | `module:cleanup_duplicates` | internal | ✅ | ⚠️ Disabled |
| 9 | `update_settings` | `db:site_settings` | internal | ✅ | ✅ Verified |

### Search & Browser Skills (5 skills)

| # | Skill | Handler | Scope | Approval | Status |
|---|-------|---------|-------|----------|--------|
| 1 | `browser_fetch` | `edge:browser-fetch` | internal | ❌ | ✅ Verified |
| 2 | `scrape_url` | `edge:web-scrape` | internal | ❌ | ✅ Verified |
| 3 | `search_web` | `edge:web-search` | both | ❌ | ✅ Verified |
| 4 | `web_scrape` | `edge:web-scrape` | both | ❌ | ✅ Verified |
| 5 | `web_search` | `edge:web-search` | both | ❌ | ✅ Verified |

### Analytics Skills (8 skills)

| # | Skill | Handler | Scope | Approval | Status |
|---|-------|---------|-------|----------|--------|
| 1 | `analyze_analytics` | `db:page_views` | internal | ❌ | ✅ Verified |
| 2 | `analyze_chat_feedback` | `module:analytics` | internal | ❌ | ✅ Verified |
| 3 | `competitor_monitor` | `edge:competitor-monitor` | internal | ❌ | ✅ Verified |
| 4 | `competitor_watch` | `edge:firecrawl-scrape` | internal | ❌ | ✅ Verified |
| 5 | `kb_gap_analysis` | `module:analytics` | internal | ❌ | ✅ Verified |
| 6 | `learn_from_data` | `edge:flowpilot-learn` | internal | ❌ | ✅ Verified |
| 7 | `seo_audit_page` | `module:analytics` | internal | ❌ | ✅ Verified |
| 8 | `weekly_business_digest` | `edge:business-digest` | internal | ❌ | ✅ Verified |

### Built-in Tools (32 tools in agent-reason — NOT in agent_skills table)

These are hardcoded in `agent-reason.ts` and not stored in the database:

| Group | Tool | Purpose |
|-------|------|---------|
| **Memory** | `memory_write` | Save key-value to persistent memory |
| **Memory** | `memory_read` | Search memory by key/category |
| **Objectives** | `objective_update_progress` | Update objective progress JSON |
| **Objectives** | `objective_complete` | Mark objective as completed |
| **Self-Mod** | `skill_create` | Register new skill at runtime |
| **Self-Mod** | `skill_update` | Modify existing skill definition |
| **Self-Mod** | `skill_list` | List all registered skills |
| **Self-Mod** | `skill_disable` | Disable a skill |
| **Self-Mod** | `skill_instruct` | Write instructions to a skill |
| **Reflect** | `reflect` | 7-day performance analysis |
| **Soul** | `soul_update` | Evolve personality/values/tone |
| **Planning** | `decompose_objective` | AI plan decomposition (3-7 steps) |
| **Planning** | `advance_plan` | Execute next plan steps |
| **Planning** | `propose_objective` | Proactively create objectives |
| **Workflows** | `workflow_create` | Define multi-step DAG workflow |
| **Workflows** | `workflow_execute` | Run a workflow with input |
| **Workflows** | `workflow_list` | List all workflows |
| **Delegation** | `delegate_task` | Route to specialist sub-agent |
| **Skill Packs** | `skill_pack_list` | List available skill packs |
| **Skill Packs** | `skill_pack_install` | Install a pack of skills |
| **Automations** | `execute_automation` | Trigger an automation manually |

---

## 6. Autonomy Schedule (Admin-Configurable)

Five autonomous cron jobs are registered during bootstrap via `register_flowpilot_cron`:

| Job | Default Schedule | Configurable | Purpose |
|-----|-----------------|--------------|---------|
| `flowpilot-heartbeat` | Every 12h | ✅ Frequency (6h/12h/24h) | Objective management, self-healing, reflection |
| `flowpilot-daily-briefing` | 07:00 local | ✅ Hour + timezone | Morning business summary |
| `flowpilot-learn` | 03:00 local | ✅ Hour + timezone | Nightly feedback distillation |
| `automation-dispatcher` | Every minute | ❌ Fixed | Execute due cron automations |
| `publish-scheduled-pages` | Every minute | ❌ Fixed | Publish scheduled content |

**Admin UI**: Site Settings → Autonomy tab. Local timezone selection with automatic UTC conversion.

---

## 7. Database Triggers (Event-Driven)

Active Postgres triggers that fire events + signals via `pg_net`:

| Trigger | Table | Events Emitted |
|---------|-------|---------------|
| `on_lead_created` | `leads` | `lead_created` |
| `on_lead_score_changed` | `leads` | `lead_score_changed` |
| `on_blog_published` | `blog_posts` | `blog_published` |
| `on_booking_created` | `bookings` | `booking_created` |
| `on_form_submitted` | `form_submissions` | `form_submitted` |
| `on_order_created` | `orders` | `order_created` |

These triggers enable the signal automation layer — e.g., "when a lead is created, auto-qualify."

---

## 8. Workflow DAGs

Multi-step workflow chains stored in `agent_workflows` table (3 seed workflows):

| Workflow | Trigger | Steps |
|----------|---------|-------|
| Content Publishing Pipeline | manual | research → write → publish |
| Lead Nurture Flow | signal | qualify → enrich → create deal |
| Weekly Business Digest | cron | analyze → digest → brief |

**Built-in tools**: `workflow_create`, `workflow_execute`, `workflow_list`
**Features**: Step dependencies (`depends_on`), conditional execution, data passing between steps (`{{s1.output}}`), error handling per step

---

## 9. Agent-to-Agent (A2A) Delegation

| Mechanism | Description |
|-----------|-------------|
| **Built-in sub-agents** | `delegate_task` routes to seo/content/sales/analytics/email specialists |
| **External peers** | `a2a_peers` table with token-authenticated communication |
| **A2A skill** | `a2a_request` handler (`a2a:SoundSpace`) for external agent calls |
| **Activity tracking** | All delegations logged in `a2a_activity` |

---

## 10. Skill Packs

Bundled capability sets in `agent_skill_packs` table (3 seed packs, not yet installed):

| Pack | Status | Skills Included |
|------|--------|----------------|
| **E-Commerce Pack** | ⬜ Not installed | manage_product, lookup_order, inventory alerts |
| **Content Marketing Pack** | ⬜ Not installed | research_content, write_blog_post, generate_content_proposal, send_newsletter |
| **CRM Nurture Pack** | ⬜ Not installed | add_lead, qualify_lead, manage_deal, enrich_company |

**Tools**: `skill_pack_list`, `skill_pack_install`

---

## 11. Approval Gating & Human-in-the-Loop

1. Agent calls skill → `agent-execute` intercepts
2. If `requires_approval`: activity logged with status `pending_approval`, `202` returned
3. Admin sees pending action in Activity Feed
4. Admin approves → original args re-executed automatically
5. Result returned to conversation (if still active)

**Skills requiring approval** (verified from DB):
- `generate_content_proposal` — Multi-channel content generation
- `generate_site_from_identity` — Generate entire site from business identity
- `execute_newsletter_send` — Send newsletter to subscribers
- `send_newsletter` — Draft/schedule newsletter
- `remove_duplicate_resumes` — Destructive cleanup
- `update_settings` — Site settings modification

---

## 12. Content as Knowledge — The Public Chat

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

## 13. Edge Functions Reference (76 total)

### Agent Core
| Function | Purpose |
|----------|---------|
| `agent-reason` | **Shared module** — NOT a serve() handler. AI config, soul, memory, 32 built-in tools, reasoning loop. |
| `agent-execute` | Unified skill executor — handler routing, scope validation, approval gating, activity logging |
| `agent-operate` | Interactive SSE streaming wrapper around agent-reason |

### Autonomous Loop
| Function | Purpose |
|----------|---------|
| `flowpilot-heartbeat` | 7-step autonomous loop (12h configurable) |
| `flowpilot-learn` | Daily feedback distillation |
| `flowpilot-briefing` | Morning business briefing |
| `automation-dispatcher` | Cron automation executor |
| `signal-dispatcher` | Signal condition evaluator |
| `signal-ingest` | Token-authenticated external signal endpoint |
| `update-autonomy-cron` | Admin schedule configuration |
| `setup-flowpilot` | Bootstrap — seeds skills, soul, identity |

### Content & CMS
| Function | Purpose |
|----------|---------|
| `chat-completion` | Public chat with knowledge base + skills |
| `copilot-action` | Page migration, block creation |
| `get-page` | Page serving with caching |
| `render-page` | Server-side page rendering |
| `publish-scheduled-pages` | Scheduled content publisher |
| `generate-text` | AI text generation |
| `research-content` | Deep topic research |
| `generate-content-proposal` | Multi-channel content pipeline |
| `generate-social-post` | Social media post generation |
| `generate-site-from-identity` | Full site generation from business identity |
| `landing-page-compose` | AI landing page composition |
| `blog-rss` | RSS feed generator |
| `sitemap-xml` | Sitemap generator |
| `llms-txt` | LLM-optimized text export |
| `content-api` | REST/GraphQL/Markdown Content API |

### CRM & Sales
| Function | Purpose |
|----------|---------|
| `qualify-lead` | AI lead scoring + summary |
| `enrich-company` | Domain-based company enrichment |
| `contact-finder` | Contact discovery (Hunter.io) |
| `prospect-research` | Full company research pipeline |
| `prospect-fit-analysis` | Fit scoring + intro letter |
| `sales-profile-setup` | Sales profile configuration |
| `enrich-company-profile` | Business identity enrichment |
| `competitor-monitor` | Competitor tracking |

### Communication
| Function | Purpose |
|----------|---------|
| `newsletter-send` | Send newsletter via Resend |
| `newsletter-subscribe` | Public subscription endpoint |
| `newsletter-track` | Open/click tracking |
| `newsletter-link` | Link tracking redirects |
| `newsletter-export` | GDPR data export |
| `newsletter-gdpr` | GDPR compliance tools |
| `send-contact-email` | Contact form emails |
| `send-booking-confirmation` | Booking confirmation emails |
| `send-order-confirmation` | Order confirmation emails |
| `gmail-inbox-scan` | Gmail business signal scan |
| `gmail-oauth-callback` | Gmail OAuth handler |
| `support-router` | Live support routing |

### Commerce
| Function | Purpose |
|----------|---------|
| `create-checkout` | Stripe checkout session |
| `stripe-webhook` | Stripe event handler |

### Search & Browser
| Function | Purpose |
|----------|---------|
| `web-search` | Web search (Jina free / Firecrawl paid) |
| `web-scrape` | URL scraping |
| `browser-fetch` | Chrome Extension relay for walled gardens |
| `scrape-url` | URL content extraction |
| `unsplash-search` | Stock photo search |
| `firecrawl-map` | Site mapping |
| `firecrawl-search` | Full-text search |

### Analytics & Intelligence
| Function | Purpose |
|----------|---------|
| `business-digest` | Weekly cross-module business summary |
| `track-page-view` | Page view tracking |
| `analyze-brand` | Brand analysis |

### System
| Function | Purpose |
|----------|---------|
| `setup-database` | Database bootstrap |
| `check-secrets` | Integration status checker |
| `send-webhook` | Outbound webhooks + event dispatch |
| `invalidate-cache` | Page cache invalidation |
| `process-image` | Image optimization (WebP) |
| `fetch-image` | Remote image fetching |
| `test-ai-connection` | AI provider connectivity test |
| `create-user` | User creation |
| `parse-resume` | Resume PDF parsing |
| `resume-match` | AI consultant matching |
| `extract-pdf-text` | PDF text extraction |
| `update-kb-feedback` | KB article feedback tracking |
| `run-autonomy-tests` | Autonomy conformance suite |
| `a2a-ingest` | A2A peer communication handler |

### Growth
| Function | Purpose |
|----------|---------|
| `ad-campaign-create` | Ad campaign creation |
| `ad-creative-generate` | AI ad creative generation |
| `ad-optimize` | Campaign optimization |
| `ad-performance-check` | Performance monitoring |
| `migrate-page` | Page migration from URL |

---

## 14. Frontend Admin Pages (53 pages)

| Page | Route | Module |
|------|-------|--------|
| AdminDashboard | `/admin` | Core |
| PagesListPage | `/admin/pages` | Pages |
| PageEditorPage | `/admin/pages/:id` | Pages |
| NewPagePage | `/admin/pages/new` | Pages |
| BlogPostsPage | `/admin/blog` | Blog |
| BlogPostEditorPage | `/admin/blog/:id` | Blog |
| BlogCategoriesPage | `/admin/blog/categories` | Blog |
| BlogTagsPage | `/admin/blog/tags` | Blog |
| BlogSettingsPage | `/admin/blog/settings` | Blog |
| KnowledgeBasePage | `/admin/knowledge-base` | KB |
| KbArticleEditorPage | `/admin/knowledge-base/:id` | KB |
| NewsletterPage | `/admin/newsletter` | Newsletter |
| LeadsPage | `/admin/contacts` | CRM |
| LeadDetailPage | `/admin/contacts/:id` | CRM |
| CompaniesPage | `/admin/companies` | Companies |
| CompanyDetailPage | `/admin/companies/:id` | Companies |
| DealsPage | `/admin/deals` | Deals |
| DealDetailPage | `/admin/deals/:id` | Deals |
| ProductsPage | `/admin/products` | Products |
| OrdersPage | `/admin/orders` | Orders |
| BookingsPage | `/admin/bookings` | Bookings |
| BookingServicesPage | `/admin/bookings/services` | Bookings |
| BookingAvailabilityPage | `/admin/bookings/availability` | Bookings |
| FormSubmissionsPage | `/admin/forms` | Forms |
| MediaLibraryPage | `/admin/media` | Media |
| GlobalBlocksPage | `/admin/global-blocks` | Global Elements |
| ConsultantProfilesPage | `/admin/resume` | Resume |
| WebinarsPage | `/admin/webinars` | Webinars |
| ContentApiPage | `/admin/content-api` | Content Hub |
| SalesIntelligencePage | `/admin/sales-intelligence` | Sales Intel |
| CompanyInsightsPage | `/admin/company-insights` | Business Identity |
| AnalyticsDashboardPage | `/admin/analytics` | Analytics |
| GrowthDashboardPage | `/admin/growth` | Growth |
| ContentCampaignsPage | `/admin/content-campaigns` | Growth |
| CopilotPage | `/admin/copilot` | FlowAgent |
| SkillHubPage | `/admin/skills` | FlowAgent |
| FederationPage | `/admin/federation` | A2A |
| LiveSupportPage | `/admin/live-support` | Support |
| ChatSettingsPage | `/admin/chat-settings` | Chat |
| SiteSettingsPage | `/admin/settings` | System |
| IntegrationsStatusPage | `/admin/integrations` | System |
| ModulesPage | `/admin/modules` | System |
| UsersPage | `/admin/users` | System |
| WebhooksPage | `/admin/webhooks` | System |
| ProfilePage | `/admin/profile` | System |
| BrandingSettingsPage | `/admin/branding` | System |
| DeveloperToolsPage | `/admin/developer-tools` | System |
| TemplateGalleryPage | `/admin/templates` | System |
| TemplateExportPage | `/admin/template-export` | System |
| TemplateLivePreviewPage | `/admin/template-preview` | System |
| QuickStartPage | `/admin/quick-start` | Onboarding |
| TrashPage | `/admin/trash` | System |
| AutonomyTestSuitePage | `/admin/autonomy-tests` | Testing |

---

## 15. Database Tables (Agent Layer)

| Table | Purpose |
|-------|---------|
| `agent_skills` | Skill registry — 73 skills (name, handler, scope, instructions, tool_definition) |
| `agent_memory` | Persistent K-V memory incl. soul & identity (pgvector-ready) |
| `agent_objectives` | Goal tracking with plan decomposition, priority scoring, locking |
| `agent_activity` | Full execution audit trail with I/O, timing, status |
| `agent_automations` | Cron/event/signal trigger definitions with run tracking |
| `agent_objective_activities` | Join table linking objectives to activities |
| `agent_workflows` | Workflow DAG definitions (3 seed workflows) |
| `agent_skill_packs` | Skill bundle definitions (3 seed packs) |
| `a2a_peers` | External agent peer registry |
| `a2a_activity` | A2A communication audit trail |
| `flowpilot_briefings` | Morning briefing archive |
| `audit_logs` | General system audit trail |

---

## 16. OpenClaw Architecture Compliance

> **⚠️ Full architecture law documented in [`docs/OPENCLAW-LAW.md`](./OPENCLAW-LAW.md).**

| OpenClaw Concept | FlowAgent Implementation | Status |
|------------------|--------------------------|--------|
| Skill Registry | `agent_skills` table — 73 DB-driven, hot-reloadable | ✅ |
| Tool Definition | OpenAI function-calling JSON format | ✅ |
| Tool Router | `agent-execute` — unified dispatcher | ✅ |
| Handler Routing | `edge:`, `module:`, `db:`, `webhook:`, `a2a:` | ✅ |
| Scope Model | `internal`, `external`, `both` enum | ✅ |
| Approval Gate | `requires_approval` → pending_approval | ✅ |
| Memory | `agent_memory` — persistent K-V with categories | ✅ |
| Soul / Identity | `agent_memory` entries (soul + identity keys) | ✅ |
| Skill Knowledge | `instructions` column on `agent_skills` | ✅ |
| Objectives | `agent_objectives` with plan decomposition | ✅ |
| Plan Decomposition | `decompose_objective` → 3-7 step plans | ✅ |
| Plan Execution | `advance_plan` → chain up to 4 steps | ✅ |
| Proactive Goals | `propose_objective` → self-created objectives | ✅ |
| Self-Healing | `runSelfHealing` → auto-disable after 3+ failures | ✅ |
| Activity Log | `agent_activity` — full I/O audit trail | ✅ |
| Automations | `agent_automations` — cron/event/signal | ✅ |
| Signal Ingest | `signal-ingest` — external triggers | ✅ |
| Self-Modification | soul_update, skill_instruct, skill_create/update/disable | ✅ |
| Workflow DAGs | `workflow_create/execute/list` — multi-step chains | ✅ |
| A2A Delegation | `delegate_task` + `a2a_peers` table | ✅ |
| Skill Packs | `skill_pack_list/install` — bundle install | ✅ |
| Heartbeat | `flowpilot-heartbeat` — 7-step loop | ✅ |
| Learning Loop | `flowpilot-learn` — daily distillation | ✅ |
| Multi-Tool Loop | Up to 8 iterations (heartbeat), 6 (interactive) | ✅ |
| Autonomy Schedule | Admin-configurable timezone + frequency | ✅ |
| DB Triggers | 6 event triggers for reactive automations | ✅ |
| Auto-Module Activation | Skills auto-enable modules they need | ✅ |

---

## 17. Known Gaps & Future Work

| Area | Gap | Priority |
|------|-----|----------|
| **Duplicate search skills** | `search_web` + `web_search` and `scrape_url` + `web_scrape` are duplicates | 🟡 Low |
| **Skill Packs** | 3 packs seeded but none installed — no auto-install on template setup | 🟡 Medium |
| **Workflow execution** | DAG workflows exist in DB but no cron/event trigger wiring yet | 🟡 Medium |
| **A2A communication** | Single peer (SoundSpace) registered; no real external agents connected | 🟡 Low |
| **Briefing delivery** | Briefings stored in DB but no email delivery to admin | 🟡 Medium |
| **pgvector embeddings** | `embedding` column exists on `agent_memory` but not populated | 🟡 Medium |
| **Token budget enforcement** | Token tracking exists but no hard budget limits per day/month | 🟢 Low |
| **Growth module** | Ad campaign edge functions exist but no full end-to-end flow | 🟡 Medium |

---

*Stop managing. Start directing. — FlowAgent operates your entire digital presence so you can focus on what matters.*

*This document is the definitive, DB-verified reference for the FlowAgent agentic framework. Update it when new skills, handlers, or architectural changes are introduced.*
