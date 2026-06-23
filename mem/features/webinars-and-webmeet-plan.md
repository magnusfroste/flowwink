---
name: Webinars & WebMeet Strategy
description: Two-track real-time video plan — Webinars (1-to-many SFU) vs WebMeet (1-to-few P2P), invite flow via SMS/email/Telegram for client meetings
type: feature
---

# Real-time video: two distinct tracks

Decision after scouting `chatsoap` (raw WebRTC + Supabase signaling) and `quickpitch` (Agora SFU). Both serve real needs but **must NOT share one stack**.

## Track 1 — Webinars (1-to-many, 50-500 viewers)

- **Stack:** SFU. Prefer **LiveKit** (open source, self-hostable — aligns with self-hosted philosophy). Agora kept as fallback if simplicity beats self-host for a given customer.
- **Why not raw WebRTC:** mesh collapses above ~6 peers. Recording/HLS/transcoding also belongs in an SFU.
- **Lives in:** `webinars` module (already exists with lifecycle + lead-loop + reminders). LiveKit becomes the runtime layer for the live session itself.
- **Status:** spike not started. Decision logged; build when a customer actually books a webinar live.

## Track 2 — WebMeet (1-to-few, internal + customer-facing meetings)

- **Stack:** Port `chatsoap`'s raw WebRTC (`useWebRTC` + `useDirectCall`) + Supabase Realtime signaling (`room_signals` / `direct_calls` / `call_signals`). Free, no SFU.
- **Use cases:**
  1. **Internal cowork:** "ring a colleague" / quick huddle / screen-share inside FlowChat — does NOT replace 46elks JsSIP (PSTN stays separate).
  2. **Customer-facing 1:1 video meeting** — e.g. psychologist offers a session, books via the `bookings` module, gets a unique WebMeet room link, customer joins from a browser without install.
- **Screen-share:** trivial — `getDisplayMedia` → add track to existing `RTCPeerConnection`.
- **Capacity:** good up to ~4-6 peers. Anything bigger → Track 1.

## Invite flow (the new piece)

When an admin/practitioner creates a WebMeet room (or a booking with `meeting_type='webmeet'`), the system mints a one-shot room URL and offers invite channels:

- **Email** — `send-transactional-email` with `webmeet-invite` template (subject + start time + link + add-to-calendar `.ics`).
- **SMS** — Twilio or GatewayAPI connector (whichever the customer has linked). Short body: practitioner name + time + link.
- **Telegram** — Telegram connector if recipient has a `telegram_chat_id` on their contact record.

All three go through existing connector gateway — no new infra. Channel selection is per-invite (checkbox) and per-recipient (use what we have on file, fall back to email).

## Module layout

- **`webmeet`** (new module) — owns the WebRTC hooks, signaling tables, room minting RPC (`create_webmeet_room`), invite RPC (`send_webmeet_invite` — fan-out to email/SMS/Telegram).
- **`webinars`** (existing) — gains a `runtime: 'livekit' | 'agora'` config field when Track 1 is built.
- **`bookings`** — gains optional `meeting_type` + `webmeet_room_id` so a booking auto-creates a room.

## What this does NOT replace

- **46elks JsSIP** — PSTN/SIP calls (real phone numbers). Lives in `voice` / future `voice-web` module under UC gateway. Untouched.
- **AI receptionist** (parked) — separate vision, separate stack.

## Status

- Plan documented. No code yet.
- Next concrete step (when prioritized): scaffold `webmeet` module via `bun run new:module webmeet`, port `useWebRTC` + `useDirectCall`, add `room_signals` + `direct_calls` migrations with RLS + GRANT.
