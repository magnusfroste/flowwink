---
title: "FlowBox as aggregator"
description: FlowBox projects email threads, chat conversations, tickets, form submissions and voice calls into one queue — but the source of truth and the CRUD surface stay in the module that owns each table.
category: architecture
---

# FlowBox as aggregator

> FlowBox is a view, not a channel owner. (This page was "Live Support as Aggregator" until 2026-09-02 — the rule is the same; the view has a new name and more channels.)

## The pattern

```text
 ┌──────────────┐ ┌──────────────┐ ┌───────────┐ ┌────────────┐ ┌──────────────┐
 │  email       │ │  chat        │ │  tickets  │ │  forms     │ │  voice       │
 │  Composio /  │ │  web /       │ │           │ │  form      │ │  46elks /    │
 │  Gmail       │ │  telegram /  │ │  email →  │ │  block     │ │  Twilio      │
 │              │ │  sms         │ │  ticket   │ │            │ │  calls + vm  │
 └──────┬───────┘ └──────┬───────┘ └─────┬─────┘ └─────┬──────┘ └──────┬───────┘
  email_threads    chat_conversations   tickets   form_submissions   voice_calls
        └────────────────┴───────────────┴──────────────┴───────────────┘
                                         │  five bounded reads, merged in the client
                                         ▼
                              ┌────────────────────────┐
                              │  FlowBox (view)        │
                              │  /admin/flowbox        │
                              │  Queue · Calls ·       │
                              │  Routing · Message log │
                              └────────────────────────┘
```

## What FlowBox owns

Nothing that is data. The page, the state mapping (`src/lib/inbox-items.ts`), the inline reply boxes, and the redirects from the retired pages.

## What the `liveSupport` module owns

| Concern | Owner |
|---|---|
| `support_agents` table + presence (`online` / `away` / `busy` / `offline`) | `liveSupport` |
| `conversation_status` lifecycle (`waiting_agent` → `with_agent` → `closed` → reopened) | `liveSupport` |
| Claim / release trigger (`support_agent_offline_release`) | `liveSupport` |
| Agent composer + broadcast fallback (`agent_message` channel for visitor RLS bypass) | `liveSupport` |
| The support skills (`support_list_conversations`, `support_assign_conversation`, `route_conversation`, `send_channel_message`, …) | `liveSupport` |

FlowBox's **Go live** toggle writes `support_agents.status`; its chat reply box makes the same two writes the old page made (claim the conversation, insert an agent message the widget receives over broadcast).

## What FlowBox does NOT own

- Mail threads, drafts, the send rail → `email`
- Call recordings, IVR, voicemail audio, callbacks → `voice`
- The visitor chat widget itself → `chat`
- Ticket comments and lifecycle → `tickets`
- Form submissions and the handled stamp → `forms`
- Telegram outbound → `telegram-ingest` (integration); SMS → `elks46-ingest` (integration)

FlowBox **projects** all of these by reading their tables. Every action on a row writes exactly where that module's own page writes: a ticket reply is a `ticket_comments` row, an email reply goes through `email-send`, marking a form handled sets the same `handled_at` the Forms page sets.

## Consequence: graceful degradation

If a channel module is off, or the role may not read it:

- A source the role cannot read comes back empty through RLS.
- A source that is not installed is logged and skipped.
- The **Calls** card in Routing tones down when `voice` is off (`useIsModuleEnabled('voice')`); the ticket options on a mailbox are disabled when `tickets` is off.

The queue is never blank because one channel is missing. That is the **aggregator contract**: removing a channel module degrades the aggregator gracefully, never breaks it.

## Adding a new channel to FlowBox

When a new channel module ships (e.g. `whatsapp`, which does not exist today):

1. The module creates or extends its own tables — it does **not** modify `liveSupport` or FlowBox.
2. If it is a conversational transport, it writes `chat_conversations` rows with `channel='whatsapp'` and answers through `chat-completion` as Telegram and SMS do; FlowBox then shows it under **Chat** with no change.
3. If it is a new kind of thing (as email was), it gets its own reader in `inbox-items.ts` that maps its rows into the four states, and a channel chip.
4. It implements the [`ChannelAdapter` contract](./channel-adapter-contract.md) so outbound replies route consistently.

## Inspiration

This mirrors how Odoo splits **Discuss** (the inbox) from **Livechat**, **VoIP**, **Helpdesk**, and how OpenClaw separates its Gateway runtime from each `ChannelPlugin` ([Ch. 11 — Channel Adapter Abstraction](https://github.com/0xtresser/OpenClaw-Book/blob/main/EN/Ch11-Channel-Adapter-Abstraction/11.1-Channel-Adapter-Design-Pattern.md)).

## See also

- [FlowBox — one queue over every channel](../modules/flowbox.md)
- [Channels vs Modules](./channels-vs-modules.md)
- [Channel Adapter Contract](./channel-adapter-contract.md)
- [Email routing: transports, mailboxes, and what a conversation binds to](./email-routing-and-mailboxes.md)
