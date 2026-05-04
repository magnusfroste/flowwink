---
name: Webinar Lifecycle & Lead Loop
description: Webinar status state-machine via SECURITY DEFINER RPCs, anonymous registration via RPC, auto lead-link with score boost, platform events, cron auto-flip
type: feature
---
## Lifecycle RPCs (all MCP-exposed)
- `publish_webinar(p_webinar_id)` — draft → published; emits `webinar.published`
- `start_webinar(p_webinar_id)` — published → live; emits `webinar.live`
- `complete_webinar(p_webinar_id, p_recording_url?)` — live/published → completed; emits `webinar.completed`
- `cancel_webinar(p_webinar_id, p_reason?)` — emits `webinar.cancelled`
- `mark_webinar_attendance(p_registration_id, p_attended)` — flips attended flag, +10 lead score, emits `webinar.attended`

## Anonymous registration
- `register_for_webinar(p_webinar_id, p_name, p_email, p_phone?)` — SECURITY DEFINER, granted to anon+authenticated.
  - Auto-links to `leads` by email (case-insensitive) or creates new lead with `source='webinar'`, `source_id=<webinar.id>`, `score=15`.
  - Existing lead: `score += 15`, name/phone backfill if null.
  - Idempotent via `UNIQUE (webinar_id, email)` upsert.
  - Emits `webinar.registered`.
- Replaces previous client-side dedup + insert pattern in `useRegisterForWebinar`. Block-friendly (no JWT needed).

## Cron auto-flip
- `webinar_tick()` runs every 5 min:
  - `published` → `live` when `date <= now() < date + 1h`
  - `live` → `completed` when `date + duration_minutes < now()`
- Cron job name: `webinar-tick-5min`.

## Skills (agent_skills)
`manage_webinar`, `register_webinar` (now RPC), `publish_webinar`, `start_webinar`, `complete_webinar`, `cancel_webinar`, `mark_webinar_attendance` — all `mcp_exposed=true`, category `communication`.

## Admin UI
`/admin/webinars` cards expose Publish / Start / Complete / Cancel icon-buttons gated on current status. Detail dialog has "Mark attended" toggle per registration.

## Events for automations
External listeners can subscribe to `webinar.published|live|completed|cancelled|registered|attended` via `agent_events` and trigger reminder emails, recording follow-ups, lead nurture sequences.
