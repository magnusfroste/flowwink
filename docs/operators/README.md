---
title: For Operators — Running FlowWink
description: Install, configure, and operate FlowWink for a real business. Self-hosted, single-tenant.
category: operators
---

# Running FlowWink

You're an operator if you want to **use** FlowWink for a business — not modify the code. Each deployment is a single-tenant site you control.

---

## 1. Install

| Step | Doc |
|---|---|
| **Install without a CLI** (fork + Vercel + Supabase dashboards only — recommended) | [`./provisioning-without-cli.md`](./provisioning-without-cli.md) |
| **The long-lived testbed** (Nordbrygg — never reset, agents act on it over months) | [`./nordbrygg-testbed.md`](./nordbrygg-testbed.md) |
| Backend setup & env vars | [`../guides/setup.md`](../guides/setup.md) |
| Production deployment (Supabase Cloud + Vercel) | [`../guides/deployment.md`](../guides/deployment.md) |
| Security & auth model | [`../guides/security.md`](../guides/security.md) |
| **System Settings reference** (`/admin/settings`) | [`./system-settings.md`](./system-settings.md) |
| **Users, access & invitations** | [`./users-access-and-invites.md`](./users-access-and-invites.md) |

After install: log in, complete `/admin/onboarding`, pick a template, run the docs sync from `/admin/docs`, then walk through [`system-settings.md`](./system-settings.md) tab by tab.

> Weighing alternatives? See [`comparison.md`](./comparison.md) — FlowWink vs Odoo / HubSpot / NetSuite.

---

## 2. Decide your operator

FlowPilot ships as **one** module among many. You can:

- Run **FlowPilot** locally (default — autonomous loop, soul, skills, heartbeat)
- Run an **external operator** over MCP (OpenClaw, Claude Desktop, custom)
- Run **both** (FlowPilot for day-to-day, external for cross-site or specialized work)
- Run **none** (use FlowWink as a plain modular SaaS — modules and admin UI still work)

See [`../concepts/operator-strategy.md`](../concepts/operator-strategy.md). MCP endpoint and group filtering: [`../architecture/mcp-as-platform.md`](../architecture/mcp-as-platform.md).

---

## 3. Pick your modules

Modules are opt-in capabilities (CRM, Orders, Accounting, HR, Pages, Blog, …). Toggle them in `/admin/modules`. Each module:

- Owns its tables & RLS
- Exposes **skills** (callable by FlowPilot or any MCP client)
- Has a dedicated page in [`../modules/`](../modules/) — auto-generated from `defineModule()` with skill catalog, owned tables, webhook events, and processes it participates in

Tiers (`core` / `standard` / `extended` / `experimental`) explained in [`../architecture/module-tiers.md`](../architecture/module-tiers.md).

**Highlights to read first:**

- [`flowbox.md`](../modules/flowbox.md) — the one queue over email, chat, tickets, forms and calls; FlowPilot first, what needs a person on top
- [`email-guide.md`](../modules/email-guide.md) — the company mailbox, replies, and how FlowPilot answers mail under each mailbox's reply mode
- [`accounting.md`](../modules/accounting.md) — locale packs (BAS 2024 / IFRS / US GAAP), autonomous reconciliation
- [`crm.md`](../modules/crm.md), [`leads.md`](../modules/leads.md), [`deals.md`](../modules/deals.md) — the sales engine
- [`subscriptions.md`](../modules/subscriptions.md) — Stripe + manual invoice-driven billing, daily cron
- [`flowpilot.md`](../modules/flowpilot.md) — the local operator
- [`federation.md`](../modules/federation.md) — connecting external agents

### Where things are in the menu

The admin sidebar groups pages by who works there. Items appear only when their module is on and your role has it (**Admin → Role Permissions**).

| Group | Items |
|---|---|
| **Main** | Dashboard, FlowChat (admin), FlowPilot, Analytics, Flowwork, Profile |
| **Automate** | Automations, Federation |
| **Content** | Website, Business Identity, Blog, Media Library, Knowledge Base, Docs, Handbook, Wiki, River, Flowtable, Trash |
| **Marketing** | Campaigns, Newsletter, Growth, Social posts, Webinars, WebMeet, Forms |
| **Support** | FlowBox, Email, Tickets, Surveys & NPS, AI Chat, Voice |
| **Sales** | Contacts, Companies, Deals, Activities, Pipeline Stages, Bookings, Calendar, Customer 360, Sales Intelligence, Visitor Intelligence, Consultants |
| **Finance** | Quotes, Quote templates, Invoices, Subscriptions, Dunning, Point of Sale, POS Audit, Accounting, Expenses, Approvals, Reconciliation, Payroll, Fixed Assets, Currencies |
| **Commerce** | Products, Orders, Customers, Inventory, Units of Measure, Pricelists, Shipping, Returns / RMA, Vendors, Purchase Orders, Manufacturing |
| **Operations** | Projects, Timesheets, HR & Employees, Recruitment, Contracts, Contract templates, Documents, Field Service, Maintenance, SLA Monitor |
| **Admin** (admins only) | Site Settings, Branding, Users, Role Permissions |
| **System** (admins only) | Modules, Integrations, Templates, Developer, AI Usage, System |

Pin any page to the header bar for quick access (up to eight). On a desktop-width screen the pins can be dragged into the order you want — a click is still a click; the order is saved to your profile.

---

## 4. Learn the processes

Business flows that span multiple modules:

| Process | Doc |
|---|---|
| Content → conversion | [`../processes/content-to-conversion.md`](../processes/content-to-conversion.md) |
| Lead → customer | [`../processes/lead-to-customer.md`](../processes/lead-to-customer.md) |
| Quote → cash | [`../processes/quote-to-cash.md`](../processes/quote-to-cash.md) |
| Sign → serve | [`../processes/sign-to-serve.md`](../processes/sign-to-serve.md) |
| Order → delivery | [`../processes/order-to-delivery.md`](../processes/order-to-delivery.md) |
| Procure → pay | [`../processes/procure-to-pay.md`](../processes/procure-to-pay.md) |
| Record → report | [`../processes/record-to-report.md`](../processes/record-to-report.md) |
| Hire → retire | [`../processes/hire-to-retire.md`](../processes/hire-to-retire.md) |
| Support → resolution | [`../processes/support-to-resolution.md`](../processes/support-to-resolution.md) |

---

## 5. Run external "claws"

If you operate FlowWink alongside specialist agents (marketing growth, finance reconciliation, etc.), assign each one a playbook:

- [`../agents/marketing-claw-playbook.md`](../agents/marketing-claw-playbook.md)
- [`../agents/sales-claw-playbook.md`](../agents/sales-claw-playbook.md)
- [`../agents/finance-claw-playbook.md`](../agents/finance-claw-playbook.md)
- [`../agents/operations-claw-playbook.md`](../agents/operations-claw-playbook.md)
- [`../agents/support-claw-playbook.md`](../agents/support-claw-playbook.md)
- [`../agents/success-claw-playbook.md`](../agents/success-claw-playbook.md)
- Invite flow: [`../agents/agent_invite.md`](../agents/agent_invite.md)

---

## 6. Operate & maintain

| Task | Doc |
|---|---|
| Backups, updates, troubleshooting | [`../guides/maintenance.md`](../guides/maintenance.md) |
| Version upgrades | [`../guides/upgrading.md`](../guides/upgrading.md) |
| Migrate content from an existing site | [`../guides/site-migration.md`](../guides/site-migration.md) |
| FlowPilot slash commands | [`../reference/commands.md`](../reference/commands.md) |
| Headless REST/GraphQL content API | [`../reference/headless-api.md`](../reference/headless-api.md) |

---

## What you do not need to read

The whole [`builders/`](../builders/README.md), [`pilot/`](../pilot/), and [`contributing/`](../contributing/) trees are for people extending the codebase. Skip them unless you're writing your own module.
