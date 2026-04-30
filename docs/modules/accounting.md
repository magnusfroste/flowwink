---
title: "Accounting Module"
module_id: "accounting"
version: "1.0.0"
category: "data"
autonomy: "agent-capable"
generated: true
generated_at: "2026-04-30"
---

# Accounting

> Double-entry bookkeeping with pluggable locale packs (chart of accounts, VAT rules, payroll, bank import). Default: BAS 2024 (Sweden); also supports IFRS-generic. Add new market packs in src/lib/locale-packs/.

Ships with **13 agent skills**, an **admin UI**.

## Quick Facts

| Property | Value |
|----------|-------|
| **Module ID** | `accounting` |
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
| `manage_journal_entry` | internal | Create, list, or void double-entry journal entries (verifikat). Use when: admin asks to book/record a transaction, invoice is paid and needs journal entry, salary/rent/VAT or other recurring transa… |
| `accounting_reports` | internal | Generate financial reports: balance sheet (balansräkning), income statement (resultaträkning), general ledger (huvudbok), trial balance, or check for unbooked invoices. Use when: admin asks for fin… |
| `manage_accounting_template` | internal | Create, list, or update reusable accounting templates for common transactions. Templates have keyword matching for AI auto-selection. Use when: admin wants to add a new template, or a new transacti… |
| `manage_opening_balances` | internal | Create, list, update, or delete opening balances (ingående balanser / IB) for a fiscal year. Use when: admin wants to set initial account balances, migrating from another system, starting a new fis… |
| `manage_chart_of_accounts` | internal | List, add, update, or deactivate accounts in the chart of accounts. Supports multiple locales (se-bas2024, ifrs, us-gaap). Use when: admin asks about available accounts, needs to add a custom accou… |
| `suggest_accounting_template` | internal | Analyze recent journal entries to identify recurring transaction patterns and suggest new reusable templates. Use when: heartbeat detects repeated similar bookings, admin asks FlowPilot to learn fr… |
| `close_accounting_period` | internal | Close an accounting period (month) — locks all journal entries with dates in that period against further changes and snapshots totals. Use when: month-end close after all entries are posted and rec… |
| `reopen_accounting_period` | internal | Reopen a previously closed accounting period to allow corrections. Fails if the period was permanently locked. Use when: late-arriving correction needs to be booked, auditor requests adjustment. NO… |
| `list_accounting_periods` | internal | List accounting periods with their status (open/closed/locked) and snapshot totals. Use when: admin asks "is March closed?", before attempting to close a new month, or for the month-end dashboard. |
| `manage_analytic_account` | internal | Create, list, update, or archive analytic accounts (cost centers, projects, departments, campaigns) used to tag journal entries for profitability and per-project reporting. Use when: admin asks to … |
| `tag_journal_entry_analytics` | internal | Tag an existing journal entry line with one or more analytic accounts to attribute the cost/revenue to projects, cost centers, departments or campaigns. Supports splitting (e.g. 60% Project A / 40%… |
| `manage_vendor_defaults` | internal | Read or update a vendor\ |
| `record_accounting_correction` | internal | Record that a manually-corrected journal entry differed from what was originally booked (auto or by template). This is the learning signal — every call makes the agent smarter for similar future tr… |

## Module API Contract

**Actions:** `create_entry`, `list_entries`, `balance_sheet`, `profit_loss`

**Input fields:** `action`, `entry_date`, `description`, `reference_number`, `lines`, `account_code`, `account_name`, `debit_cents`, `credit_cents`, `description`

**Output fields:** `success`, `entry_id`, `message`

## Used in Processes

This module participates in the following end-to-end business processes:

- [record-to-report](../processes/record-to-report.md)

## File Map

| Purpose | Path |
|---------|------|
| Module definition | `src/lib/modules/accounting-module.ts` |
| Hook | `src/hooks/useAccounting.ts` |
| Admin page | `src/pages/admin/AccountingPage.tsx` |

## Contributing

To enhance this module, see [Contributing Guide](../contributing/contributing.md).

Key rules:
- Follow `ModuleDefinition<I, O>` contract pattern
- All schema changes require idempotent migrations
- Skills must be self-describing ([Law 2](../concepts/openclaw-law.md))
- Blocks are interfaces, not pipelines ([Law 3](../concepts/openclaw-law.md))
- New skills must pass the [Agent Contract Integrity](../architecture/agent-contract-integrity.md) checklist (`bun run lint:skills`)

---

*This file is auto-generated by `scripts/generate-module-docs.ts`. Do not edit manually — re-run the script after changing the module definition.*