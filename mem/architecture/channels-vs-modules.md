---
name: Channels vs Modules
description: How to classify a new communication surface — module (business logic, owns tables, has skills) vs integration (transport adapter, no admin page, no skills). Live Support is an aggregator view, not a channel owner.
type: feature
---

# Channels vs Modules

**Rule of thumb:** *"If I switch this off, does the user lose a business capability — or just a connection to a provider?"*

- Loses business capability → **module** (lives in `src/lib/modules/*.ts`, toggle in `/admin/modules`, owns tables, exposes skills).
- Loses provider connection → **integration** (lives in `supabase/functions/<provider>-ingest/` and/or `src/lib/<channel>-providers/`, configured in `/admin/integrations`, no admin page, no skills).

## Concrete map

| Layer | Examples |
|---|---|
| Module | `liveSupport`, `voice`, `chat`, `tickets` |
| Integration | Telegram, 46elks, Twilio, Composio/Gmail |

## Live Support is an aggregator

`liveSupport` owns the agent inbox UI, `support_agents`, `conversation_status` lifecycle, claim/release, broadcast fallback, closed/reopen. It does NOT own channels — it consumes data from `voice_calls`, `chat_conversations`, etc. Removing a channel module degrades gracefully (tabs hide), never breaks the inbox.

## When in doubt

- 46elks feeds **two** modules (voice + chat-via-SMS). That confirms it is an integration, not a module.
- A "thin module shell" around an integration (config UI like "Connect Telegram bot") still belongs under `/admin/integrations`, not as a `/admin/modules` toggle. Composio drawer is the reference pattern.

Full docs: `docs/architecture/channels-vs-modules.md` + `docs/architecture/live-support-as-aggregator.md`.
