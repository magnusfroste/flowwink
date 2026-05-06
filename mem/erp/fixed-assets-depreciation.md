---
name: Fixed Assets & Depreciation
description: Capitalize equipment, monthly straight-line/declining depreciation, dispose with gain/loss — all auto-bookkept per BAS 2024
type: feature
---

## Tables
- `fixed_assets` — name, cost_cents, salvage_cents, useful_life_months, depreciation_method (straight_line|declining), declining_rate, status (active|fully_depreciated|disposed), accumulated_cents, BAS-konton (1210/1219/7832 default)
- `depreciation_entries` — UNIQUE (asset_id, period_date) — idempotent månadsbokföring + JE-länk

## RPCs (alla MCP-exposed)
- `register_fixed_asset(...)` → skapar tillgång + JE Dt 1210 / Cr 1930 (eller 2440 om vendor bill). Trust: notify.
- `run_monthly_depreciation(period_date)` → idempotent per (asset, period). JE Dt 7832 / Cr 1219 per asset. Auto-flagar fully_depreciated när NBV ≤ salvage. Trust: notify.
- `dispose_fixed_asset(id, sale_cents)` → reverserar cost+ackum, bokar proceeds (1930), gain (3970) eller loss (7970). Trust: approve.

## Cron
`fixed-assets-monthly-depreciation` — `0 3 1 * *` (1:a varje månad 03:00 UTC) → `run_monthly_depreciation`.

## UI
`/admin/fixed-assets` (modul `fixedAssets`) — 3 tabs: register / log / new. KPI-kort: active count, total cost, NBV. Dispose-dialog per rad.

## Override
Alla BAS-konton är defaults i RPC-args. Locale-pack kan i framtiden deklarera `pack.fixed_asset_accounts`.
