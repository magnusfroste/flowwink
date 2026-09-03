---
title: "Channels vs Modules"
description: Examples:
category: architecture
---

# Channels vs Modules

> The single most important distinction for anyone adding a new communication surface to FlowWink.

## TL;DR

- **A module** = business logic + UI + skills + owned tables. Lives in `src/lib/modules/*.ts`. Toggleable in `/admin/modules`. Exposes MCP skills when enabled.
- **A channel integration** = a transport adapter to an external provider (API key, webhooks, format translation). Lives under `supabase/functions/<provider>-ingest/` + (optionally) `src/lib/<channel>-providers/`. Configured in `/admin/integrations`. No own admin page, no own skills.
- **FlowBox** (`/admin/flowbox`) is an *aggregator view* that consumes data from multiple channel-bearing modules. It does **not** own channels; the `liveSupport` (Contact Center) module owns presence and the chat lifecycle underneath it.

## The matrix

| Layer | Examples | Owns |
|---|---|---|
| **Module** `liveSupport` (Contact Center) | Presence, claim/release/transfer, broadcast fallback, the support skills — worked from FlowBox | `support_agents`, `conversation_status` lifecycle |
| **Module** `email` | The company mailbox: threads, replies, FlowPilot's draft-or-send per mailbox, templates, signatures, the send gateway | `email_threads`, `inbound_email_accounts`, the `email-send` gateway |
| **Module** `voice` | Call log, IVR, voicemail, callbacks, WebRTC-toggle, recording proxy | `voice_calls`, `voice-recording` edge |
| **Module** `chat` (AI Chat / widget) | Visitor chat widget, AI replies, sessions | `chat_conversations`, `chat_messages` |
| **Integration** Telegram | Inbound/outbound Telegram text messages | `telegram-ingest` edge + Telegram Bot API |
| **Integration** 46elks | SMS, Voice numbers, recordings (multi-purpose) | `elks46-ingest`, `voice-recording` edges |
| **Integration** Twilio | US-market sibling of 46elks | `twilio` voice adapter |
| **Integration** Composio (Gmail) | Transport for the company mailbox: inbound push + outbound send | `composio-webhook`, `composio-proxy` |

## The rule of thumb

> **An integration has no admin page and no own skills — it only exposes a channel that one or more modules consume.**

Examples:

- **Telegram** is an SMS-like text channel. It feeds into `chat_conversations` with `channel='telegram'`, answers through `chat-completion`, a person replies from the chat row in FlowBox, and outbound goes back through `telegram-ingest`.
- **46elks** is a multi-purpose provider that feeds **two modules at once**: `voice` (calls, voicemail) **and** `chat` (SMS messages in the same `chat_conversations` table with `channel='sms'`).
- **Composio + Gmail** is the transport for the `email` module's company mailbox. A mail becomes a ticket only when the mailbox's route mode says so; otherwise it binds to the CRM record it concerns.

That is why `src/lib/support-channels.tsx` lists `web | telegram | sms | voice | voicemail` as **channels** (transports), not as modules — these are the transports presence governs. Email is a channel in FlowBox's queue, but it never rings anyone.

## Subtle case: integration with a thin module shell

Some integrations need a small **config UI** ("Connect Telegram bot", webhook URL, which agents receive Telegram traffic). That UI belongs under `/admin/integrations`, **not** as a toggle in `/admin/modules`. The Composio drawer is the reference pattern.

## When in doubt

Ask: *"If I switch this off, does the user lose a business capability (a UI, a workflow, a skill) — or just a connection to a provider?"*

- Loses a business capability → it is a **module**.
- Loses a provider connection (with the capability still present via other channels) → it is an **integration**.

## Related

- [FlowBox as aggregator](./flowbox-as-aggregator.md)
- [FlowBox — one queue over every channel](../modules/flowbox.md)
- [Channel Adapter Contract](./channel-adapter-contract.md) — the target architecture for new channels
- `mem://architecture/channels-vs-modules`
