# FlowWink — Product & System Reference

> **The Business Operating System — powered by an autonomous AI agent.**
> 
> Version: 5.0 | Updated: April 2026 | Modules: 27 | Skills: 118 + ∞ runtime

---

## 1. Vision & Positioning

FlowWink is a **Business Operating System (BOS)** — a self-hosted platform where an autonomous AI agent (FlowPilot) operates your entire business. Built for era three of business software:

1. **Tools era** (1990s–2010s) — Separate apps. You operate each one manually.
2. **SaaS era** (2010s–2020s) — Cloud platforms. Easier to use, still human-driven.
3. **Agent era** (2025–) — AI operators. You set direction, the agent runs the business.

### The Core Insight

Every business has **directional work** (strategy, decisions — requires humans) and **operational work** (executing, iterating, following up — increasingly automatable). FlowWink takes all operational work off your plate. You set objectives. FlowPilot executes.

### Odoo-Inspired ERP for SMBs

FlowWink is an Odoo-inspired BOS where FlowPilot functions as the primary autonomous operator for the full **Quote-to-Cash** lifecycle. The UI is a cockpit for exception handling, not a traditional form-based admin.

### Module Ecosystem (Odoo Model)

FlowWink follows Odoo's module ecosystem model with three tiers:

| Tier | Name | Origin | Trust | Status |
|------|------|--------|-------|--------|
| **1** | **Core Modules** | Bundled in repo | `bundled` / full trust | ✅ Active (24 modules) |
| **2** | **Community-Submitted** | PR → FlowWink review → merge | `bundled` after review | 🔜 Next |
| **3** | **External/Marketplace** | Loaded at runtime from external source | `community` + admin install | 🔮 Future |

**How it works:**

- **Tier 1**: All current modules (Blog, CRM, Ecommerce, Accounting, etc.). Skills declared in `skill-map.ts`, lifecycle managed via `registerBootstrap()`.
- **Tier 2**: Developers submit modules following the `new-module.md` workflow. After FlowWink team review and merge, the module ships as bundled with full trust. Modules can declare **skills + automations + seedData** — same power as core modules (e.g., Accounting pilot with BAS 2024 chart of accounts, templates, and scheduled automations).
- **Tier 3**: Future plugin-loader pattern. DB support exists (`agent_skill_packs` table, `origin='community'`, `trust_level` field) but runtime loading is not yet implemented.

**Bootstrap Contract** (applies to Tier 1 + 2):

```typescript
registerBootstrap('myModule', {
  seedData: async () => { /* seed reference data */ },
  skills: [{ name, description, category, handler, scope, tool_definition }],
  automations: [{ name, trigger_type, trigger_config, skill_name, skill_arguments }],
});
```

When enabled: seeds data → enables skills → registers automations.  
When disabled: sets `enabled=false` on skills/automations. Data preserved.  
FlowPilot off: skills/automations skipped entirely (shell mode).  
FlowPilot enabled later: retroactive scan bootstraps all active modules.

### Design Principles

1. **Agents, not automation** — FlowPilot reasons about context and adapts, not follows scripts.
2. **Self-evolution over configuration** — The agent creates skills, learns templates, enriches memory.
3. **Privacy by architecture** — Your agent, your data, your AI. Self-hosted with private LLM support.
4. **OpenClaw compliance** — 10 mandatory laws for agent architecture. See [OPENCLAW-LAW.md](./OPENCLAW-LAW.md).
5. **The 80/20 rule, enforced** — Build core deeply. For the rest, integrate via webhooks and Workflow DAGs.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FLOWWINK PLATFORM                        │
├──────────┬──────────┬──────────┬──────────┬────────────────────┤
│ Content  │   Data   │  Comms   │ Insights │      System        │
│          │          │          │          │                    │
│ Pages    │ Leads    │ News-    │ Analytics│ Global Elements    │
│ Blog     │ Deals    │ letter   │ Sales    │ Federation (A2A)   │
│ KB       │ Companies│ AI Chat  │ Intel    │ Accounting         │
│ Forms    │ Products │ Live     │          │ Expense Reporting  │
│ Content  │ Orders   │ Support  │          │                    │
│ Hub      │ Bookings │ Webinars │          │                    │
│          │ Invoices │          │          │                    │
│          │ Consult. │          │          │                    │
└──────┬───┴──────────┴──────────┴──────────┴────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                     FLOWPILOT (Autonomous Agent)                 │
│  117 skills · pgvector memory · heartbeat · self-healing · A2A  │
│  See FLOWPILOT.md for the agent's full architecture              │
└──────────────────────────────────────────────────────────────────┘

### Three-Channel Architecture

FlowWink exposes its capabilities through three complementary channels:

| Channel | Purpose | Auth | Transport |
|---------|---------|------|-----------|
| **Skills** (internal) | FlowPilot autonomy — agent reasons and executes | Service role JWT | Edge Function (`agent-execute`) |
| **A2A** (federation) | Peer-to-peer agent collaboration (e.g. OpenClaw) | Bearer token (hashed) | JSON-RPC via `a2a-ingest` |
| **MCP** (universal) | External AI clients (Cursor, Claude Desktop) | API Key (SHA-256 hashed) | Streamable HTTP via `mcp-server` |

The MCP server dynamically exposes skills where `mcp_exposed = true` in the `agent_skills` table. Admin controls which skills are public via the Engine Room UI (shield toggle). API keys are managed under **Setup → API Keys**.

**MCP Client Configuration (Cursor / Claude Desktop):**

```json
{
  "mcpServers": {
    "flowwink": {
      "transport": "streamable-http",
      "url": "https://<project-ref>.supabase.co/functions/v1/mcp-server",
      "headers": {
        "Authorization": "Bearer fwk_<your-api-key>"
      }
    }
  }
}
```
```

### Request Flow

```
Visitor → PublicPage.tsx → get-page edge function → page.content_json
                         → BlockRenderer.tsx → [Name]Block.tsx

Admin   → PageEditorPage.tsx → BlockEditor.tsx → [Name]BlockEditor.tsx
```

### Technology Stack

- **Frontend**: React 18 + Vite 5 + Tailwind CSS v3 + TypeScript 5
- **Backend**: Supabase (Postgres + Edge Functions + Auth + Storage)
- **AI**: OpenAI, Google Gemini, Private LLM (OpenAI-compatible)
- **Agent**: OpenClaw-compliant autonomous engine

---

## 3. Modules (24 total)

### Core (always enabled)

| Module | Description |
|--------|-------------|
| **Pages** | Block-based page builder with 61+ block types, drag-and-drop, scheduling, version history |
| **Media Library** | Media assets with WebP optimization, Unsplash integration, folder organization |

### Content

| Module | Description | Default |
|--------|-------------|---------|
| **Blog** | Posts with categories, tags, RSS, AI writing, scheduling | Enabled |
| **Knowledge Base** | Structured FAQ with AI Chat integration and gap analysis | Disabled |
| **Forms** | Form submissions with automatic lead capture and webhooks | Enabled |
| **Content Hub** | REST, GraphQL, and Markdown Content API for headless delivery | Disabled |

### Communication

| Module | Description | Default |
|--------|-------------|---------|
| **Newsletter** | Email campaigns via Resend with subscriber management | Disabled |
| **AI Chat** | Intelligent chatbot with Context-Augmented Generation (CAG) | Disabled |
| **Live Support** | Human agent support with AI handoff and sentiment detection | Disabled |
| **Webinars** | Event planning, registration, and follow-up automation | Disabled |

### Data

| Module | Description | Default |
|--------|-------------|---------|
| **Leads** | AI-driven lead management with automatic scoring and qualification | Enabled |
| **Deals** | Sales pipeline (prospect → won/lost) with activity tracking | Enabled |
| **Companies** | Organization management with AI enrichment and domain detection | Enabled |
| **Products** | Product catalog with Stripe Checkout integration | Enabled |
| **Orders** | Order management with Stripe webhooks, confirmation emails, and **fulfillment tracking** (unfulfilled → picked → packed → shipped → delivered) | Enabled |
| **Bookings** | Appointment scheduling with calendar, services, and email confirmations | Enabled |
| **Invoices** | Quote-to-invoice lifecycle with PDF generation and email delivery | Enabled |
| **Consultants** | Team expertise with AI-powered resume matching and cover letters | Disabled |
| **Inventory** | Stock levels, movements, reorder points — auto-decrements on orders | Disabled |

### Insights

| Module | Description | Default |
|--------|-------------|---------|
| **Analytics** | Dashboard for leads, deals, content, and newsletter performance | Enabled |
| **Sales Intelligence** | Prospect research, fit analysis, and competitor monitoring | Disabled |

### System

| Module | Description | Default |
|--------|-------------|---------|
| **Global Elements** | Header, footer, announcement bars, reusable components | Enabled |
| **Federation** | Agent-to-Agent (A2A) peer management for cross-agent collaboration | Disabled |
| **Accounting** | Double-entry bookkeeping (BAS 2024), journal entries, balance sheet, P&L, autonomous templates | Disabled |
| **Expense Reporting** | Employee expense reporting with receipt scanning (AI vision), monthly approval workflow, and autonomous journal entry booking | Disabled |

### Operations

| Module | Description | Default |
|--------|-------------|---------|
| **SLA Monitor** | Policy-based service level tracking across tickets, orders, leads, and bookings with automatic violation detection and severity scoring | Disabled |

### Module Dependencies

- **Orders** → Products
- **Deals** → Leads
- **Live Support** → AI Chat
- **Sales Intelligence** → Leads, Companies
- **Invoices** → Products (optional)

### Module Autonomy Levels

| Level | Description | Examples |
|-------|-------------|----------|
| `view-required` | Needs admin UI for meaningful interaction | Leads, Analytics |
| `config-required` | Needs initial setup, then runs autonomously | Blog, Newsletter |
| `agent-capable` | Admin UI optional — FlowPilot manages fully | Bookings, Accounting, Invoices, SLA Monitor |

---

## 4. Block System (61+ types)

### Categories

| Category | Blocks |
|----------|--------|
| **Text & Media** | Text, Image, Gallery, Quote, YouTube, Embed, Table, Lottie |
| **Layout** | Two-Column, Separator, Section Divider, Tabs, Bento Grid, Parallax Section |
| **Navigation** | Link Grid, Hero, Announcement Bar, Quick Links, Category Nav |
| **Information** | Info Box, Stats, Accordion, Article Grid, Features, Timeline, Progress, Countdown, Marquee, Trust Bar, Shipping Info |
| **Social Proof** | Testimonials, Logos, Team, Badge, Social Proof |
| **Conversion** | CTA, Pricing, Comparison, Booking, Smart Booking, Form, Newsletter, Floating CTA, Notification Toast, Featured Carousel, Featured Product |
| **Contact** | Contact, Map |
| **Interactive** | Chat, Chat Launcher, AI Assistant, Popup, Webinar, Resume Matcher |
| **Knowledge Base** | KB Hub, KB Search, KB Featured, KB Accordion |
| **E-commerce** | Products, Cart |

### Block Features

- Drag & drop reordering (@dnd-kit)
- Per-block animations (fade, slide, scale)
- Anchor IDs for in-page navigation
- Hide/Show toggle (Webflow-style)
- Rich editor previews matching public rendering
- Fully responsive

### Architecture Principle

> **Blocks are interfaces, not pipelines.** Blocks capture intent and render responses. All intelligence flows through FlowPilot's reasoning engine. A block never builds its own AI pipeline.

---

## 5. AI System

### Multi-Provider Architecture

| Provider | Use Case | Data Location |
|----------|----------|---------------|
| **OpenAI** | GPT models with function calling | OpenAI Cloud |
| **Google Gemini** | Gemini models for reasoning and multimodal | Google Cloud |
| **Private LLM** | Self-hosted OpenAI-compatible (Ollama, vLLM, LM Studio) | On-premise |

### Context-Augmented Generation (CAG)

The AI Chat uses all module content as context — pages, blog, KB, products — with zero training required.

### Key AI Features

- **Page Import**: Intelligent migration from WordPress, Wix, Squarespace, Webflow, etc. (22+ block types mapped)
- **Content Generation**: Blog posts, newsletter copy, KB articles via FlowPilot
- **Lead Qualification**: AI scoring with enrichment summaries
- **Template Creation**: FlowPilot autonomously learns and creates booking templates

---

## 6. Quote-to-Cash Lifecycle

```
Lead → Qualify → Deal → Quote → Invoice → Payment → Journal Entry → Reports
 │        │        │       │        │          │            │           │
 └── AI ──┘   Pipeline   PDF    PDF+Email   Webhook    Accounting   Balance
scoring    tracking   generation  delivery  integration  module     Sheet/P&L
```

FlowPilot can autonomously manage each step when the corresponding modules are enabled.

---

## 7. Starter Templates (10)

| Template | Category | Pages | Blog | KB | Products | Target |
|----------|----------|-------|------|----|----------|--------|
| Launchpad | Startup | 5 | ✅ | ✅ | — | SaaS/Tech |
| Momentum | Startup | 4 | ✅ | — | — | Single-page dark |
| TrustCorp | Enterprise | 5 | ✅ | ✅ | — | B2B |
| SecureHealth | Compliance | 7 | ✅ | ✅ | — | Healthcare (HIPAA) |
| FlowWink Platform | Platform | 5 | ✅ | ✅ | — | CMS showcase |
| Help Center | Help | 4 | — | ✅ | — | Support |
| Service Pro | Startup | 5 | ✅ | — | — | Service + booking |
| Digital Shop | Platform | 5 | ✅ | — | ✅ | E-commerce |
| FlowWink Agency | Platform | 5 | ✅ | ✅ | — | Agency white-label |
| Consult Agency | Platform | 5 | ✅ | ✅ | — | Consulting + AI matching |

Each template includes FlowPilot configuration (soul + objectives), sample content, and required module activation.

---

## 8. Security & Compliance

- **RLS Policies**: All tables protected with row-level security
- **Approval Gating**: Sensitive skills require admin confirmation
- **Audit Trail**: Every agent action logged in `agent_activity`
- **GDPR**: Cookie consent, data export, account deletion
- **WCAG**: Accessible block rendering, color contrast validation
- **HIPAA-ready**: Private LLM support for air-gapped deployments

---

## 9. Webhooks

| Module | Events |
|--------|--------|
| Pages | `page.published`, `page.updated`, `page.deleted` |
| Blog | `blog_post.published`, `blog_post.updated`, `blog_post.deleted` |
| Newsletter | `newsletter.subscribed`, `newsletter.unsubscribed` |
| Leads | `form.submitted` |
| Deals | `deal.created`, `deal.updated`, `deal.won`, `deal.lost` |
| Bookings | `booking.submitted`, `booking.confirmed`, `booking.cancelled` |

HMAC-SHA256 signatures · Retry with exponential backoff · Auto-disable after 5 failures

---

## 10. Deployment

- **Self-hosted**: Docker with `docker-compose.yml`
- **Edge Functions**: Deployed to Supabase (`supabase functions deploy`)
- **Public functions**: `--no-verify-jwt`
- **Admin functions**: Default JWT verification

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [FLOWPILOT.md](./FLOWPILOT.md) | FlowPilot agent architecture — the brain of the system |
| [OPENCLAW-LAW.md](./OPENCLAW-LAW.md) | The 10 laws of agent development |
| [SKILLS-SOURCE.md](./SKILLS-SOURCE.md) | Skill registry source of truth |
| [MODULE-API.md](./MODULE-API.md) | Technical module API |
| [INTEGRATIONS-STRATEGY.md](./INTEGRATIONS-STRATEGY.md) | Integration architecture |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Development guidelines |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Deployment instructions |
| [SECURITY.md](./SECURITY.md) | Security model |

---

## 12. Module Bootstrap Architecture

When a module is enabled, it can optionally run a **bootstrap** that seeds everything it needs:

```
Module.enable("accounting")
  → Always: Seed reference data (chart of accounts, templates)
  → Always: Run migrations if tables missing
  → If FlowPilot.enabled: Register skills + automations in agent registry
  → If !FlowPilot.enabled: Skip skills (pure UI module)

Module.disable("accounting")
  → Deactivate skills (enabled=false, data preserved)
  → Deactivate automations
  → Reference data untouched

FlowPilot.enable()
  → Scan all enabled modules → seed their skills

FlowPilot.disable()
  → Skills become irrelevant (no agent runs them)
  → Modules continue working as traditional UI
```

### Implementation

- **Registry**: `src/lib/module-bootstrap.ts` — core bootstrap/teardown engine
- **Bootstraps**: `src/lib/module-bootstraps/*.ts` — per-module seed configs
- **Hook point**: `ModulesPage.tsx` `handleToggle` calls `bootstrapModule()` / `teardownModule()`
- **Idempotent**: Safe to run multiple times (check-then-insert pattern)

### Pilot: Accounting Module

The accounting module (`src/lib/module-bootstraps/accounting.ts`) seeds:
- **43 BAS 2024 accounts** (chart of accounts)
- **7 transaction templates** (invoice, payment, payroll, rent, etc.)
- **6 skills** (`manage_journal_entry`, `accounting_reports`, `manage_accounting_template`, `manage_opening_balances`, `manage_chart_of_accounts`, `suggest_accounting_template`)
- **1 automation** (`Invoice Reconciliation` — daily cron checking for unbooked invoices)

### Expense Reporting Module

The expenses module (`src/lib/module-bootstraps/expenses.ts`) is a standalone module with a dependency on Accounting for journal entry booking:

- **Tables**: `expenses`, `expense_reports`, `expense_attachments`
- **2 skills**: `manage_expenses` (full CRUD + approval workflow), `analyze_receipt` (AI vision extraction)
- **1 automation**: `Monthly Expense Processing` (1st of each month — collects drafts, submits reports, prompts admin)
- **Representation rule**: Expenses categorized as `representation` require an `attendees` list (name + company) — Swedish tax compliance
- **Autonomous workflow**: Draft → Submit → Approve → Book (FlowPilot generates journal entries: net cost to expense account, VAT to 2640, liability to 2820)
- **Receipt scanning**: Uses multimodal AI vision (Gemini/OpenAI) via the `analyze-receipt` edge function to extract vendor, date, amount, VAT, and suggest account codes

### Timesheets Module

The timesheets module (`src/lib/module-bootstraps/timesheets.ts`) tracks employee hours per project with billing integration:

- **Tables**: `projects` (name, client, color, hourly_rate, billable), `time_entries` (user, project, date, hours, description, billable, invoiced)
- **3 skills**: `log_time` (create/list/delete time entries), `manage_projects` (CRUD for projects), `timesheet_summary` (period summaries with revenue calculation)
- **1 automation**: `Weekly Timesheet Reminder` (Fridays 15:00 — checks if employees have logged ≥35h and reminds those who haven't)
- **Weekly view**: Grid layout with projects as rows, weekdays as columns, quick-add for logging hours inline
- **Billable tracking**: Projects have hourly rates; `timesheet_summary` can calculate revenue from billable hours
- **Invoice integration** (planned): Mark billable entries as invoiced when creating client invoices
- **FlowPilot chat**: Natural language time logging — "jag jobbade 4 timmar på Website Redesign idag" triggers `log_time`
- **RLS**: Users see own entries, admins see all; invoiced entries cannot be deleted

| Reference doc | Path |
|---|---|
| [MODULE-API.md](./MODULE-API.md) | Technical module API |
| [SKILLS-SOURCE.md](./SKILLS-SOURCE.md) | Skill registry source of truth |

---

### Inventory Module

The inventory module tracks stock levels across all e-commerce products with automatic order integration:

- **Tables**: `product_stock` (product_id, quantity_on_hand, quantity_reserved, reorder_point), `stock_moves` (product_id, quantity, move_type, reference_type, reference_id, notes)
- **3 skills**: `check_stock` (query stock levels), `adjust_stock` (manual in/out/adjustment), `low_stock_report` (products below reorder point)
- **Auto-decrement**: Database trigger on `orders` table automatically creates stock moves and decrements `quantity_on_hand` when orders are placed
- **Admin UI**: Three-tab layout — Stock Levels (with inline reorder point editing), Movements log, and Untracked products (enable tracking per product)
- **KPI cards**: Tracked products, stock value, low stock count, out of stock count
- **E-commerce integration**: Leverages existing `back_in_stock_requests` table for notifications
- **RLS**: Authenticated users can view; writers/admins can modify stock and create moves

| Reference doc | Path |
|---|---|
| [MODULE-API.md](./MODULE-API.md) | Technical module API |
| [SKILLS-SOURCE.md](./SKILLS-SOURCE.md) | Skill registry source of truth |

---

### Order Fulfillment Flow

The fulfillment flow extends the Orders module with warehouse-style tracking from payment to delivery:

- **Columns on `orders`**: `fulfillment_status` (unfulfilled → picked → packed → shipped → delivered), `picked_at`, `packed_at`, `shipped_at`, `delivered_at`, `tracking_number`, `tracking_url`, `fulfillment_notes`
- **Auto-timestamping**: Database trigger automatically fills in earlier timestamps when status advances (e.g. marking as "shipped" auto-sets picked_at and packed_at if not already set)
- **Order status sync**: Advancing to "shipped" sets order status to `shipped`; "delivered" sets it to `completed`
- **Admin UI**: Visual stepper showing fulfillment progress with timestamps, tracking info display, and one-click advancement buttons per stage
- **SLA-ready**: Timestamps enable SLA Monitor to track `fulfillment_time` policies (e.g. "orders must ship within 4 hours of payment")

---

### SLA Monitor Module

The SLA Monitor (`src/pages/admin/SlaMonitorPage.tsx`) enables policy-based service level tracking with autonomous violation detection:

- **Tables**: `sla_policies` (entity_type, metric, target_minutes, severity, enabled), `sla_violations` (policy_id, entity_type, entity_id, severity, actual_minutes, target_minutes, resolved_at)
- **1 skill**: `sla_check` (evaluate all active SLA policies, detect violations, auto-resolve when entities are handled)
- **Edge Function**: `sla-check` — iterates over active policies, queries entity tables for breaches, upserts violations, and auto-resolves previously violated entities that are now handled
- **Supported entity types**: `ticket`, `order`, `lead`, `booking`
- **Supported metrics**: `first_response_time`, `resolution_time`, `fulfillment_time`, `follow_up_time`
- **Severity levels**: `warning` (approaching SLA), `breach` (exceeded SLA), `critical` (2x exceeded)
- **Admin UI**: Policy management (create/toggle/delete) + violations dashboard with severity badges and resolution status
- **Autonomy**: FlowPilot runs `sla_check` during heartbeat to proactively detect and escalate SLA breaches. Fully `agent-capable` — no admin intervention needed after initial policy setup

| Reference doc | Path |
|---|---|
| [MODULE-API.md](./MODULE-API.md) | Technical module API |
| [SKILLS-SOURCE.md](./SKILLS-SOURCE.md) | Skill registry source of truth |

---

*The Business Operating System. FlowPilot runs the business so you can build it.*
