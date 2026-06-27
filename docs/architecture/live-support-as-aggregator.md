# Live Support as Aggregator

> Live Support is a view, not a channel owner.

## The pattern

```text
   ┌─────────────────┐  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
   │  chat (widget)  │  │   voice     │  │   tickets    │  │ (future) ... │
   │ web / telegram  │  │ calls + vm  │  │  email→ticket│  │ whatsapp/etc │
   │ sms / ...       │  │             │  │              │  │              │
   └────────┬────────┘  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘
            │ chat_conversations│ voice_calls   │ tickets         │
            └───────────────────┴───────────────┴─────────────────┘
                                       │
                                       ▼
                            ┌──────────────────────┐
                            │  Live Support (view) │
                            │  /admin/live-support │
                            │  Waiting / Inbox /   │
                            │  Closed / Callbacks/ │
                            │  Voicemail           │
                            └──────────────────────┘
```

## What Live Support owns

| Concern | Owner |
|---|---|
| `support_agents` table + presence (online/away/busy/offline) | `liveSupport` |
| `conversation_status` lifecycle (`waiting_agent` → `with_agent` → `closed` → reopened) | `liveSupport` |
| Claim/release triggers (`support_agent_offline_release`) | `liveSupport` |
| Agent composer + broadcast fallback (`agent_message` channel for visitor RLS bypass) | `liveSupport` |
| Closed-history search + reopen | `liveSupport` |
| Notification sound for new waiting visitors | `liveSupport` |

## What Live Support does NOT own

- Call recordings, IVR, voicemail audio → `voice`
- The visitor chat widget itself → `chat`
- Telegram outbound API call → `telegram-ingest` (integration)
- SMS sending → `46elks` / `twilio` (integration)
- Email-to-ticket parsing → `tickets` + `composio-webhook` (integration)

Live Support **projects** voicemails and callbacks into its UI by reading `voice_calls` — but the source of truth and CRUD surface stay in the `voice` module.

## Consequence: graceful degradation

If a customer turns off the `voice` module:

- `/admin/voice` disappears (modules-toggle).
- Voicemail + Callback tabs in `/admin/live-support` tone down or hide (uses `useIsModuleEnabled('voice')`).
- Waiting / Inbox / Closed continue to work — they depend on `chat_conversations`, owned by the `chat` module.

This is the **aggregator contract**: removing a channel module degrades the aggregator gracefully, never breaks it.

## Adding a new channel to Live Support

When a new channel module ships (e.g. `whatsapp`):

1. The module creates/extends its own data tables — does **not** modify `liveSupport`.
2. The module sets `channel='whatsapp'` on rows it writes into `chat_conversations` (or its own table).
3. The module implements the future [`ChannelAdapter` contract](./channel-adapter-contract.md) so outbound replies route consistently.
4. Live Support picks up the new channel automatically because `support-channels.tsx` reads `channel` as data.

No code changes in `LiveSupportPage.tsx` should be required for a pure new channel.

## Inspiration

This mirrors how Odoo splits **Discuss** (the inbox) from **Livechat**, **VoIP**, **Helpdesk**, and how OpenClaw separates its Gateway runtime from each `ChannelPlugin` ([Ch. 11 — Channel Adapter Abstraction](https://github.com/0xtresser/OpenClaw-Book/blob/main/EN/Ch11-Channel-Adapter-Abstraction/11.1-Channel-Adapter-Design-Pattern.md)).
