---
title: "Webinars Module"
module_id: "webinars"
version: "1.1.0"
category: "communication"
autonomy: "autonomous"
generated: false
updated: "2026-05-04"
---

# Webinars

> Plan, promote, run and follow up webinars — fully integrated with the lead loop.

Ships with **7 agent skills**, **2 database tables**, an **admin UI**, a 5-min **cron auto-flip**, and **6 platform events** for downstream automations.

## Quick Facts

| Property | Value |
|----------|-------|
| **Module ID** | `webinars` |
| **Version** | 1.1.0 |
| **Category** | communication |
| **Autonomy** | autonomous (lifecycle + lead-link automatic) |
| **Core** | No |
| **Capabilities** | `content:receive`, `data:write` |
| **MCP-exposed skills** | 7 |
| **Owns tables** | 2 |

## Lifecycle

```
draft → published → live → completed
                ↘ cancelled
```

- `published → live` and `live → completed` are flipped automatically by the `webinar-tick-5min` cron (`webinar_tick()` RPC) based on `date` and `duration_minutes`.
- Manual control is available from the admin UI and via skills.

## Lead Loop

`register_for_webinar` (SECURITY DEFINER, anon-callable):
- Upserts on `(webinar_id, email)` — idempotent.
- Auto-links by case-insensitive email to existing `leads`, otherwise creates a new lead with `source='webinar'`, `source_id=<webinar.id>`, `score=15`.
- Existing lead: `score += 15`, name/phone backfill if null.
- `mark_webinar_attendance(..., true)` adds **+10** to the linked lead's score.

## Platform Events

Emitted to `agent_events` for FlowPilot / external automations:

| Event | When |
|-------|------|
| `webinar.published` | `publish_webinar` |
| `webinar.live` | `start_webinar` (manual or cron) |
| `webinar.completed` | `complete_webinar` (manual or cron) |
| `webinar.cancelled` | `cancel_webinar` |
| `webinar.registered` | `register_for_webinar` |
| `webinar.attended` | `mark_webinar_attendance` |

## Skills

All seeded into `agent_skills` with `mcp_exposed=true` — available to FlowPilot and any external MCP client.

| Skill | Scope | Trust | Description |
|-------|-------|-------|-------------|
| `manage_webinar` | internal | auto | CRUD + list registrations. |
| `register_webinar` | external | auto | Visitor registration → lead-link. |
| `publish_webinar` | internal | notify | Draft → published. |
| `start_webinar` | internal | notify | Manually flip to live. |
| `complete_webinar` | internal | notify | Close + optional recording URL. |
| `cancel_webinar` | internal | approve | Cancel + emit event for notifications. |
| `mark_webinar_attendance` | internal | auto | Per-registration attendance flag + lead boost. |

## Data Model

- `public.webinars` — `status`, `date`, `duration_minutes`, `platform`, `meeting_url`, `recording_url`, `cover_image`, `max_attendees`.
- `public.webinar_registrations` — `webinar_id`, `name`, `email`, `phone`, `attended`, `lead_id` (auto-linked).

RLS enabled on both. Anonymous registration goes through `register_for_webinar` RPC, never direct insert.

## Admin UI

`/admin/webinars`:
- Status-gated lifecycle buttons on each card (Publish / Start / Complete / Cancel).
- Registration drawer with per-row "Mark attended" toggle.
- Cover image, agenda, platform metadata.

## File Map

| Purpose | Path |
|---------|------|
| Module definition | `src/lib/modules/webinars-module.ts` |
| Hook | `src/hooks/useWebinars.ts` |
| Admin page | `src/pages/admin/WebinarsPage.tsx` |
| Public block | `src/components/public/blocks/WebinarBlock.tsx` |
| Initial migration | `supabase/migrations/20260208173000_create_webinars.sql` |
| Lifecycle + lead-loop migration | `supabase/migrations/20260504190108_*.sql` |
| Memory | `mem/erp/webinar-lifecycle-and-lead-loop.md` |

## Roadmap (next)

- **Reminders** — `webinar_reminders` table + scheduled emails (T-24h, T-1h, post-webinar follow-up).
- **Attendance analytics** — conversion rate, no-show rate, lead-to-customer per webinar.
- **Platform integration** — Zoom/Meet/Teams meeting auto-creation, .ics invites, recording ingest.
- **Content loop** — Auto-transcribe `recording_url` → blog draft via `content-campaign-pipeline`.

## Contributing

Follow `mem://development/new-module-checklist`. Skills must pass `bun run lint:skills` (Agent Contract Integrity).
