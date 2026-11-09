---
title: "Reconciliation Module"
module_id: "reconciliation"
version: "1.1.0"
category: "data"
autonomy: "agent-capable"
generated: true
generated_at: "2026-11-09"
description: Bank reconciliation: Stripe payout sync + bank file import (CAMT.053/MT940/OFX/CSV/SIE) + OCR import of statement images/PDFs.
---

# Reconciliation

> Bank reconciliation: Stripe payout sync + bank file import (CAMT.053/MT940/OFX/CSV/SIE) + OCR import of statement images/PDFs. Auto-matches against invoices/expenses/orders.

Ships with **10 agent skills**, **5 database tables**, an **admin UI**.

## Quick Facts

| Property | Value |
|----------|-------|
| **Module ID** | `reconciliation` |
| **Version** | 1.1.0 |
| **Category** | data |
| **Autonomy** | agent-capable |
| **Core** | No |
| **Capabilities** | `data:read`, `data:write` |
| **MCP-exposed skills** | 10 |
| **Owns tables** | 5 |
| **Requires modules** | `accounting` |

## Integrations

**Optional:** `stripe`

## Skills

These skills are seeded into `agent_skills` when the module is enabled and exposed via MCP.
External operators (FlowPilot, OpenClaw, Claude Desktop, custom MCP clients) can call them directly.

| Skill | Scope | Description |
|-------|-------|-------------|
| `sync_stripe_payouts` | internal | Pull recent Stripe payouts and balance transactions into bank_transactions for matching. Use when: admin asks to refresh Stripe activity, daily payout reconciliation, before running auto_match_tran… |
| `import_bank_file` | internal | Import a structured bank statement file (CAMT.053 XML, MT940, OFX, CSV, or SIE 4) into bank_transactions. Auto-detects format and links to the correct bank account via IBAN/BBAN/GL match. Use when:… |
| `auto_match_transactions` | internal | Run the auto-matcher across all unmatched bank_transactions, scoring against open invoices, expenses, and orders. Creates reconciliation_match rows for confident hits and leaves ambiguous ones for … |
| `import_bank_image` | internal | OCR a bank statement image or PDF (screenshot, scan, exported PDF) and turn it into bank_transactions rows. Use when: user uploads a picture/PDF of a bank account printout instead of a structured C… |
| `list_unmatched_transactions` | internal | List bank_transactions still in status=unmatched, optionally filtered by bank account or date range. Use when: admin asks "what is left to reconcile?", before invoking auto_match_transactions, buil… |
| `propose_bookkeeping` | internal | Propose a double-entry booking for unbooked bank transactions: for each event it picks the template — a bookkeeping RULE with a template wins (routing rule #0, 90% + ramp), then the counterparty's … |
| `manage_reconciliation_rule` | internal | Manage bookkeeping rules for bank transactions: match counterparty/reference/description (contains|equals|regex) → EITHER the accounting template to book with (p_suggested_template_id — the rule th… |
| `apply_reconciliation_rules` | internal | Tag unmatched bank transactions with a suggested account/category from the highest-priority matching reconciliation rule. Use when: after importing a bank file, before manual review. NOT for: invoi… |
| `reconciliation_report` | internal | Bank reconciliation summary for a period: matched vs unmatched counts and amounts, plus rule-suggested count. Use when: month-end reconciliation review, reporting bank-feed health. |
| `run_bookkeeping_sweep` | internal | Run the WHOLE daily bookkeeping pipeline as one deterministic step: apply reconciliation rules → auto-match bank events against invoices/expenses/orders → propose bookings for the rest → auto-book … |

## Data Model

Tables this module owns (declared by the module, or created in its migrations):

- `public.bank_accounts`
- `public.bank_import_batches`
- `public.bank_transactions`
- `public.payment_reconciliations`
- `public.reconciliation_matches`

All tables ship with Row-Level Security policies. See migration files for the exact rules.

## Module API Contract

**Actions:** `sync_stripe`, `import_file`, `import_image`, `auto_match`, `list_unmatched`

**Input fields:** `action`, `fileName`, `content`, `contentBase64`, `mimeType`, `provider`, `format`, `commit`, `transactions`

**Output fields:** `success`, `result`, `error`

## Used in Processes

This module participates in the following end-to-end business processes:

- [record-to-report](../processes/record-to-report.md)
- [procure-to-pay](../processes/procure-to-pay.md)

## File Map

| Purpose | Path |
|---------|------|
| Module definition | `src/lib/modules/reconciliation-module.ts` |
| Hook | `src/hooks/useReconciliation.ts` |
| Admin page | `src/pages/admin/ReconciliationPage.tsx` |

## Contributing

To enhance this module, see [Contributing Guide](../contributing/contributing.md).

Key rules:
- Follow `ModuleDefinition<I, O>` contract pattern
- All schema changes require idempotent migrations
- Skills must be self-describing ([Law 2](../concepts/openclaw-law.md))
- Blocks are interfaces, not pipelines ([Law 3](../concepts/openclaw-law.md))
- New skills must pass the [Agent Contract Integrity](../../mem/architecture/agent-contract-integrity.md) checklist (`bun run lint:skills`)

---

*This file is auto-generated by `scripts/generate-module-docs.ts`. Do not edit manually — re-run the script after changing the module definition.*