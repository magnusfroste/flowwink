---
title: "Module catalog"
description: Every FlowWink module — category, autonomy level, skill count and owned tables. Generated from code.
category: modules
generated: true
---

# Module catalog

68 modules across 5 categories, 588 module-owned skills.
Platform skills (search_web, manage_site_settings, briefings…) are not owned by a module — see [`src/lib/platform-seeds.ts`](../reference/skills-source.md).

**How a module behaves**

```text
Enable  → seedData() → skills registered in agent_skills → automations armed
Disable → skills disabled → automations disarmed (data is preserved)
```

With FlowPilot off, a module is a normal admin UI. With FlowPilot on, the same module is operable by the agent through its skills. Autonomy column:

| Autonomy | Meaning |
|---|---|
| `agent-capable` | FlowPilot can operate the module through its skills |
| `view-required` | Data is agent-readable; changes happen in the admin UI |
| `config-required` | Needs an integration or setting before it does anything |

## Communication

| Module | Autonomy | Skills | What it does |
|---|---|---:|---|
| [**Chat**](./chat.md) | view-required | 1 | Public visitor chat — the AI-powered widget and /chat landing page for anonymous site visitors. For internal operator chat use FlowChat… |
| [**Contact Center**](./live-support.md) | view-required | 9 | Omnichannel contact center: human-agent takeover across web chat, Telegram (and future SMS/voice), with presence-aware routing, callbacks,… |
| [**Flowwork**](./workspace-chat.md) | view-required | 1 | Internal authenticated chat that blends your workspace data with the model |
| [**Newsletter**](./newsletter.md) | config-required | 6 | Create newsletter drafts for sending |
| [**River**](./river.md) | view-required | 3 | Internal social feed (X / Instagram / Slack-inspired) for the team. Authenticated staff post short messages with images, reply in threads,… |
| [**Tickets**](./tickets.md) | agent-capable | 5 | Helpdesk ticket management with Kanban pipeline |
| [**Voice**](./voice.md) | config-required | 3 | Inbound + outbound voice calls via pluggable providers (46elks, Twilio, ...). WebRTC browser softphone in admin, voicemail, missed-call… |
| [**Webinars**](./webinars.md) | config-required | 9 | Plan, promote, run and follow up webinars — lifecycle, lead-loop, reminders and content-loop |
| [**WebMeet**](./webmeet.md) | agent-capable | 3 | Quick 1-to-few video meetings with shareable URLs and screen sharing — peer-to-peer WebRTC, no SFU required. Use for internal huddles,… |

## Content

| Module | Autonomy | Skills | What it does |
|---|---|---:|---|
| [**Agentic Handbook**](./handbook.md) | agent-capable | 3 | Agentic methodology handbook with search and reader capabilities |
| [**Blog**](./blog.md) | config-required | 16 | Publish content to the blog |
| [**Docs**](./docs.md) | agent-capable | 3 | Public documentation portal — auto-synced from the GitHub docs/ folder, browsable at /docs with embedded AI chat for evaluators. |
| [**Knowledge Base**](./knowledge-base.md) | config-required | 5 | Create knowledge base articles |
| [**Site Migration**](./site-migration.md) | agent-capable | 2 | Clone and migrate external websites into FlowWink. Discovers pages, extracts branding, and creates blocks that match the source site |
| [**Website**](./pages.md) | config-required | 15 | Create and publish website pages, header, footer, branding and navigation |
| [**Wiki**](./wiki.md) | agent-capable | 6 | Internal TEdit-style wiki / intranet with page hierarchy, automatic version history (list/diff/restore), and per-page permissions… |

## Data

| Module | Autonomy | Skills | What it does |
|---|---|---:|---|
| [**Accounting**](./accounting.md) | agent-capable | 32 | Double-entry bookkeeping with pluggable locale packs (chart of accounts, VAT rules, payroll, bank import). Default: BAS 2024 (Sweden); also… |
| [**Approvals**](./approvals.md) | agent-capable | 10 | Generic approval engine — define rules (entity type + amount threshold + required role) and route requests for sign-off. Used by… |
| [**Booking**](./bookings.md) | config-required | 9 | Create and manage bookings/appointments |
| [**Companies**](./companies.md) | view-required | 16 | Create and manage company records with optional AI enrichment |
| [**Consultants**](./consultants.md) | agent-capable | 7 | Match consultant profiles against job descriptions with AI-powered scoring and cover letters |
| [**Contracts**](./contracts.md) | agent-capable | 13 | Contract lifecycle management with renewal tracking and document storage |
| [**CRM**](./leads.md) | view-required | 22 | Create and manage leads |
| [**Customer 360**](./customer360.md) | view-required | 1 | One screen showing every signal, deal, order, invoice, ticket, booking, subscription, chat and webinar tied to a person or customer — with… |
| [**Deals**](./deals.md) | view-required | 2 | Create and manage sales deals/opportunities |
| [**Documents**](./documents.md) | agent-capable | 4 | Document management with categorization, entity linking, and version tracking |
| [**Expense Reporting**](./expenses.md) | agent-capable | 11 | Employee expense reporting with receipt scanning, monthly report submission, approval workflow, and autonomous journal entry booking via… |
| [**Field Service**](./field-service.md) | view-required | 9 | Dispatch on-site service orders: schedule technicians, track visits, capture signatures and auto-generate invoices on completion. |
| [**Fixed Assets**](./fixed-assets.md) | agent-capable | 9 | Capitalize equipment, run monthly depreciation, and post disposals — all to BAS 2024 accounts (1210/1219/7832 + 3970/7970). |
| [**Flowtable**](./flowtable.md) | agent-capable | 10 | Airtable-style flexible tables for lists, prospect sheets, content backlogs. CSV import/export + push-to-CRM bridge. |
| [**Forms**](./forms.md) | view-required | 2 | Process form submissions and create leads |
| [**HR & Employees**](./hr.md) | agent-capable | 11 | Employee directory, leave management, and organizational structure |
| [**Inventory**](./inventory.md) | agent-capable | 17 | Multi-location inventory: locations, lots/serials, quants, reservations, transfers, MRP scheduler, and a full Pick & Pack flow that… |
| [**Invoicing**](./invoicing.md) | agent-capable | 9 | Create and manage invoices with line items, tax computation, and status tracking |
| [**Maintenance**](./maintenance.md) | view-required | 6 | Equipment registry, corrective + preventive maintenance requests, and interval-based preventive schedules with a nightly sweep. Odoo… |
| [**Manufacturing**](./manufacturing.md) | agent-capable | 17 | MRP-light: Bills of Materials, Manufacturing Orders, component reservation, and the link from production demand to procurement. |
| [**Media Library**](./media-library.md) | config-required | 6 | Manage media assets and files |
| [**Meeting Polls**](./meeting-polls.md) | view-required | 4 | Propose several times, let people answer by link without an account, and let a rule pick the first time everyone can make |
| [**Multi-Currency**](./multi-currency.md) | agent-capable | 8 | Sell and bill in multiple currencies with daily ECB rates, bulk historical rate import, FX revaluation of open AR/AP, realized FX on… |
| [**Payroll**](./payroll.md) | agent-capable | 15 | Monthly payroll runs: snapshots employees + recurring components + salary structures, per-country statutory profiles (SE default: 31.42%… |
| [**Point of Sale**](./pos.md) | view-required | 16 | In-store register — sessions, receipts, split payments, stock-aware product catalog |
| [**Pricelists**](./pricelists.md) | config-required | 6 | Versioned pricing per customer, company, segment, country, or period — Odoo-style price lists with fixed prices, discount %, formula… |
| [**Products**](./ecommerce.md) | config-required | 15 | Create and manage e-commerce products |
| [**Projects**](./projects.md) | agent-capable | 17 | Project and task management with Kanban boards, assignments, and time tracking integration |
| [**Purchasing**](./purchasing.md) | agent-capable | 22 | Procure-to-pay lifecycle: purchase orders, vendor management, and goods receipt |
| [**Quotes**](./quotes.md) | view-required | 4 | Sales quotes with line items, versioning, customer e-sign via public link, reusable templates, and approval workflow before sending… |
| [**Reconciliation**](./reconciliation.md) | agent-capable | 10 | Bank reconciliation: Stripe payout sync + bank file import (CAMT.053/MT940/OFX/CSV/SIE) + OCR import of statement images/PDFs. Auto-matches… |
| [**Recruitment**](./recruitment.md) | agent-capable | 15 | Applicant Tracking System — job postings, candidate pipeline, AI scoring and outreach. FlowPilot runs the daily pipeline review. |
| [**Returns / RMA**](./returns.md) | view-required | 8 | Return-merchandise-authorization flow with line-item tracking, approval, restock-on-receive, and refund processing. Customers see their own… |
| [**Sales Intelligence**](./sales-intelligence.md) | agent-capable | 5 | Prospect research, fit analysis, profile management, and introduction letter generation |
| [**Shipping**](./shipping.md) | config-required | 13 | Outbound shipping with multi-parcel support and carrier integrations. Built-in: PostNord, DHL, Bring. Tracking URLs are auto-rendered from… |
| [**Subscriptions**](./subscriptions.md) | view-required | 21 | Recurring revenue lifecycle — active customers, MRR, churn, dunning, renewals, win-back |
| [**Surveys & NPS**](./surveys.md) | agent-capable | 6 | Capture customer satisfaction with one-click NPS, CSAT, and custom surveys. Triggered manually or automatically after orders, tickets,… |
| [**Timesheets**](./timesheets.md) | agent-capable | 10 | Time tracking for employees and projects with billable/non-billable categorization |

## Insights

| Module | Autonomy | Skills | What it does |
|---|---|---:|---|
| [**Analytics**](./analytics.md) | view-required | 9 | Dashboard with insights on leads, deals, and newsletter performance |
| [**Business Identity**](./company-insights.md) | agent-capable | 3 | Unified business identity, financials, and market positioning. Feeds Sales Intelligence, Chat AI, SEO, FlowPilot, and external agents (MCP… |
| [**Calendar**](./calendar.md) | view-required | 3 | Unified calendar aggregating bookings, tasks, leave and renewals |
| [**Paid Growth**](./paid-growth.md) | agent-capable | 10 | Manage ad campaigns and track paid growth performance |
| [**SLA Monitor**](./sla.md) | agent-capable | 10 | Service level agreement monitoring for order fulfillment, ticket response, lead handling, chat reply times, and booking confirmations.… |
| [**Visitor Intelligence**](./visitor-intelligence.md) | agent-capable | 2 | Behavioral signals from anonymous browsing — identity stitching, rule-based scoring, and a per-lead visitor timeline in the CRM. |

## System

| Module | Autonomy | Skills | What it does |
|---|---|---:|---|
| [**Browser Control**](./browser-control.md) | config-required | 1 | Chrome Extension relay for authenticated web browsing — enables FlowPilot to read login-walled sites (LinkedIn, X) using your browser… |
| [**Composio**](./composio.md) | agent-capable | 4 | Connect to 1000+ external apps via managed OAuth and intent-based tool resolution |
| [**Developer**](./developer.md) | config-required | 4 | API explorer, webhooks, and developer tools for integrating with external systems. Also hosts platform-level skills (e.g. global_search). |
| [**Email**](./email.md) | agent-capable | 10 | Provider-agnostic email sender. Routes system emails through SMTP or Resend. |
| [**Federation**](./federation.md) | agent-capable | 13 | Agent-to-Agent protocol — register and manage peer connections |
| [**FlowPilot**](./flowpilot.md) | config-required | 7 | Autonomous AI operator — skills, objectives, automations and workflows. When disabled, FlowWink runs as a traditional SaaS; when enabled,… |
| [**Global Blocks**](./global-elements.md) | config-required | 0 | Create reusable global content blocks (header, footer, etc.) |
| [**Templates**](./templates.md) | config-required | 4 | Template gallery, export current site as reusable template, and import templates from file |

## Deep dives (hand-maintained)

Longer companions to the generated pages above — design rationale, playbooks, operational detail.

- [Consultants — profiles and matching](./consultants-guide.md)
- [Email — inbox, replies and FlowPilot first](./email-guide.md)
- [FlowBox — one queue over every channel](./flowbox.md)
- [Live Support (retired) — see FlowBox](./live-support-guide.md)
- [Invoice-Driven Subscriptions (B2B Manual Billing)](./subscriptions-invoice-billing.md)
- [Voice / WebRTC Softphone](./voice-softphone.md)

---

*Auto-generated by `scripts/generate-module-docs.ts`. Do not edit — re-run the script after changing a module definition.*
