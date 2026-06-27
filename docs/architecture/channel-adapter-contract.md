# Channel Adapter Contract

> The target architecture for every communication channel in FlowWink. Inspired by [OpenClaw's `ChannelPlugin`](https://github.com/0xtresser/OpenClaw-Book/blob/main/EN/Ch11-Channel-Adapter-Abstraction/11.1-Channel-Adapter-Design-Pattern.md) (Ch. 11 — Channel Adapter Abstraction).

## Why we need a contract

Today our channels are implemented ad hoc:

- `voice` follows a clean adapter pattern (`src/lib/voice-providers/{elks46,twilio}.ts` implementing `VoiceProvider`).
- `telegram` lives only as an edge function (`telegram-ingest`) with outbound hardcoded in `useSupportConversations`.
- `sms` (46elks) and `email` (Composio) are similar one-off integrations.

A formal `ChannelAdapter` interface gives us:

1. **Discoverability** — Live Support, FlowPilot, and external agents can enumerate channels and their capabilities at runtime.
2. **Capability-driven UI** — features (threads, media, voicemail, streaming) light up only when the channel supports them.
3. **No more outbound hacks** — one well-known function per channel for "send a message".
4. **Easy onboarding** — adding WhatsApp or Slack means implementing one interface, not editing five files.

## The contract

Target type, to live in `src/lib/channels/types.ts`:

```ts
import type { SupportChannel } from '@/lib/support-channels';

export type ChannelCapabilities = {
  // What the channel can carry
  text: boolean;
  media?: boolean;            // images / files
  voice?: boolean;            // audio messages or calls
  voicemail?: boolean;        // async voice with transcription

  // Interaction patterns
  reactions?: boolean;
  threads?: boolean;          // quoted replies / thread chains
  typing?: boolean;           // typing indicators
  streaming?: boolean;        // partial-message streaming (agent → visitor)
  presence?: boolean;         // online/offline of the remote party

  // Operational
  webhookIngest?: boolean;    // provider pushes to us
  pollIngest?: boolean;       // we poll the provider
  inboundOnly?: boolean;      // e.g. voicemail-only flows
};

export type ChannelMeta = {
  id: SupportChannel;
  label: string;              // "Telegram"
  blurb: string;              // one-line description
  docsPath?: string;          // "/docs/integrations/telegram"
  icon: string;               // lucide icon name OR sf-symbol
  color: string;              // tailwind text color
  bg: string;                 // tailwind bg color (chip)
};

export type ChannelHealth = 'ok' | 'degraded' | 'down' | 'unknown';

export type ChannelAdapter = {
  // Required (4 fields, matching OpenClaw's minimal ChannelPlugin)
  id: SupportChannel;
  meta: ChannelMeta;
  capabilities: ChannelCapabilities;
  config: {
    settingsKey: string;            // e.g. 'integrations.telegram'
    accountsTable?: string;         // e.g. 'inbound_email_accounts'
    requiredSecrets: string[];      // env vars the provider needs
    isConfigured: () => Promise<boolean>;
  };

  // Optional adapters — implement only what the channel supports
  ingest?: {
    edgeFunction: string;           // 'telegram-ingest'
    webhookPath?: string;           // public webhook URL fragment
    register?: () => Promise<void>; // e.g. setWebhook on Telegram
  };

  outbound?: (params: {
    conversationId: string;
    content: string;
    media?: { url: string; mime: string }[];
  }) => Promise<{ messageId: string }>;

  heartbeat?: () => Promise<ChannelHealth>;

  // Lifecycle (per OpenClaw's ChannelGatewayAdapter)
  gateway?: {
    start?: () => Promise<void>;
    stop?: () => Promise<void>;
    reconnect?: () => Promise<void>;
  };

  // Agent integration
  agentPromptHint?: string;         // injected into FlowPilot system prompt
                                    // when this channel is active
};
```

## Today vs target

| Channel | Today | Target gap |
|---|---|---|
| `voice` | ✅ Has `VoiceProvider` adapter, 2 implementations | Wrap in unified `ChannelAdapter` (provider becomes sub-adapter) |
| `web` (chat widget) | Direct DB writes via `useChat` + RLS | Implement `outbound` so Live Support stops doing the broadcast hack inline |
| `telegram` | Edge function only, outbound hardcoded in `useSupportConversations` | Wrap as full `ChannelAdapter` |
| `sms` (46elks/Twilio) | Shares voice provider's API key, no dedicated outbound | Build a `messaging` sub-adapter on 46elks/twilio that exports `outbound` |
| `voicemail` | Projection of `voice_calls` | Mark `inboundOnly: true`, no `outbound` |
| `email` (future) | Composio webhook → ticket | New adapter when we ship the full email channel |
| `whatsapp` (future) | — | Greenfield against the contract |

## Capabilities at runtime

The UI should not hardcode "Telegram has no voicemail". Instead:

```tsx
const adapter = getChannelAdapter(conversation.channel);
if (adapter.capabilities.voicemail) {
  // show voicemail tab
}
```

This matches OpenClaw's pattern where `blockStreaming: true` is checked at runtime, not assumed.

## Heartbeat → Integrations UI

`/admin/integrations` should poll `heartbeat()` for each registered adapter and show a status dot. Today we have no visibility into "is the Telegram bot reachable?".

## Migration plan

This is the **target**. We do not refactor existing channels in one big bang.

**Phase 1 (current):**
- Document the contract (this file).
- Keep existing edge functions and hooks working.

**Phase 2:**
- Create `src/lib/channels/registry.ts` + `ChannelAdapter` type.
- Implement adapter for `voice` (mostly wrap existing code).
- Implement adapter for `telegram` (move outbound out of `useSupportConversations`).

**Phase 3:**
- 46elks `messaging` sub-adapter for SMS outbound.
- `web` adapter formalizes broadcast fallback.
- Capability-driven Live Support UI (drop hardcoded channel checks).

**Phase 4:**
- New channels (WhatsApp, Slack, email) ship adapter-first.
- Heartbeat dashboard in `/admin/integrations`.

## See also

- [Channels vs Modules](./channels-vs-modules.md)
- [Live Support as Aggregator](./live-support-as-aggregator.md)
- `src/lib/voice-providers/types.ts` — current reference implementation
- `mem://architecture/channel-adapter-contract`
