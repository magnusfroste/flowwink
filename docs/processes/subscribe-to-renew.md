# Subscribe-to-Renew

> From signup to recurring revenue: bill on cycle, handle changes with proration,
> chase failures, win back churn. The recurring-revenue mirror of Quote-to-Cash.

**Maturity level:** L3 — Operational (manual/invoice-billed subs end-to-end; card subs via Stripe webhooks)
**Status:** ✅ Core loop live · proration shipped 2026-06-12

## Flow

```
Signup ──► Subscription (stripe | manual) ──► bill each cycle ──────► Renewal
              │                                  │                        │
              │ manual: create_manual_subscription│ subscription-billing- │
              │ card:   Stripe checkout/webhooks  │ cron → generate_      │
              │                                   │ subscription_invoice  │
   Mid-cycle change ◄──────────────────────────┐  │                       │
   change_subscription (PRORATION):            │  └─ dunning: flag_at_   │
     upgrade   → prorated adjustment invoice   │     risk_subscriptions, │
     downgrade → credit (next cycle)           │     send_dunning_       │
                                               │     reminders (invoices)│
   Churn ◄─────────────────────────────────────┘                         │
     record_churn_reason (+NPS) → winback campaigns ─────────────────────┘
```

## Participating modules & skills

| Step | Module | Skills / functions |
|---|---|---|
| Create | subscriptions | `create_manual_subscription` (B2B invoice-billed), Stripe webhooks (card) |
| Bill on cycle | subscriptions + invoicing | `subscription-billing-cron` → `generate_subscription_invoice` |
| Mid-cycle change | subscriptions | `change_subscription` — prorated by remaining days; upgrade → draft adjustment invoice, downgrade → credit on `metadata.last_change` |
| Collect | invoicing + reconciliation | `send_dunning_reminders`, `auto_mark_invoice_paid` |
| Risk & churn | subscriptions | `flag_at_risk_subscriptions`, `record_churn_reason`, `upcoming_renewals` |
| Report | subscriptions | `subscription_mrr` (MRR/ARR/churn) |

## Agent coverage

| Actor | What they run |
|---|---|
| 👤 Manual | Subscriptions admin UI, invoice review |
| 🤖 FlowPilot | billing cron, dunning, at-risk sweeps, renewal outreach |
| 🔗 External agent | full loop over MCP (create/change/report skills) |

## Known gaps (tracked in parity scorecards)

- `subscriptions.proration` — engine shipped + Stage-3-verified; admin UI for
  qty/price change pending (→ done after UI).
- `invoicing.recurring` — recurring engine exists for subscription-billed
  invoices; standalone recurring invoices (no subscription) not yet.
- Usage-based billing, plan templates, cohort analysis — see
  `docs/parity/capabilities/subscriptions.json`.
