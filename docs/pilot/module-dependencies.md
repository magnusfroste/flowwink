# FlowPilot Module Dependencies

> How FlowPilot assists each module — and what happens without it.

## What This Document Covers

FlowWink is designed as a **Human-First platform** where every module provides full manual functionality out of the box. FlowPilot — the autonomous AI operator — is an optional layer that adds proactive intelligence on top.

This document defines exactly what each module gains from FlowPilot and what an administrator can expect when FlowPilot is active, inactive, or unavailable. It is the authoritative reference for understanding the operational impact of enabling or disabling the agent.

## Dependency Tiers

Every module falls into one of three tiers based on its relationship with FlowPilot:

### 🟢 Independent — "Works alone"

The module has **zero dependency** on FlowPilot. All features are fully available regardless of whether the agent is active. These are typically CRUD-heavy modules with no AI reasoning component (e.g., Pages, Products, Inventory, Accounting).

**In practice:** An administrator sees no difference. The module behaves identically whether FlowPilot exists or not.

### 🟡 Enhanced — "Works alone, better with FlowPilot"

The module provides **complete manual functionality** as a Human-First CRUD tool. When FlowPilot is active, it adds a proactive intelligence layer: autonomous monitoring, smart suggestions, auto-categorization, and cross-module reasoning.

**In practice:** Without FlowPilot, the administrator does everything manually — creates tickets, scores leads, schedules content. With FlowPilot, these tasks happen automatically during heartbeats, and the agent surfaces insights the administrator might miss.

**The contract:**
1. The module MUST be fully functional as manual CRUD without FlowPilot
2. FlowPilot skills for the module are optional enhancements
3. The UI shows a degradation indicator (🟡) when FlowPilot is inactive
4. No feature gates — all manual actions remain available

### 🔴 Requires — "Cannot function without FlowPilot"

The module's core functionality is **entirely agent-driven**. There is no manual UI fallback — the feature exists only as an interactive dialogue with FlowPilot's reasoning engine.

**In practice:** When FlowPilot is disabled, these modules are hidden from the UI entirely. They cannot be used.

### Summary

| Tier | Flag | Count | Effect when FlowPilot is OFF |
|------|------|-------|------------------------------|
| 🔴 **Requires** | `requiresFlowPilot: true` | 1 | Module is **disabled** — cannot function without the reasoning engine |
| 🟡 **Enhanced** | `enhancedByFlowPilot: true` | 12 | Module works as **Human-First CRUD** — proactive/autonomous features are lost |
| 🟢 **Independent** | *(neither flag)* | 24 | Full functionality, no degradation |

---

## 🔴 Requires FlowPilot (1 module)

### Site Migration

**Why:** The migration pipeline is an interactive multi-step dialogue driven entirely by FlowPilot's reasoning loop. The agent orchestrates: URL discovery → page crawling (Firecrawl/Jina) → content extraction → block mapping → image migration → page creation. Each step requires the agent to reason about structure, make decisions about block types, and chain multiple skills (`migrate_url` → `manage_page` → `create_page_block`).

**Without FlowPilot:** No migration capability. There is no manual UI fallback — the entire feature is agent-driven.

---

## 🟡 Enhanced by FlowPilot (12 modules)

---

### Sales Intelligence

**What works without FlowPilot:**
- Manual prospect research via the Sales Intelligence admin page
- Direct edge function calls: `prospect-research`, `prospect-fit-analysis`, `contact-finder`, `web-search`, `web-scrape`
- Profile setup (company/user sales profiles)
- All CRUD operations on companies, leads, and research data

**What FlowPilot adds:**
- **Autonomous prospecting chain:** FlowPilot orchestrates a multi-step pipeline: `prospect_research` → `enrich_company` → `prospect_fit_analysis` → `qualify_lead` → introduction letter generation
- **Proactive research:** During heartbeats, FlowPilot identifies unresearched companies in the CRM and triggers enrichment autonomously
- **Contextual analysis:** FlowPilot uses its sales domain handler to provide strategic reasoning about fit scores, ICP alignment, and outreach timing
- **Cross-module intelligence:** FlowPilot connects research data with lead scoring, deal pipeline, and content strategy

**Skills involved:**

| Skill | Handler | Role |
|-------|---------|------|
| `prospect_research` | `edge:prospect-research` | Raw data fetch (web scrape + Hunter contacts) |
| `prospect_fit_analysis` | `edge:prospect-fit-analysis` | Data collection for fit evaluation |
| `enrich_company` | `edge:enrich-company` | Domain scraping + company enrichment |
| `qualify_lead` | `edge:qualify-lead` | Deterministic point-based scoring |
| `contact_finder` | `edge:contact-finder` | Hunter.io contact discovery |
| `sales_profile_setup` | `edge:sales-profile-setup` | Company/user profile management |

**⚠️ Known issue:** `prospect-fit-analysis` currently contains a reasoning-level AI prompt (introduction letters, strategic advice) that should flow through FlowPilot. See [Sensors vs. Reasoning](./sensors-vs-reasoning.md) for details.

**Proactive flow:**
```
Heartbeat → scan CRM companies without enrichment
  ├── enrich_company (domain scrape + Firecrawl)
  ├── prospect_research (web + Hunter)
  ├── prospect_fit_analysis (raw data collection)
  ├── qualify_lead (deterministic scoring)
  └── FlowPilot reasons: fit, timing, and drafts intro letter
```

---

### Tickets

**What works without FlowPilot:**
- Full Kanban board with drag-and-drop status management
- Manual ticket creation, editing, and assignment
- Priority/category management
- Ticket comments (internal and external)
- SLA tracking
- Table and board views

**What FlowPilot adds:**
- **Auto-triage** (`ticket_triage` skill): Incoming tickets are automatically categorized by priority and type
- **KB matching:** FlowPilot searches the Knowledge Base for articles matching the ticket content
- **Auto-response drafting:** When a KB article provides a clear answer, FlowPilot drafts a response as a ticket comment
- **Smart escalation:** Complex or billing-related tickets are flagged for human attention
- **Proactive monitoring:** During heartbeats, FlowPilot reviews unresolved tickets and suggests actions

**Skills involved:**

| Skill | Handler | Role |
|-------|---------|------|
| `ticket_triage` | `ticket_triage` (internal) | Auto-categorize, KB-match, propose solutions |

**Triage flow:**
```
New Ticket → ticket_triage
  ├── Categorize (bug/feature/question/billing/other)
  ├── Set priority (low/medium/high/urgent)
  ├── Search KB for matching articles
  ├── IF clear match → Draft response, set status: waiting
  └── IF complex/billing → Set status: open (human escalation)
```

---

### Leads

**What works without FlowPilot:**
- Full lead management with list and detail views
- Manual lead creation, editing, and status changes (`lead` → `contacted` → `qualified` → `opportunity` → `customer`)
- Lead source tracking and tagging
- Contact information management
- Notes and activity logging
- Lead-to-deal conversion (auto-updates lead status to `opportunity`)
- CRM task management (create, assign, prioritize, complete)
- Webhook triggers on `form.submitted` / `lead_created`

**What FlowPilot adds:**
- **Proactive scoring:** During heartbeats, FlowPilot evaluates unscored leads using `qualify_lead` (deterministic point-based system with 1.5× recency bonus for 7-day activity)
- **Pipeline review:** `lead_pipeline_review` audits leads by status/score, identifies neglected contacts, and suggests follow-up actions
- **Nurture sequences:** `lead_nurture_sequence` creates automated drip campaigns (welcome: 3 emails/7 days, re-engage: 2 emails, upsell: 2 emails) personalized with lead data
- **CRM task automation:** FlowPilot creates follow-up tasks linked to leads/deals based on pipeline state
- **Cross-module linking:** FlowPilot connects leads with company enrichment data, deal pipeline, and ticket history

**Skills involved:**

| Skill | Handler | Role |
|-------|---------|------|
| `add_lead` | `module:crm` | Create a new lead from any source |
| `manage_leads` | `module:crm` | List, get, update status/score, delete existing leads |
| `lead_pipeline_review` | `module:crm` | Audit pipeline by status, score, and days since contact |
| `lead_nurture_sequence` | `module:newsletter` | Create email drip campaigns for leads |
| `qualify_lead` | `edge:qualify-lead` | Deterministic point-based lead scoring |
| `crm_task_list` | `db:crm_tasks` | List CRM tasks with lead/deal/priority filters |
| `crm_task_create` | `db:crm_tasks` | Create follow-up tasks linked to leads or deals |
| `crm_task_update` | `db:crm_tasks` | Update or complete CRM tasks |

**Proactive flow:**
```
Heartbeat → lead_pipeline_review
  ├── Scan leads by status (new, contacted, qualified)
  ├── Identify leads with no activity for X days
  ├── For hot leads → qualify_lead (scoring)
  ├── For stale leads → crm_task_create (follow-up reminder)
  └── For new qualified leads → lead_nurture_sequence (drip campaign)
```

---

### Deals

**What works without FlowPilot:**
- Full pipeline view with drag-and-drop stage management (`proposal` → `negotiation` → `closed_won` / `closed_lost`)
- Manual deal creation with value, currency, expected close date
- Deal-to-lead and deal-to-product associations
- Auto-update of lead status to `opportunity` on deal creation
- Activity logging and notes
- Revenue forecasting based on stage probability
- CRM tasks linked to deals
- Webhook triggers: `deal.created`, `deal.updated`, `deal.stage_changed`, `deal.won`, `deal.lost`

**What FlowPilot adds:**
- **Stale deal detection:** `deal_stale_check` identifies deals stuck in a stage for X days and suggests re-engagement strategies
- **Pipeline health analysis:** During heartbeats, FlowPilot reviews deal distribution across stages and flags bottlenecks
- **Win/loss pattern recognition:** Over time, FlowPilot identifies patterns in won vs. lost deals and adjusts fit scoring
- **Forecast refinement:** FlowPilot adjusts probability estimates based on activity patterns, not just static stage defaults
- **Cross-module coordination:** FlowPilot connects deal progress with lead nurture sequences, content proposals, and ticket history

**Skills involved:**

| Skill | Handler | Role |
|-------|---------|------|
| `manage_deal` | `module:deals` | List, create, update, move deals between stages |
| `deal_stale_check` | `module:deals` | Find stalled deals and suggest actions |
| `crm_task_create` | `db:crm_tasks` | Create follow-up tasks linked to deals |
| `crm_task_list` | `db:crm_tasks` | Review pending tasks for a deal |

**Proactive flow:**
```
Heartbeat → deal_stale_check
  ├── Find deals with no activity for N days (default 14)
  ├── Group by stage (proposal, negotiation)
  ├── For stale proposals → crm_task_create (follow-up call)
  ├── For stale negotiations → escalation alert to admin
  └── Update deal notes with FlowPilot analysis
```

---

### Blog

**What works without FlowPilot:**
- Full blog editor with rich text (TipTap)
- Post creation, editing, scheduling, and publishing
- Category and tag management
- Featured images and SEO metadata
- Draft/review/publish workflow with `scheduled_at` support
- Author management and attribution
- RSS feed generation (`blog-rss` edge function)
- Webhook triggers: `blog_post.published`, `blog_post.updated`, `blog_post.deleted`
- Markdown and TipTap JSON content support

**What FlowPilot adds:**
- **Content research:** `research_content` scans trends, competitor analysis, and customer questions to identify topics
- **Proposal generation:** `generate_content_proposal` creates structured content briefs from research data
- **Autonomous writing:** `write_blog_post` composes full articles from proposals with SEO optimization
- **Social amplification:** `generate_social_post` and `social_post_batch` repurpose blog content into LinkedIn/X/newsletter formats
- **Product promotion:** `product_promoter` creates product-focused articles from the product catalog
- **SEO briefs:** `seo_content_brief` generates keyword-targeted outlines with search intent analysis
- **Content calendar:** `content_calendar_view` audits the editorial pipeline for gaps in frequency, topics, and SEO coverage
- **Publishing cadence:** FlowPilot monitors publishing frequency against objectives and nudges when the schedule slips

**Skills involved:**

| Skill | Handler | Role |
|-------|---------|------|
| `write_blog_post` | `module:blog` | Compose and publish blog posts |
| `manage_blog_posts` | `module:blog` | List, update, delete, change post status |
| `manage_blog_categories` | `module:blog` | CRUD for categories and tags |
| `browse_blog` | `module:blog` | Read published posts for reference |
| `content_calendar_view` | `module:blog` | Audit editorial pipeline and find gaps |
| `research_content` | `edge:content-research` | Trend and competitor research |
| `generate_content_proposal` | `db:content_proposals` | Structured content brief from research |
| `product_promoter` | `db:blog_posts` | Product-focused article generation |
| `seo_content_brief` | `db:content_proposals` | SEO keyword + intent outline |
| `generate_social_post` | `db:content_proposals` | Single social post from blog content |
| `social_post_batch` | `db:content_proposals` | Batch social post generation |

**Proactive flow:**
```
Heartbeat → content_calendar_view
  ├── Check publishing frequency vs. objective targets
  ├── Identify topic gaps and trending subjects
  ├── research_content (trend + competitor scan)
  ├── generate_content_proposal (structured brief)
  ├── write_blog_post (draft, queued for approval)
  └── social_post_batch (repurpose across channels)
```

**Workflow (3-step content pipeline):**
```
research_content → generate_content_proposal → write_blog_post
```

---

### AI Chat

**What works without FlowPilot:**
- Full conversational AI via `chat-completion` edge function
- RAG-powered responses using Knowledge Base articles and page content
- Conversation history and session management
- Customer information capture
- Feedback collection (thumbs up/down)
- Multi-provider support (OpenAI, Gemini, local, n8n)
- Conversation escalation to support agents
- Visitor profile tracking

**What FlowPilot adds:**
- **Personality and soul:** FlowPilot injects its soul (tone, values, communication style) into chat responses, creating a consistent brand voice
- **Objective-driven conversations:** FlowPilot steers conversations toward active objectives (e.g., promoting a new service, collecting feedback on a feature)
- **Escalation intelligence:** FlowPilot decides when to escalate to a human agent based on sentiment, complexity, and conversation history
- **Cross-session memory:** FlowPilot remembers returning visitors and adapts responses based on previous interactions
- **Lead capture:** FlowPilot identifies purchase intent and autonomously creates leads via `add_lead`

**Skills involved:**

| Skill | Handler | Role |
|-------|---------|------|
| *(no module-specific skills)* | `edge:chat-completion` | Chat uses the edge function directly |

**Architecture note:** AI Chat is unique — it does not have dedicated FlowPilot skills because the chat-completion edge function itself is the primary interface. FlowPilot's enhancement operates at the **prompt engineering** level: when FlowPilot is active, its soul, objectives, and memory are injected into the system prompt. Without FlowPilot, the chat uses generic RAG responses with no strategic alignment.

**Note:** AI Chat requires an AI provider (`requiresAI: true`) but does NOT require FlowPilot. Without FlowPilot, the chat uses generic RAG responses. With FlowPilot, responses are strategically aligned with business goals.

---

### Consultants

**What works without FlowPilot:**
- Full consultant profile management (name, title, skills, experience, certifications, hourly rate)
- Rich data fields: education, languages, portfolio URL, LinkedIn, availability
- Manual search and filtering by skills, availability, and rate
- Profile editing with detailed experience JSON
- AI-powered matching via `resume-match` edge function (requires AI provider, not FlowPilot)
- Resume parsing pipeline: `extract-pdf-text` → `parse-resume` → profile creation

**What FlowPilot adds:**
- **Proactive matching:** During heartbeats, FlowPilot cross-references new leads/deals with consultant availability using `match_consultant` and suggests optimal team compositions
- **Profile management at scale:** `manage_consultant_profile` with deduplication detection keeps the directory clean
- **Capacity monitoring:** FlowPilot tracks consultant utilization and alerts when capacity is running low
- **Skill gap analysis:** FlowPilot identifies skills requested by prospects that aren't covered by current consultants
- **Auto-response to inquiries:** When a new lead matches a consultant's profile, FlowPilot drafts a personalized response referencing relevant experience

**Skills involved:**

| Skill | Handler | Role |
|-------|---------|------|
| `manage_consultant_profile` | `module:resume` | CRUD + deduplication for consultant profiles |
| `match_consultant` | `module:resume` | AI-powered matching against job descriptions |
| `parse_resume` | `edge:parse-resume` | OCR/structured extraction from uploaded CVs |
| `extract_pdf_text` | `edge:extract-pdf-text` | Raw PDF text extraction (sensor) |

**Proactive flow:**
```
Heartbeat → scan new leads/deals
  ├── Extract job requirements from deal notes
  ├── match_consultant (AI scoring + reasoning)
  ├── Identify top 3 candidates with match scores
  ├── Check availability status
  └── Draft personalized response for admin review
```

**Resume ingestion chain:**
```
PDF Upload → extract_pdf_text → parse_resume → manage_consultant_profile(create)
  └── FlowPilot deduplicates against existing profiles
```

---

### Expenses

**What works without FlowPilot:**
- Full expense tracking with manual entry (date, description, amount, VAT, vendor, category)
- Category management: `travel`, `meals`, `office`, `software`, `representation`, `other`
- Receipt upload and storage
- Representation expense support with mandatory attendee tracking (name + company)
- Monthly report submission and approval workflow (`draft` → `submitted` → `approved` → `booked`)
- Accounting integration (journal entry creation from approved reports)
- Account code mapping (6071 travel, 6110 office, 7690 representation)

**What FlowPilot adds:**
- **Receipt analysis:** `analyze_receipt` uses AI vision to extract amount, VAT, vendor, date, and suggest matching account codes from `chart_of_accounts`
- **Auto-categorization:** FlowPilot suggests categories for new expenses based on merchant name and description patterns
- **Monthly automation:** On the 1st of each month, FlowPilot reviews draft expenses, submits reports per employee, and prompts admin for approval
- **Journal entry booking:** After approval, FlowPilot autonomously calls `book_report` to create accounting entries
- **Anomaly detection:** During heartbeats, FlowPilot flags unusual spending patterns (sudden category spikes, duplicate amounts)
- **Budget monitoring:** FlowPilot tracks spending against budgets and alerts before thresholds are exceeded

**Skills involved:**

| Skill | Handler | Role |
|-------|---------|------|
| `manage_expenses` | `db:expenses` | Full CRUD: create, list, update, delete, submit/approve/book reports |
| `analyze_receipt` | `edge:analyze-receipt` | AI vision extraction from receipt images (sensor) |

**Automation:**

| Automation | Trigger | Action |
|------------|---------|--------|
| Monthly Expense Processing | Cron: `0 9 1 * *` (1st of month, 09:00) | List draft expenses, submit per-employee reports |

**Monthly lifecycle:**
```
Employee creates expenses → draft status
  ├── analyze_receipt (optional: AI extracts data from photo)
  └── FlowPilot suggests category + account_code

Month-end → FlowPilot automation:
  ├── manage_expenses(submit_report) → bundles into monthly report
  ├── Admin approves via approve_report
  └── manage_expenses(book_report) → creates journal entry in accounting
```

---

### Contracts

**What works without FlowPilot:**
- Full contract lifecycle management (`draft` → `pending_signature` → `active` → `expired` / `terminated`)
- Contract types: `service`, `nda`, `employment`, `lease`, `other`
- Counterparty tracking with name, email, and contact details
- Document upload and versioning via `contract_documents` table
- Start/end date and value tracking (in cents with currency)
- Renewal type configuration: `none`, `auto`, `manual`
- Renewal notice period (`renewal_notice_days`)
- Free-text search across title and counterparty name

**What FlowPilot adds:**
- **Renewal alerts:** `contract_renewal_check` scans upcoming expirations and groups by urgency: critical (<7 days), warning (<30 days), notice (<90 days)
- **Auto-renew awareness:** For auto-renewing contracts, FlowPilot checks if the `renewal_notice_days` window has passed and alerts before automatic renewal
- **Proactive monitoring:** Daily heartbeat reviews contracts approaching end dates and creates CRM tasks for renegotiation
- **Value analysis:** FlowPilot connects contract values with revenue data and identifies contracts with poor ROI
- **Status automation:** FlowPilot detects contracts past their `end_date` and transitions them to `expired`

**Skills involved:**

| Skill | Handler | Role |
|-------|---------|------|
| `manage_contract` | `db:contracts` | CRUD: create, list, update, search contracts |
| `contract_renewal_check` | `db:contracts` | Find contracts expiring within N days, grouped by urgency |

**Automation:**

| Automation | Trigger | Action |
|------------|---------|--------|
| Contract Renewal Alert | Cron: `0 8 * * 1-5` (weekdays 08:00) | Check for contracts expiring within 30 days |

**Proactive flow:**
```
Heartbeat → contract_renewal_check(days_ahead: 30)
  ├── Critical (<7 days) → urgent notification + CRM task
  ├── Warning (<30 days) → renewal reminder
  ├── Notice (<90 days) → planning alert
  ├── Auto-renew contracts → check if notice period passed
  └── Expired contracts with no renewal → status → expired
```

---

### HR

**What works without FlowPilot:**
- Full employee directory with rich profiles (name, email, title, department, employment type, start date)
- Employment types: `full_time`, `part_time`, `contractor`
- Status lifecycle: `active` → `on_leave` → `active`, or `active` → `terminated`
- Leave request management: `vacation`, `sick`, `parental`, `other`
- Leave approval workflow: `pending` → `approved` / `rejected`
- Leave balance tracking by employee
- Onboarding checklists with default items (IT setup, access cards, welcome meeting, policy review, buddy assignment)
- Department and role management

**What FlowPilot adds:**
- **Leave review automation:** Every weekday at 09:00, FlowPilot checks for pending leave requests and reminds admin to review them
- **Onboarding orchestration:** When a new employee is created, FlowPilot auto-generates an onboarding checklist and tracks completion
- **Leave pattern analysis:** During heartbeats, FlowPilot identifies leave patterns (frequent Monday absences, burn-rate on vacation days) and flags potential issues
- **Capacity planning:** FlowPilot cross-references leave schedules with project timelines and alerts on coverage gaps
- **Policy compliance:** FlowPilot monitors leave balances and flags employees approaching limits

**Skills involved:**

| Skill | Handler | Role |
|-------|---------|------|
| `manage_employee` | `db:employees` | CRUD: create, update, search, deactivate employees |
| `manage_leave` | `db:leave_requests` | Create, approve, reject, list leave requests |
| `onboarding_checklist` | `db:onboarding_checklists` | Create and manage onboarding task lists |

**Automation:**

| Automation | Trigger | Action |
|------------|---------|--------|
| HR Leave Review Reminder | Cron: `0 9 * * 1-5` (weekdays 09:00) | List pending leave requests, notify admin |

**Proactive flow:**
```
Heartbeat → manage_leave(list_pending)
  ├── Pending requests > 2 days old → escalation alert
  ├── Approved leaves this week → capacity check
  ├── New employees without checklists → onboarding_checklist(create)
  └── Vacation balance warnings → notification to employee/admin
```

**Onboarding chain:**
```
manage_employee(create) → detect new employee
  ├── onboarding_checklist(create) with default items
  ├── Track item completion over time
  └── Mark completed_at when all items done
```

---

### Purchasing

**What works without FlowPilot:**
- Full procure-to-pay lifecycle: purchase orders, vendors, goods receipt
- Vendor/supplier directory with payment terms (`immediate`, `net15`, `net30`, `net45`, `net60`)
- Purchase order creation with line items (product, quantity, unit cost, tax rate)
- PO status lifecycle: `draft` → `sent` → `partially_received` → `received`
- Goods receipt recording with line-level quantity tracking
- Inventory integration (stock levels updated on receipt)
- Default 25% tax rate for Swedish vendors

**What FlowPilot adds:**
- **Reorder point monitoring:** `purchase_reorder_check` compares stock levels against `low_stock_threshold` per product and groups suggestions by preferred vendor
- **Auto-PO drafting:** FlowPilot creates draft purchase orders from reorder suggestions for admin review
- **Supplier analysis:** FlowPilot tracks delivery times and quality across vendors and recommends preferred suppliers
- **Spend consolidation:** FlowPilot identifies opportunities to combine orders to the same vendor
- **Price trend tracking:** FlowPilot monitors unit price changes across orders and flags significant increases

**Skills involved:**

| Skill | Handler | Role |
|-------|---------|------|
| `manage_vendor` | `db:vendors` | CRUD for vendor/supplier records |
| `create_purchase_order` | `db:purchase_orders` | Create draft POs with line items |
| `send_purchase_order` | `db:purchase_orders` | Transition PO from draft to sent |
| `receive_goods` | `db:goods_receipts` | Record goods receipt, update inventory |
| `purchase_reorder_check` | `db:products` | Analyze stock vs. reorder points, suggest POs |

**Automation:**

| Automation | Trigger | Action |
|------------|---------|--------|
| Auto Reorder Check | Cron: `0 7 * * *` (daily 07:00) | Check stock levels, suggest reorders |

**Proactive flow:**
```
Heartbeat → purchase_reorder_check
  ├── Compare stock_quantity vs. low_stock_threshold per product
  ├── Group low-stock items by preferred vendor
  ├── Calculate suggested quantity: max(threshold × 3, 10)
  ├── create_purchase_order (draft, pending approval)
  └── Alert admin with PO summary for review
```

**Full procurement chain:**
```
purchase_reorder_check → create_purchase_order → admin approves
  → send_purchase_order → vendor delivers
  → receive_goods → inventory updated → PO status: received
```

---

### SLA

**What works without FlowPilot:**
- SLA policy definition (response time, resolution time per priority level)
- SLA status tracking on tickets
- Breach logging and reporting
- Manual escalation triggers
- Compliance reporting (met/breached/pending)

**What FlowPilot adds:**
- **Proactive breach prediction:** During heartbeats, FlowPilot calculates time remaining on active SLAs and escalates tickets approaching breach *before* it occurs
- **Response optimization:** FlowPilot prioritizes the ticket queue based on SLA urgency, not just creation order
- **Performance trending:** FlowPilot tracks SLA compliance over time and identifies systemic issues (e.g., "Tuesday tickets always breach")
- **Auto-escalation chains:** FlowPilot triggers escalation workflows when breach is imminent
- **Cross-module alerts:** SLA warnings propagate to CRM tasks and admin notifications

**Skills involved:**

| Skill | Handler | Role |
|-------|---------|------|
| *(shares ticket skills)* | `ticket_triage` | SLA context influences triage priority |

**Architecture note:** SLA is currently a lightweight module (`skills: []` in module definition) that piggybacks on the Tickets module's infrastructure. SLA policies are applied as metadata on tickets, and FlowPilot's enhancement operates by weaving SLA urgency into the `ticket_triage` reasoning. Future iterations may introduce dedicated SLA skills for standalone monitoring.

**Proactive flow:**
```
Heartbeat → scan open tickets with SLA policies
  ├── Calculate remaining time per SLA metric
  ├── Response SLA < 30 min remaining → urgent alert
  ├── Resolution SLA < 2 hours remaining → escalation
  ├── Breached SLAs → log breach + notify admin
  └── Weekly: SLA compliance report with trend analysis
```

---

## Architecture Notes

### Edge Functions Are "Hands"

All edge functions follow the OpenClaw [Sensors vs. Reasoning](./sensors-vs-reasoning.md) pattern:

- **Edge functions** = deterministic data operations (fetch, scrape, score, write)
- **FlowPilot** = the reasoning layer that chains operations, interprets results, and makes strategic decisions

This is why Enhanced modules work without FlowPilot — the "hands" still function, but there's no "brain" orchestrating them proactively.

### The Heartbeat as Enhancement Engine

Most FlowPilot enhancements activate during the [heartbeat loop](./presence.md). The 7-step protocol (Evaluate → Plan → Advance → Propose → Automate → Reflect → Remember) is what drives proactive behavior across all Enhanced modules. Without FlowPilot, there are no heartbeats — and therefore no proactive monitoring, suggestions, or autonomous actions.

### Skill Categories Across Modules

| Category | Skills | Modules |
|----------|--------|---------|
| **CRM** | `add_lead`, `manage_leads`, `manage_deal`, `qualify_lead`, `lead_pipeline_review`, `lead_nurture_sequence`, `deal_stale_check`, `crm_task_*` | Leads, Deals, SI |
| **Content** | `write_blog_post`, `manage_blog_*`, `content_calendar_view`, `research_content`, `generate_content_proposal`, `seo_content_brief`, `social_post_*`, `product_promoter` | Blog |
| **Commerce** | `manage_expenses`, `analyze_receipt`, `manage_contract`, `contract_renewal_check`, `manage_vendor`, `create_purchase_order`, `send_purchase_order`, `receive_goods`, `purchase_reorder_check` | Expenses, Contracts, Purchasing |
| **People** | `manage_employee`, `manage_leave`, `onboarding_checklist`, `manage_consultant_profile`, `match_consultant` | HR, Consultants |

### Graceful Degradation in Practice

When FlowPilot is disabled:
1. **No features break** — all manual workflows continue unchanged
2. **No data is lost** — everything FlowPilot would have monitored is still in the database
3. **No UI changes** — Enhanced modules show a subtle 🟡 indicator but all controls remain active
4. **Re-enabling is instant** — FlowPilot picks up where it left off, scanning for unprocessed items during its first heartbeat
5. **Automations pause** — cron-triggered automations (reorder checks, renewal alerts, leave reminders) stop firing but resume immediately when FlowPilot is re-enabled

---

*Last updated: 2026-04-14*
