---
name: Lifecycle Event Emitters
description: 11 DB-triggers som emittar plattformsevents vid statusövergångar i kärntabeller — låser upp automations
type: feature
---

DB-triggers som anropar `emit_platform_event()` vid lifecycle-övergångar:

| Event | Tabell | Trigger |
|---|---|---|
| `invoice.paid` | invoices | trg_emit_invoice_paid (UPDATE, status→paid) |
| `quote.accepted` | quotes | trg_emit_quote_accepted (UPDATE, status→accepted) |
| `contract.signed` | contracts | trg_emit_contract_signed (UPDATE, status→active) |
| `subscription.created` | subscriptions | trg_emit_subscription_events (INSERT) |
| `subscription.churned` | subscriptions | trg_emit_subscription_events (UPDATE, status→canceled/unpaid/incomplete_expired) |
| `shipment.dispatched` | shipments | trg_emit_shipment_dispatched (UPDATE, status→shipped/in_transit/dispatched) |
| `return.received` | returns | trg_emit_return_received (UPDATE, status→received) |
| `expense.approved` | expense_reports | trg_emit_expense_approved (UPDATE, status→approved) |
| `application.received` | applications | trg_emit_application_received (INSERT) |
| `employee.hired` | employees | trg_emit_employee_hired (INSERT) |
| `ticket.resolved` | tickets | trg_emit_ticket_resolved (UPDATE, status→resolved/closed) |

Alla triggerfunktioner är `SECURITY DEFINER` med `SET search_path=public` och idempotenta (DROP TRIGGER IF EXISTS + CREATE).

Konsumeras av `event-dispatcher` edge function (cron varje minut) som fan-outar till automations med `trigger_type='event'` och matchande `trigger_config.event_name`.

**Source-konvention:** `platform.<modul>` (t.ex. `platform.invoices`, `platform.subscriptions`).
