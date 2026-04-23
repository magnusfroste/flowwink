---
title: "Invoicing Module"
module_id: "invoicing"
version: "1.1.0"
category: "data"
autonomy: "agent-capable"
generated: true
generated_at: "2026-04-23"
---

# Invoicing

> Order-to-Cash automation: draft invoices, bulk billing from timesheets, graduated dunning, and auto-paid reconciliation.

## Quick Facts

| Property | Value |
|----------|-------|
| **Module ID** | `invoicing` |
| **Version** | 1.1.0 |
| **Category** | data |
| **Autonomy** | agent-capable |
| **Core** | No |
| **Capabilities** | `data:write`, `data:read` |

## Integrations

**Optional:** `stripe`, `resend`

## Loops

### Order-to-Cash

Closes the loop from billable hours all the way to a paid, reconciled invoice.

| Step | Skill / Mechanism | Outcome |
|------|-------------------|---------|
| 1 | `bulk_invoice_from_timesheets(project_id, start, end)` | Aggregates billable, uninvoiced `time_entries` into a draft invoice; marks entries as invoiced |
| 2 | `manage_invoice` (`send`) | Draft → `sent` |
| 3 | `invoice_overdue_check` (cron, daily 08:00) | `sent` → `overdue` past due date |
| 4 | `send_dunning_reminders` | Idempotent sweep — friendly (7d), formal (14d), final (30d). Logs `dunning_actions` |
| 5 | Trigger `trg_auto_mark_invoice_paid` on `reconciliation_matches` | When `SUM(reconciled_amount) ≥ invoice.total_cents` → status `paid` |

## API Contract

**Actions (publish):** `create`, `update`, `list`

**Skills:** `manage_invoice`, `invoice_from_timesheets`, `bulk_invoice_from_timesheets`, `invoice_overdue_check`, `send_dunning_reminders`, `auto_mark_invoice_paid`

## File Map

| Purpose | Path |
|---------|------|
| Module definition | `src/lib/modules/invoicing-module.ts` |
| Order-to-cash migration | `supabase/migrations/20260423143442_*.sql` |

## Contributing

Key rules:
- Dunning is idempotent per invoice/step/day — preserve that property
- Auto-paid trigger is `SECURITY DEFINER` — review carefully when changing reconciliation logic
- Skills must be self-describing (Law 2)
