---
name: Send the meeting link by SMS, and "video call with support" for visitors
description: Backlog — two ways a WebMeet room reaches someone who is not on the team. (1) The host sends /meet/<slug> as a text through the 46elks adapter that already exists; the Capio case, a patient with a phone and no account. (2) A visitor asks the public site for a video call and lands in the support queue as a conversation on channel `video`, routed like web chat and Telegram. Standalone; nothing in Here now, the waiting room or Start video call depends on it. Not started.
type: feature
---

# Problem
A WebMeet link is for someone who clicks it. Today the only way to hand it
over is the clipboard: the host copies the link and pastes it into whatever
channel they already have with the guest. For a clinic texting the next
patient, or a support agent who wants to see the customer's screen, that is
one copy-paste too many — and the visitor side has no way to ask for a video
call at all.

# What it would take

## 1. The link by SMS (host → guest)
- `elks46-ingest?action=send` already sends an outbound SMS with an admin JWT
  (`ELKS46_API_USERNAME` / `ELKS46_API_PASSWORD`; the Integrations card and
  `check-secrets` know it as `elks46`). The adapter is the whole backend.
- In the call, next to Copy link: **Send by SMS** — a phone number field, the
  text "Join the video call: <link>" and one tap. Same on `/admin/webmeet`'s
  room card. Hidden when 46elks is not configured (Law 4).
- A `send_sms` skill (`handler: edge:elks46-ingest?action=send` or a thin RPC)
  so the agent can text the link too — "send the meeting link to the customer".
  Platform-level (`src/lib/platform-seeds.ts`), not a WebMeet-only skill: the
  same primitive serves booking confirmations and dunning.
- With the waiting room on (#668), the texted link is the clinic flow end to
  end: patient opens it on time, waits, is let in.

## 2. Video call with support (visitor → team)
- A public block (or a button in the chat widget): **"Video call with
  support"**. It creates a `support_conversations` row on a new channel
  `video` with a WebMeet room attached, and the visitor lands on the pre-join
  screen of that room.
- `route_conversation` routes it like web chat and Telegram: presence-aware,
  to the agent who is here (the `team-presence` channel from #666 is the same
  signal). The agent's FlowBox shows "Anna wants a video call" with Join.
- Channel enum: `support_conversations.channel` gains `video`; the relay in
  `useSupportConversations` already branches on channel (Telegram today) and
  gets one more branch that posts nothing, since the room is the conversation.
- Room per conversation; the room closes when the conversation is resolved.
  Max two participants unless an agent pulls in a colleague.

# Not in scope
- SMS replies back into FlowWink (inbound SMS is already an `elks46-ingest`
  mode; wiring it to the same conversation is its own step).
- Recording. Transcripts.
- Any provider but 46elks for SMS at first; the adapter shape is the seam.

# Touchpoints
- `supabase/functions/elks46-ingest/index.ts` (`?action=send` — exists)
- `src/pages/MeetRoomPage.tsx` (Send by SMS next to Copy link, host only)
- `src/pages/admin/WebmeetPage.tsx` (room card)
- `src/lib/platform-seeds.ts` (`send_sms`)
- `src/components/public/blocks/` — a `video-support` block, or the chat
  widget's header; `src/hooks/useSupportConversations.tsx`
- `support_conversations.channel` check constraint; `route_conversation_to_agent`
- `docs/operators/video-meetings.md`

# Decision needed
Two halves, two PRs. (1) is small and standalone: the adapter exists, it is a
field and a button. (2) is the first time a public visitor starts a WebMeet
room, which means the room's cost is on the visitor's finger — a cap per
hour per IP, and the waiting room on by default for those rooms. Order?
