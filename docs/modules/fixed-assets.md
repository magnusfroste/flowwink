---
title: "Fixed Assets Module"
module_id: "fixedAssets"
version: "1.0.0"
category: "data"
autonomy: "agent-capable"
---

# Fixed Assets

> Capitalize equipment, run monthly depreciation, and post disposals — all to BAS 2024 accounts (1210/1219/7832 + 3970/7970).

Ships with **3 agent skills** and **1 monthly automation**.

## Quick Facts

| Property | Value |
|----------|-------|
| **Module ID** | `fixedAssets` |
| **Version** | 1.0.0 |
| **Category** | data |
| **Autonomy** | agent-capable |
| **Core** | No |
| **Capabilities** | `data:read`, `data:write` |
| **MCP-exposed skills** | 3 |
| **Owns tables** | `fixed_assets`, `fixed_asset_depreciations` |

## Skills

| Skill | Trust | Description |
|-------|-------|-------------|
| `register_fixed_asset` | notify | Register a new fixed asset (equipment, furniture, vehicles, IT) and post the acquisition journal entry. NOT for: small consumables, software subscriptions, or intangibles. |
| `run_monthly_depreciation` | notify | Compute and post depreciation for one accounting month across all active assets. Idempotent per (asset, period). Auto-marks assets `fully_depreciated` when NBV reaches salvage. |
| `dispose_fixed_asset` | approve | Dispose of an asset (sale, scrap, write-off). Reverses cost + accumulated depreciation, books proceeds, and posts gain (3970) or loss (7970). |

## Automations

| Name | Trigger | Skill |
|------|---------|-------|
| `fixed-assets-monthly-depreciation` | cron `0 3 1 * *` (1st of month, 03:00 UTC) | `run_monthly_depreciation` |

## BAS 2024 Accounts Used

| Account | Purpose |
|---------|---------|
| `1210` | Asset cost (machinery & equipment) |
| `1219` | Accumulated depreciation |
| `1930` | Bank — acquisition / proceeds counter-account |
| `2440` | Accounts Payable — when asset is acquired via vendor bill |
| `3970` | Gain on disposal of fixed assets |
| `7832` | Depreciation expense |
| `7970` | Loss on disposal of fixed assets |

## Depreciation Methods

| Method | Notes |
|--------|-------|
| `straight_line` (default) | `(cost − salvage) / useful_life_months` per period |
| `declining` | `declining_rate` annual rate applied to NBV; useful for tax-aligned schedules |

## Module API Contract

**Actions:** `register`, `depreciate`, `dispose`, `list`

**Output fields:** `success`, `result`

## Used in Processes

- [record-to-report](../processes/record-to-report.md)
- [procure-to-pay](../processes/procure-to-pay.md)

## File Map

| Purpose | Path |
|---------|------|
| Module definition | `src/lib/modules/fixed-assets-module.ts` |

## Contributing

To enhance this module, see [Contributing Guide](../contributing/contributing.md).

Key rules:
- Follow `ModuleDefinition<I, O>` contract pattern
- All schema changes require idempotent migrations
- Skills must be self-describing ([Law 2](../concepts/openclaw-law.md))
- New skills must pass the [Agent Contract Integrity](../architecture/agent-contract-integrity.md) checklist (`bun run lint:skills`)
