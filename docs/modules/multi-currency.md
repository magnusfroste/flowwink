---
title: "Multi-Currency Module"
module_id: "multiCurrency"
version: "1.0.0"
category: "data"
autonomy: "agent-capable"
manual: true
description: Ships with 3 agent skills and 1 daily automation.
---

# Multi-Currency

> Sell and bill in multiple currencies with daily ECB rates and FX revaluation of open AR/AP.

Ships with **3 agent skills** and **1 daily automation**.

## Quick Facts

| Property | Value |
|----------|-------|
| **Module ID** | `multiCurrency` |
| **Version** | 1.0.0 |
| **Category** | data |
| **Autonomy** | agent-capable |
| **Core** | No |
| **Capabilities** | `data:read`, `data:write` |
| **MCP-exposed skills** | 3 |
| **Owns tables** | `currencies`, `exchange_rates` |

## Layered Design

The module ships three optional layers — all enabled together when the module is on; ignore a layer by simply not using its UI/skill.

| Layer | Purpose | Surface |
|-------|---------|---------|
| **L1 Display** | `currency` + `exchange_rate` columns on transactional tables | UI selectors on invoices/quotes/orders |
| **L2 Daily FX** | `currencies` + `exchange_rates` tables, ECB cron, manual override | `set_exchange_rate`, `fetch_ecb_rates` |
| **L3 Revaluation** | Period-end FX gain/loss on open AR/AP to BAS 3960/7960 | `revalue_open_balances` |

## Skills

| Skill | Trust | Description |
|-------|-------|-------------|
| `set_exchange_rate` | auto | Manually set or override an exchange rate for a base→quote pair on a given date. NOT for: automatic daily ECB fetch (use `fetch_ecb_rates`) or inline conversions. |
| `fetch_ecb_rates` | auto | Pull the latest daily exchange rates from the ECB reference feed and upsert them into `exchange_rates`. Idempotent. |
| `revalue_open_balances` | notify | Compute unrealized FX gain/loss on all open AR/AP in non-base currencies and post a single journal entry per BAS 2024 (Dt/Cr 3960 gain / 7960 loss vs 1510 AR / 2440 AP). Run at month-end before `close_accounting_period`. |

## Automations

| Name | Trigger | Skill |
|------|---------|-------|
| `fetch-fx-rates-daily` | cron `15 6 * * *` (06:15 UTC) | `fetch_ecb_rates` |

## BAS 2024 Accounts Used

| Account | Purpose |
|---------|---------|
| `1510` | Accounts Receivable |
| `2440` | Accounts Payable |
| `3960` | Realized/Unrealized FX gain |
| `7960` | Realized/Unrealized FX loss |

## Module API Contract

**Actions:** `get_rate`, `set_rate`, `fetch_ecb`, `revalue`, `list_currencies`

**Input fields:** `action`, `base_currency`, `quote_currency`, `rate`, `rate_date`

**Output fields:** `success`, `result`, `error`

## Used in Processes

- [record-to-report](../processes/record-to-report.md)
- [order-to-cash](../processes/order-to-delivery.md)
- [procure-to-pay](../processes/procure-to-pay.md)

## File Map

| Purpose | Path |
|---------|------|
| Module definition | `src/lib/modules/multi-currency-module.ts` |
| Edge function | `supabase/functions/fetch-fx-rates/index.ts` |

## Contributing

To enhance this module, see [Contributing Guide](../contributing/contributing.md).

Key rules:
- Follow `ModuleDefinition<I, O>` contract pattern
- All schema changes require idempotent migrations
- Skills must be self-describing ([Law 2](../concepts/openclaw-law.md))
- New skills must pass the [Agent Contract Integrity](../../mem/architecture/agent-contract-integrity.md) checklist (`bun run lint:skills`)

<!-- generated:skills:start — written by scripts/generate-module-docs.ts, edits here are overwritten -->
## Skills

These skills are seeded into `agent_skills` when the module is enabled and exposed via MCP.
External operators (FlowPilot, OpenClaw, Claude Desktop, custom MCP clients) can call them directly.

| Skill | Scope | Description |
|-------|-------|-------------|
| `set_exchange_rate` | internal | Manually set or override an exchange rate for a base→quote pair on a given date. Use when: admin enters a custom rate, locking a contract rate, fixing a bad ECB pull. NOT for: automatic daily ECB f… |
| `fetch_ecb_rates` | internal | Pull the latest daily exchange rates from the European Central Bank reference feed and upsert them into exchange_rates. Use when: scheduled daily refresh, admin clicks "Refresh rates now". Idempotent. |
| `revalue_open_balances` | internal | Compute unrealized FX gain/loss on all open AR (invoices) and AP (purchase orders) in non-base currencies, then post a single journal entry per BAS 2024 (Dt/Cr 3960 gain / 7960 loss vs 1510 AR / 24… |
| `import_exchange_rates` | internal | Bulk import historical exchange rates (upsert per base/quote/date). Use when: backfilling rate history before revaluation, migrating from another system, loading a year of ECB/Riksbank data. NOT fo… |
| `manage_fx_forward` | internal | Hedging: manage FX forward contracts — create, list, mark-to-market against the latest spot, settle (posts realized gain/loss to BAS 3960/7960), cancel. Use when: locking a future currency exchange… |
| `manage_subsidiary` | internal | Manage subsidiaries (local-currency entities) and tag journal entries to a subsidiary ledger. Use when: setting up a foreign subsidiary, booking an entry into its local-currency ledger. NOT for: co… |
| `subsidiary_ledger_report` | internal | Per-account ledger totals for one subsidiary in its local currency (posted journal entries tagged to it). Use when: reviewing a subsidiary\ |
| `consolidation_report` | internal | Group consolidation with currency translation: translates each entity\ |

<!-- generated:skills:end -->
