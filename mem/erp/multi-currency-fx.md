---
name: Multi-Currency & FX Revaluation
description: 3-layer multi-currency stack — currency columns på transactional tables, ECB daily rates via fetch-fx-rates edge, revalue_open_balances RPC bokar FX gain/loss till BAS 3960/7960
type: feature
---

## Layers
- **L1 Display:** `currency` (default 'SEK') + `exchange_rate` (default 1) på invoices/quotes/orders/purchase_orders/expenses. Bakåtkompatibelt — befintliga rader rör inte sig.
- **L2 Daily FX:** `currencies` (ISO-katalog, en `is_base=true`) + `exchange_rates` (UNIQUE base/quote/date). `get_exchange_rate(base,quote,date)` med inverse fallback. `set_exchange_rate(...)` admin-only upsert.
- **L3 Revaluation:** `revalue_open_balances(date, gain_acct='3960', loss_acct='7960', ar='1510', ap='2440')` — räknar delta på öppna AR/AP i icke-bas-valuta och postar EN journal_entry per körning.

## Edge function
- **`fetch-fx-rates`** — pollar `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml`, upsertar EUR→quote OCH cross-rates base→quote om base ≠ EUR. Idempotent (UNIQUE constraint). Cron: `15 6 * * *` UTC via automation `fetch-fx-rates-daily`.
- ECB-XML använder single-quotes — regex stödjer båda.

## MCP-skills (alla seedade i `multiCurrencyModule.skillSeeds`)
- `set_exchange_rate` → `rpc:mcp_set_exchange_rate` (auto trust)
- `fetch_ecb_rates` → `edge:fetch-fx-rates` (auto trust)
- `revalue_open_balances` → `rpc:mcp_revalue_open_balances` (notify trust — påverkar ledger)

## UI
- `/admin/currencies` (modul `multiCurrency`) — 3 tabs: rates / currencies / manual rate. Knappar i header: "Fetch ECB rates" + "Revalue open balances".

## Locale-pack hook
BAS 2024 default 3960/7960. Andra pack:s kan override via `revalue_open_balances`-args. Framtida förbättring: `pack.fx_accounts` på `AccountingLocalePack`.
