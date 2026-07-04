-- Quote expiry reminder automation (docs/parity/capabilities/quotes.json: expiry_reminders).
--
-- 1) quotes.expiry_reminder_sent_at — idempotency guard so a quote is never
--    reminded twice.
-- 2) send_quote_expiry_reminders skill (edge:quote-expiry-reminders) — scans
--    status='sent' quotes with valid_until within the next 48h (or up to 3
--    days past, grace window) that have not been reminded yet, and emails
--    the customer via the existing send-quote-email -> email-send pipeline
--    (the same one the manual "Send Reminder" button in
--    useQuoteWorkflow.ts/useSendQuoteReminder already uses).
-- 3) "Quote Expiry Reminders" cron automation (agent_automations,
--    trigger_type=cron, executor=platform) — same registration pattern as
--    "Daily Briefing" (see 20260624225254_...sql) so automation-dispatcher
--    (already scheduled every minute, baseline) picks it up with no extra
--    pg_cron wiring and no human needs to click anything.
-- Idempotent: ADD COLUMN IF NOT EXISTS, ON CONFLICT DO UPDATE.

ALTER TABLE "public"."quotes"
  ADD COLUMN IF NOT EXISTS "expiry_reminder_sent_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "idx_quotes_expiry_reminder_pending"
  ON "public"."quotes" ("valid_until")
  WHERE "status" = 'sent' AND "expiry_reminder_sent_at" IS NULL;

INSERT INTO public.agent_skills (
  name, description, category, scope, handler, enabled, mcp_exposed, trust_level, origin, tool_definition, instructions
) VALUES (
  'send_quote_expiry_reminders',
  'Scan sent quotes whose valid_until is within the next 48 hours or up to 3 days past (grace window) and email the customer a reminder, reusing the existing quote reminder email pipeline (send-quote-email). Skips quotes already reminded (expiry_reminder_sent_at set) or not in status=sent. Use when: running the periodic quote-expiry sweep (cron). NOT for: sending an ad-hoc reminder for a single quote (use the quote''s Send Reminder action / manage_quote) or invoice dunning (use dunning-processor).',
  'commerce',
  'internal',
  'edge:quote-expiry-reminders',
  true,
  true,
  'auto',
  'bundled',
  '{"type":"function","function":{"name":"send_quote_expiry_reminders","description":"Send expiry reminder emails for quotes nearing or just past their valid_until date","parameters":{"type":"object","properties":{}}}}'::jsonb,
  'Runs as a scheduled sweep, no arguments needed. Finds quotes with status=''sent'', valid_until within [now-3d, now+48h], and expiry_reminder_sent_at IS NULL. Sends one reminder email per quote via send-quote-email (reminder=true) and stamps expiry_reminder_sent_at so it is never sent twice.'
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
  'Quote Expiry Reminders',
  'Platform automation. Emails a reminder for sent quotes expiring within 48h (or up to 3 days past) every 6 hours.',
  'cron',
  '{"cron":"0 */6 * * *","expression":"0 */6 * * *","timezone":"UTC"}'::jsonb,
  s.id,
  'send_quote_expiry_reminders',
  '{}'::jsonb,
  true,
  'platform'
FROM public.agent_skills s
WHERE s.name = 'send_quote_expiry_reminders'
  AND NOT EXISTS (
    SELECT 1 FROM public.agent_automations WHERE name = 'Quote Expiry Reminders'
  );

UPDATE public.agent_automations
SET
  trigger_type = 'cron',
  trigger_config = '{"cron":"0 */6 * * *","expression":"0 */6 * * *","timezone":"UTC"}'::jsonb,
  skill_name = 'send_quote_expiry_reminders',
  skill_id = (SELECT id FROM public.agent_skills WHERE name = 'send_quote_expiry_reminders'),
  executor = 'platform',
  enabled = true,
  updated_at = now()
WHERE name = 'Quote Expiry Reminders';

NOTIFY pgrst, 'reload schema';
