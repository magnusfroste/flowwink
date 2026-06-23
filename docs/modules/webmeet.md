# WebMeet

Quick 1-to-few video meetings with shareable URLs — like Google Meet, built into FlowWink.

## What it does

- **Create a meeting** → get a shareable URL like `/meet/swift-river-482`.
- **Share with anyone** — link works for logged-in users and anonymous guests. No install.
- **Screen sharing** built in (`getDisplayMedia` → replaces the camera track on every peer connection).
- **Camera + mic toggles**, per-participant tiles, presence sync.
- **End the room** to revoke the link.

## Architecture

| Concern | Implementation |
|---|---|
| Transport | Browser-native `RTCPeerConnection` (no `simple-peer` dep). |
| Signaling | Supabase Realtime broadcast channel `webmeet:<slug>`. No DB signaling tables. |
| Presence | Supabase Realtime presence on the same channel. |
| ICE | Public Google STUN servers. Add TURN when you need to traverse strict NATs. |
| Capacity | Mesh — good up to ~4–6 peers. Use Webinars (SFU) for larger broadcasts. |

Only one table is persisted (`webmeet_rooms`) holding room metadata + the shareable slug. Everything else lives on the wire.

## Tables

| Table | Purpose |
|---|---|
| `webmeet_rooms` | Room metadata: `slug`, `name`, `host_user_id`, `password`, `max_participants`, `expires_at`, `ended_at`. Public-readable when active so anonymous guests can join via the link. |

## Skills (MCP exposed)

All three are exposed to FlowPilot **and** external agents via `mcp-server`, group `communication`.

| Skill | Handler | Use case |
|---|---|---|
| `create_webmeet_room` | `rpc:create_webmeet_room` | Mint a room + return `{ slug, url, max_participants, expires_at }`. Agents call this whenever a customer asks for a video meeting link. |
| `end_webmeet_room` | `rpc:end_webmeet_room` | Close an active room. |
| `list_webmeet_rooms` | `rpc:list_webmeet_rooms` | List active rooms (or include ended ones). |

### Example MCP call

```jsonc
{
  "tool": "create_webmeet_room",
  "arguments": {
    "p_name": "Customer call — Acme",
    "p_max_participants": 4,
    "p_expires_in_minutes": 120
  }
}
```

Response:
```jsonc
{ "id": "…", "slug": "swift-river-482", "url": "/meet/swift-river-482", "max_participants": 4, "expires_at": "…" }
```

Prefix `url` with the site origin when sharing externally (email/SMS/Telegram).

## Pages

- `/admin/webmeet` — list & create rooms (admin).
- `/meet/:slug` — public meeting room (lobby → join with name → grid + controls).

## Settings

| Module flag | Effect |
|---|---|
| `webmeet.enabled` | Toggles admin UI + skill availability. |

## When NOT to use WebMeet

- **Webinars / 50+ viewers** — use the `webinars` module (SFU-backed, LiveKit/Agora runtime planned).
- **PSTN / real phone numbers** — use the `voice` module (46elks JsSIP).
- **Persistent text chat** — use `chat`.

## Future

- Optional TURN config per site for strict-NAT customers.
- Invite fan-out — auto-send a join link via email / SMS / Telegram when a `bookings` row gets `meeting_type='webmeet'`. See `mem/features/webinars-and-webmeet-plan.md`.
- Optional recording → push to `documents`.
