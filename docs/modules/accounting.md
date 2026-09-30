---
id: accounting
name: Accounting
manual: true
description: Double-entry accounting with autonomous reconciliation, multi-locale chart of accounts, and pluggable export adapters (SIE/DATEV/FEC/SAF-T).
title: "Accounting"
category: modules
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

<!-- generated:skills:start — written by scripts/generate-module-docs.ts, edits here are overwritten -->
## Skills

These skills are seeded into `agent_skills` when the module is enabled and exposed via MCP.
External operators (FlowPilot, OpenClaw, Claude Desktop, custom MCP clients) can call them directly.

| Skill | Scope | Description |
|-------|-------|-------------|
| `prepare_vat_return` | internal | Prepare a full Swedish momsdeklaration (SKV 4700) for a period: all boxes (05,10,11,12,20,21,22,30,31,32,35,39,41,48,49) mapped from posted ledger via the active locale pack. Use when: closing a VA… |
| `book_unbooked_invoices` | internal | Find invoices that reached a bookable status without ever producing a journal entry, and book them. Use when: revenue or receivables look lower in the ledger than in the invoice list; after activat… |
| `list_voucher_gaps` | internal | Detect gaps in voucher-number sequences per series and fiscal year. Use when: closing a period, verifying audit integrity. NOT for: listing all entries (manage_journal_entry action=list) or explain… |
| `explain_voucher_gap` | internal | Look up audit_logs for clues about a missing voucher number. Use when: list_voucher_gaps returned a gap and root cause is needed. NOT for: detecting gaps (list_voucher_gaps) or posting corrections … |
| `year_end_readiness` | internal | Year-end checklist: periods closed, no drafts, no voucher gaps, reconciliations done, invoices/expenses settled. Use when: preparing annual close. NOT for: running the close (run_year_end) or closi… |
| `run_year_end` | internal | Orchestrate year-end close: runs year_end_readiness + propose_accruals + propose_annual_depreciation and returns a consolidated report with next-step instructions. Read-only; actual posting require… |
| `propose_accruals` | internal | Scan for unpaid invoices and approved-but-unpaid expense reports that may need year-end accrual entries. Returns proposals with suggested_action (defer_revenue, accrue_receivable, accrue_payable). … |
| `manage_journal_entry` | internal | Create, list, or reverse double-entry journal entries (verifikat). action=void does NOT erase: a booked verification is never unbooked. It keeps the original posted and books a mirror entry dated t… |
| `accounting_reports` | internal | Generate financial reports: balance sheet, income statement, general ledger, trial balance, or check for unbooked invoices. Use when: admin asks for financial overview, month-end closing, reconcili… |
| `manage_accounting_template` | internal | Create, list, or update ONE reusable accounting template at a time. Templates have keyword matching for AI auto-selection. Use when: admin wants to add or tweak a single template, or list what exis… |
| `manage_account_tax_boxes` | internal | add/remove only — must already exist in the chart of accounts. |
| `manage_journal_entry_document` | internal | The verification. Required for list and attach. |
| `manage_account_roles` | internal | set only — the platform role, e.g. sales_revenue. An unknown name errors with the full valid list. |
| `read_sie_file` | internal | The file as base64-encoded BYTES. Read it in binary mode. If your file tool returns a string, it has already decoded — and if the file was CP437 the Swedish characters are gone. A data: prefix is s… |
| `import_accounting_standard` | internal | Lowercase hex sha256 of the downloaded file. You have the file — hash it. Required. |
| `propose_posting_templates` | internal | Each: {template_name, description?, category: revenue|expense|payment|payroll|tax|adjustment|asset, keywords: [..], template_lines: [{account_code, debit_pct, credit_pct}]}. Percentages of the NET … |
| `manage_opening_balances` | internal | Create, list, update, or delete opening balances (IB) for a fiscal year. Use when: admin wants to set initial account balances, migrating from another system, starting a new fiscal year. NOT for: j… |
| `manage_chart_of_accounts` | internal | List, add, update, or deactivate accounts in the chart of accounts. Supports multiple locales (se-bas2024, ifrs, us-gaap). `add` is NOT an upsert: a code that is already taken in that locale is ref… |
| `suggest_accounting_template` | internal | Analyze recent journal entries to identify recurring transaction patterns and suggest new reusable templates. Use when: heartbeat detects repeated similar bookings, admin asks FlowPilot to learn fr… |
| `close_accounting_period` | internal | Close an accounting period (month) — locks all journal entries with dates in that period against further changes and snapshots totals. Use when: month-end close after all entries are posted and rec… |
| `reopen_accounting_period` | internal | Reopen a previously closed accounting period to allow corrections. Fails if the period was permanently locked. Use when: late-arriving correction needs to be booked, auditor requests adjustment. NO… |
| `list_accounting_periods` | internal | List accounting periods with their status (open/closed/locked) and snapshot totals. Use when: admin asks "is March closed?", before attempting to close a new month, or for the month-end dashboard. |
| `list_fiscal_years` | internal | List the fiscal years this company actually has, derived from the ledger — entry count, drafts, months closed, and whether each year is open, closed or upcoming. Use when: orienting in a new instan… |
| `manage_analytic_account` | internal | Create, list, update, or archive analytic accounts (cost centers, projects, departments, campaigns) used to tag journal entries for profitability and per-project reporting. Use when: admin asks to … |
| `tag_journal_entry_analytics` | internal | Tag an existing journal entry line with one or more analytic accounts to attribute the cost/revenue to projects, cost centers, departments or campaigns. Supports splitting (e.g. 60% Project A / 40%… |
| `manage_vendor_defaults` | internal | Read or update a vendor\ |
| `record_accounting_correction` | internal | Record that a manually-corrected journal entry differed from what was originally booked (auto or by template). This is the learning signal — every call makes the agent smarter for similar future tr… |
| `manage_budget` | internal | Set and list per-account budgets (annual or per-month). Use when: planning a fiscal year, setting a cost-centre budget. NOT for: comparing to actuals (budget_vs_actual) or posting entries (manage_j… |
| `cash_flow_forecast` | internal | Week-by-week cash-flow forecast: today\ |
| `request_journal_entry_approval` | internal | Put a DRAFT journal entry up for approval. Use when: a manual entry is held as a draft because an approval rule or chain for "journal_entry" applies to its amount, or a draft should be reviewed bef… |
| `post_journal_entry` | internal | Post a DRAFT journal entry so it enters the books. Use when: a draft has been reviewed or its approval has been granted. NOT for: creating an entry (manage_journal_entry) or correcting a posted one… |
| `budget_vs_actual` | internal | Budget vs actual variance report per account for a fiscal year (or a single month). Use when: reviewing spend against plan, month-end/year-end variance analysis. NOT for: editing budgets (manage_bu… |

<!-- generated:skills:end -->
