# Subscriptions Module

> Provider-agnostic recurring revenue lifecycle for FlowWink — owns visibility,
> MRR/ARR, churn, dunning and self-service customer flows on top of Stripe (today)
> and Paddle (planned).

**Module ID:** `subscriptions` · **Default:** Disabled · **Autonomy:** `agent-capable`

---

## 1. Why This Module Exists

Stripe's dashboard is great for *Stripe operators* — not for the business
owner. When a SaaS site has 50, 200 or 2 000 active customers, the questions
are always the same:

- What's my **MRR/ARR right now**?
- Who's **trialing** and about to convert (or not)?
- Who's **past due** and about to churn?
- Did Stripe just **fail to charge Anna's card** — and what is FlowPilot
  doing about it?

The Subscriptions module mirrors provider state into FlowWink's own
`subscriptions` table via webhooks, so the answers live where the rest of
the business lives — next to Leads, Orders, Invoices and FlowPilot.

**Key principle:** the DB schema and UI are **provider-neutral**. Switching
or adding a provider = ship a new adapter, no UI rewrite.

---

## 2. Subscription vs Subscription-Product (the common confusion)

A `product` with `is_subscription = true` is a **catalog entry** (price,
billing interval, trial config). A row in `subscriptions` is a **live
contract** between a customer and that product — created when checkout
completes, and kept in sync with the provider for its entire lifetime
(trial → active → past_due → canceled). Stripe charges the same amount
every period until **we** tell it to stop.

| | Product (is_subscription) | Subscription (live row) |
|---|---|---|
| Lives in | `products` | `subscriptions` |
| Created by | Admin | Webhook on `customer.subscription.created` |
| Lifecycle | Static catalog | trial → active → past_due → canceled |
| Charges | Defines the price | The actual recurring charge |

---

## 3. Architecture

```
Stripe (or Paddle)
        │
   webhooks ──────────► supabase/functions/stripe-webhook
        │                          │
        │                          ├─► UPSERT into `subscriptions`
        │                          ├─► OPEN/UPDATE `dunning_sequences`
        │                          └─► (later) emit notifications
        │
   ◄── customer-portal ── supabase/functions/subscriptions-portal
   ◄── change-plan ────── supabase/functions/subscriptions-manage
```

### Provider abstraction

Both client and edge code are routed through a `SubscriptionProvider`
interface so adding Paddle is purely additive:

- **Client:** `src/lib/subscription-providers/types.ts` + `index.ts`
  (registry + `getActiveProvider()` reading `site_settings.subscriptions.provider`).
- **Edge:** `supabase/functions/_shared/subscription-providers.ts`
  (Stripe adapter + `mapStripeSubscription()` normalizer).

UI, hooks, FlowPilot skills and the `subscriptions-module.ts` manifest
NEVER reference Stripe directly.

### Data model

| Table | Purpose |
|---|---|
| `subscriptions` | Live contracts mirrored from the provider. Holds `status`, `unit_amount_cents`, `billing_interval`, `current_period_*`, `cancel_at_period_end`, `provider_*` ids, denormalized customer info. |
| `dunning_sequences` | One per failed-payment recovery flow. Tracks `current_step` (0–4), `next_action_at`, `status` (active/recovered/failed/cancelled), `failure_reason`, `mrr_at_risk_cents`. |
| `dunning_actions` | Append-only audit log of every email/system action per sequence. |

All three are admin-RLS only — customers interact via the **Stripe Customer
Portal**, never with these rows directly.

---

## 4. Edge Functions

| Function | Trigger | Responsibility |
|---|---|---|
| `stripe-webhook` | Stripe events | Verifies signature → maps to neutral row → upserts `subscriptions` → opens/closes `dunning_sequences` |
| `subscriptions-checkout` | UI button | Creates a provider checkout session via the active adapter |
| `subscriptions-portal` | UI button (`openCustomerPortal`) | Returns a Customer Portal URL so customers can self-serve |
| `subscriptions-manage` | UI dropdown (`useSubscriptionAction`) | `cancel` / `resume` / `change_plan` via the adapter |
| `dunning-processor` | Cron (every 30 min, planned) | Walks `dunning_sequences` where `next_action_at <= now()` and runs the next step |

Public-facing functions (checkout, webhook) are deployed with
`--no-verify-jwt`; admin functions use default JWT verification.

---

## 5. Module Manifest & Skills

`src/lib/modules/subscriptions-module.ts` registers the module in the
unified registry with skills:

- `list_subscriptions(status?, limit?)` — read live contracts
- `subscription_mrr` — compute MRR (normalizes year/week/day to monthly)
- `subscription_churn` — count cancellations in the last 30 days

Planned (Phase 3):

- `list_dunning_sequences`, `pause_dunning`, `escalate_dunning`
- Briefing integration: *"3 customers in dunning — 297 SEK MRR at risk"*

This honours **Law 1** (no hardcoded routing) and **Law 2** (skills are
self-describing) — FlowPilot picks them through the normal scoring loop
based on description alone.

---

## 6. Admin UI

| Route | Purpose |
|---|---|
| `/admin/subscriptions` | Live contracts: MRR, ARR, trialing, churn-30d, filterable list, customer-portal access, cancel/resume |
| `/admin/subscriptions/dunning` | Active recovery flows: MRR-at-risk, recovery rate, per-sequence pause/resume/escalate |

Hooks: `useSubscriptions`, `useSubscriptionMetrics`, `useSubscriptionAction`,
`openCustomerPortal`, `useDunningSequences`, `useDunningMetrics`, `useDunningControl`.

Calendar surfaces upcoming dunning actions via the `dunning-actions` source
in `src/lib/calendar-sources.ts`.

---

## 7. Dunning — Automated Recovery for Failed Payments

**Dunning** is the structured escalation that runs *after* `invoice.payment_failed`
fires, with the goal of recovering the subscription before it churns.
Industry benchmarks recover **15–30% of otherwise lost MRR** — for a SaaS
at 100k SEK MRR with 5% involuntary churn, that's roughly **3 000–9 000
SEK/month rescued**.

### The 5-step sequence

| Day | Trigger | Action | Tone |
|---:|---|---|---|
| 0  | `invoice.payment_failed` | Branded mail + customer portal link | Friendly, "probably technical" |
| 3  | Still unpaid | Reminder + likely causes | Helpful |
| 7  | Still unpaid | "Subscription will pause soon" + clear CTA | Urgent |
| 10 | Still unpaid | Final warning + auto `crm_task` for FlowPilot/owner if MRR > $500 | Personal |
| 14 | Still unpaid | Auto-cancel via provider + "door is open" mail | Closing |

### Smart logic

- `invoice.payment_succeeded` mid-sequence → mark `recovered`, send
  thank-you, no further steps.
- Customer cancels themselves → jump to offboarding.
- High-value failures (> $500 MRR) escalate to a manual `crm_task` instead
  of just another email.
- `pause_dunning` lets the operator stop the sequence after a real
  conversation; `escalate_dunning` jumps straight to the final step.

### Components

1. **DB:** `dunning_sequences` + `dunning_actions` (admin-RLS only).
2. **Webhook hook:** `stripe-webhook` opens sequences on
   `invoice.payment_failed` and resolves them on `payment_succeeded`.
3. **Engine:** `dunning-processor` edge function (cron-driven, every 30 min).
4. **Templates:** 5 transactional React Email templates (`dunning-step-1` …
   `dunning-step-5`), brand-styled — **planned, see Phase 3**.
5. **UI:** `/admin/subscriptions/dunning` — MRR-at-risk, recovery rate,
   sequence controls.
6. **Calendar:** `dunning-actions` source surfaces the next contact point.

---

## 8. Roadmap

- **Phase 1 (done)** — Provider abstraction, neutral `subscriptions` table,
  Stripe webhook ingestion, admin UI, MRR/ARR/churn metrics, customer
  portal, cancel/resume/change-plan.
- **Phase 2 (done)** — Dunning DB, webhook integration, processor edge
  function, dunning admin UI, calendar source.
- **Phase 3 (next)** — 5 React Email templates via the transactional email
  infra, `pg_cron` schedule for `dunning-processor`, FlowPilot skills
  (`list_dunning_sequences`, `pause_dunning`, `escalate_dunning`),
  briefing integration ("X customers in dunning, Y SEK MRR at risk").
- **Phase 4** — Paddle adapter, plan-change UI with proration preview,
  revenue retention analytics (cohort LTV, recovery rate trendline).

---

## 9. Files

```
src/lib/modules/subscriptions-module.ts           # Module manifest
src/lib/subscription-providers/                   # Client provider abstraction
src/hooks/useSubscriptions.ts                     # Subs hooks
src/hooks/useDunning.ts                           # Dunning hooks
src/pages/admin/SubscriptionsPage.tsx             # Live contracts UI
src/pages/admin/DunningPage.tsx                   # Recovery UI
src/lib/calendar-sources.ts                       # `dunning-actions` source

supabase/functions/_shared/subscription-providers.ts  # Edge adapters
supabase/functions/stripe-webhook/                    # Ingestion
supabase/functions/subscriptions-checkout/
supabase/functions/subscriptions-portal/
supabase/functions/subscriptions-manage/
supabase/functions/dunning-processor/                 # Recovery engine
```

---

## 10. Phase 3 — FlowPilot Skills & Automation (shipped)

### Skills (registered via `setup-flowpilot`)
| Skill | Handler | Approval | Purpose |
|---|---|---|---|
| `list_subscriptions` | `edge:subscriptions-skills` | auto | List subs by status |
| `subscription_mrr` | `edge:subscriptions-skills` | auto | MRR/ARR/churn aggregate |
| `list_dunning_sequences` | `edge:subscriptions-skills` | auto | Active recovery queue + MRR at risk |
| `pause_dunning` | `edge:subscriptions-skills` | approve | Pause N days after manual contact |
| `escalate_dunning` | `edge:subscriptions-skills` | approve | Jump to final cancel step |

All five route through one edge function (`subscriptions-skills`) which dispatches by `_skill` (injected by `agent-execute`).

### Cron
`pg_cron` job `dunning-processor-every-30min` calls `dunning-processor` every 30 min via `pg_net`.

### Briefing integration
`flowpilot-briefing` now collects active dunning + 7-day recovered, renders a "💸 Recurring Revenue" section, surfaces a high-priority action item when MRR is at risk, and adds `dunning_*` keys to the metrics payload.

### Remaining (Phase 4)
- 5 React Email templates (`dunning-step-1`…`dunning-step-5`) — requires email-domain setup first.
- Paddle adapter.
- Per-customer revenue analytics view.
