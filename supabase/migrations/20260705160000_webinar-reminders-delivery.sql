-- Webinar reminder DELIVERY (docs/parity/capabilities/webinars.json: reminders).
--
-- The schema shipped long ago (webinar_registrations.reminder_confirm/t24/t1/
-- post_sent_at) and webinar_reminder_tick() emits webinar.reminder.* platform
-- events — but nothing ever CALLED the tick and nothing turned the events into
-- emails, so no attendee ever received a reminder ("in schema, not wired").
--
-- This wires the operational path, mirroring the proven Quote Expiry Reminders
-- pattern (20260703130500):
--  1) send_webinar_reminders skill (edge:send-webinar-reminders) — the edge
--     sweep queries the same four windows (confirm / T-24h / T-1h / post with
--     attended-vs-missed variants), emails via the email-send pipeline, and
--     stamps the marker columns (idempotent per registration + reminder kind).
--  2) "Webinar Reminders" cron automation (agent_automations, trigger_type=
--     cron, executor=platform, every 15 min) — picked up by the existing
--     automation-dispatcher; no new pg_cron wiring.
-- webinar_reminder_tick() remains as the event-emitting alternative; both
-- paths dedupe on the same marker columns so they can coexist.
-- Idempotent: ON CONFLICT DO UPDATE / WHERE NOT EXISTS.

INSERT INTO public.agent_skills (
  name, description, category, scope, handler, enabled, mcp_exposed, trust_level, origin, tool_definition, instructions
) VALUES (
  'send_webinar_reminders',
  'Sweep webinar registrations and send the due reminder emails: registration confirmation, T-24h, T-1h, and post-webinar follow-up (thanks vs missed-you, with recording link when set). Each reminder is sent at most once per registration (marker columns). Use when: running the periodic webinar-reminder sweep (cron). NOT for: registering attendees (register_webinar) or the webinar lifecycle (publish/start/complete_webinar).',
  'communication',
  'internal',
  'edge:send-webinar-reminders',
  true,
  true,
  'auto',
  'bundled',
  '{"type":"function","function":{"name":"send_webinar_reminders","description":"Send due webinar reminder emails (confirm, T-24h, T-1h, post) and stamp the per-registration markers","parameters":{"type":"object","properties":{}}}}'::jsonb,
  'Runs as a scheduled sweep, no arguments needed. Four reminder kinds, each deduped via its marker column on webinar_registrations: confirm (any unconfirmed registration on a non-cancelled webinar), t24 (webinar starts in 23-25h), t1 (starts in 40-90 min), post (completed webinar, 30+ min after end; variant thanks/missed_you based on attended, includes recording_url when set). Emails go through the email-send pipeline; results are returned per kind as {sent, skipped} plus per-registration errors.'
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  handler = EXCLUDED.handler,
  tool_definition = EXCLUDED.tool_definition,
  instructions = EXCLUDED.instructions,
  enabled = true,
  mcp_exposed = true,
  updated_at = now();

INSERT INTO public.agent_automations (
  name, description, trigger_type, trigger_config,
  skill_id, skill_name, skill_arguments, enabled, executor
)
SELECT
  'Webinar Reminders',
  'Platform automation. Sends due webinar reminder emails (confirmation, T-24h, T-1h, post-webinar follow-up) every 15 minutes.',
  'cron',
  '{"cron":"*/15 * * * *","expression":"*/15 * * * *","timezone":"UTC"}'::jsonb,
  s.id,
  'send_webinar_reminders',
  '{}'::jsonb,
  true,
  'platform'
FROM public.agent_skills s
WHERE s.name = 'send_webinar_reminders'
  AND NOT EXISTS (
    SELECT 1 FROM public.agent_automations a WHERE a.name = 'Webinar Reminders'
  );
