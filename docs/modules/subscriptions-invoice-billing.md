# Invoice-Driven Subscriptions (B2B Manual Billing)

Companion doc to [`subscriptions.md`](./subscriptions.md). Covers the full design, operations and recovery playbook for **manual (invoice-billed) subscriptions** — the B2B path that runs alongside Stripe.

---

## 1. Why this exists

The original `subscriptions` module is a mirror of Stripe state. That works for self-serve digital SMBs but breaks for B2B scenarios such as:

- A telecom operator selling a monthly business plan billed by invoice, net 30
- A consulting firm with a fixed retainer paid against PO
- A hosting/SaaS vendor where finance demands SEPA direct debit and a real invoice number

These customers do not want to enter a card in Stripe Checkout. They want a PDF invoice, payment terms, a PO reference, and the line item to land in the same accounting flow as one-off invoices. This module provides exactly that without leaving the platform.

**Design principle:** invoice-billed subs live in the same `subscriptions` table and produce real rows in the same `invoices` table. Accounting export adapters (BAS 2024 → SIE 4, OECD SAF-T, DATEV, FEC) already read `invoices`, so manual subs flow through reporting with zero extra plumbing.

---

## 2. Data model

### `subscriptions` — new columns

| Column | Type | Purpose |
|---|---|---|
| `provider` | `text` | `'stripe'` (webhook-synced, immutable from UI) or `'manual'` (platform-managed) |
| `payment_terms` | `text` (CHECK) | `prepaid_card` \| `invoice_7` \| `invoice_14` \| `invoice_30` \| `direct_debit` \| `manual` |
| `next_invoice_date` | `date` | The date the next draft invoice should be generated. Cron compares against `today` |
| `billing_interval_count` | `int` | Multiplier on `interval`. `interval='month'` + `billing_interval_count=3` = quarterly |
| `billing_contact_email` | `text` | AP/AR contact for invoices. Falls back to `customer_email` if null |
| `po_number` | `text` | Customer purchase order shown on the invoice |
| `last_invoice_id` | `uuid` | FK to `invoices.id` — most recent generated invoice |

> `provider='manual'` rows are invisible to the Stripe webhook handler. They never enter dunning via Stripe; collection is finance's responsibility (or a future `collections` module).

### Helper functions

- `advance_billing_date(current_date, interval, interval_count)` — pure SQL function used by `generate_subscription_invoice` to roll `next_invoice_date` forward. Handles `day`, `week`, `month`, `year`.

---

## 3. RPCs

All are `SECURITY DEFINER`, exposed via MCP through the `subscriptions` module skill seeds.

### `create_manual_subscription`
```sql
create_manual_subscription(
  p_customer_email      text,        -- required
  p_customer_name       text,
  p_plan_name           text,        -- required, shown on invoice line
  p_unit_amount         int,         -- minor units (cents/öre), required
  p_currency            text default 'EUR',
  p_interval            text default 'month',   -- day|week|month|year
  p_interval_count      int  default 1,
  p_payment_terms       text default 'invoice_30',
  p_start_date          date default current_date,
  p_billing_contact_email text,
  p_po_number           text,
  p_metadata            jsonb default '{}'::jsonb
) returns subscriptions
```
Creates a row with `provider='manual'`, `status='active'`, `next_invoice_date=p_start_date`. Emits `subscription.created` on the platform event bus.

### `generate_subscription_invoice`
```sql
generate_subscription_invoice(
  p_subscription_id uuid,
  p_tax_rate        numeric default 0,    -- 25 = 25%
  p_due_in_days     int     default null  -- derived from payment_terms if null
) returns invoices
```
Creates a draft row in `invoices` with one line item (plan name + unit amount), sets `status='draft'`, advances `subscriptions.next_invoice_date` by one billing period, stores `last_invoice_id`. Emits `subscription.invoiced`. **Idempotent within the day** — running twice the same day is a no-op because the cron filter is `next_invoice_date <= today` and the RPC advances the date.

### `cancel_manual_subscription`
```sql
cancel_manual_subscription(
  p_subscription_id uuid,
  p_reason          text default null,
  p_effective_date  date default current_date
) returns subscriptions
```
Sets `status='canceled'`, `canceled_at`, clears `next_invoice_date`. Records the reason via `record_churn_reason` if provided. Emits `subscription.canceled`.

---

## 4. Daily billing cron

**Edge function:** `supabase/functions/subscription-billing-cron`
**Schedule:** `subscription-billing-daily` pg_cron job, **06:00 UTC** every day.
**Logic:**
```
SELECT id FROM subscriptions
WHERE provider = 'manual'
  AND status   = 'active'
  AND next_invoice_date <= current_date
```
For each row → `generate_subscription_invoice(id)`. Errors are logged per-row; one bad sub never blocks the rest.

**Manual run** (Cloud-style, via deployed function URL):
```bash
curl -X POST "$VITE_SUPABASE_URL/functions/v1/subscription-billing-cron" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY"
```
Or via MCP: skill `generate_subscription_invoice` per `subscription_id`.

---

## 5. Event bus integration

| Event | When | Payload |
|---|---|---|
| `subscription.created` | `create_manual_subscription` returns | `{ subscription_id, customer_email, plan_name, provider:'manual' }` |
| `subscription.invoiced` | Each draft invoice generated | `{ subscription_id, invoice_id, amount, currency, due_date }` |
| `subscription.canceled` | `cancel_manual_subscription` returns | `{ subscription_id, reason, effective_date }` |

Consumers (FlowPilot automations, accounting batch, email notifications) subscribe via standard `agent_events` → `event-dispatcher` fan-out. See `mem://architecture/event-bus-platform-layer`.

---

## 6. MCP skills

Seeded by `src/lib/modules/subscriptions-module.ts` and exposed as `mcp_exposed=true` whenever the `subscriptions` module is enabled.

| Skill | Handler | Notes |
|---|---|---|
| `create_manual_subscription` | `rpc:create_manual_subscription` | External agents (sales, AE bots) can register a new B2B sub |
| `generate_subscription_invoice` | `rpc:generate_subscription_invoice` | Ad-hoc invoice generation outside the cron |
| `cancel_manual_subscription` | `rpc:cancel_manual_subscription` | Used by support / FlowPilot churn flows |
| `list_subscriptions` | generic CRUD | Filterable by `provider='manual'` |

A composite peer (e.g. an external finance claw) can request `?groups=finance` and get all four plus invoicing + reconciliation skills — see `mem://federation/marketing-claw-department-pattern` for the pattern.

---

## 7. Admin UI

Route: `/admin/subscriptions`

- **New manual subscription** button (top-right) opens `NewManualSubscriptionButton` dialog with:
  - Customer email + name
  - Plan name, unit amount (major units in the field, converted to minor units on submit), currency
  - Interval + interval count
  - Payment terms (dropdown)
  - Start date (defaults today)
  - Billing contact email
  - PO number
- Submit calls `create_manual_subscription` via RPC, then refreshes the list.
- Manual subs appear in the existing table with a `provider` badge so they're visually distinct from Stripe-synced rows.

The Stripe Checkout button remains for online self-serve flows.

---

## 8. Accounting flow

Generated invoices use the same `invoices` schema as one-offs, so:

1. `generate_subscription_invoice` → `invoices` row, `status='draft'`
2. Admin (or future automation) finalizes → `status='sent'`
3. Payment in → reconciliation matches via `reconciliation` module
4. Period close → `close_accounting_period` locks both invoice and any time entries
5. Export adapter (SIE/SAF-T/DATEV/FEC) reads the period and emits the file

No special-case code per `provider`. The accounting layer doesn't know — or care — that the invoice came from a recurring schedule.

---

## 9. Operations & troubleshooting

### "Cron ran but no invoice was created"
- Confirm `provider='manual'` and `status='active'` on the subscription
- Check `next_invoice_date` — if it's already in the future, nothing is due
- Inspect edge function logs (`subscription-billing-cron`) for per-row errors
- Verify the pg_cron job exists: `SELECT * FROM cron.job WHERE jobname='subscription-billing-daily'`

### "Duplicate invoices in one day"
Should be impossible because the RPC advances `next_invoice_date` before returning. If it happens, something is calling `generate_subscription_invoice` directly outside the cron. Audit `agent_events` for `subscription.invoiced` with the same `subscription_id` and the same date.

### "Customer wants to switch from Stripe to invoice billing"
1. `cancel_manual_subscription` is the wrong tool — that's for cancelling manual subs
2. Cancel the Stripe sub via Stripe API (or `stripe-cancel-subscription` skill) → webhook updates `status='canceled'`
3. Create a fresh manual sub with `create_manual_subscription`, `start_date` = the day after Stripe's coverage ends

### "Need quarterly billing"
`interval='month'`, `billing_interval_count=3`. Same for `semi-annual` (6) and biennial (`interval='year'`, count `2`).

### "Need to skip a billing cycle (customer on hold)"
Update `next_invoice_date` directly to the resume date. Or call `cancel_manual_subscription` and create a new one when they resume. Pause is intentionally not a separate state on manual subs — it adds complexity without business value at current scale.

---

## 10. Future development

- **Auto-finalize draft invoices** when the customer profile carries `auto_finalize=true` (e.g. trusted enterprise accounts)
- **Send invoice email** edge function chained on the `subscription.invoiced` event, using the existing tiered email system
- **Direct debit (SEPA) integration** — currently `payment_terms='direct_debit'` is documentation-only; needs a payments adapter
- **Proration** for mid-period plan changes (out of scope until first customer asks)
- **Collections module** — dunning for unpaid invoice-billed subs, separate from Stripe's built-in dunning
- **Multi-currency invoicing** — currency is stored per sub but FX handling at invoice time isn't normalized

---

## Related

- Memory: `mem://subscriptions/invoice-driven-billing`
- Sibling doc: `docs/modules/subscriptions.md`
- Accounting: `mem://accounting/export-adapters-pluggable`
- Event bus: `mem://architecture/event-bus-platform-layer`
- MCP module gating: `mem://architecture/mcp-module-aware-filtering`
