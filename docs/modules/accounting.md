---
id: accounting
name: Accounting
manual: true
description: Double-entry accounting with autonomous reconciliation, multi-locale chart of accounts, and pluggable export adapters (SIE/DATEV/FEC/SAF-T).
---

# Accounting

> **Status:** Flagship module — manually maintained.
> **Source of truth:** `src/lib/modules/accounting-module.ts` + this file.
> _The auto-generator (`scripts/generate-module-docs.ts`) skips this file because of `manual: true`._

The Accounting module is FlowWink's general ledger. It implements **real double-entry bookkeeping** — not a spreadsheet wrapped in a UI — with locale-aware charts of accounts, period locking, and a 4D template-matching engine that lets FlowPilot post journal entries autonomously without writing rules per customer.

It is designed around one core idea: **bookkeeping is reasoning, not data entry.** Every event in the platform (an order paid, an expense approved, an invoice sent, a bank transaction reconciled) emits a candidate journal entry. FlowPilot evaluates the candidate against locale templates, posts it if confidence is high, or escalates to a human via the SLA queue if not.

---

## Why this module exists

Most ERPs treat accounting as a destination: data flows in, an accountant cleans it up, reports come out at month-end. FlowWink inverts this — accounting is the **memory layer** that every other module writes to, and FlowPilot is the bookkeeper that keeps it consistent in real time.

This means:
- **No batch close.** Period close is a guarded boundary check, not a reconciliation marathon.
- **No manual coding.** Templates + 4D matching mean the same vendor invoice always books the same way.
- **No locked-in chart.** Locale packs (BAS 2024 for Sweden, IFRS, US GAAP) are pluggable.
- **No proprietary export.** SIE 4 (SE), DATEV (DE), FEC (FR), SAF-T (OECD) all generate from the same canonical payload.

---

## Architecture

### Data model (key tables)

| Table | Purpose |
|---|---|
| `accounts` | Chart of accounts. Locale-aware. Multi-currency safe. |
| `journal_entries` | Header row per posting (date, description, source, reference). |
| `journal_lines` | Debit/credit lines. Sum per entry MUST be zero (DB constraint). |
| `accounting_periods` | Open/closed periods. Locks all writes when closed. |
| `accounting_locale_packs` | Pluggable chart + tax rules per country. |
| `accounting_export_adapters` | Format adapters (SIE, DATEV, FEC, SAF-T) registered per pack. |
| `bank_transactions` | Imported bank lines awaiting reconciliation. |
| `reconciliation_matches` | Audit trail of which transaction matched which entry. |
| `expense_reports` / `expenses` | Employee expense lifecycle (draft → paid). |
| `expense_payments` | Payment records linked to booked expenses. |

### The 4D matching algorithm

When a candidate entry arrives (e.g. from a bank import or expense booking), FlowPilot scores it across four dimensions against existing templates:

1. **Counterparty** — vendor name, IBAN, OCR reference
2. **Amount** — exact, ±tolerance, or proportional split
3. **Timing** — date proximity, recurrence pattern
4. **Context** — narrative keywords, source module, prior history

A match above the confidence threshold posts automatically. Below threshold → SLA queue with a suggested template. See `mem://accounting/template-first-instrument-logic`.

### Period lock guardrail

`close_accounting_period` doesn't just flip a flag — it installs a trigger (`guard_time_entries_period`, `guard_journal_entries_period`) that rejects any write to a closed period. This includes timesheet entries, so HR and payroll can't silently corrupt a closed quarter. See `mem://erp/timesheet-period-lock`.

---

## Skills (MCP-exposed)

All skills are exposed via MCP and callable by FlowPilot or external peers.

### Posting & journals
| Skill | Purpose |
|---|---|
| `post_journal_entry` | Create a balanced journal entry with N lines. |
| `reverse_journal_entry` | Post the inverse of an existing entry (audit-safe). |
| `lookup_account` | Resolve account by number, name, or natural-language description. |

### Period management
| Skill | Purpose |
|---|---|
| `close_accounting_period` | Lock a period; installs write-guard triggers. |
| `reopen_accounting_period` | Admin-only; logs to audit trail. |

### Reconciliation
| Skill | Purpose |
|---|---|
| `import_bank_statement` | Ingest CSV/MT940/CAMT.053. |
| `import_bank_image` | Vision OCR (preview → commit, never auto). See `mem://reconciliation/ocr-bank-statement-import`. |
| `match_bank_transaction` | Run 4D scoring against open entries. |
| `confirm_reconciliation` | Commit a suggested match. |

### Expense P2P loop
Full lifecycle: `generate_expense_report` → `submit_expense_report` → `approve_expense_report` → `book_expense_report` → `mark_expense_paid`.
Booking posts `Dr 5410 (or category) + Dr 2641 (input VAT) / Cr 2890 (employee liability)`. Payment posts `Dr 2890 / Cr 1930`. See `mem://erp/expense-procure-to-pay-loop`.

### Export
| Skill | Purpose |
|---|---|
| `export_accounting_period` | Serialize closed period to canonical `AccountingExportPayload`. |
| `generate_export_file` | Run adapter (SIE/DATEV/FEC/SAF-T/CSV) over payload. |

See `mem://accounting/export-adapters-pluggable`.

### Neutral-core audit primitives

These three primitives are locale-agnostic — every pack (SE/IFRS/DE/UK/US) gets them for free.

#### Staged-Operation Envelope

High-risk ledger-modifying skills (`manage_journal_entry`, `book_expense_report`, `mark_expense_report_paid`, `record_pos_sale_v2`, `close_pos_session_v2`, `close_accounting_period`, `reopen_accounting_period`) are flagged `requires_staging=true`. When called via MCP, `agent-execute` returns a **preview envelope** (HTTP 202) instead of writing, and persists the intent in `pending_operations`:

```json
{
  "staged": true,
  "risk_level": "high",
  "preview": { "...payload that would be written...": true },
  "period_status": "open|locked|closing",
  "next": { "approve": "approve_pending_operation", "reject": "reject_pending_operation" }
}
```

The operator (human or peer) reviews via `/admin/accounting → Pending Ops` and confirms with `approve_pending_operation(id)`, which re-invokes the skill with `_approved_operation_id` set. See `mem://accounting/staged-operations-envelope`.

#### Voucher integrity

`journal_entries.voucher_series/voucher_number/voucher_year` auto-assigned per `(series, year)` via the `assign_voucher_number` BEFORE INSERT trigger. Two RPCs surface integrity:
- `list_voucher_gaps(year, series?)` → returns `[{ series, expected_next, last_seen, gap_size, gap_after_date }]`
- `explain_voucher_gap(series, voucher_number)` → looks up `audit_logs` for delete/void events around the missing number

UI: `/admin/accounting → Voucher Integrity`. Both RPCs are MCP-exposed as skills with the same names. Universal audit requirement (SE/DE/IFRS/GAAP all need unbroken series). See `mem://accounting/voucher-integrity`.

#### Year-end orchestration

Four read-only skills compose a country-agnostic year-end flow:
- `year_end_readiness(year)` — 6-point checklist (periods closed / no drafts / voucher integrity / reconciliations cleared / invoices settled / expenses settled)
- `propose_accruals(year)` — scans unpaid invoices/expenses crossing the year boundary
- `propose_annual_depreciation(year)` — runs over `fixed_assets`
- `run_year_end(year, confirm)` — orchestrator returning consolidated readiness + proposals

Country-specific bookings live in the locale pack as an optional callback:

```ts
// src/lib/locale-packs/types.ts
year_end_proposals?: (year: number) => Promise<AccrualProposal[]>
```

SE implements `se-periodiseringsfond` and `se-overavskrivningar` (stubs with zero amounts — the real tax-result computation lands in a follow-up PR). DE/UK/US can add `de-rueckstellungen`, `us-deferred-tax`, etc. without core changes. UI: `/admin/accounting → Year-End`. See `mem://accounting/year-end-readiness`.

---

## Locale packs

A locale pack bundles:
- Chart of accounts (account numbers, names, types)
- VAT rates and reporting structure
- Default templates (rent, salaries, common vendors)
- At least one export adapter (guardrail-enforced)

Shipped packs:
- **SE — BAS 2024** (default for Swedish deployments) → SIE 4 export
- **Generic OECD** → SAF-T + CSV export
- **Stubs:** US GAAP, IFRS, DE, FR (extend via `accounting_locale_packs` + adapter registration)

---

## End-to-end processes this module participates in

- **`order-to-cash`** — receives revenue postings from `orders` + `invoicing`
- **`procure-to-pay`** — receives vendor invoice postings from `purchasing`
- **`expense-to-payment`** — full lifecycle owned by this module
- **`bank-reconciliation`** — owned
- **`period-close`** — owned

See `docs/processes/` for full E2E diagrams.

---

## Admin UI

`/admin/accounting` — journal browser, period controls, reconciliation queue, locale-pack selector, export download.

Key sub-pages:
- `/admin/accounting/journals` — entry-level browser with filtering
- `/admin/accounting/reconciliation` — bank import + 4D match review
- `/admin/accounting/periods` — open/close controls with audit log
- `/admin/accounting/exports` — generate + download SIE/DATEV/FEC/SAF-T

---

## Extending

### Add a new locale pack
1. Insert row into `accounting_locale_packs` with chart + VAT JSON.
2. Register at least one `accounting_export_adapters` row (guardrail).
3. Seed default templates via migration.

### Add a new export format
1. Implement adapter in `supabase/functions/accounting-export/adapters/<format>.ts`.
2. Register in `accounting_export_adapters` linked to applicable packs.
3. Adapter receives canonical `AccountingExportPayload` — never raw DB rows.

### Add a new automated booking source
1. Other module emits a platform event (`emit_platform_event('expense.approved', ...)`).
2. Register an automation with `executor='platform'` that calls `book_expense_report`.
3. FlowPilot only steps in when the platform automation fails or the event is ambiguous.

---

## Development context

- **Never bypass `journal_lines` balance constraint.** All writes go through `post_journal_entry` SECURITY DEFINER RPC.
- **Never modify a closed period.** Even from migrations — use `reopen_accounting_period` first, log the reason.
- **Never hardcode account numbers in module code.** Always resolve via `lookup_account` or locale-pack defaults.
- **Vision OCR is preview-first.** `import_bank_image` returns a draft; commit requires explicit user/agent confirmation.

See also: `mem://accounting/autonomous-reconciliation-philosophy`, `mem://accounting/full-record-to-report-skill-coverage`.
