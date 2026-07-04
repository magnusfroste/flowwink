# Business Processes — FlowWink Coverage Map

> **What is this?** A business process usually spans multiple modules. This folder maps which **business processes** FlowWink supports, which modules participate, and at what **maturity level** each one currently sits.
>
> **Audience (initially):** Internal — to keep track of what we can actually deliver in customer conversations. Excerpts can later be published or shared as PDF.

---

## Maturity Scale (5 levels)

| Level | Name | Meaning |
|-------|------|---------|
| **L1** | **Stub** | Data model exists. No UI, no logic. |
| **L2** | **Manual** | Admin can CRUD via UI. No automation. |
| **L3** | **Operational** | Happy path works end-to-end. Customer can run the process in production. |
| **L4** | **Agent-augmented** | An agent (FlowPilot or external) can execute parts of the process autonomously. |
| **L5** | **Production-grade** | Edge cases, approvals, audit trail, multi-entity. ERP-grade. |

**Rule of thumb for sales:**
- L3 = "Yes, we support it"
- L4 = "Yes, and the agent can run parts autonomously"
- L5 = "Yes, even for complex cases" (few processes are here today)

---

## Agent Coverage

For each process we mark **who does what**:

| Actor | Description |
|-------|-------------|
| 👤 **Manual** | Human via admin UI |
| 🤖 **FlowPilot** | The platform's built-in agent |
| 🔗 **External agent** | Federated peer (e.g. ClawThree, OpenClaw) via A2A/MCP |

---

## Core Processes

| Process | Maturity | Modules | Doc |
|---------|----------|---------|-----|
| **Lead-to-Customer** | L4 | Forms, Leads/CRM, Sales Intelligence, Companies, Deals, Newsletter | [lead-to-customer.md](./lead-to-customer.md) |
| **Quote-to-Cash** | L3 | Quotes, Deals, Projects, Timesheets, Invoicing, Accounting, Reconciliation, Contracts | [quote-to-cash.md](./quote-to-cash.md) |
| **Procure-to-Pay** | L3 | Purchasing (3-way match), Inventory, Expenses (full P2P), Invoicing, Accounting | [procure-to-pay.md](./procure-to-pay.md) |
| **Order-to-Delivery** | L3 | Products, Inventory, POS, SLA, Documents | [order-to-delivery.md](./order-to-delivery.md) |
| **Hire-to-Retire** | L3 | Recruitment, HR, Contracts, Documents, Expenses, Resume | [hire-to-retire.md](./hire-to-retire.md) |
| **Content-to-Conversion** | L4 | Pages, Blog, KB, Newsletter, Growth (Paid), Analytics, Sales Intelligence | [content-to-conversion.md](./content-to-conversion.md) |
| **Record-to-Report** | L3 | Accounting (period lock + SIE/SAF-T), Reconciliation, Invoicing, Expenses, Analytics | [record-to-report.md](./record-to-report.md) |
| **Support-to-Resolution** | L3 | Chat, Tickets, Live Support, Knowledge Base, SLA, Analytics | [support-to-resolution.md](./support-to-resolution.md) |
| **Subscribe-to-Renew** | L3 | Subscriptions, Invoicing, Reconciliation, CRM | [subscribe-to-renew.md](./subscribe-to-renew.md) |
| **Return-to-Refund** | L3 | Returns, Inventory, Invoicing, Shipping | [return-to-refund.md](./return-to-refund.md) |
| **Acquire-to-Retire** | L3 | Fixed Assets, Accounting, Purchasing | [acquire-to-retire.md](./acquire-to-retire.md) |

---

## The adopter layer — "How it works in practice"

The sections above serve the **program lens** (what we cover, at which maturity).
Each process doc also carries an **adopter lens**: the working understanding
someone needs when moving from spreadsheets to system support. That layer is a
standard section per process doc, titled **"How it works in practice"**, with
four fixed parts:

1. **The work story** — the happy path as a short narrative with named actors
   ("an employee photographs a receipt … at month end the report …"). No
   feature lists; a month in the life.
2. **State machines** — one table **per entity that carries a status**, because
   processes usually couple several (expenses have statuses on both the expense
   AND the monthly report). Columns: `Status · Meaning · Who/what moves it
   forward · What the transition does`. The transition-effect column is the
   important one — "book" is not a label change, it posts Dt cost+VAT / Cr 2890.
   **This is the canonical home for status documentation.** Module docs are
   generated and must never restate state tables — they already link here.
   If a status exists in the schema but no transition is implemented, say so
   explicitly (e.g. `rejected — in schema, transition not yet wired`).
3. **Who does what** — employee / manager / agent split, reusing the existing
   Agent-coverage table where possible rather than adding a second table.
4. **Coming from spreadsheets** — 3–5 bullets mapping the old manual artifacts
   to their new home ("the Excel column 'OK?' is the report status; the
   end-of-month email is `submit_expense_report`").

Anti-duplication rules: statuses live **only** here (schema CHECK constraints
are the machine truth, this section is the human truth — if they disagree, the
doc is wrong); module composition lives only in the generated
`docs/modules/*.md`; program status (maturity/gaps) stays in the sections
above. Exemplar: [procure-to-pay.md](./procure-to-pay.md) § Expenses.

---

## How we use this in sales

1. **Discovery:** "Which processes do you run today?" → match against the list above
2. **Coverage:** Show the maturity level honestly — L3 is enough for most SMBs
3. **Gap analysis:** Make explicit what the agent covers (L4+) vs. manual admin (L3)
4. **Roadmap:** What moves from L3 → L4 → L5 next quarter

---

*Documentation is maintained manually for now. Once `defineModule()` gains `processes` + `maturity` metadata we can auto-generate an `/admin/process-coverage` page.*
