---
name: voucher-integrity
description: assign_voucher_number BEFORE INSERT-trigger + list_voucher_gaps/explain_voucher_gap RPCs + MCP-skills för obrutna verifikatserier per (series, year)
type: feature
---

# Voucher Integrity

**Lager:** Accounting neutral core. Universellt audit-krav (BAS/HGB/SKR/IFRS/US GAAP — alla kräver obrutna serier).

## Schema
`journal_entries.voucher_series` (text, default `A`), `voucher_number` (int), `voucher_year` (int). Unik per `(series, year, voucher_number)`.

## Trigger
`assign_voucher_number()` BEFORE INSERT på `journal_entries` — om `voucher_number IS NULL` sätts den till `max+1` för aktuell `(series, year)`. Garanterar sekvenstighet även vid parallel-inserts (rad-lås på serie/år).

## RPCs (MCP-exposed som skills med samma namn)
- `list_voucher_gaps(p_year int, p_series text default null)` → `[{ series, expected_next, last_seen, gap_size, gap_after_date }]`
- `explain_voucher_gap(p_series text, p_voucher_number int)` → letar i `audit_logs` efter `journal_entries.delete`/`void`-events runt numret; returnerar förklaring eller `unknown — investigate`.

## UI
`/admin/accounting → Voucher Integrity` (`VoucherIntegrityTab.tsx`) — scanna år, visa gaps, expandera för audit-trail.

## Guardrail
`src/lib/__tests__/voucher-gaps.guardrails.test.ts` verifierar att RPC är callable och att skills är enabled+mcp_exposed.

## Varför neutralt
Alla länder kräver obrutna verifikatserier för bokföringslagsefterlevnad — bara serieprefix (`A`/`SK`/`JE`) skiljer.
