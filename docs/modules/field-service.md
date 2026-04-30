# Field Service Module

Dispatch on-site service orders, schedule technician visits, capture customer signatures and auto-generate invoices on completion.

## Tables

- `service_orders` — A piece of customer-facing work. Auto-numbered `SO-00001` via `generate_service_order_number` trigger. Lifecycle status: `draft` → `scheduled` → `in_progress` → `completed` → `invoiced` (or `cancelled`). Links optionally to deal/project/contract/invoice.
- `service_order_lines` — Labor / material / expense lines. `total` is a generated column (`quantity * unit_price`). A trigger recomputes `service_orders.total_amount` on every line change.
- `service_visits` — Concrete scheduled visits (start/end, technician, status, signature URL, calendar event link). One order can have multiple visits (e.g. follow-up).

## Triggers & RPCs

- `recompute_service_order_total` — keeps `total_amount` in sync with line items.
- `emit_service_order_event` — pushes `service_order.created`, `service_order.scheduled`, `service_order.completed` to `agent_events`.
- `complete_service_order(_order_id, _completion_notes)` — SECURITY DEFINER RPC that flips status to `completed`, sets `completed_at`, appends notes. Used by both UI and the `manage_service_order` skill.

## Skills (MCP-exposed)

| Skill | Purpose |
|-------|---------|
| `manage_service_order` | Universal action skill: `create`, `update`, `list`, `get`, `schedule`, `complete`, `cancel`, `add_line`, `list_visits` |

Routed via `agent-execute` (handler `edge:field-service-skill` — falls back to generic CRUD if no dedicated edge function).

## Automations (FlowPilot)

- `invoice_completed_service_orders` — Triggers on `service_order.completed` event → calls `create_invoice_from_service_order` skill (TODO: wire into invoicing module).

## Routes

- `/admin/field-service` (`FieldServicePage.tsx`) — KPI dashboard (draft / scheduled / in progress / completed), filter tabs, new-order dialog, inline status actions.

## Module flag

`fieldService` in `ModulesSettings`. Disabled by default. `enhancedByFlowPilot: true` (works standalone, fully autonomous when FlowPilot is on).

## Future hookups

- Visit creation should also insert into `calendar_events` with the technician as attendee.
- `service_order.completed` automation needs the `create_invoice_from_service_order` skill in `invoicing-module.ts`.
- Mobile signature capture on `/visit/:token` (public route — TBD).
