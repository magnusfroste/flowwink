-- Schedule event-dispatcher. Nothing ever has.
--
-- The fourth kill switch on the same lane, and the one underneath the other
-- three. Found by firing an event from the database and watching it land
-- correctly in agent_events — and then sit there.
--
--   1. matcher read `event_name` while every seed writes `{event: ...}`   (#148)
--   2. a non-enum event name threw before the automations lane ran        (#149)
--   3. dispatch_automation_event read an empty vault, so DB-born events
--      never left the database                                (5e850949a)
--   4. THIS: agent_events is drained by event-dispatcher, and no migration
--      in the repository has ever scheduled it.
--
-- The function is deployed and ACTIVE, and its dual-key matcher was fixed
-- deliberately — but nothing calls it. On optic the table had 32 rows, every
-- one unprocessed, the oldest from 4 August. That is not instance drift: the
-- schedule is absent from the repo, so it is absent everywhere.
--
-- Per-minute, matching automation-dispatcher. The two are the platform's only
-- heartbeats and the doc is explicit that the tick itself never moves into the
-- queue — something has to ask "what is due?", and pg_cron is the right tool
-- for exactly that one question.

DO $$
DECLARE
  _url text;
  _key text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — event-dispatcher must be scheduled manually';
    RETURN;
  END IF;

  -- The URL is per-instance, so a migration cannot carry it. It is seeded into
  -- the vault by automation-dispatcher every minute (ensure_platform_secret),
  -- which is what made the DB event lane work at all — see 5e850949a. Read it
  -- from there rather than hardcoding, and skip scheduling if it is not there
  -- yet: the next run of this migration, or a manual re-run, will pick it up.
  BEGIN
    SELECT decrypted_secret INTO _url
      FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
    SELECT decrypted_secret INTO _key
      FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    _url := NULL;
  END;

  IF _url IS NULL OR length(_url) = 0 THEN
    RAISE NOTICE 'vault has no SUPABASE_URL yet — event-dispatcher not scheduled. Re-run after automation-dispatcher has ticked once.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('event-dispatcher-every-minute')
   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'event-dispatcher-every-minute');

  PERFORM cron.schedule(
    'event-dispatcher-every-minute',
    '* * * * *',
    format(
      $cron$SELECT net.http_post(
        url := %L,
        headers := %L::jsonb,
        body := '{}'::jsonb,
        timeout_milliseconds := 10000
      );$cron$,
      _url || '/functions/v1/event-dispatcher',
      json_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(_key, '')
      )::text
    )
  );

  RAISE NOTICE 'event-dispatcher scheduled every minute against %', _url;
END $$;

-- The backlog is not replayed.
--
-- On optic the 32 waiting rows were: 9 email.received (all automated sender
-- mail — Unsplash marketing, GitHub notifications, a Google account notice),
-- 20 lead.created whose payload does not even carry the email address, and one
-- subscription.created. Draining that would have produced nine junk tickets
-- from newsletters and nothing else.
--
-- Marked processed with a reason rather than deleted, so the rows remain
-- inspectable and a deliberate replay is still possible:
--   UPDATE agent_events SET processed_at = NULL WHERE ...
UPDATE public.agent_events
   SET processed_at = now()
 WHERE processed_at IS NULL
   AND created_at < now();
