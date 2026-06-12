---
title: "Sprint — P1 Subscribe-to-Renew backend (proration + recurring re-score)"
description: Close the two w3 gaps gating the Subscribe-to-Renew process.
category: concepts
status: planned
---

# Sprint — P1 Subscribe-to-Renew backend

[`process-gaps.md`](./process-gaps.md) ranks **Subscribe-to-Renew** as P1, gated by
`invoicing.recurring` (w3) and `subscriptions.proration` (w3).

**Verify-first finding (2026-06-12):** recurring billing already EXISTS for
invoice-billed subscriptions — `subscription-billing-cron` picks due manual
subscriptions, `generate_subscription_invoice` creates the draft invoice and
advances `next_invoice_date`. The audit's "missing" was stale →
`invoicing.recurring` re-scored to **partial** (remaining: dunning sequences are
tracked separately on subscriptions; plan templates out of scope here).

## Issues

### P1.1 — Proration on mid-cycle change (the real w3 build)
- **RPC/skill `change_subscription`**: change `quantity` and/or `unit_amount_cents`
  mid-period on a manual subscription. Computes the remaining-period fraction
  (days-based: remaining/period vs `current_period_start..end`), and creates a
  prorated **adjustment invoice** (upgrade → charge for the delta × fraction;
  downgrade → negative line / credit note marked in notes). Updates the
  subscription row. Returns the prorated amounts for transparency.
- Flips `subscriptions.proration` → partial/done per dual-surface.

### P1.2 — Process doc
- Write `docs/processes/subscribe-to-renew.md` (maturity L3) per the existing
  process-doc format, linking the gating capabilities.

Stage-3 per the verification loop; smoke scenarios appended to
`scripts/smoke/floor-wave1.sql`'s successor (`scripts/smoke/p1-subscribe.sql`).
