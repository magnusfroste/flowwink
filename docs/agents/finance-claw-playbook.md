---
title: "Finance Department — External Claw Playbook"
audience: "external operators (OpenClaw, ClawThree, Claude Desktop, custom MCP claws)"
last_updated: "2026-05-04"
description: This playbook lets an external claw act as FlowWink's finance department — running invoicing, expense booking, bank reconciliation, and period close (record-to-report) — without…
category: agents
---

# Finance Department Playbook

This playbook lets an **external claw** act as FlowWink's finance department —
running invoicing, expense booking, bank reconciliation, and period close
(record-to-report) — **without FlowPilot involvement**.

> Finance touches money. Most write skills are `trust_level='approve'` — your
> claw will spend most of its time **proposing** journal entries and bookings;
> a human or FlowPilot approves them.

## Connect

```http
POST https://<your-site>/functions/v1/mcp-server
Authorization: Bearer <MCP_API_KEY>
```

## Pull only the finance toolkit

```http
GET /rest/tools?groups=finance
```

`finance` expands to:

| Category | What you get | Example skills |
|----------|--------------|----------------|
| `commerce` | Invoices, expenses, journal entries | `manage_invoice`, `generate_monthly_expense_report`, `submit_expense_report`, `approve_expense_report`, `book_expense_report`, `mark_expense_report_paid` |
| `subscriptions` | Recurring revenue | `change_subscription`, `list_subscriptions` |
| `analytics` | Reports | `analytics_dashboard` |
| `automation` | Bank statement OCR + utilities | `import_bank_image`, `extract_pdf_text`, `process_signal` |

Plus reconciliation skills: `auto_match_transactions`, `apply_reconciliation_rules`,
`auto_match_transactions`, `list_unmatched_transactions`.

## End-to-end record-to-report loop

### 1. Invoice run (quote-to-cash)

```jsonc
// List invoiceable timesheets / orders / subscriptions
{"tool":"manage_invoice","arguments":{"action":"list_billable"}}

// Create invoices in batch
{"tool":"manage_invoice","arguments":{
  "action":"create_batch",
  "source":"timesheets",
  "period":"2026-04"
}}
// → returns array of draft invoices

// Send (gated — see approval section)
{"tool":"manage_invoice","arguments":{
  "action":"send",
  "id":"<invoice_id>",
  "_approved":true            // only if your claw has bypass
}}
```

### 2. Bank statement import

OCR a bank statement image/PDF — **always two-step (preview → commit)**:

```jsonc
// Step 1: parse (no DB writes)
{"tool":"import_bank_image","arguments":{
  "action":"preview",
  "image_base64":"<base64>",
  "mime_type":"image/png",
  "provider":"openai"        // openai | gemini
}}
// → { transactions: [...], confidence_per_row }

// Step 2: commit (after human review of the preview)
{"tool":"import_bank_image","arguments":{
  "action":"commit",
  "transactions":[/* edited preview */]
}}
```

> **Never auto-commit OCR output.** Vision models hallucinate amounts.
> See `mem://reconciliation/ocr-bank-statement-import`.

### 3. Reconciliation

```jsonc
// Auto-match bank tx → invoices/expenses
{"tool":"match_bank_transactions","arguments":{"period":"2026-04"}}
// → { matched: N, unmatched: M, ambiguous: K }

// Manually propose a match for ambiguous rows
{"tool":"propose_reconciliation","arguments":{
  "bank_transaction_id":"<id>",
  "invoice_id":"<id>",
  "note":"Customer paid 2 invoices in one transfer"
}}

// Commit accepted proposals
{"tool":"commit_reconciliation","arguments":{"proposal_id":"<id>"}}
```

### 4. Expense P2P loop

Full lifecycle (each is a separate MCP-exposed RPC):

```
generate_expense → submit_expense → approve_expense → book_expense → mark_expense_paid
   draft              submitted        approved          booked          paid
```

```jsonc
{"tool":"book_expense","arguments":{
  "expense_id":"<id>",
  "expense_account":"5410",   // BAS 2024 default
  "vat_account":"2641",
  "credit_account":"2890"
}}
// Posts: Dt 5410 + 2641 / Cr 2890

{"tool":"mark_expense_paid","arguments":{
  "expense_id":"<id>",
  "method":"sepa",            // manual | sepa | swish | bankgiro | stripe | other
  "payment_date":"2026-04-30"
}}
// Posts: Dt 2890 / Cr 1930 + creates expense_payments row
```

### 5. Period close

```jsonc
// Locks period — also locks time_entries via guard trigger
{"tool":"close_accounting_period","arguments":{
  "period":"2026-04",
  "lock_timesheets":true
}}
```

### 6. Reports & exports

```jsonc
{"tool":"analytics_query","arguments":{"metric":"profit_loss","period":"2026-04"}}
{"tool":"analytics_query","arguments":{"metric":"balance_sheet","date":"2026-04-30"}}
{"tool":"analytics_query","arguments":{"metric":"vat_summary","period":"2026-Q2"}}
```

Export per locale-pack adapter (SIE 4 for SE, SAF-T for generic, DATEV for DE,
FEC for FR). See `mem://accounting/export-adapters-pluggable`.

## Approval gating (heavy)

| Skill | trust_level | Why |
|-------|-------------|-----|
| `analytics_dashboard`, `list_*` | `notify` | Read-only. |
| `import_bank_image` (preview) | `notify` | No writes. |
| `import_bank_image` (commit) | **`approve`** | Posts to bank ledger. |
| `manage_invoice` (create/draft) | `notify` | Drafts only. |
| `manage_invoice` (send) | **`approve`** | Customer-facing + revenue. |
| `book_expense_report`, `mark_expense_report_paid` | **`approve`** | Posts to GL. |
| `auto_match_transactions` | **`approve`** | Locks the match. |
| `close_accounting_period` | **`approve`** | Irreversible at site level. |

Approve-gated calls return HTTP 202 `{ status: "pending_approval", activity_id }`.
Visible at `/admin/developer → Activity`.

## What's NOT exposed

| Skill | Why hidden |
|-------|------------|
| `a2a_*`, `openclaw_*` | FlowPilot peer-comms primitives. |
| Direct `journal_entries` insert via generic CRUD | Use domain skills (`book_*`). |
| `manage_objective`, agent objectives | Cognition layer. |

## Audit & limits

- **Rate limits**: ~60 req/min per MCP key.
- **Audit**: Every call in `agent_executions` + every booking in
  `journal_entries.created_by_agent`.
- **Multi-locale**: Default chart-of-accounts is BAS 2024 (SE). Override per
  call with explicit account codes.

## Related

- `mem://accounting/export-adapters-pluggable` — SIE/SAF-T/DATEV/FEC
- `mem://erp/expense-procure-to-pay-loop` — full P2P lifecycle
- `mem://reconciliation/ocr-bank-statement-import` — OCR safety
- `mem://accounting/full-record-to-report-skill-coverage`
- `docs/modules/invoicing.md`, `docs/modules/expenses.md`,
  `docs/modules/reconciliation.md`, `docs/modules/accounting.md`
