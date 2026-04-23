---
title: "Accounting Module"
module_id: "accounting"
version: "1.0.0"
category: "data"
autonomy: "agent-capable"
generated: true
generated_at: "2026-04-23"
---

# Accounting

> Double-entry bookkeeping with BAS 2024 chart of accounts, journal entries, general ledger, balance sheet and P&L reports — with period locking for month-end close.

## Quick Facts

| Property | Value |
|----------|-------|
| **Module ID** | `accounting` |
| **Version** | 1.0.0 |
| **Category** | data |
| **Autonomy** | agent-capable |
| **Core** | No |
| **Capabilities** | `data:write`, `data:read` |

## Loops

### Record-to-Report (Period Close)

Closes the month so historical reports become immutable.

| Step | Skill / Mechanism | Outcome |
|------|-------------------|---------|
| 1 | `accounting_reports` (`unbooked_invoices`) | Verify nothing is pending |
| 2 | `close_accounting_period(year, month)` | Inserts row in `accounting_periods` with status `closed` and snapshots totals |
| 3 | DB trigger `trg_block_writes_in_closed_period` | Blocks all subsequent INSERT/UPDATE/DELETE on `journal_entries` / `journal_entry_lines` whose `entry_date` falls in a closed period |
| 4 | `reopen_accounting_period(year, month, reason)` | Admin-only escape hatch; refused if status = `locked` |
| 5 | `list_accounting_periods` | Dashboard view of open/closed/locked months |

**Tables:** `accounting_periods` (status enum: `open` | `closed` | `locked`).

## API Contract

**Actions (publish):** `create_entry`, `list_entries`, `balance_sheet`, `profit_loss`

**Skills:** `manage_journal_entry`, `accounting_reports`, `manage_accounting_template`, `manage_opening_balances`, `manage_chart_of_accounts`, `suggest_accounting_template`, `close_accounting_period`, `reopen_accounting_period`, `list_accounting_periods`

## File Map

| Purpose | Path |
|---------|------|
| Module definition | `src/lib/modules/accounting-module.ts` |
| Hook | `src/hooks/useAccounting.ts` |
| Admin page | `src/pages/admin/AccountingPage.tsx` |
| Period-lock migration | `supabase/migrations/20260423002633_*.sql` |

## Contributing

Key rules:
- Follow `ModuleDefinition<I, O>` contract pattern
- All schema changes require idempotent migrations
- Skills must be self-describing (Law 2)
- Never bypass period locks via direct SQL — use `reopen_accounting_period`
