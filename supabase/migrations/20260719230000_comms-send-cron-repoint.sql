-- Edge-surface refactor B2: eleven transactional-comms functions consolidated
-- into comms-send (dispatch on ?kind=). The standalone functions are deleted,
-- so any cron job still POSTing to their URLs would silently 404 on every tick
-- (pg_net reports success regardless — the exact silent-degradation class from
-- the 2026-07-17 cron-parser incident).
--
-- This self-heal repoints EXISTING cron.job rows. It touches only commands
-- that still reference an old URL, so it is idempotent and a no-op on
-- instances that never had the jobs (the current register_flowpilot_cron no
-- longer registers reminder jobs — a separate fresh-install gap, tracked in
-- the refactor notebook).
--
-- Forward-dated for managed-instance ledgers (Lovable skips backdated
-- migrations).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    UPDATE cron.job
       SET command = replace(command, '/functions/v1/send-booking-reminders', '/functions/v1/comms-send?kind=booking_reminders')
     WHERE command LIKE '%/functions/v1/send-booking-reminders%';

    UPDATE cron.job
       SET command = replace(command, '/functions/v1/send-calendar-reminders', '/functions/v1/comms-send?kind=calendar_reminders')
     WHERE command LIKE '%/functions/v1/send-calendar-reminders%';

    UPDATE cron.job
       SET command = replace(command, '/functions/v1/csat-dispatch', '/functions/v1/comms-send?kind=csat_dispatch')
     WHERE command LIKE '%/functions/v1/csat-dispatch%';

    -- Belt-and-braces: any other job that still points at a deleted comms
    -- function (none known, but the sweep is cheap and idempotent).
    UPDATE cron.job
       SET command = replace(replace(replace(command,
             '/functions/v1/send-webinar-reminders', '/functions/v1/comms-send?kind=webinar_reminders'),
             '/functions/v1/survey-send',            '/functions/v1/comms-send?kind=survey_send'),
             '/functions/v1/send-order-confirmation','/functions/v1/comms-send?kind=order_confirmation')
     WHERE command LIKE '%/functions/v1/send-webinar-reminders%'
        OR command LIKE '%/functions/v1/survey-send%'
        OR command LIKE '%/functions/v1/send-order-confirmation%';
  END IF;
END $$;
