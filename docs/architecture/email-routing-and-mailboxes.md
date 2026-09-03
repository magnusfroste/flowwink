---
title: "Email routing: transports, mailboxes, and what a conversation binds to"
category: architecture
description: Nothing here contradicts the channel boundary those documents drew. 
---

# Email routing: transports, mailboxes, and what a conversation binds to

**Status:** decided 2026-07-26. Extends [channels-vs-modules.md](channels-vs-modules.md)
and [flowbox-as-aggregator.md](flowbox-as-aggregator.md), which answered
email-as-support-intake. This answers email as a whole: sales and finance
correspondence use the same machinery with a different container.

Nothing here contradicts the channel boundary those documents drew. It explains
*why* that boundary is right, and fills in the part they did not cover.

## The problem this solves

On dev, 213 inbound emails have arrived and **not one is bound to a customer**.
Every piece of machinery for binding them exists and has existed for months. The
halves simply never met:

| Source | Direction | Rows | Bound to an entity | Has a thread id |
|---|---|---|---|---|
| composio-webhook | inbound | 213 | **0** | 213 |
| newsletter-send | outbound | 9 | 3 | **0** |
| send_email_to_lead | outbound | 2 | 2 | **0** |
| send_invoice | outbound | 6 | 6 | 2 |

Inbound has the thread and no customer. Outbound has the customer and no thread.
The join key is missing on exactly the side that would let a reply inherit who
it is from.

## Two transports, two purposes

|  | Resend | Composio / Gmail |
|---|---|---|
| Role | transactional | **the company mailbox** |
| Sender | the system | the company, via a human or an agent |
| Reply expected | no | **yes** |
| Examples | newsletters, order confirmations, receipts, password resets | cold outreach, follow-ups, anything a person answers |

`email-send` already encodes this as `expects_reply`, which flips the fallback
order from `resend → smtp → composio` to `composio → smtp → resend`. The concept
was right; it was never enforced.

**SMTP sits alongside Resend as a self-hosting escape hatch** — same
transactional role, no vendor account required. See the SMTP card in
`/admin/integrations`.

## Identity is not delivery

A salesperson sending as `kalle@company.se` is **an alias, not an account**. When
the company owns the domain, mail to any alias lands in the same shared mailbox.
The customer replies to Kalle and sees Kalle; the conversation still arrives
where the CRM and FlowPilot can see it.

So the rule is *not* "reply-to is always the company mailbox address". It is:

> **Reply-to must be an address that DELIVERS to the company mailbox.**
> The mailbox's own address is simply the least interesting such alias.

Per-user mailboxes are the thing to avoid — not per-user addresses. A reply into
a salesperson's own Gmail is invisible to the system, and no amount of CRM
tooling recovers it.

`inbound_email_accounts.is_shared` already models this distinction.

### Scope: one company mailbox, many identities

**FlowWink supports a company email account. It does not set up per-salesperson
mailboxes.** This is a product boundary, not a limitation to route around. A
mailbox per seller is precisely what puts a customer's reply somewhere the CRM
and FlowPilot cannot see it, and no amount of tooling recovers a conversation
that never arrived.

What varies is not the number of mailboxes but how much personal identity the
mailbox can carry, and that depends on a capability we can detect rather than
assume:

| Mailbox | From line | Reply-to | Personal identity |
|---|---|---|---|
| Owned domain with catch-all or aliases | the signed-in seller's profile alias, e.g. `kalle@company.se` | the same alias — it delivers to the company mailbox | full |
| Company mailbox without alias support (a plain Gmail, which is liteit today) | the company address | the company address | display name only: `Kalle at Liteit <liteitdev@gmail.com>` |
| Any address on a domain we do not control | **never** | — | — |

So the seller's profile alias is used as the sender **when the mailbox can carry
it**, and degrades to a display name when it cannot. The conversation lands in
the same place either way, which is the point.

This is why the domain registry below is a capability check and not merely
validation: it decides which row of that table an instance is in.

### The guard this requires

`profiles.email_from_address` is free text today, and `email-send` falls back to
it for reply-to. So typing `kalle@gmail.com` into a profile silently routes every
customer reply out of the building. A typo is enough.

A per-user from-address must therefore be **honoured only when its domain is a
registered company domain**, falling back to the mailbox address otherwise. That
registry does not exist yet and is the one genuinely new component here.

## What a conversation binds to

Phone, SMS and Telegram arrive with a natural container. A call *is* a session —
bounded in time, one recording, one transcript. SMS and Telegram are one linear
thread per contact. "Which conversation is this?" answers itself.

Email has no such container. One person can run five parallel threads with you.
Reply-all forks it, a changed subject line splits it, a forward creates a sibling
conversation. For email, "which conversation is this?" must be **decided**.

That is what a ticket is: **the container email does not ship with.**

But it does not follow that email becomes tickets. A prospect replying "yes,
we're interested" is not a support ticket — that conversation's container is the
lead or the deal. The schema already says so: email binds to `invoice`, `lead`
and `lead_email_blast` today, and none of those are tickets.

> **Email binds to whatever the conversation is about.**
> A ticket is one possible container among several, and `email_to_ticket` is one
> classification among several.

## Why email is in the queue but never rings

Two unifications are easy to conflate:

- **Real-time routing.** Presence, availability, who picks up. The question is
  *"can I reach someone now?"* Email has neither presence nor session. Governing
  it by presence is a category error that yields a worse interface for both.
- **Unified customer history = everything that ever passed between us and this
  customer.** Email belongs here without reservation. So do calls — as records,
  after the fact.

FlowBox resolves this by organising its queue by *turn*, not by presence: an
email thread whose last message is inbound is **Needs a person**, one whose last
message is ours is **Waiting on the customer**. The **Go live** toggle applies
only to chat hand-offs and calls; answering mail never needs it.
`support-channels.tsx` therefore still lists `web | telegram | sms | voice |
voicemail` and omits email — that list is the set of transports presence governs,
and the omission is correct and should stay.

### Since then (2026-09)

- The inbox exists (**Email → Inbox**, and email rows in [FlowBox](../modules/flowbox.md)).
  A reply from either goes through `email-send` with `expects_reply`, the
  parent's `In-Reply-To` / `References` and the thread id, bound to the same
  record as the inbound mail — rule 3 below, enforced at the one place replies
  are written.
- Each mailbox carries a second dial next to `route_mode`: `reply_mode` decides
  whether FlowPilot drafts, sends when grounded, or writes nothing. See
  [Email — inbox, replies and FlowPilot first](../modules/email-guide.md).
- **FlowBox → Message log** shows the routing quality ("N of M messages are bound
  to a customer") and lets a person **Link** an unbound message to its record.

## Rules

1. **A salesperson is the From line, never a separate destination.** Reply-to is
   an alias that delivers to the company mailbox.
2. **`expects_reply` chooses the transport, and the fallback must not silently
   betray it.** Four real emails to a prospect went out via Resend in June with
   the flag set, because Composio was disabled and the chain fell through. Failing
   forward is right (Law 4); doing it silently is not. Record the degradation so
   the routing view can show *"sent, but the reply cannot come home."*
3. **Every conversational send writes `outbound_communications` with the
   provider's thread id.** That is the join key. Without it inbound has nothing
   to inherit from.
4. **One intake, not two.** `composio-webhook` is the transport — push,
   signature-verified, backed by the account registry, and it emits
   `email.received` so automations can fan out. Entity resolution belongs inside
   it. Polling (`ingest_inbound_email`) is a backfill and repair tool, not the
   primary path.

### Thread inheritance has a limit worth knowing

Inheriting a thread only works when outbound and inbound travel through the same
provider. Resend-sent plus Gmail-received share no thread id. When they differ,
the system falls back to matching the sender address against known people — which
is why rule 1 matters more than it looks: get the reply into the right mailbox and
the fallback still finds the customer.

## Open gaps (2026-07-26)

- Reply-to does not resolve to the company mailbox; it falls back to the personal
  address (`email-send/index.ts`, the `sender_user_id` branch)
- No registry of domains that deliver to the company mailbox, and no validation
  of `profiles.email_from_address` against one
- No degradation signal when `expects_reply` cannot be honoured
- `composio-webhook` does no entity resolution
- `send_email_to_lead` writes `lead_activities` but usually not
  `outbound_communications` — roughly 2 of 26 sends reached the routing table
- `inbound_email_accounts` is empty on liteit, so the webhook path is dormant there
- `useUnifiedTimeline` reads six sources and `outbound_communications` is not one
  of them, so the card headed "All interactions across channels" is the one view
  without the actual emails

Related: [[conversation-and-retrieval]] for the retrieval side of the same
conversations.
