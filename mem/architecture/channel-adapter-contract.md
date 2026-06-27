---
name: Channel Adapter Contract
description: Target architecture for communication channels — every channel implements ChannelAdapter (id, meta, capabilities, config + optional ingest/outbound/heartbeat/gateway). Inspired by OpenClaw's ChannelPlugin (Ch.11). Voice is the reference impl; telegram/sms/email to migrate.
type: feature
---

# Channel Adapter Contract

Target type lives in `src/lib/channels/types.ts` (to be created). Mirrors OpenClaw's `ChannelPlugin` pattern: 4 required fields (`id`, `meta`, `capabilities`, `config`) + optional adapters (`ingest`, `outbound`, `heartbeat`, `gateway`, `agentPromptHint`).

## Why

1. **Capability-driven UI** — features (threads, media, voicemail, streaming) light up at runtime instead of hardcoded channel checks.
2. **No outbound hacks** — one well-known `outbound()` per channel, not hardcoded in `useSupportConversations`.
3. **Heartbeat** — `/admin/integrations` can show channel health.
4. **Easy onboarding** — new channel = implement one interface.

## Current state vs target

| Channel | Today | Target gap |
|---|---|---|
| `voice` | `VoiceProvider` adapter (elks46/twilio) ✅ | Wrap in unified `ChannelAdapter` |
| `web` | Direct DB writes via `useChat` + RLS | Implement `outbound` to formalize broadcast fallback |
| `telegram` | Edge function only, outbound hardcoded | Full adapter |
| `sms` | Shares voice provider keys | `messaging` sub-adapter on 46elks/twilio |
| `voicemail` | Projection of `voice_calls` | `inboundOnly: true`, no outbound |

## Rule for new channels

Any new channel (WhatsApp, Slack, email full) MUST be implemented adapter-first against this contract. Do NOT add another one-off edge function + hardcoded outbound. Voice is the reference.

Full spec: `docs/architecture/channel-adapter-contract.md`.
