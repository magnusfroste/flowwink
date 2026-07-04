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
| **Book-to-Meet** | L3 | Booking, Email, Voice (IVR), Calendar, SLA, HR (staff) | [book-to-meet.md](./book-to-meet.md) |
| **Register-to-Attend** | L3 | Webinars, Leads/CRM, Blog (content loop), Automations | [register-to-attend.md](./register-to-attend.md) |

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

## The CEO/CFO question — where does agentic AI work today?

For readers arriving from the agentic-AI handbook ([clawable.org](https://clawable.org)):
the honest answer to *"which business processes does agentic AI actually work
for?"* is this catalog. Each doc's **Agent coverage** table shows exactly which
steps an agent runs today (🤖 FlowPilot / 🔗 external operator) versus a human
(👤), and the maturity level says how much you can lean on it. The business
lever, per process:

| Process | What the agent runs today | Business lever |
|---|---|---|
| Lead-to-Customer (L4) | Qualifies, scores, dedupes leads; drafts follow-ups | **More deals** — minutes-not-days response time |
| Book-to-Meet (L3) | Books/checks availability via chat & voice, sends reminders | **More deals** — 24/7 booking without a receptionist |
| Quote-to-Cash (L3) | Creates & sends quotes, chases expiry, records payments | **Faster cash** — shorter quote→paid cycle |
| Subscribe-to-Renew (L3) | Bills, runs the dunning ladder, flags churn risk | **Safer cash** — fewer silently lost renewals |
| Content-to-Conversion (L4) | Drafts/publishes content, answers from the KB | **Cheaper marketing** — output without headcount |
| Support-to-Resolution (L3) | First-line answers, routing, KB deflection | **Lower support cost** per ticket |
| Procure-to-Pay (L3) | 3-way match auto-approve, expense month-end loop | **Lower admin cost** — no invoice-matching hours |
| Record-to-Report (L3) | Posts expenses/payroll/depreciation, reconciles bank | **Lower accounting cost** — balanced vouchers, automatically |
| Return-to-Refund (L3) | RMA intake, QC stamps, partial refunds with guardrails | **Lower ops cost** — returns without escalation |
| Order-to-Delivery (L3) | Stock checks, fulfillment steps, order status | **Lower ops cost**, fewer stockout surprises |
| Register-to-Attend (L3) | Registrations, lifecycle, attendance scoring | **More pipeline** from events |
| Hire-to-Retire (L3) | Screening assist, contracts, expense loop | **Lower HR admin** |
| Acquire-to-Retire (L3) | Depreciation runs, disposal postings | **Lower accounting cost** |

Everything a human sees, the agent did through the same skills — and every
agent action is verifiable in the record's timeline (the "titthål" principle).
That is what makes the CEO/CFO delegation safe: you don't trust the agent,
you *verify* it — at a glance.

---

## Gaps are an invitation (community)

Every process doc ends with an honest "Known gaps (missing for L5)" list, and
the adopter sections flag statuses that exist in schema but have no wired
transition. That transparency is deliberate and does double duty:

- **Adopters** see exactly what they get today (L3 = run it in production)
  and what to expect next — no marketing fog.
- **Contributors** see a concrete, scoped backlog with business value
  attached: close a gap, and you've built something real businesses run on —
  and something you can build a business around yourself (hosting, services,
  verticals). The gap lists ARE the contribution funnel; pick one, see
  [contributing](../contributing/contributing.md).

Also usable as training material: the "How it works in practice" sections
teach the standard process itself (what a quote lifecycle or an expense
month-end IS), not just FlowWink's buttons — useful for onboarding staff who
have never worked with system support before.

---

## How we use this in sales

1. **Discovery:** "Which processes do you run today?" → match against the list above
2. **Coverage:** Show the maturity level honestly — L3 is enough for most SMBs
3. **Gap analysis:** Make explicit what the agent covers (L4+) vs. manual admin (L3)
4. **Roadmap:** What moves from L3 → L4 → L5 next quarter

---

*Documentation is maintained manually for now. Once `defineModule()` gains `processes` + `maturity` metadata we can auto-generate an `/admin/process-coverage` page.*
