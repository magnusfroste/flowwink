-- Edge-surface refactor B5: five FlowPilot lifecycle functions consolidated
-- into flowpilot-lifecycle (dispatch on ?task=), and cron-health folded into
-- instance-health (?check=cron). The standalone functions are deleted, so any
-- cron job still POSTing to their URLs would silently 404 on every tick while
-- pg_net reports success.
--
-- Live inventory 2026-07-19: flowpilot-learn is cron-scheduled on all three
-- fleet instances; flowpilot-followthrough on liteit. briefing and curator
-- have NO live cron jobs anywhere (a known fleet gap — they run via skills).
-- The jobnames stay unchanged ('flowpilot-learn' etc.) per the wire-name
-- policy — only the URL inside the command moves.
--
-- Idempotent (touches only commands still referencing an old URL) and
-- forward-dated for managed-instance ledgers.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    UPDATE cron.job
       SET command = replace(command, '/functions/v1/flowpilot-learn', '/functions/v1/flowpilot-lifecycle?task=learn')
     WHERE command LIKE '%/functions/v1/flowpilot-learn%';

    UPDATE cron.job
       SET command = replace(command, '/functions/v1/flowpilot-followthrough', '/functions/v1/flowpilot-lifecycle?task=followthrough')
     WHERE command LIKE '%/functions/v1/flowpilot-followthrough%';

    UPDATE cron.job
       SET command = replace(command, '/functions/v1/flowpilot-briefing', '/functions/v1/flowpilot-lifecycle?task=briefing')
     WHERE command LIKE '%/functions/v1/flowpilot-briefing%';

    UPDATE cron.job
       SET command = replace(command, '/functions/v1/flowpilot-distill', '/functions/v1/flowpilot-lifecycle?task=distill')
     WHERE command LIKE '%/functions/v1/flowpilot-distill%';

    UPDATE cron.job
       SET command = replace(command, '/functions/v1/skill-curator', '/functions/v1/flowpilot-lifecycle?task=curator')
     WHERE command LIKE '%/functions/v1/skill-curator%';

    UPDATE cron.job
       SET command = replace(command, '/functions/v1/cron-health', '/functions/v1/instance-health?check=cron')
     WHERE command LIKE '%/functions/v1/cron-health%';
  END IF;
END $$;
