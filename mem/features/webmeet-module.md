---
name: WebMeet — video meeting rooms
description: Mesh WebRTC over Supabase Realtime broadcast, shareable URL like Google Meet, MCP-exposed so any agent can mint a meeting link
type: feature
---

# WebMeet

Module `webmeet`. Quick 1-to-few video meetings with shareable URLs.

## Key shape

- Single DB table: `webmeet_rooms` (slug, name, host_user_id, password, max_participants, expires_at, ended_at).
- **Signaling lives on the wire**, not in DB. Supabase Realtime broadcast channel `webmeet:<slug>` carries SDP offers/answers, ICE candidates, and presence. No `room_signals`/`room_presence` tables.
- Hook `useWebmeet(slug, displayName)` uses native `RTCPeerConnection` — no `simple-peer` dep, no Buffer polyfill.
- Deterministic initiator: `peerIdRef.current < remotePeerId` → initiator calls `createOffer`.

## Public-safe by design

`webmeet_rooms` row is readable by `anon` when `ended_at IS NULL` and not expired. Anonymous guests can join via the URL with just a display name. Only authenticated users can create/update/delete rooms (host or admin).

## MCP skills

All three exposed (group `communication`):

- `create_webmeet_room` (rpc) → `{ slug, url, max_participants, expires_at }`. Prefix `url` with site origin when sharing.
- `end_webmeet_room` (rpc)
- `list_webmeet_rooms` (rpc)

FlowPilot, OpenClaw peers and external claws all use the same skills the admin UI uses (Law 1). Marketing/sales claws should call `create_webmeet_room` when scheduling a customer demo.

## NOT a replacement for

- `webinars` — 50+ viewer broadcasts need an SFU. WebMeet mesh collapses above ~6 peers.
- `voice` (46elks JsSIP) — PSTN/SIP calls. Untouched.

## Future hooks

- Invite fan-out via existing email/SMS/Telegram connectors when `bookings.meeting_type='webmeet'`.
- TURN server config per site.
- Optional recording → `documents`.
