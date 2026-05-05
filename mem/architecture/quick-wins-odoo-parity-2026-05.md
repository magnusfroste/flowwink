---
name: quick-wins-odoo-parity-2026-05
description: Polymorphic activities, multi-address, optional quote items, KB suggest on ticket, CSAT survey — Odoo 80/20 parity quick-wins
type: feature
---

# Quick Wins — Odoo 80/20 Parity (May 2026)

Five low-complexity additions that closed the most-felt Odoo gaps without
adding modules. Each is exposed via MCP for FlowPilot/peers.

## 1. Polymorphic activities (`activities` table)
- Generic timeline attachable to ANY entity via `entity_type` + `entity_id`
  (`deal`, `order`, `ticket`, `invoice`, `company`, `lead`, `contact`,
  `project`, `task`).
- Types: `note | call | meeting | todo | email | status_change`. Todos/calls/
  meetings support `due_at` + `done_at`.
- UI: `<EntityActivityTimeline entityType=... entityId=... />` — drop into any
  detail view.
- Hook: `useEntityActivities`, `useCreateEntityActivity`,
  `useToggleActivityDone`, `useDeleteEntityActivity`.
- Skill: `manage_activities` (handler `db:activities`, MCP-exposed).
- Coexists with the lead-only `lead_activities` table (we did NOT migrate that
  — point-of-truth split is intentional: scoring/gamification logic stays on
  leads).

## 2. Multi-address per contact (`addresses` table)
- `owner_type`: `company | profile | vendor | lead`. `address_type`:
  `billing | shipping | private | other`. `is_primary` exclusive per owner
  (enforced in UI, not constraint).
- UI: `<AddressList ownerType=... ownerId=... />`.
- Skill: `manage_addresses` (handler `db:addresses`, MCP-exposed).
- Profile-owned rows are user-readable/writable via RLS.

## 3. Optional products in quote
- `quote_items.is_optional` + `selected_by_customer` (default true).
- Public RPC `set_quote_item_selection(token, item_id, selected)`
  re-aggregates `quotes.subtotal/tax/total` from included lines only.
- UI: `PublicQuotePage` renders checkbox + "Optional" badge; dimmed/strike-
  through when deselected.

## 4. KB suggestions on ticket
- `tickets.suggested_kb_article_ids uuid[]` + helper UI
  `<TicketKbSuggestions ticket={...} />` in `TicketDetailDrawer`.
- Local keyword-overlap ranker (no AI call) picks top matches; "Suggest top 3"
  button persists them.
- Skill: `suggest_kb_for_ticket` (handler `db:tickets`, MCP-exposed) lets
  FlowPilot do the same write programmatically.

## 5. CSAT survey after ticket close
- DB trigger `trg_emit_ticket_resolved` on `tickets.status` → emits
  `ticket.resolved` platform event when status transitions to `resolved`.
- `tickets.csat_survey_sent_at` prevents duplicate sends.
- Edge function `csat-dispatch` (cron every 5–15 min): finds resolved tickets
  past `delay_hours` of the active campaign with `trigger='ticket_resolved'`,
  posts to `survey-send`, then stamps `csat_survey_sent_at`.
- Operator wires it up by creating a `survey_campaign` with
  `trigger='ticket_resolved'` and `is_active=true`. No campaign = silent.

## Why this scope
Each item touched ≤ 2 tables, ≤ 1 edge function, ≤ 1 reusable component.
Together they close the gap on multi-address, universal activities, upsells in
quotes, KB self-service, and post-resolution feedback — the five complaints
that landed most often vs Odoo demos. Higher-value but heavier additions
(payroll, lot/serial, multi-currency revaluation, real MRP, intercompany)
stay deferred per 80/20.
