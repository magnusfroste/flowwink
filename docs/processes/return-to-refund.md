# Return-to-Refund

> The reverse-logistics mirror of Order-to-Delivery: request → approve → receive →
> inspect → restock → refund.

**Maturity level:** L3 — Operational (full RMA lifecycle incl. QC + partial refunds)
**Status:** ✅ Core loop live · F2 depth (reasons/fees/partials) shipped 2026-06-12

## Flow

```
Customer return request
   └─► create_return (reason_code, draft RMA) ─► approve_return
         └─► receive_return (restock=true items emit stock.movement → layers)
               └─► inspect_return (QC notes + restocking fee)
                     └─► refund_return (PARTIAL ok: Σ items − fee enforced,
                          over-refund rejected; closes on completion/p_final)
Analytics: return_reason_report (counts + refunded per reason, N days)
```

## Participating modules & skills

| Step | Module | Skills |
|---|---|---|
| Request | returns | `create_return` (reason_code), `manage_return_item` |
| Approve/receive | returns + inventory | `approve_return`, `receive_return` (restock → valuation layers) |
| QC | returns | `inspect_return` (notes + restocking_fee_cents) |
| Refund | returns + invoicing | `refund_return` (partial, Stripe/manual/store_credit) |
| Analyze | returns | `return_reason_report` |

## Agent coverage

| Actor | What they run |
|---|---|
| 👤 Manual | ReturnsPage (create w/ reason, Inspect step, partial refund w/ remaining, reasons widget) |
| 🤖 FlowPilot | reason analytics in reviews; refund execution on approval |
| 🔗 External agent | full loop over MCP |

## Known gaps (parity scorecards)

`return_to_vendor`, `return_email`/labels, `reverse_logistics` pickup,
`condition_actions` — see `docs/parity/capabilities/returns.json`.
