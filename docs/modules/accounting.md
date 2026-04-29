---
title: "Accounting Module"
module_id: "accounting"
version: "1.0.0"
category: "data"
autonomy: "agent-capable"
---

# Accounting

> Double-entry bookkeeping with pluggable **locale packs** (chart of accounts, VAT
> rules, payroll, bank import). Default: BAS 2024 (Sweden); also ships with an
> IFRS-generic pack. Designed to be **agent-capable** — FlowPilot books invoices,
> closes periods, and learns from corrections autonomously.

## Quick Facts

| Property | Value |
|---|---|
| **Module ID** | `accounting` |
| **Version** | 1.0.0 |
| **Category** | data |
| **Autonomy** | agent-capable |
| **Capabilities** | `data:read`, `data:write` |
| **Default locale** | `se-bas2024` (BAS 2024) |
| **Other locales** | `ifrs-generic` (extend via `src/lib/locale-packs/`) |
| **Related modules** | `reconciliation`, `invoicing`, `purchasing`, `expenses`, `hr` |

## Core concepts

### 1. Double-entry bookkeeping
Every journal entry is a set of balanced lines (Σ debit = Σ credit). Stored in:
- `journal_entries` — header (date, description, reference, status, source)
- `journal_entry_lines` — debit/credit per `account_code`
- `chart_of_accounts` — account catalog per locale

The `publish()` handler refuses to insert unbalanced entries.

### 2. Locale packs (Odoo-style addons)
Country/standard-specific behaviour lives in `src/lib/locale-packs/<id>/index.ts`
implementing the `AccountingLocalePack` contract. The accounting module is
**locale-neutral** — it reads chart, templates, VAT rates and AI instructions
from `getActivePack()`. See [`accounting-locale-packs.md`](../architecture/accounting-locale-packs.md).

Switching pack (Settings → Accounting) is non-destructive — existing journal
entries keep their original `account_code`.

### 3. Templates (autokontering)
`accounting_templates` rows hold reusable patterns with keywords + usage_count.
The agent ranks templates by keyword overlap × usage_count when booking.

### 4. Vendor defaults & learning
Three feedback signals make booking smarter over time:

| Signal | Table | When it fires |
|---|---|---|
| `vendors.default_account_code` / `last_used_template_id` | `vendors` | Set after first successful booking via `manage_vendor_defaults` |
| `accounting_templates.usage_count` | `accounting_templates` | Auto-incremented when `template_id` is passed to `manage_journal_entry` |
| `accounting_corrections` | `accounting_corrections` | Logged when a user/agent re-books an entry; consulted before next similar booking |

**Routing priority** (enforced via skill `instructions`):
1. `vendor.default_account_code` (if vendor known)
2. `accounting_templates` keyword match (score ≥ 0.6)
3. Manual fallback + `suggest_accounting_template` to register the new pattern

### 5. Period control
`accounting_periods` (year, month, status: `open` / `closed` / `locked`).

- `close_accounting_period(year, month)` → snapshots totals, blocks further bookings
- `reopen_accounting_period(year, month, reason)` → admin override (audit-logged)
- `guard_time_entries_period` trigger also locks `time_entries` for closed periods (HR/Timesheet integration)

### 6. Analytic accounting
`analytic_accounts` (cost center / project / department / campaign) +
`analytic_lines` tag JE lines with attribution. Supports splits (60/40 across
projects) — sum of `analytic_lines.amount_cents` must match the source line.

## Skills (MCP-exposed)

All skills live in `agent_skills` and are exposed via MCP unless noted.

| Skill | Action set | Purpose |
|---|---|---|
| `manage_journal_entry` | create / list / void | Core bookkeeping. Enforces vendor-default → template → fallback routing |
| `accounting_reports` | balance_sheet / income_statement / general_ledger / trial_balance / unbooked_invoices | Read-only reporting |
| `manage_accounting_template` | create / list / update | CRUD on `accounting_templates` |
| `manage_opening_balances` | list / set / delete | IB per fiscal year (must balance) |
| `manage_chart_of_accounts` | list / add / update / deactivate | Per-locale account catalog |
| `suggest_accounting_template` | — | Mines `journal_entries` for recurring patterns |
| `close_accounting_period` | — | Month-end close (RPC) |
| `reopen_accounting_period` | — | Admin reopen (RPC, requires `reason`) |
| `list_accounting_periods` | — | Status dashboard |
| `manage_analytic_account` | list / get / create / update / delete | Cost-center/project catalog |
| `tag_journal_entry_analytics` | list / create / delete | Attribute JE lines to analytic accounts |
| `manage_vendor_defaults` | get / update | Read/write vendor autokontering |
| `record_accounting_correction` | create / list | Learning signal — logs every override |

### Mandatory create-flow for `manage_journal_entry`
The skill `description` enforces this order on the agent side:
1. If `vendor_id` known → fetch `manage_vendor_defaults` first
2. Else → `manage_accounting_template action=list`, score by keywords × usage
3. If no template scores ≥ 0.6 → manual booking + `suggest_accounting_template`
4. Always pass `template_id` and `vendor_id` so usage stats and learning fire

## Automations

| Name | Trigger | Skill | Purpose |
|---|---|---|---|
| Invoice Reconciliation | Cron `0 8 * * *` | `accounting_reports` (`type=unbooked_invoices`) | Daily check; FlowPilot books missing entries autonomously |

## Database tables

| Table | Purpose |
|---|---|
| `journal_entries` | Verifikat header (status: draft/posted/voided, source: manual/flowpilot/template/import) |
| `journal_entry_lines` | Debit/credit lines |
| `chart_of_accounts` | Account catalog (per `locale`) |
| `accounting_templates` | Reusable patterns with keywords + usage_count |
| `accounting_periods` | Month-level open/closed/locked status + snapshot totals |
| `opening_balances` | IB per fiscal year + account |
| `analytic_accounts` | Cost centers / projects / departments / campaigns |
| `analytic_lines` | JE-line attribution (supports splits) |
| `accounting_corrections` | Learning trail (original vs corrected account/VAT) |
| `vendors.default_account_code` / `last_used_template_id` | Per-vendor autokontering |

All tables have RLS — admin-only write, authenticated read.

## Admin UI (`/admin/accounting`)

Tabs:
- **Journal** — list/create entries, with template picker
- **Opening Balances** — IB per fiscal year
- **General Ledger** — per-account drill-down
- **Profit & Loss** — income statement
- **Balance Sheet** — assets/liabilities/equity
- **Tax** / **VAT Report** — period-based VAT summary
- **Analytic** — cost-center/project reports
- **Templates** — autokontering catalog
- **Audit Trail** — `accounting_corrections` + period close history
- **Export** — SIE 4 (SE), CAMT-out, CSV
- **Settings** — locale-pack switcher

## Process integration

The module is one node in the **Record-to-Report** process. See
[`docs/processes/record-to-report.md`](../processes/record-to-report.md).

| Source module | Hand-off | Accounting reaction |
|---|---|---|
| `invoicing` | Invoice paid | Heartbeat → unbooked_invoices → `manage_journal_entry` |
| `purchasing` | Vendor bill approved | `expenses.book_expense` → JE Dt 5410 / Cr 2440 |
| `expenses` | Approved expense report | `expenses.book_expense` RPC posts Dt 5410+2641 / Cr 2890 |
| `reconciliation` | Bank tx matched / one-click "Book" | Creates JE + `reconciliation_match` atomically |
| `hr` (`payroll`) | Payroll run finalized | JE Dt 7010 (gross) / Cr 1930 + Cr 2710 (skatt) + Cr 2730 (sociala) |

## Locale packs — extend to a new market

To add Germany (SKR04), UK (FRS 102), US (GAAP), …:

1. Create `src/lib/locale-packs/<id>/index.ts` exporting an `AccountingLocalePack`:
   - `chart` — `chart_of_accounts` rows
   - `templates` — `accounting_templates` rows
   - `currency`, `vat`
   - `payroll_adapters[]` (PAXml, DATEV-Lohn, BACS, ADP-CSV, …)
   - `bank_import_adapters[]` (CAMT.053, MT940, OFX, CSV — SIE for SE)
   - `ai_instructions.{journal_entry,invoicing,purchasing}` — injected into skill prompts
2. Register it in `src/lib/locale-packs/index.ts`
3. Done — Settings UI and bootstrap-seeding pick it up automatically

Guardrail test: `src/lib/__tests__/locale-packs.guardrails.test.ts` enforces
the contract.

## File map

| Purpose | Path |
|---|---|
| Module definition | `src/lib/modules/accounting-module.ts` |
| Hook (UI data) | `src/hooks/useAccounting.ts` |
| Periods hook | `src/hooks/useAccounting.ts` (periods slice) |
| Opening balances | `src/hooks/useOpeningBalances.ts` |
| Analytic | `src/hooks/useAnalyticAccounting.ts` |
| Audit trail | `src/hooks/useAuditTrail.ts` |
| Locale registry | `src/lib/locale-packs/index.ts` |
| Locale contract | `src/lib/locale-packs/types.ts` |
| Default pack (SE) | `src/lib/locale-packs/se/index.ts` |
| Generic pack | `src/lib/locale-packs/generic/index.ts` |
| Admin page | `src/pages/admin/AccountingPage.tsx` |
| Period close RPC | `supabase/migrations/*close_accounting_period*` |
| Locale pack guide | `docs/architecture/accounting-locale-packs.md` |

## Related memories

- `mem://accounting/template-first-instrument-logic` — 4D matching algorithm
- `mem://accounting/autonomous-reconciliation-philosophy` — no hard triggers, flow-driven
- `mem://accounting/multi-market-localization-and-bas2024` — pack strategy
- `mem://accounting/export-adapters-pluggable` — SIE/DATEV/FEC/SAF-T per pack
- `mem://erp/timesheet-period-lock` — period close also locks time entries

## Future work

- **Live bank connectivity** (GoCardless / Tink / Plaid) → currently file/OCR import only via `reconciliation` module
- **VAT-return adapters** per locale (`tax_return_adapters[]` field exists in pack contract; SE-only today)
- **Multi-currency JEs** with FX gain/loss auto-posting
- **Year-end close** with retained-earnings auto-roll
- **Consolidation** across multiple `accounting_locale` tenants
