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
