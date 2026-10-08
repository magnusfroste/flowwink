---
title: "Expense Reporting Module"
module_id: "expenses"
version: "1.0.0"
category: "data"
autonomy: "agent-capable"
generated: true
generated_at: "2026-10-08"
description: Employee expense reporting with receipt scanning, monthly report submission, approval workflow, and autonomous journal entry booking via FlowPilot
---

# Expense Reporting

> Employee expense reporting with receipt scanning, monthly report submission, approval workflow, and autonomous journal entry booking via FlowPilot

Ships with **13 agent skills**, an **admin UI**.

## Quick Facts

| Property | Value |
|----------|-------|
| **Module ID** | `expenses` |
| **Version** | 1.0.0 |
| **Category** | data |
| **Autonomy** | agent-capable |
| **Core** | No |
| **Capabilities** | `data:write`, `data:read` |
| **MCP-exposed skills** | 13 |
| **Owns tables** | — |

## Skills

These skills are seeded into `agent_skills` when the module is enabled and exposed via MCP.
External operators (FlowPilot, OpenClaw, Claude Desktop, custom MCP clients) can call them directly.

| Skill | Scope | Description |
|-------|-------|-------------|
| `manage_expenses` | internal | Full lifecycle management for employee expenses: create individual expenses (with optional receipt data, in any currency — converted to the base currency at the receipt date\ |
| `analyze_receipt` | internal | Analyze a receipt image using AI vision to extract structured data: amount, VAT, vendor, date, and suggest matching account code. Use when: employee uploads a receipt photo, FlowPilot processes exp… |
| `generate_monthly_expense_report` | internal | Generate or refresh a monthly expense report |
| `submit_expense_report` | internal | Submits a draft expense report for approval: locks all included expenses to submitted state and recomputes the report total from its lines. Only the report owner or an admin may submit. Use when: e… |
| `approve_expense_report` | internal | Admin-only. Approves a submitted expense report, marks all included expenses as approved and refreshes the report total from its lines. Use when: manager approves a submitted report / "approve expe… |
| `book_expense_report` | internal | Admin-only. Posts a balanced journal entry for an approved expense report (Dt expense + VAT / Cr owed-to-employee) and marks the report as booked; an open expense advance the employee holds is sett… |
| `mark_expense_report_paid` | internal | Admin-only. Records a payout to the employee for a booked expense report: the report total minus any advance settled at booking (paid_cents). Posts Dt 2890 / Cr 1930 and creates an expense_payments… |
| `list_expense_reports` | internal | List expense reports filtered by status (draft / submitted / approved / booked / paid) and optionally by employee. Use when: admin reviews pending approvals, FlowPilot scans for reports to advance … |
| `manage_expense_policy` | internal | Configure expense spend policies per category (max amount, receipt requirement, approval threshold). Use when: setting company expense rules. NOT for: checking one expense (evaluate_expense_policy)… |
| `evaluate_expense_policy` | internal | Check a prospective expense against the policies — returns allowed, requires_approval, and any violations (over_limit, missing_receipt, needs_approval). Use when: validating an expense before submi… |
| `extract_receipt` | internal | Extract structured expense fields (vendor, date, total, VAT, line items) from a receipt image or PDF via AI. Use when: an employee uploads a receipt to file an expense. NOT for: bank statement OCR … |
| `manage_expense_advance` | internal | Expense (travel) advances: money paid to an employee BEFORE the trip, settled against their expense reports AFTER it. grant pays it out (Dt employee advance 1610 / Cr bank) and opens the advance; b… |
| `match_expense_to_po` | internal | Tie an employee expense to the purchase order it paid for — the employee took the company card for something that was ordered — so the order\ |

## Module API Contract

**Actions:** `create`, `list`, `submit_report`, `approve_report`, `analyze_receipt`

**Input fields:** `action`, `user_id`, `expense_date`, `description`, `amount_cents`, `vat_cents`, `currency`, `category`, `vendor`, `account_code`, `is_representation`, `attendees`, `receipt_url`, `period`, `report_id`

**Output fields:** `success`, `expense_id`, `report_id`, `message`, `error`

## Used in Processes

This module participates in the following end-to-end business processes:

- [procure-to-pay](../processes/procure-to-pay.md)
- [record-to-report](../processes/record-to-report.md)

## File Map

| Purpose | Path |
|---------|------|
| Module definition | `src/lib/modules/expenses-module.ts` |
| Hook | `src/hooks/useExpenses.ts` |
| Admin page | `src/pages/admin/ExpensesPage.tsx` |

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