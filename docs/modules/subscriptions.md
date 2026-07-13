---
title: "Subscriptions Module"
module_id: "subscriptions"
version: "2.0.0"
category: "data"
autonomy: "view-required"
generated: true
generated_at: "2026-07-13"
---

# Subscriptions

> Recurring revenue lifecycle — active customers, MRR, churn, dunning, renewals, win-back

Ships with **15 agent skills**, **1 database table**, an **admin UI**.

## Quick Facts

| Property | Value |
|----------|-------|
| **Module ID** | `subscriptions` |
| **Version** | 2.0.0 |
| **Category** | data |
| **Autonomy** | view-required |
| **Core** | No |
| **Capabilities** | `data:read`, `data:write` |
| **MCP-exposed skills** | 15 |
| **Owns tables** | 1 |

## Integrations

**Optional:** `stripe`, `stripe_webhook`

## Skills

These skills are seeded into `agent_skills` when the module is enabled and exposed via MCP.
External operators (FlowPilot, OpenClaw, Claude Desktop, custom MCP clients) can call them directly.

| Skill | Scope | Description |
|-------|-------|-------------|
| `list_subscriptions` | internal | List recurring subscriptions with filters. Use when: admin asks "who is subscribed?", reviewing billing, auditing customer base. NOT for: one-off orders (lookup_order); MRR/ARR aggregates (subscrip… |
| `subscription_mrr` | internal | Compute current MRR, ARR, active subscriber count, and 30-day churn. Use when: reviewing recurring revenue, weekly briefings, business health checks. NOT for: listing individual subs (list_subscrip… |
| `upcoming_renewals` | internal | List subscriptions renewing within N days. Use when: planning outreach, weekly briefing on renewals, identifying win-back candidates with cancel_at_period_end. NOT for: aggregate MRR (subscription_… |
| `flag_at_risk_subscriptions` | internal | Sweep subscriptions and flag at-risk ones (past_due, scheduled cancel, low health). Use when: daily health check, before sending win-back. NOT for: reading current at-risk list (use list_subscripti… |
| `record_churn_reason` | internal | Record why a customer churned (reason category + free-text feedback + NPS). Use when: customer cancels via portal, exit survey returned. NOT for: technical cancellation (use Stripe customer-portal … |
| `manage_winback_campaign` | internal | Create or update a win-back campaign (the offer + email shown to churned/at-risk subscribers). Use when: setting up a retention offer after a churn event, or editing an existing one. NOT for: listi… |
| `list_winback_campaigns` | internal | List configured win-back campaigns (active or all). Use when: choosing which offer to send, auditing win-back program. NOT for: creating/editing a campaign (manage_winback_campaign) or sending it. |
| `manage_subscription_plan` | internal | CRUD for reusable subscription plan templates (name/price/interval/trial/commitment). Use when: defining or changing the plans customers subscribe to. NOT for: creating a customer subscription (use… |
| `create_manual_subscription` | internal | Create a recurring subscription billed by invoice (not via Stripe card). Use when: B2B customer signs a service plan paid by invoice (telecom plans, retainers, hosted services). NOT for: online car… |
| `generate_subscription_invoice` | internal | Generate the next due invoice for a manual subscription. Use when: ad-hoc billing run, customer requested immediate invoice, testing. NOT for: stripe-billed subscriptions (Stripe handles those). No… |
| `cancel_manual_subscription` | internal | Cancel a manual (invoice-billed) subscription. Use when: customer terminates B2B plan, account closed. NOT for: Stripe subscriptions (use Stripe customer portal or cancel_subscription). |
| `change_subscription` | internal | Change quantity or unit price on a manual (invoice-billed) subscription with PRORATION: mid-period upgrades create a prorated adjustment invoice; downgrades record a credit (applied next cycle). Us… |
| `list_dunning_sequences` | internal | List dunning sequences (failed-payment recovery runs) with MRR at risk, sorted highest first. Use when: reviewing payment-failure recovery, weekly revenue-risk briefing, deciding whom to contact pe… |
| `pause_dunning` | internal | Pause an active dunning sequence for a subscription (stop retry emails for N days). Use when: customer promised to pay, dispute in progress, goodwill grace period. NOT for: permanently stopping rec… |
| `escalate_dunning` | internal | Escalate a dunning sequence to its final step immediately (last-notice email + imminent cancellation). Use when: repeated failures with no customer response, high-risk account needs resolution now.… |

## Data Model

Tables created by this module (from migrations):

- `public.public`

All tables ship with Row-Level Security policies. See migration files for the exact rules.

## Module API Contract

**Actions:** `list`, `mrr`, `churn`

**Input fields:** `action`, `status`, `limit`

**Output fields:** `success`, `data`, `error`

## Used in Processes

This module participates in the following end-to-end business processes:

- [quote-to-cash](../processes/quote-to-cash.md)

## File Map

| Purpose | Path |
|---------|------|
| Module definition | `src/lib/modules/subscriptions-module.ts` |
| Hook | `src/hooks/useSubscriptions.ts` |
| Admin page | `src/pages/admin/SubscriptionsPage.tsx` |
| Migration | `supabase/migrations/20260707120000_parity-r3-shipping-tickets-subscriptions.sql` |

## Contributing

To enhance this module, see [Contributing Guide](../contributing/contributing.md).

Key rules:
- Follow `ModuleDefinition<I, O>` contract pattern
- All schema changes require idempotent migrations
- Skills must be self-describing ([Law 2](../concepts/openclaw-law.md))
- Blocks are interfaces, not pipelines ([Law 3](../concepts/openclaw-law.md))
- New skills must pass the [Agent Contract Integrity](../../mem/architecture/agent-contract-integrity.md) checklist (`bun run lint:skills`)

---

*This file is auto-generated by `scripts/generate-module-docs.ts`. Do not edit manually — re-run the script after changing the module definition.*