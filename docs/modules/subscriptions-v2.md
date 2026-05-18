# Subscriptions v2 — Renewals, Churn & Win-back

Extends the v1 Subscriptions module with renewal awareness, churn intelligence and win-back campaigns.

## New tables

| Table | Purpose |
|-------|---------|
| `subscription_churn_reasons` | Captures why customers cancel — reason category, free-text feedback, NPS, would-return flag |
| `subscription_winback_campaigns` | Admin-defined win-back offers (discount %, duration, target segment, email body) |
| `subscription_winback_sends` | Tracks each individual win-back outreach (channel, sent / opened / converted) |

## New columns on `subscriptions`

- `renewal_reminder_sent_at` — when the upcoming-renewal heads-up was sent
- `health_score` (0–100) — derived signal combining payment history, usage, support tickets
- `at_risk` boolean + `at_risk_reason` — flagged when health drops or dunning starts

## RPCs (SECURITY DEFINER)

- `record_churn_reason(subscription_id, reason, feedback, nps_score, would_return)` — invoked from cancel flow / exit survey
- `flag_at_risk_subscriptions()` — sweep that marks `at_risk = true` for past_due, scheduled-cancel, low-health subs
- `upcoming_renewals(days_ahead)` — list subs renewing in N days for FlowPilot briefings

## Skills (MCP-exposed)

- `list_subscriptions`, `subscription_mrr` (v1)
- `upcoming_renewals` — for proactive outreach
- `flag_at_risk_subscriptions` — daily sweep
- `record_churn_reason` — exit-survey ingestion
- `list_winback_campaigns`
- `list_dunning_sequences`, `pause_dunning`, `escalate_dunning` (v1)

## UI

`/admin/subscriptions` now has two top-level tabs:
- **Subscriptions** — original list with status filter
- **Renewals & Risk** — KPI cards (renewals 14d, at-risk count), upcoming renewals table, "Flag at-risk now" sweep button

## Events emitted

- `subscription.churn_reason_recorded`
- `subscription.at_risk` (planned via `flag_at_risk_subscriptions`)
- `subscription.renewal_upcoming` (planned, fired from cron over `upcoming_renewals`)

## Future development

- Cron job that runs `flag_at_risk_subscriptions()` daily and emits events per newly flagged sub
- Cron job that calls `upcoming_renewals(7)` and emits `subscription.renewal_upcoming` for each row not yet reminded
- `send_winback` skill (edge function that creates a `subscription_winback_sends` row + sends email)
- Health-score computation (currently nullable; needs feeder pipeline from payments + tickets + login activity)
- Customer-facing exit-survey block to populate `subscription_churn_reasons`

---

## Invoice-driven (manual) subscriptions — B2B

Stripe is no longer the only billing path. The platform supports **invoice-billed subscriptions** for B2B customers (telecom plans, retainers, hosted services) who pay by invoice instead of card.

### Data model
On `subscriptions`:
- `provider` — `'stripe'` (webhook-synced) or `'manual'` (platform-managed)
- `payment_terms` — `invoice_30` | `invoice_14` | `invoice_7` | `direct_debit` | `manual` | `prepaid_card`
- `next_invoice_date` — driven by the daily billing cron
- `billing_interval_count` — e.g. 3 with `interval=month` for quarterly
- `billing_contact_email` — B2B AP/AR contact (can differ from `customer_email`)
- `po_number` — customer purchase order reference
- `last_invoice_id` — link to most recent generated invoice
- `auto_finalize` (default `false`) — when `true`, generated invoices are issued as `sent` immediately (auto-finalized) and emit `invoice.finalized`; when `false`, invoices land as `draft` for manual review

### RPCs (all SECURITY DEFINER, MCP-exposed)
- `create_manual_subscription(...)` — admin creates a recurring subscription
- `generate_subscription_invoice(subscription_id, tax_rate?, due_in_days?)` — creates a `draft` invoice and advances `next_invoice_date`
- `cancel_manual_subscription(subscription_id, reason?, effective_date?)` — stops further invoicing

### Daily billing cron
`supabase/functions/subscription-billing-cron` runs at **06:00 UTC** (`subscription-billing-daily` pg_cron job). It selects every active `provider='manual'` subscription with `next_invoice_date <= today` and calls `generate_subscription_invoice` per row. Idempotent (the RPC advances the date so reruns the same day do nothing).

### Events emitted (platform event bus)
- `subscription.created` — on manual sub creation (includes `auto_finalize` flag)
- `subscription.invoiced` — every time an invoice is generated (includes `auto_finalized` + `status`)
- `invoice.finalized` — additionally fired when `auto_finalize=true` (source: `subscription_auto_finalize`)
- `subscription.canceled` — on manual cancel

### UI
`/admin/subscriptions` → **New manual subscription** button opens a dialog with customer, plan, price, interval, payment terms, start date, billing contact, PO number.

### Why not just use Stripe Invoicing?
Stripe Invoicing works for digital-first SMBs but pulls B2B billing out of the platform's accounting/reconciliation flow. By keeping invoice-billed subs inside the platform, the generated invoices land in the same `invoices` table that BAS/SIE/SAF-T export adapters already read — so revenue recognition and reconciliation work uniformly across card and invoice channels.
