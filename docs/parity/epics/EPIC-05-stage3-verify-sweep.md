---
title: "EPIC-05 — Stage-3 verification sweep"
status: planned
sprint: R1
owner: unassigned
---

# EPIC-05 — Stage-3 verification sweep

## Why
Thirteen capabilities across seven modules are **code-complete but capped at
`partial`** solely because the Stage-3 rule requires runtime verification on a
live instance before a capability may be marked `done`. The code shipped (most
of it 2026-07-02/03: line discounts, expiry reminders, credit-note/payment UI,
aging report, booking staff/reminders/no-show, duration-aligned free slots,
parts deduction, tiered pricing). This epic is pure verification — no new
product code — and is therefore the cheapest parity in the whole backlog:
**+~2pp mean parity for zero feature risk.** It also hardens the processes the
features belong to (quote-to-cash, order-to-delivery, booking).

Method per item: exercise the real flow on the live dev instance (UI click or
gateway skill call against real rows), confirm the DB effect, then flip the
scorecard with a dated Stage-3 note. The expenses incident (2026-07-03) showed
why live verification is non-negotiable: code-level review said "works", the
live instance said "column does not exist".

## Outcome (Definition of Done for the whole epic)
- [ ] All 13 tagged capabilities verified live and flipped `partial → done`
      (or a real defect filed + fixed if verification fails)
- [ ] Each flip carries a dated Stage-3 note naming the live evidence
- [ ] Mean parity ≥ 61%
- [ ] `npx vitest run` + `bun run scripts/parity-report.ts --check` green

## Capabilities delivered
| File | Capability id | From → To |
|---|---|---|
| `capabilities/quotes.json` | `line_discounts`, `expiry_reminders` | partial → done |
| `capabilities/invoicing.json` | `credit_notes`, `partial_payment`, `aging_report` | partial → done |
| `capabilities/booking.json` | `duration_rules`, `staff_assignment`, `reminders`, `no_show` | partial → done |
| `capabilities/email.json` | `send_email`, `crm_email_association` | partial → done |
| `capabilities/field-service.json` | `parts_inventory_deduction` | partial → done |
| `capabilities/pricelists.json` | `tiered_quantity` | partial → done |

## Issues

- [ ] **05.1 — Quote-to-cash verifications** *(quotes + invoicing)*
  - Set a per-line discount in QuoteDetailSheet on a real quote → totals correct
    pre-tax; `add_item` with `discount_pct` via `manage_quote` → same result.
  - Trigger `quote-expiry-reminders` against a quote with `valid_until` inside
    the window → email logged, `expiry_reminder_sent_at` stamped, second run
    skips it.
  - Issue a full + a partial credit note from InvoiceDetailSheet; record a
    partial payment; confirm `ar_aging_report` buckets the remainder correctly.

- [ ] **05.2 — Booking cluster** *(booking)*
  - Book a 45-min service via `book_appointment_slot`; confirm `free_slots`
    grid honours `duration_minutes`; assign staff from CreateBookingDialog and
    via `manage_bookings assign_staff`; run `send-booking-reminders` against a
    confirmed booking <24h out → `reminder_sent_at` stamped once; mark a past
    confirmed booking `no_show`.

- [ ] **05.3 — Email ↔ lead association** *(email)*
  - Send from the lead compose dialog → row associated (trigger), actor badge
    "Manual · {email}"; inbound Composio mail from a known lead address →
    associated + timeline renders; agent send via skill → source no longer NULL.

- [ ] **05.4 — Ops singles** *(field-service, pricelists)*
  - Complete a service order with material lines → stock quants actually
    decrement (the one thread never runtime-verified); resolve a tiered price
    via `resolve_pricelist_price` at two quantity breakpoints.
