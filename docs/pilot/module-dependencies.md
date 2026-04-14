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
- Manual lead creation, editing, and status changes
- Lead source tracking and tagging
- Contact information management
- Notes and activity logging
- Lead-to-deal conversion

**What FlowPilot adds:**
- **Proactive scoring:** During heartbeats, FlowPilot evaluates unscored leads using the `qualify_lead` skill (deterministic point-based system with recency bonus)
- **Auto-qualification:** Leads meeting threshold criteria are automatically moved to "qualified" status
- **Source analysis:** FlowPilot identifies which lead sources produce the highest conversion rates and adjusts objectives accordingly
- **CRM linking:** FlowPilot connects lead activity with company research and deal pipeline for a unified view

---

### Deals

**What works without FlowPilot:**
- Full pipeline view with drag-and-drop stage management
- Manual deal creation with value, probability, and close date
- Deal-to-company and deal-to-lead associations
- Activity logging and notes
- Revenue forecasting based on stage probability

**What FlowPilot adds:**
- **Pipeline health analysis:** During heartbeats, FlowPilot identifies stale deals (no activity for X days) and flags them
- **Stage progression alerts:** FlowPilot notices deals stuck in a stage and suggests next actions
- **Win/loss pattern recognition:** Over time, FlowPilot identifies patterns in won vs. lost deals and adjusts fit scoring
- **Forecast refinement:** FlowPilot adjusts probability estimates based on activity patterns, not just static stage defaults

---

### Blog

**What works without FlowPilot:**
- Full blog editor with rich text (TipTap)
- Post creation, editing, scheduling, and publishing
- Category and tag management
- Featured images and SEO metadata
- Draft/review/publish workflow
- Author management

**What FlowPilot adds:**
- **Content suggestions:** During heartbeats, FlowPilot proposes blog topics based on trending keywords, customer questions (from tickets/chat), and content gaps
- **SEO optimization:** FlowPilot reviews drafts and suggests meta descriptions, title improvements, and internal linking opportunities
- **Publishing cadence:** FlowPilot monitors publishing frequency against objectives and nudges when the schedule slips
- **Content-to-pipeline connection:** FlowPilot links blog performance (traffic, engagement) with lead generation data

---

### AI Chat

**What works without FlowPilot:**
- Full conversational AI via `chat-completion` edge function
- RAG-powered responses using Knowledge Base articles and page content
- Conversation history and session management
- Customer information capture
- Feedback collection (thumbs up/down)

**What FlowPilot adds:**
- **Personality and soul:** FlowPilot injects its soul (tone, values, communication style) into chat responses, creating a consistent brand voice
- **Objective-driven conversations:** FlowPilot steers conversations toward active objectives (e.g., promoting a new service, collecting feedback on a feature)
- **Escalation intelligence:** FlowPilot decides when to escalate to a human agent based on sentiment, complexity, and conversation history
- **Cross-session memory:** FlowPilot remembers returning visitors and adapts responses based on previous interactions

**Note:** AI Chat requires an AI provider (`requiresAI: true`) but does NOT require FlowPilot. Without FlowPilot, the chat uses generic RAG responses. With FlowPilot, responses are strategically aligned with business goals.

---

### Consultants

**What works without FlowPilot:**
- Full consultant profile management (skills, experience, certifications, rates)
- Manual search and filtering by skills, availability, and rate
- Profile editing with rich data (education, languages, portfolio)
- AI-powered matching and summaries (requires AI provider, not FlowPilot)

**What FlowPilot adds:**
- **Proactive matching:** During heartbeats, FlowPilot cross-references new leads/deals with consultant availability and suggests optimal team compositions
- **Capacity monitoring:** FlowPilot tracks consultant utilization and alerts when capacity is running low
- **Skill gap analysis:** FlowPilot identifies skills requested by prospects that aren't covered by current consultants
- **Auto-response to inquiries:** When a new lead matches a consultant's profile, FlowPilot can draft a personalized response referencing relevant experience

---

### Expenses

**What works without FlowPilot:**
- Full expense tracking with manual entry
- Category management and tagging
- Receipt upload and storage
- Approval workflows
- Reporting and export
- Accounting integration (journal entries)

**What FlowPilot adds:**
- **Anomaly detection:** During heartbeats, FlowPilot flags unusual spending patterns (e.g., sudden spikes in a category, duplicate amounts)
- **Auto-categorization:** FlowPilot suggests categories for new expenses based on merchant name and description patterns
- **Budget monitoring:** FlowPilot tracks spending against budgets and alerts before thresholds are exceeded
- **Receipt analysis:** Combined with the `analyze_receipt` sensor (vision AI), FlowPilot interprets receipt data and validates against entered amounts

---

### Contracts

**What works without FlowPilot:**
- Full contract lifecycle management (draft → active → expired)
- Counterparty tracking with contact details
- Document upload and versioning
- Start/end date and value tracking
- Renewal type configuration (auto, manual, none)
- Manual renewal notice tracking

**What FlowPilot adds:**
- **Renewal alerts:** During heartbeats, FlowPilot scans upcoming contract expirations and creates proactive reminders based on `renewal_notice_days`
- **Expiry monitoring:** FlowPilot flags contracts approaching their end date without renewal decisions
- **Value analysis:** FlowPilot connects contract values with revenue data and identifies contracts with poor ROI
- **Auto-renewal tracking:** For auto-renewing contracts, FlowPilot logs renewals and updates status automatically

---

### HR

**What works without FlowPilot:**
- Employee directory and profile management
- Leave request submission and approval
- Leave balance tracking
- Department and role management
- Basic reporting

**What FlowPilot adds:**
- **Leave pattern analysis:** During heartbeats, FlowPilot identifies leave patterns (e.g., frequent Monday absences) and flags potential issues
- **Onboarding automation:** FlowPilot creates onboarding task checklists for new employees and tracks completion
- **Capacity planning:** FlowPilot cross-references leave schedules with project timelines and alerts on coverage gaps
- **Policy compliance:** FlowPilot monitors leave balances and flags employees approaching limits

---

### Purchasing

**What works without FlowPilot:**
- Purchase order creation and management
- Supplier directory
- Order tracking (draft → sent → received)
- Budget tracking per order
- Inventory integration

**What FlowPilot adds:**
- **Reorder point monitoring:** During heartbeats, FlowPilot checks inventory levels against reorder points and suggests purchase orders
- **Supplier analysis:** FlowPilot tracks delivery times and quality across suppliers and recommends preferred vendors
- **Spend consolidation:** FlowPilot identifies opportunities to combine orders to the same supplier
- **Price trend tracking:** FlowPilot monitors price changes across orders and flags significant increases

---

### SLA

**What works without FlowPilot:**
- SLA policy definition (response time, resolution time per priority)
- SLA status tracking on tickets
- Breach logging and reporting
- Manual escalation triggers

**What FlowPilot adds:**
- **Proactive breach prediction:** During heartbeats, FlowPilot calculates time remaining on active SLAs and escalates tickets approaching breach
- **Response optimization:** FlowPilot prioritizes the ticket queue based on SLA urgency, not just creation order
- **Performance trending:** FlowPilot tracks SLA compliance over time and identifies systemic issues (e.g., "Tuesday tickets always breach")
- **Auto-escalation chains:** FlowPilot triggers escalation workflows when breach is imminent, before it actually occurs

---

## Architecture Notes

### Edge Functions Are "Hands"

All edge functions follow the OpenClaw [Sensors vs. Reasoning](./sensors-vs-reasoning.md) pattern:

- **Edge functions** = deterministic data operations (fetch, scrape, score, write)
- **FlowPilot** = the reasoning layer that chains operations, interprets results, and makes strategic decisions

This is why Enhanced modules work without FlowPilot — the "hands" still function, but there's no "brain" orchestrating them proactively.

### The Heartbeat as Enhancement Engine

Most FlowPilot enhancements activate during the [heartbeat loop](./presence.md). The 7-step protocol (Evaluate → Plan → Advance → Propose → Automate → Reflect → Remember) is what drives proactive behavior across all Enhanced modules. Without FlowPilot, there are no heartbeats — and therefore no proactive monitoring, suggestions, or autonomous actions.

### Graceful Degradation in Practice

When FlowPilot is disabled:
1. **No features break** — all manual workflows continue unchanged
2. **No data is lost** — everything FlowPilot would have monitored is still in the database
3. **No UI changes** — Enhanced modules show a subtle 🟡 indicator but all controls remain active
4. **Re-enabling is instant** — FlowPilot picks up where it left off, scanning for unprocessed items during its first heartbeat

---

*Last updated: 2026-04-14*
