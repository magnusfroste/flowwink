# Acquire-to-Retire

> Fixed-asset lifecycle: capitalize → depreciate monthly → (impair/adjust) → dispose
> with gain/loss. The asset mirror of Record-to-Report.

**Maturity level:** L3 — Operational
**Status:** ✅ Live (engine shipped pre-program; formalized as a process 2026-06-12)

## Flow

```
register_fixed_asset (cost, life, salvage → acquisition JE Dt 1210)
   └─► run_monthly_depreciation (Dt 7832 / Cr 1219, idempotent per period)
         └─► propose_annual_depreciation (year-end, via run_year_end)
               └─► dispose_fixed_asset (reverse cost+accum, book proceeds,
                    gain 3970 / loss 7970)
```

## Participating modules & skills

| Step | Module | Skills |
|---|---|---|
| Acquire | fixed-assets + accounting | `register_fixed_asset` |
| Depreciate | fixed-assets | `run_monthly_depreciation` (straight-line/declining) |
| Year-end | fixed-assets + accounting | `propose_annual_depreciation`, `run_year_end` |
| Retire | fixed-assets | `dispose_fixed_asset` |

## Agent coverage

| Actor | What they run |
|---|---|
| 👤 Manual | Fixed assets admin, journal review |
| 🤖 FlowPilot | monthly depreciation runs, year-end proposals |
| 🔗 External agent | full lifecycle over MCP |

## Known gaps (parity scorecards)

Impairment/revaluation, IFRS 16 leases, component tracking, schedule report —
see `docs/parity/capabilities/fixed-assets.json`.
