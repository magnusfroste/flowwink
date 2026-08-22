---
title: "Nordbrygg AB — the sandbox company"
category: concepts
description: The fictional company that lives on sandbox.flowwink.com. Its state is not inserted — it is the residue of the fifteen processes having actually run, which makes the sandbox a standing regression test and a stage an external agent can play on.
---

# Nordbrygg AB — the sandbox company

> **What is this?** `sandbox.flowwink.com` runs one fictional company. This page
> is who that company is, what state it is in, and — the load-bearing part —
> **why its data is produced by running the processes rather than by inserting
> rows.**
>
> Think Contoso, but alive: not a catalogue of sample records, a business with a
> Tuesday.

---

## Why this document exists

The demo data we had was **scenery**. It was authored so that a person logging
in would see something in the views, which was the right goal at the time and is
a different goal from the one we have now.

Measured on the sandbox instance, 2026-08-21:

| what the data said | what it means |
|---|---|
| 6 stock moves, **all** `out`, **all** without a location | six deliveries out of a warehouse nothing ever came into |
| 0 goods receipts, 0 purchase orders | the inbound chain had never run once |
| 5 invoices, **0** with `order_id` | every invoice hangs in the air, unlinked to its order |
| 6 orders, **0** with `quote_id` | no order was ever converted from a quote |
| 0 stock locations | the nightly reset truncates them and nothing re-seeds |
| catalogue: *Starter Plan, Pro Subscription, Onboarding Pack* | **nothing physical to buy, receive, pick or return** |

Read the first row as a story: **six shipments out of an empty warehouse.** That
is a state the system cannot itself produce — run the real process and you
cannot get an outbound move without a location, and since the order-to-cash fix
you cannot get an invoice without `order_id`.

Scenery is worse than emptiness. An empty table is honest: nothing has happened
here. Populated scenery **lies in the other direction** — the view looks right,
the dashboard shows figures, and everyone concludes the chain works. The goods
receipt bug lived for months partly because the stock view had rows in it. And
for QA it is actively harmful: an agent asked to test "create an invoice from an
order" finds five invoices that already exist without orders, concludes the step
works, and never tests it.

**So: the sandbox company's state is earned.** Every row exists because a process
put it there.

---

## Who Nordbrygg AB is

A Swedish company, in business since 2019, that **sells and services
professional coffee equipment**.

It was chosen for one reason: it exercises every lever an ERP has, without
contrivance.

| Nordbrygg sells | which forces |
|---|---|
| **Machines** — high value, serialised, imported | purchasing, goods receipt, landed cost, serial/lot tracking, warranty returns |
| **Consumables** — beans, filters, descaler | reorder points, replenishment, subscriptions, the eshop's bread and butter |
| **Spare parts** | stock at multiple locations, picking, backorder |
| **Installation** — on site | services on a quote, scheduling, timesheets |
| **Service agreements** — annual, per machine | contracts → subscriptions → recurring invoicing, the whole sign-to-serve chain |

Its customers are both kinds, which the platform needs:

- **B2C** through the webshop — a person buying a bag of beans or a home machine
- **B2B** — cafés, offices and a hotel group, who ask for quotes, sign service
  agreements, and are invoiced on 30 days

Its suppliers are three, deliberately:

- an **Italian machine manufacturer** (EUR, long lead time, the reason FX and
  landed cost matter)
- a **Swedish roastery** (SEK, weekly deliveries, the reason replenishment runs
  often)
- a **parts distributor** (small orders, the reason 3-way match has anything to
  match)

Nothing here is decoration. Each choice exists so that a process has a real
reason to run.

---

## The company has been trading a while

A business that started this morning has no interesting state. Nordbrygg has
**history and things in flight** — because the bugs we keep finding do not live
on the happy path, they live in the middle.

The seed therefore leaves the company mid-stride, with at least one entity
parked in a non-terminal state per process:

| Process | What is in flight when the reset finishes |
|---|---|
| [Procure-to-Pay](../processes/procure-to-pay.md) | one PO **confirmed, awaiting delivery**; one **partially received**; one vendor invoice awaiting 3-way match |
| [Order-to-Delivery](../processes/order-to-delivery.md) | orders spread across `paid`, `picked`, `shipped`, `delivered` — one of each |
| [Quote-to-Cash](../processes/quote-to-cash.md) | a quote **sent** and unanswered; an invoice **overdue by 12 days** |
| [Return-to-Refund](../processes/return-to-refund.md) | one RMA **received, under inspection**; one refunded and restocked |
| [Sign-to-Serve](../processes/sign-to-serve.md) | a signed service agreement with an active subscription; one renewal due in 30 days |
| [Support-to-Resolution](../processes/support-to-resolution.md) | an open ticket on a delivered machine, breaching SLA in 4 hours |
| [Lead-to-Customer](../processes/lead-to-customer.md) | two leads mid-qualification, one deal at `proposal` |
| [Record-to-Report](../processes/record-to-report.md) | last month **closed**, current month open with unreconciled bank lines |

That table is the specification. If a process has nothing in flight, an agent
arriving to work has nothing to pick up — and we have no evidence the middle of
that process works.

---

## The rule: seeded by process, not by row

The nightly reset (`sandbox_reset_wipe`) truncates and then **replays the
business**, in dependency order:

```
1.  assert_platform_config()      locations, roles, chart of accounts, skills
2.  master data                   products, vendors, customers, price lists
3.  procure-to-pay                PO → goods receipt → vendor invoice → payment
4.  the shop                      checkout → order → pick → ship → deliver
5.  quote-to-cash                 quote → order → invoice → part payment
6.  aftermarket                   RMA → inspection → refund → restock
7.  services                      contract → subscription → recurring invoice
8.  the month                     reconciliation, period close
9.  leave the in-flight states above standing
```

Three things fall out of this, and they are the whole argument:

**The data is possible by construction.** No state the process cannot reach, so
no scenery hiding a broken step. Stock balances are *earned* — every unit in the
warehouse arrived on a goods receipt that actually ran.

**Every nightly reset becomes a full regression run.** If the seed does not
complete, a chain is broken — and we learn it in the morning, not three weeks
later when a QA agent trips over it. This is the signal the platform does not
have today.

**The platform-config problem disappears as a class.** The seed *cannot* run
without stock locations, so the reset can never leave them empty. Compare the
bug that prompted this page: `stock_locations` is platform config — the
migration that created it is literally named
`stock-locations-are-platform-config.sql` — but it is absent from the reset's
KEEP list, so every night it was truncated and nothing sowed it again. Verified
on sandbox: goods receipt refused with *"there is no active internal destination
location"*, and after `seed_stock_locations()` the same chain ran clean —
balance 0 → 100, one stock move, PO `received`, GRNI posted.

---

## What an external agent can do here

This is the part that makes it a simulation rather than a fixture. The company
has a state; agents move it forward, each playing a role:

| Role | What it does | Surface |
|---|---|---|
| **Customer** | browses the shop, orders beans, asks support a question, returns a broken grinder | public site, `place_order`, chat, portal |
| **Salesperson** | qualifies a lead, quotes the hotel group, converts to order | MCP gateway, CRM skills |
| **Supplier** | confirms a PO, ships short, invoices at a different price than ordered | inbound A2A / MCP |
| **Warehouse** | receives goods, picks, reports a discrepancy | inventory skills |
| **Accountant** | matches invoices, reconciles the bank, closes the month | accounting skills |

An adversarial supplier who **ships 8 of 10 and invoices for 10** is a better
test of 3-way match than any assertion we can write. That is the point of
letting agents drive: they produce the awkward middles we would not think to
seed.

**Run it until it breaks.** The instance resets nightly, so there is nothing to
be careful about. The question a session should answer is not "did it error" but
**"did the world change the way the process says it should"** — which is what
the invariants below are for.

### What the nightly reset cannot show you

The same reset that makes the sandbox safe also caps what it can prove. Every
process that takes longer than one night to unfold is destroyed before it
happens: dunning escalation, subscription renewal, reordering rules firing on
real consumption, aging receivables, SLA breach, contract renewal windows,
period close — and FlowPilot's own learning loop.

That is what `nordbrygg.flowwink.com` is for: the same company, seeded once and
then **left standing**, so time can pass and agents can hold a position across
days. A sandbox answers *"did something break last night?"*; a testbed answers
*"what happens when an invoice is left to age 60 days and nobody touches it?"*

Setup, the flag that keeps `demo-cycle` away from it, and what to watch for once
time starts passing: **[`docs/operators/nordbrygg-testbed.md`](../operators/nordbrygg-testbed.md)**.

---

## Invariants — the check that survives the next bug

Every serious finding so far broke one of these. They do not care *how* the code
fails, which is why they catch silence:

| Chain | Invariant |
|---|---|
| **Inbound** | Σ received quantity = Δ `stock_quantity` = Σ inbound `stock_moves`; GRNI amount = quantity × unit cost |
| **Order-to-cash** | order total incl. VAT = accepted quote total · **exactly one** invoice per order · Σ invoice lines = order total |
| **Aftermarket** | Σ refunded ≤ Σ(line qty × unit refund) − restocking fee |
| **Replenishment** | reorder candidates ⊆ products where balance < reorder point |
| **Ledger** | every stock move has a location · every invoice has its order · every order has its origin |

The last row is the one that would have caught today's scenery in a single
query, years before anyone opened the stock view and wondered.

---

## Related

- [Business Processes — coverage map](../processes/README.md) — the fifteen processes this company runs
- [Provisioning and updates](../operators/provisioning-and-updates.md) — how instances are built and kept current
