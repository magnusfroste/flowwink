# FlowPilot Module Dependencies

> How FlowPilot assists each module — and what happens without it.

## Dependency Tiers

| Tier | Flag | Effect when FlowPilot is OFF |
|------|------|------------------------------|
| 🔴 **Requires** | `requiresFlowPilot: true` | Module is **disabled** — cannot function without the reasoning engine |
| 🟡 **Enhanced** | `enhancedByFlowPilot: true` | Module works as **Human-First CRUD** — proactive/autonomous features are lost |
| 🟢 **Independent** | *(neither flag)* | Full functionality, no degradation |

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
- **Contextual analysis:** FlowPilot uses its sales domain handler (`handlers.ts: sales`) to provide strategic reasoning about fit scores, ICP alignment, and outreach timing
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

### Other Enhanced Modules

| Module | FlowPilot Enhancement |
|--------|----------------------|
| **Leads** | Proactive scoring, auto-qualification during heartbeats |
| **Deals** | Pipeline health analysis, stale deal alerts |
| **Blog** | Content scheduling, SEO suggestions during heartbeats |
| **AI Chat** | FlowPilot personality and objectives enrich conversations |
| **Consultants** | Proactive matching, team composition recommendations |
| **Expenses** | Anomaly detection, auto-categorization |
| **Contracts** | Renewal alerts, expiry monitoring |
| **HR** | Leave pattern analysis, onboarding automation |
| **Purchasing** | Reorder point monitoring, supplier analysis |
| **SLA** | Proactive SLA breach prediction |

---

## Architecture Notes

### Edge Functions Are "Hands"

All edge functions in the Sales Intelligence and Tickets domain follow the OpenClaw "Sensors vs. Reasoning" pattern:

- **Edge functions** = deterministic data operations (fetch, scrape, score, write)
- **FlowPilot** = the reasoning layer that chains operations, interprets results, and makes strategic decisions

This is why these modules work without FlowPilot — the "hands" still function, but there's no "brain" orchestrating them proactively.

### The `enhancedByFlowPilot` Contract

When a module declares `enhancedByFlowPilot: true`:
1. The module MUST be fully functional as manual CRUD without FlowPilot
2. FlowPilot skills for the module are optional enhancements
3. The UI shows a degradation indicator (🟡) when FlowPilot is inactive
4. No feature gates — all manual actions remain available

---

*Last updated: 2026-04-14*
