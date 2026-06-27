# Channels vs Modules

> The single most important distinction for anyone adding a new communication surface to FlowWink.

## TL;DR

- **A module** = business logic + UI + skills + owned tables. Lives in `src/lib/modules/*.ts`. Toggleable in `/admin/modules`. Exposes MCP skills when enabled.
- **A channel integration** = a transport adapter to an external provider (API key, webhooks, format translation). Lives under `supabase/functions/<provider>-ingest/` + (optionally) `src/lib/<channel>-providers/`. Configured in `/admin/integrations`. No own admin page, no own skills.
- **Live Support** is an *aggregator view* that consumes data from multiple channel-bearing modules. It does **not** own channels.

## The matrix

| Layer | Examples | Owns |
|---|---|---|
| **Module** `liveSupport` | Agent inbox, claim/release, presence, broadcast fallback, closed history | `support_agents`, `conversation_status` lifecycle |
| **Module** `voice` | Call log, IVR, voicemail, callbacks, WebRTC-toggle, recording proxy | `voice_calls`, `voice-recording` edge |
| **Module** `chat` (AI Chat / widget) | Visitor chat widget, AI replies, sessions | `chat_conversations`, `chat_messages` |
| **Integration** Telegram | Inbound/outbound Telegram text messages | `telegram-ingest` edge + Telegram Bot API |
| **Integration** 46elks | SMS, Voice numbers, recordings (multi-purpose) | `elks46-ingest`, `voice-recording` edges |
| **Integration** Twilio | US-market sibling of 46elks | `twilio` voice adapter |
| **Integration** Composio (Gmail) | Inbound email → ticket | `composio-webhook` |

## The rule of thumb

> **An integration has no admin page and no own skills — it only exposes a channel that one or more modules consume.**

Examples:

- **Telegram** is an SMS-like text channel. It feeds into `chat_conversations` with `channel='telegram'`. Live Support (the module) handles agent replies, and outbound goes back through `telegram-ingest`.
- **46elks** is a multi-purpose provider that feeds **two modules at once**: `voice` (calls, voicemail) **and** `chat` (SMS messages in the same `chat_conversations` table with `channel='sms'`).
- **Composio + Gmail** feeds the `tickets` module via classification — not its own "Email" module.

That is why `src/lib/support-channels.tsx` lists `web | telegram | sms | voice | voicemail` as **channels** (transports), not as modules.

## Subtle case: integration with a thin module shell

Some integrations need a small **config UI** ("Connect Telegram bot", webhook URL, which agents receive Telegram traffic). That UI belongs under `/admin/integrations`, **not** as a toggle in `/admin/modules`. The Composio drawer is the reference pattern.

## When in doubt

Ask: *"If I switch this off, does the user lose a business capability (a UI, a workflow, a skill) — or just a connection to a provider?"*

- Loses a business capability → it is a **module**.
- Loses a provider connection (with the capability still present via other channels) → it is an **integration**.

## Related

- [Live Support as Aggregator](./live-support-as-aggregator.md)
- [Channel Adapter Contract](./channel-adapter-contract.md) — the target architecture for new channels
- `mem://architecture/channels-vs-modules`
