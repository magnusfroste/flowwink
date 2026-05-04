---
name: Webinar Reminders & Content Loop
description: Sprint 5 — webinar_reminder_tick cron emits 4 reminder events; ai-task generate_blog_from_webinar inserts blog draft from completed webinar
type: feature
---

## Reminder events (15-min cron)
`webinar_reminder_tick()` emits, deduped per registration via marker columns:
- `webinar.reminder.confirm` — right after registration
- `webinar.reminder.t24` — 23–25h before start
- `webinar.reminder.t1` — 40–90 min before start
- `webinar.reminder.post` — 30 min after end (`variant: thanks|missed_you`)

Markers: `reminder_confirm_sent_at`, `reminder_t24_sent_at`, `reminder_t1_sent_at`, `reminder_post_sent_at` on `webinar_registrations`.

Cron: `webinar-reminder-tick-15min`. Email delivery is wired by automations subscribing to these events — function emits only.

## Content loop
`ai-task` task `generate_blog_from_webinar` (tier=reasoning):
- Loads webinar metadata
- Optional `source_text` (transcript/notes)
- Tool-output: `{title, slug, excerpt, body_markdown, tags}`
- `apply()` inserts `blog_posts` row as `status='draft'`, `source='webinar'`, `source_id=<webinar.id>`

MCP-skill `generate_blog_from_webinar` (handler `edge:ai-task`, scope internal, trust notify) registered in webinars module v1.2.0.

## MCP composite groups expanded
mcp-server `COMPOSITE_GROUPS` now includes `support`, `success`, `finance` (in addition to existing `marketing`, `sales`, `operations`). Sales also picks up `commerce`. External claws can request `?groups=support` etc.
