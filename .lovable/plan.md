# FlowPilot Agentic Architecture

## Phase 1: Skill Registry + Unified Tool Engine ✅ DONE

### Completed
- **Database tables**: `agent_skills`, `agent_memory`, `agent_activity` with RLS policies
- **Enums**: `agent_scope`, `agent_skill_category`, `agent_activity_status`, `agent_type`, `agent_memory_category`
- **11 built-in skills** seeded: migrate_url, create_page_block, write_blog_post, send_newsletter, create_campaign, add_lead, search_web, book_appointment, check_order, update_settings, analyze_analytics
- **`agent-execute` edge function**: Unified skill executor with scope validation, approval checks, handler routing (edge/module/db/webhook), and activity logging
- **TypeScript types**: `src/types/agent.ts` with full type coverage

### Verified
- Direct execution works (analyze_analytics returns real page view data)
- Scope validation works (internal skills blocked from chat agent)
- Approval gating works (send_newsletter returns 202 pending_approval)

## Phase 2: FlowPilot "Operate" Mode ✅ DONE

### Completed
- Mode switcher (Operate | Migrate) in CopilotPage header using Tabs
- OperateChat component — chat with quick actions, skill badges, and inline results
- ActivityFeed sidebar — shows recent actions with status, duration, approve button
- `agent-operate` edge function — AI router that picks skills via tool calling, executes via agent-execute, summarizes results
- `useAgentOperate` hook — manages messages, skills, activity, and approval flow

### TODO (refinement)
- [ ] Refactor copilot-action to load tool definitions from agent_skills table

## Phase 2.5: Active Memory ✅ DONE

### Completed
- **agent-operate** loads all `agent_memory` entries into system prompt before each AI call
- **memory_write** built-in tool — FlowPilot saves preferences, facts, context to DB
- **memory_read** built-in tool — FlowPilot searches memory by key/category
- Memory tools handled locally in agent-operate (no round-trip to agent-execute)
- Two new skills registered in `agent_skills` table (memory_write, memory_read)
- FlowPilot proactively saves useful info when it learns something new

## Phase 3.5: Skill Hub Admin UI ✅ DONE

### Completed
- **SkillHubPage** (`/admin/skills`) with Skills, Activity, and Objectives (placeholder) tabs
- **SkillCard** — card grid with inline enable/disable toggle, scope/category/handler badges
- **SkillEditorSheet** — full CRUD sheet with JSON tool definition editor (CodeMirror)
- **ActivityTable** — filterable activity log with expand for input/output JSON, approve/reject
- **useSkillHub** hook — CRUD for skills, activity queries, approval mutations
- **Sidebar** — "Skill Hub" added to Main group with Bot icon

## Phase 3: Public Chat Gets Skills ✅ DONE

### Completed
- **chat-completion** loads external/both skills from `agent_skills` table as OpenAI-compatible tools
- Skills are routed through `agent-execute` edge function (scope validation, approval gating, activity logging)
- `agentSkillNames` map tracks which tool calls are agent skills vs built-in tools
- System prompt dynamically extended with skill usage instructions
- Works for both OpenAI and local AI providers (when tool calling is supported)
- Approval-gated skills return friendly "pending approval" messages to visitors

## Phase 4: Automation Layer ✅ DONE

### Completed
- **agent_automations table** with cron/event/signal trigger types and RLS policies
- **AutomationsPanel** — full CRUD UI with trigger-type badges, skill linking, JSON config editor
- **ObjectivesPanel** — full CRUD UI with status management, progress tracking, constraint/criteria JSON
- **FlowPilot skills**: `create_objective` and `create_automation` registered in agent_skills
- **agent-execute** updated with `module:objectives` and `module:automations` handlers
- **5 seed automations** and **4 seed objectives** for onboarding

### Runtime
- **`automation-dispatcher` edge function** — reads due cron automations, executes via agent-execute, updates run metadata
- **pg_cron** runs dispatcher every minute via pg_net HTTP POST
- Simple cron parser calculates `next_run_at` for common patterns (*/N, daily, weekly)

- **Event-trigger dispatch** — `send-webhook` now also checks `agent_automations` with matching `event_name` and executes their skills via `agent-execute`, merging event data into arguments
- **Signal-trigger dispatch** — `signal-dispatcher` edge function evaluates dynamic conditions (score thresholds, status changes, field matches, compound logic) against incoming data

### Signal Integration Points
- `qualify-lead` → emits `lead_score_updated` and `lead_status_changed` signals
- `send-webhook` → emits every webhook event as a signal (e.g. `form.submitted`, `booking.submitted`)
- Signal conditions supported: `score_threshold`, `count_threshold`, `status_change`, `field_match`, `compound` (all/any)

## Phase 5: Autonomy Unlocks ✅ DONE

### Completed
- **Multi-tool loop** — up to 6 iterations, all tool_calls processed in parallel per round
- **Approval re-execution** — approved pending actions auto-re-execute with original args
- **Conversation persistence** — sessions saved to chat_conversations/chat_messages
- **Markdown rendering** — assistant messages rendered with react-markdown
- **Multi-skill result tracking** — Response format supports `skill_results[]` array

## Phase 6: Agent Self-Improvement ✅ DONE

### Completed
- **skill_create/update/list/disable** — FlowPilot can manage its own skill registry
- **automation_create/list** — Create and view automations
- **reflect** — Introspection: 7-day activity analysis, error rates, improvement suggestions

## Phase 7: Weekly Business Digest ✅ DONE

### Completed
- **`business-digest` edge function** — queries 7-day data across all modules (page views, leads, bookings, orders, blog posts, newsletters, chat conversations, form submissions, subscribers)
- **Structured + markdown output** — metrics table, top pages, hot leads, device/referrer breakdown, actionable callouts
- **`weekly_business_digest` skill** — registered in agent_skills with `edge:business-digest` handler
- **Cron automation** — "Weekly Business Digest" scheduled Monday 9:00 AM (disabled by default for safety)
- **Actionable callouts** — hot leads needing follow-up, pending bookings, unpublished drafts, low sentiment alerts

## Phase 8: Sales Intelligence Pipeline ✅ DONE

### Completed
- **`prospect-research` edge function** — Replaces n8n ScoutOut workflows (MBA 1-3). Uses Jina Reader (website scraping), Jina Search (market context), Hunter Domain Search (contact discovery), and AI (OpenAI/Gemini) to generate qualifying Q&A. Upserts to `companies` table and creates `leads` entries.
- **`prospect-fit-analysis` edge function** — Replaces n8n ScoutOut workflow 4 + ScoutIn. Loads company profile from `site_settings`, evaluates fit score (0-100), maps prospect problems to services, generates personalized introduction letter + email subject. Uses Hunter Email Finder for decision-maker lookup.
- **Hunter.io integration** — New `HUNTER_API_KEY` secret, added to `check-secrets`, `useIntegrationStatus`, `useIntegrations` (category: Sales Intelligence), and `configure-secrets.sh`.
- **2 new agent skills** — `prospect_research` (edge:prospect-research) and `prospect_fit_analysis` (edge:prospect-fit-analysis) registered in `agent_skills` table, category: crm, scope: internal.
- **Company Profile** — Uses `site_settings` key `company_profile` to store business context (about_us, services, delivered_value, clients, etc.) for AI prompts.
- **Data flow**: Research → `companies` + `leads` tables; Fit score → `leads.score`; Intro letters → `agent_memory`; Research Q&A → `agent_memory`.

### External APIs (No n8n dependency)
- **Jina Reader**: `https://r.jina.ai/{url}` — free, no key
- **Jina Search**: `https://s.jina.ai/{query}` — free, no key
- **Hunter Domain Search**: `https://api.hunter.io/v2/domain-search`
- **Hunter Email Finder**: `https://api.hunter.io/v2/email-finder`

### FlowPilot Usage
```
"Research Acme Corp" → prospect_research skill
"Analyze fit for Acme Corp and draft an intro" → prospect_fit_analysis skill
"Research Acme Corp and prepare an introduction if fit score > 70" → chained execution
```

## Phase 9: Autonomous Wiring ✅ DONE

### Completed
- **Cron scheduling fix** — dispatcher picks up NULL `next_run_at` automations and initializes them
- **DB triggers** — Postgres triggers on `leads`, `blog_posts`, `bookings`, `form_submissions`, `orders` fire events + signals via `pg_net`
- **Objective progress auto-tracking** — `agent-execute` links successful skills to matching objectives

## Phase 9.5: Autonomy Cold Start Fix ✅ DONE

### Completed
- **Auto-register ALL autonomy cron jobs** — `setup-flowpilot` calls `register_flowpilot_cron` DB function which registers all 5 jobs:
  - `flowpilot-heartbeat` (every 12h) — objective decomposition + advancement
  - `automation-dispatcher-every-minute` — executes due cron automations
  - `publish-scheduled-pages` (every minute) — publishes scheduled pages
  - `flowpilot-learn` (daily 03:00) — nightly learning loop
  - `flowpilot-daily-briefing` (daily 07:00) — morning briefing
- **`register_flowpilot_cron` DB function** — SECURITY DEFINER function that idempotently creates all `pg_cron` jobs via `pg_net`, removes duplicate `heartbeat-12h` if present
- **Immediate first heartbeat** — `useTemplateInstaller` fires `flowpilot-heartbeat` right after bootstrap when objectives were seeded, so decomposition starts within seconds
- **`pg_cron` + `pg_net` extensions** — enabled via migration to support autonomous scheduling
- **DB triggers verified** — all event triggers (lead_created, blog_published, booking_created, form_submitted, order_created, lead_score_changed) confirmed active

## Phase 10: Agent Self-Evolution ✅ DONE

### Completed
- **SOUL/IDENTITY layer** — persistent personality stored in `agent_memory` (soul: purpose/values/tone/philosophy, identity: name/role/capabilities/boundaries), injected into every system prompt
- **`soul_update` tool** — FlowPilot can evolve its own personality, values, and tone over time
- **`instructions` field on `agent_skills`** — rich markdown knowledge (equivalent to OpenClaw's SKILL.md) injected into prompts when skills load
- **`skill_instruct` tool** — FlowPilot can write knowledge/context/examples into any skill, making it smarter
- **Reflect → auto-persist** — `reflect` tool now auto-saves error learnings and suggestions to `agent_memory` as lessons
- **Skill Hub UI** — Instructions field added to SkillEditorSheet for manual editing
- **Memory filtering** — soul/identity excluded from general memory list to avoid duplication in prompts

### OpenClaw/NanoClaw Parity
| Concept | OpenClaw | NanoClaw | FlowPilot |
|---------|----------|----------|-----------|
| Personality | SOUL.md file | SOUL.md + IDENTITY.md | `agent_memory` soul + identity entries |
| Skill knowledge | SKILL.md markdown | .claude/skills/SKILL.md | `instructions` column on `agent_skills` |
| Self-modification | Terminal (code rewrite) | Claude Code rewrite | DB tools (skill_create/update/instruct, soul_update) |
| Heartbeat | HEARTBEAT.md config | task-scheduler.ts | `flowpilot-heartbeat` edge fn + pg_cron |
| Learning loop | Manual | Implicit via Claude | reflect → auto-persist to memory |

## Architecture Reference

```
skill.handler routing:
  edge:function-name  →  supabase.functions.invoke()
  module:name         →  Direct DB operations (blog, crm, booking, etc.)
  db:table            →  DB read/write (settings, analytics)
  webhook:n8n         →  External webhook POST
```

## Key Files
| File | Purpose |
|------|---------|
| `supabase/functions/agent-execute/index.ts` | Unified skill executor + objective tracker |
| `supabase/functions/agent-operate/index.ts` | FlowPilot operate mode with SOUL/IDENTITY |
| `supabase/functions/flowpilot-heartbeat/index.ts` | Autonomous 12h heartbeat loop |
| `supabase/functions/automation-dispatcher/index.ts` | Cron automation executor |
| `supabase/functions/signal-dispatcher/index.ts` | Signal condition evaluator |
| `supabase/functions/prospect-research/index.ts` | Sales research pipeline |
| `supabase/functions/prospect-fit-analysis/index.ts` | Fit scoring + intro drafting |
| `src/types/agent.ts` | TypeScript types for skill engine |
| `src/components/admin/skills/SkillEditorSheet.tsx` | Skill editor with instructions field |
