# Live Support — Deep Dive Guide

> Companion to the auto-generated [`live-support.md`](./live-support.md). This file is hand-maintained.

Live Support is the human-agent inbox for visitor and customer conversations across every channel FlowWink supports. It is an **aggregator view** — see [Live Support as Aggregator](../architecture/live-support-as-aggregator.md) for the architectural rationale.

## What ships in v1

### UI tabs (in order)

| Tab | Filter | Purpose |
|---|---|---|
| **Waiting** | `scope='visitor' AND status='waiting_agent'` | Inbound queue. Audible ping on new arrivals. |
| **Inbox** | `scope='visitor' AND status='with_agent' AND assigned_agent_id=me` | My active conversations. |
| **Closed** | `scope='visitor' AND status='closed'` (search bar) | Searchable history; per-conversation **Reopen** button. |
| **Callbacks** | `voice_calls WHERE callback_status='pending'` | Voicemail/missed-call follow-ups. Hidden when `voice` module is off. |
| **Voicemail** | `voice_calls WHERE status='voicemail'` | Audio + transcript; plays via `voice-recording` proxy. Hidden when `voice` module is off. |

### Conversation lifecycle

```text
        ┌──────────────────┐
        │ visitor sends    │
        │ message in widget│
        └────────┬─────────┘
                 │ (AI handles if enabled)
                 ▼
        ┌──────────────────┐    escalate    ┌──────────────────┐
        │ ai_handled       │───────────────►│ waiting_agent    │
        └──────────────────┘                └────────┬─────────┘
                                                     │ claim
                                                     ▼
                                            ┌──────────────────┐
                                            │ with_agent       │
                                            └────────┬─────────┘
                          agent goes offline         │ close
                          (support_agent_offline_    │
                           release trigger)          │
                                ◄────────────────────┤
                                                     ▼
                                            ┌──────────────────┐
                                  reopen ◄──│ closed           │
                                            └──────────────────┘
```

### Multi-channel aggregation

The Inbox lists conversations from **every channel** in the same surface:

- `web` (chat widget)
- `telegram`
- `sms` (46elks, Twilio)
- `voice` / `voicemail` (projection from `voice_calls`)
- future: `whatsapp`, `email`, `slack`

Per-row `ChannelChip` renders icon + color based on `support-channels.tsx`. No hardcoded channel logic in the page — adding a channel = adding an entry in that file.

## Key implementation patterns

### Broadcast fallback (agent → visitor)

The visitor's chat session uses **anonymous RLS** (no auth). When an authenticated agent inserts a message into `chat_messages`, the visitor's realtime subscription cannot read it back (RLS denies). To bridge this:

1. Agent insert proceeds normally (server-side authoritative).
2. `useSupportConversations` **also** broadcasts the message on a dedicated realtime channel.
3. The visitor's `useChat` subscribes to that channel and renders the broadcast.

Race condition fix: agent-side waits for `SUBSCRIBED` status (5s timeout) and uses `ack:true` before `.send()`. Without this, the broadcast fires before the channel is ready and silently drops. See [`useSupportConversations.tsx`](../../src/hooks/useSupportConversations.tsx).

### Claim and release

- **Claim** = `assigned_agent_id = me; status = 'with_agent'`. Atomic via RPC.
- **Auto-release** = DB trigger `support_agent_offline_release` resets all `with_agent` rows of an agent back to `waiting_agent` when the agent's `support_agents.status` transitions to `offline`.
- See [Backlog: Claimed ticket ownership policy](../../.lovable/backlog.md) for the open design question.

### Notification sound

A global `<audio>` element ticks once per new `waiting_agent` arrival, throttled. Lives in `useSupportConversations`. Honors the agent's online status — silent when offline.

### Closed history + reopen

`useClosedConversations` runs server-side ILIKE search over name / email / phone / title across the last 100 closed conversations. The **Reopen** button:

1. Sets `status='waiting_agent'`.
2. Clears `assigned_agent_id`.
3. The conversation reappears in the Waiting tab and triggers the notification ping.

### Voice recording proxy

Voicemail audio is hosted by the voice provider behind HTTP Basic Auth (46elks). To avoid an auth prompt on `<audio>` play, we proxy through the `voice-recording` edge function which injects `ELKS46_API_USERNAME/PASSWORD` server-side and streams the audio with `Range` header support.

## Skills (MCP-exposed)

| Skill | Description |
|---|---|
| `support_list_conversations` | List by status, returns customer meta + priority + sentiment |
| `support_assign_conversation` | Assign / reassign to an agent |
| `support_get_feedback` | Read CSAT-style chat feedback rows |

External operators (FlowPilot, OpenClaw, Claude Desktop) call these via MCP. They are gated by the `liveSupport` module being enabled.

## Known gaps (roadmap)

- **Canned responses / macros** — not yet implemented.
- **Skill-based routing** — assignment is round-robin / manual today.
- **CSAT survey after close** — `chat_feedback` table exists; surveys not auto-triggered.
- **Transfer between agents** — skill supports it; UI control missing.
- **Heartbeat per channel** — see [Channel Adapter Contract](../architecture/channel-adapter-contract.md).

## See also

- [`live-support.md`](./live-support.md) — auto-generated module manifest
- [`voice.md`](./voice.md) — companion voice module
- [Channels vs Modules](../architecture/channels-vs-modules.md)
- [Live Support as Aggregator](../architecture/live-support-as-aggregator.md)
- [Channel Adapter Contract](../architecture/channel-adapter-contract.md)
- [`support-to-resolution.md`](../processes/support-to-resolution.md) — end-to-end process
