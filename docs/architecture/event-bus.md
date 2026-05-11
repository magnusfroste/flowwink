# Platform Event Bus

The event bus is the platform's nervous system. Modules emit canonical events
when state changes, and the platform fans them out to listeners — automations,
DB triggers, and external operators (FlowPilot / OpenClaw / department claws).

This page is the **single source of truth** for event names, payload shapes,
and how to emit/consume them. If you add a new event, add it here.

---

## Architecture

```text
┌──────────────┐    emit_platform_event()    ┌──────────────────┐
│  DB triggers │ ───────────────────────────▶│   agent_events   │
│  RPC funcs   │                              │   (event log)    │
│  Edge funcs  │                              └────────┬─────────┘
└──────────────┘                                       │
                                                       │ event-dispatcher
                                                       │ (cron, every minute)
                                                       ▼
                                  ┌────────────────────────────────────┐
                                  │  automations WHERE                 │
                                  │    trigger_type = 'event'          │
                                  │    AND trigger_config.event = ...  │
                                  └────────┬───────────────────────────┘
                                           │
                       executor:           │
              ┌────────────────────────────┼────────────────────────────┐
              ▼                            ▼                            ▼
      platform (always)         flowpilot (if module on)      external (skip)
      deterministic skill        FlowPilot reasons + acts     peer polls itself
```

Three core pieces:

1. **`agent_events` table** — append-only event log with `event_name`,
   `payload` (JSONB), `source`, and processing timestamps.
2. **`emit_platform_event(name, payload, source)`** — `SECURITY DEFINER` SQL
   helper. Call from triggers, RPCs, or edge functions.
3. **`event-dispatcher` edge function** — cron-driven (1 min). Reads
   unprocessed events, looks up `automations` rows whose
   `trigger_config.event = event_name`, and dispatches based on `executor`.

Event listeners come in two flavors:

- **DB-side** (synchronous): `CREATE TRIGGER ... AFTER INSERT ON agent_events
  WHEN (NEW.event_name = '...')` — used for tight coupling like
  `stock.movement → apply_stock_movement_event`.
- **Automation-side** (async, batched): rows in `automations` with
  `trigger_type = 'event'` — used for everything else, dispatched by cron.

---

## Event catalog

Event names follow `<domain>.<verb>` in past tense (`order.created`,
`expense.approved`). Payloads always include the entity's primary id; most
also include a snapshot under `data`.

### CRM / Sales

| Event | Source | Payload | Listeners |
|-------|--------|---------|-----------|
| `lead.created` | trigger on `leads` | `{ id, data }` | qualify-lead automation |
| `deal.created` | trigger on `deals` | `{ id, data }` | webhook fanout |
| `deal.stage_changed` | trigger on `deals` | `{ id, from, to, data }` | analytics |
| `deal.won` | trigger on `deals` | `{ id, data }` | invoice draft, contract |
| `deal.lost` | trigger on `deals` | `{ id, reason, data }` | analytics |
| `quote.accepted` | RPC `accept_quote` | `{ id, deal_id }` | invoice generation |

### E-commerce / Orders

| Event | Source | Payload | Listeners |
|-------|--------|---------|-----------|
| `order.created` | trigger on `orders` | `{ id, data }` | webhook, inventory |
| `order.paid` | trigger on `orders` | `{ id, amount_cents }` | fulfillment, accounting |
| `order.cancelled` | trigger on `orders` | `{ id, reason }` | refund flow |
| `order.refunded` | trigger on `orders` | `{ id, amount_cents }` | accounting reversal |
| `pos.sale_completed` | RPC `record_pos_sale_v2` | `{ session_id, lines }` | journal, stock |
| `pos.session.closed` | RPC `close_pos_session_v2` | `{ session_id, totals }` | batch journal |
| `stock.movement` | POS, fulfillment, RPCs | `{ product_id, qty, location, lines? }` | DB trigger → `stock_quants` |
| `return.received` | RPC `process_return` | `{ id, order_id }` | refund flow, restock |
| `shipment.dispatched` | RPC `mark_shipped` | `{ id, order_id, carrier }` | order.status update |

### Bookings

| Event | Source | Payload | Listeners |
|-------|--------|---------|-----------|
| `booking.submitted` | trigger on `bookings` | `{ id, data }` | confirmation email |
| `booking.confirmed` | RPC `confirm_booking` | `{ id }` | calendar event |
| `booking.cancelled` | RPC `cancel_booking` | `{ id, reason }` | refund |

### HR / People

| Event | Source | Payload | Listeners |
|-------|--------|---------|-----------|
| `application.received` | trigger on `recruitment_applications` | `{ id, job_id }` | screening |
| `employee.hired` | RPC `hire_application` | `{ employee_id, application_id }` | onboarding checklist |
| `contract.signed` | edge `contract-sign` | `{ id, party }` | document vault |

### Finance / Accounting

| Event | Source | Payload | Listeners |
|-------|--------|---------|-----------|
| `invoice.paid` | edge `stripe-webhook`, RPC | `{ id, amount_cents }` | journal entry |
| `expense.approved` | RPC `approve_expense_report` | `{ id, total_cents }` | book + pay flow |
| `subscription.created` | edge `stripe-webhook` | `{ id, customer_id }` | onboarding |
| `subscription.churned` | edge `stripe-webhook` | `{ id, reason }` | save campaign |
| `subscription.churn_reason_recorded` | RPC | `{ id, reason }` | analytics |

### Service / Support

| Event | Source | Payload | Listeners |
|-------|--------|---------|-----------|
| `ticket.created` | trigger on `tickets` | `{ id, data }` | SLA timer |
| `ticket.resolved` | trigger on `tickets` | `{ id, resolved_at }` | CSAT survey |
| `service_order.created` | trigger | `{ id, data }` | dispatch |
| `service_order.scheduled` | RPC | `{ id, scheduled_at }` | reminder |
| `service_order.completed` | RPC | `{ id }` | invoice draft |

### Marketing / Webinars

| Event | Source | Payload | Listeners |
|-------|--------|---------|-----------|
| `webinar.published` | RPC | `{ id }` | promotion |
| `webinar.registered` | RPC | `{ webinar_id, attendee_id }` | reminder sequence |
| `webinar.live` | scheduled | `{ id }` | live notification |
| `webinar.attended` | tracking | `{ webinar_id, attendee_id }` | lead score |
| `webinar.completed` | RPC | `{ id }` | follow-up |
| `webinar.cancelled` | RPC | `{ id, reason }` | refund / notify |

---

## Emitting events

### From SQL (preferred)

```sql
PERFORM public.emit_platform_event(
  'order.paid',
  jsonb_build_object('id', NEW.id, 'amount_cents', NEW.total_cents),
  'orders'  -- source: usually the module/table name
);
```

The helper is `SECURITY DEFINER` so it bypasses RLS — safe to call from any
trigger or RPC.

### From an edge function

```ts
const sb = getServiceClient();
await sb.rpc('emit_platform_event', {
  _event_name: 'invoice.paid',
  _payload: { id: invoiceId, amount_cents },
  _source: 'stripe-webhook',
});
```

Never insert into `agent_events` directly from app code — always go through
the helper so payload validation can be added centrally later.

---

## Consuming events

### Option A — DB trigger (synchronous, sub-millisecond)

Use when the side effect is deterministic, fast, and must happen in the same
transaction. Example: `stock.movement` → upsert `stock_quants`.

```sql
CREATE TRIGGER on_stock_movement_event
AFTER INSERT ON public.agent_events
FOR EACH ROW
WHEN (NEW.event_name = 'stock.movement')
EXECUTE FUNCTION public.apply_stock_movement_event();
```

### Option B — Automation row (async, batched)

Use for everything else: emails, AI judgment, slow integrations, anything
that should be visible/auditable in `/admin/automations`.

Insert via the automations UI or seed in a module:

```ts
{
  name: 'Send order confirmation',
  trigger_type: 'event',
  trigger_config: { event: 'order.paid' },
  executor: 'platform',          // or 'flowpilot' / 'external'
  action_type: 'edge_function',
  action_config: { function: 'send-order-confirmation' },
  enabled: true,
}
```

The dispatcher passes the originating event into the action as
`arguments.event = { id, name, payload, source, created_at }`.

---

## Executor matrix

`automations.executor` decides who runs the action when an event matches:

| Value | Behavior | When to use |
|-------|----------|-------------|
| `platform` *(default)* | Dispatcher calls the edge function / RPC directly | Deterministic side effects (emails, journal entries, webhooks) |
| `flowpilot` | Dispatched only if FlowPilot module is enabled; FlowPilot picks up via heartbeat and reasons before acting | Tasks needing context, judgment, or multi-step planning |
| `openclaw` / `external` | Dispatcher writes the event to the peer's queue but does NOT execute. The external operator polls and decides | Tasks owned by an external claw (department-specific work) |

This is why FlowPilot is an **operator module**, not the platform: removing
FlowPilot does not break event flow — only `executor='flowpilot'` rows go
dormant, and `executor='platform'` continues running.

---

## Operational notes

- **Replay**: set `processed_at = NULL` on a row to re-dispatch.
- **Backlog**: `SELECT count(*) FROM agent_events WHERE processed_at IS NULL`.
  Anything > a few hundred means the dispatcher is behind or an automation
  is stuck.
- **Errors**: `last_error` on the event row captures the last dispatch
  failure. `processed_count` increments each retry.
- **Retention**: no automatic pruning yet — TODO.

---

## Adding a new event

1. Pick a name: `<domain>.<verb-past-tense>`. Reuse existing domain prefixes.
2. Emit via `emit_platform_event(...)` from the trigger / RPC / edge.
3. Add a row to the catalog above (this file).
4. If a listener should react automatically, seed an `automations` row in
   the owning module's `automations: [...]` manifest field.
5. If the listener is a DB trigger, add it in the same migration as the
   emitter so they ship together.

The doc-drift CI script will eventually fail PRs that emit an event missing
from this catalog — for now it's a soft check.

---

## See also

- `mem://architecture/event-bus-platform-layer` — short-form memory note
- `mem://architecture/automations-as-platform-layer` — executor model
- `mem://erp/stock-event-listener` — DB-trigger pattern example
- `mem://ecommerce/pos-v2-odoo-style` — emit-then-react pattern in POS
- `supabase/migrations/20260426104818_*.sql` — event-bus install migration
