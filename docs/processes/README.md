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
| **Lead-to-Customer** | L4 | Forms, Leads, Sales Intelligence, Deals, Companies | [lead-to-customer.md](./lead-to-customer.md) |
| **Quote-to-Cash** | L3 | Deals, Projects, Timesheets, Invoicing, Accounting | [quote-to-cash.md](./quote-to-cash.md) |
| **Procure-to-Pay** | L3 | Purchasing, Inventory, Expenses, Invoicing, Accounting | [procure-to-pay.md](./procure-to-pay.md) |
| **Order-to-Delivery** | L3 | E-commerce, Inventory, SLA, Documents | [order-to-delivery.md](./order-to-delivery.md) |
| **Hire-to-Retire** | L2 | HR, Contracts, Documents, Expenses | [hire-to-retire.md](./hire-to-retire.md) |
| **Content-to-Conversion** | L4 | Pages, Blog, Newsletter, Paid Growth, Analytics | [content-to-conversion.md](./content-to-conversion.md) |
| **Record-to-Report** | L2 | Accounting, Invoicing, Expenses, Analytics | [record-to-report.md](./record-to-report.md) |
| **Support-to-Resolution** | L3 | Tickets, Live Support, Knowledge Base, SLA | [support-to-resolution.md](./support-to-resolution.md) |

---

## How we use this in sales

1. **Discovery:** "Which processes do you run today?" → match against the list above
2. **Coverage:** Show the maturity level honestly — L3 is enough for most SMBs
3. **Gap analysis:** Make explicit what the agent covers (L4+) vs. manual admin (L3)
4. **Roadmap:** What moves from L3 → L4 → L5 next quarter

---

*Documentation is maintained manually for now. Once `defineModule()` gains `processes` + `maturity` metadata we can auto-generate an `/admin/process-coverage` page.*
