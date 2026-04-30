---
id: customer360
name: Customer 360
manual: true
description: Unified view of every signal, deal, order, invoice, ticket, booking, subscription, chat and webinar tied to a person — with timeline and lifetime-value KPIs.
---

# Customer 360

> **Status:** Manually maintained.

The Customer 360 module is FlowWink's **single-pane-of-glass for everything you know about a person**. It answers the question "who is this customer, really?" in one screen — pulling together CRM signals, sales pipeline, finance, support, e-commerce and engagement data without the SMB owner having to click between five different admin sections.

This is the module that demonstrates the **unified data model** — the same person who filled out a form last month, bought a product yesterday, and opened a support ticket this morning is *one record*, not three.

---

## What it shows

For any person looked up by email or lead-id:

- **Identity** — name, email, phone, company, lead status, score, AI summary
- **KPIs** — lifetime value, open deals value, open invoices value, open tickets
- **Counts** — quick badges per related entity type
- **Timeline** — chronological feed of every recorded interaction (lead activities, deals, orders, invoices, quotes, tickets, bookings, subscriptions, chats, webinar registrations, tasks)

---

## Architecture

| Component | Purpose |
|---|---|
| `customer-360` edge function | Aggregator — admin JWT auth, service-role cross-table reads |
| `useCustomer360()` hook | React Query wrapper |
| `/admin/customer/:identifier` | The 360° page — accepts UUID or URL-encoded email |
| `/admin/customer` | Search-only landing variant |

**No new tables.** The module is pure read aggregation over existing data. The lookup uses `lead_id` when available and falls back to `email` so e-commerce customers without a CRM lead row are still reachable.

**No skills, no MCP exposure.** The value lives in the UI — agents already have direct access to all underlying tables via existing skills.

---

## When SMBs use it

- "A customer just called — what's their full story?"
- "We're about to send a renewal — any open tickets we should resolve first?"
- "How much has this customer actually spent across all our products?"
- "Did they engage with our last webinar before their order?"

---

## Extending

To include a new related entity (e.g. surveys, NPS responses):

1. Add a parallel fetch in `customer-360/index.ts` — match by `lead_id` and/or `email`.
2. Add timeline events with `kind`, `title`, optional `amount` / `status` / `href`.
3. Add an icon + color in `Customer360Page.tsx` (`KIND_ICON`, `KIND_COLOR`).
4. Update KPI/count calculations if the entity affects lifetime value or open work.
