-- Pulsen får en ratt.
--
-- Autoversio, liteit och optic kör på Supabases minsta beräkningsnivå. Där är
-- det inte funktionerna som är dyra, det är pulsen: tre jobb fyrar varje
-- minut, två av dem gör ett HTTP-hopp (pg_net → kallstart av en edge-funktion)
-- även när kön är tom, och allt fyrar på :00. Senaste timmen på autoversio:
-- 220 körningar, 117 timeoutade på "job startup" — mer än hälften av alla
-- ticks hann inte ens börja. En instans som är "en webb med lite redovisning"
-- betalar för en reaktionstid på en minut som ingen efterfrågat.
--
-- Två lager, EN ratt:
--
--   1. VAKTAD PULS (oberoende av läge). pulse_lane() frågar databasen om det
--      finns något att göra — obehandlade händelser, förfallna automationer,
--      en tom vault, kö i indexet, ett nyhetsbrev som är dags — och gör
--      HTTP-hoppet bara då. En billig SELECT ersätter en kallstart.
--
--   2. PERFORMANCE MODE. cron_cadence säger vad varje jobb fyrar i low,
--      balanced och high; apply_performance_mode() är enda skrivaren av
--      scheman och läser läget ur site_settings.performance_mode. Nya
--      instanser föds LOW; instanser som redan har sin puls behåller den
--      (balanced) tills en admin vrider. Offseten sprids så att inte alla
--      jobb fyrar samtidigt.
--
-- Registrarerna (register_flowpilot_cron, register_knowledge_indexer_cron)
-- schemalägger nu i pulsform och tillämpar läget efter sig, så en bootstrap
-- ger rätt takt utan att någon behöver minnas ratten. Idempotent: allt är
-- CREATE OR REPLACE / IF NOT EXISTS / ON CONFLICT.

-- ─── 0. Arbetsflöden får en next_run_at, så vakten kan se om de är dags ──────
ALTER TABLE public.agent_workflows
  ADD COLUMN IF NOT EXISTS next_run_at timestamptz;
COMMENT ON COLUMN public.agent_workflows.next_run_at IS
  'Written by automation-dispatcher from the cron expression; NULL = not yet computed (counts as due so the first tick computes it).';

-- ─── 1. Vakten: finns det arbete i banan? ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lane_has_work(p_lane text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v boolean := false;
  v_vault_missing boolean := false;
BEGIN
  IF p_lane = 'event' THEN
    RETURN EXISTS (SELECT 1 FROM public.agent_events WHERE processed_at IS NULL);

  ELSIF p_lane = 'automation' THEN
    -- Samma tre frågor dispatchern själv ställer, plus vaultens födelsevillkor
    -- (ensure_platform_secret körs av dispatchern; utan URL i vaulten måste
    -- den få köra).
    IF to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
      EXECUTE 'SELECT NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = $1)'
        INTO v_vault_missing USING 'SUPABASE_URL';
    END IF;
    IF v_vault_missing THEN RETURN true; END IF;

    IF EXISTS (SELECT 1 FROM public.agent_automations
               WHERE enabled AND trigger_type = 'cron'
                 AND (next_run_at IS NULL OR next_run_at <= now())) THEN
      RETURN true;
    END IF;
    IF EXISTS (SELECT 1 FROM public.agent_workflows
               WHERE enabled AND trigger_type = 'cron'
                 AND (next_run_at IS NULL OR next_run_at <= now())) THEN
      RETURN true;
    END IF;
    IF to_regclass('public.agent_tasks') IS NOT NULL THEN
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.agent_tasks WHERE status = $1 AND due_at <= now())'
        INTO v USING 'pending';
    END IF;
    RETURN v;

  ELSIF p_lane = 'indexer' THEN
    IF EXISTS (SELECT 1 FROM public.knowledge_index_queue WHERE attempts < 5) THEN RETURN true; END IF;
    IF EXISTS (SELECT 1 FROM public.knowledge_chunks WHERE embedding IS NULL AND embedding_attempts < 5) THEN RETURN true; END IF;
    RETURN EXISTS (
      SELECT 1 FROM public.documents
      WHERE (extraction_status = 'pending' AND file_url IS NOT NULL)
         OR (extraction_status = 'processing' AND updated_at < now() - interval '10 minutes')
    );

  ELSIF p_lane = 'newsletter' THEN
    RETURN EXISTS (SELECT 1 FROM public.newsletters WHERE status = 'scheduled' AND scheduled_at <= now());
  END IF;

  -- Okänd bana: hellre en onödig puls än en tyst kö.
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.lane_has_work(text) FROM PUBLIC, anon, authenticated;

-- ─── 2. Pulsen: HTTP-hoppet bara när banan har arbete ────────────────────────
CREATE OR REPLACE FUNCTION public.pulse_lane(
  p_lane text,
  p_url text,
  p_headers jsonb,
  p_body jsonb DEFAULT '{"source":"pg_cron"}'::jsonb,
  p_timeout_ms integer DEFAULT 10000
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'extensions'
AS $function$
BEGIN
  IF NOT public.lane_has_work(p_lane) THEN
    RETURN NULL; -- skipped: nothing to do, no cold start
  END IF;
  RETURN net.http_post(url := p_url, headers := p_headers, body := p_body, timeout_milliseconds := p_timeout_ms);
END;
$function$;
REVOKE ALL ON FUNCTION public.pulse_lane(text, text, jsonb, jsonb, integer) FROM PUBLIC, anon, authenticated;

-- Slår om ett redan schemalagt net.http_post-jobb till pulsform. Läser URL och
-- headers ur kommandot som står där (instansens egen identitet), skriver
-- aldrig in något nytt.
CREATE OR REPLACE FUNCTION public.pulse_wrap_job(p_jobname text, p_lane text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'extensions'
AS $function$
DECLARE
  v_id bigint;
  v_cmd text;
  v_url text;
  v_headers text;
  v_timeout text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN RETURN 'pg_cron_missing'; END IF;
  SELECT jobid, command INTO v_id, v_cmd FROM cron.job WHERE jobname = p_jobname;
  IF NOT FOUND THEN RETURN 'missing'; END IF;
  IF v_cmd LIKE '%pulse_lane(%' THEN RETURN 'already'; END IF;
  v_url     := substring(v_cmd from 'url := ''([^'']+)''');
  v_headers := substring(v_cmd from 'headers := ''([^'']+)''::jsonb');
  v_timeout := substring(v_cmd from 'timeout_milliseconds := (\d+)');
  IF v_url IS NULL OR v_headers IS NULL THEN RETURN 'unrecognized'; END IF;
  PERFORM cron.alter_job(
    v_id,
    command := format(
      'SELECT public.pulse_lane(%L, %L, %L::jsonb, ''{"source":"pg_cron"}''::jsonb, %s) AS request_id;',
      p_lane, v_url, v_headers, coalesce(v_timeout::int, 10000)
    )
  );
  RETURN 'wrapped';
END;
$function$;
REVOKE ALL ON FUNCTION public.pulse_wrap_job(text, text) FROM PUBLIC, anon, authenticated;

-- ─── 3. Takten per läge ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cron_cadence (
  jobname   text PRIMARY KEY,
  low       text NOT NULL,
  balanced  text NOT NULL,
  high      text NOT NULL,
  note      text
);
COMMENT ON TABLE public.cron_cadence IS
  'What each platform job fires in low / balanced / high performance mode. apply_performance_mode() is the only writer of cron schedules.';
REVOKE ALL ON TABLE public.cron_cadence FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.cron_cadence TO authenticated, service_role;

INSERT INTO public.cron_cadence (jobname, low, balanced, high, note) VALUES
  ('event-dispatcher-every-minute',      '1-59/5 * * * *',  '* * * * *',   '* * * * *',   'Drains agent_events; pulses only when something is unprocessed.'),
  ('automation-dispatcher-every-minute', '3-59/5 * * * *',  '* * * * *',   '* * * * *',   'Runs due automations/workflows/tasks; pulses only when something is due.'),
  ('voice-calls-sweep-stale',            '2-59/5 * * * *',  '* * * * *',   '* * * * *',   'SQL only; marks abandoned calls.'),
  ('knowledge-indexer',                  '7-59/15 * * * *', '*/5 * * * *', '*/2 * * * *', 'Chunks, embeds, extracts; pulses only when the queue has rows.'),
  ('newsletter-dispatch-scheduled',      '4-59/15 * * * *', '*/5 * * * *', '*/5 * * * *', 'Pulses only when a newsletter is scheduled and due.'),
  ('gmail-reconcile',                    '6-59/15 * * * *', '*/5 * * * *', '*/5 * * * *', 'Already skips itself when no mailbox is connected.'),
  ('publish-scheduled-pages',            '8-59/15 * * * *', '*/5 * * * *', '*/5 * * * *', 'SQL only.'),
  ('flowpilot-heartbeat',                '0 6 * * *',       '0 0,12 * * *', '0 */6 * * *', 'The autonomous loop; the expensive one.')
ON CONFLICT (jobname) DO UPDATE
  SET low = EXCLUDED.low, balanced = EXCLUDED.balanced, high = EXCLUDED.high, note = EXCLUDED.note;

-- ─── 4. Ratten ───────────────────────────────────────────────────────────────
-- Vem får vrida: service_role (gatewayn, edge), admin (UI), eller en direkt
-- databassession (migration, psql, cron-ägaren). session_user — inte
-- current_user — eftersom SECURITY DEFINER gör current_user till ägaren.
CREATE OR REPLACE FUNCTION public.apply_performance_mode(p_mode text DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'extensions'
AS $function$
DECLARE
  v_stored  text;
  v_mode    text;
  v_changed jsonb := '[]'::jsonb;
  v_missing jsonb := '[]'::jsonb;
  r record;
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR public.has_role(auth.uid(), 'admin'::app_role)
          OR session_user IN ('postgres', 'supabase_admin')) THEN
    RAISE EXCEPTION 'unauthorized: performance mode requires admin or service role';
  END IF;

  SELECT value->>'mode' INTO v_stored FROM public.site_settings WHERE key = 'performance_mode';
  v_mode := coalesce(nullif(trim(p_mode), ''), v_stored, 'low');
  IF v_mode NOT IN ('low', 'balanced', 'high') THEN
    RAISE EXCEPTION 'performance mode must be low, balanced or high (got %)', v_mode;
  END IF;

  IF p_mode IS NOT NULL OR v_stored IS NULL THEN
    INSERT INTO public.site_settings (key, value, updated_by)
    VALUES ('performance_mode',
            jsonb_build_object('mode', v_mode, 'applied_at', now(), 'reason', p_reason),
            auth.uid())
    ON CONFLICT (key) DO UPDATE
      SET value = public.site_settings.value
                  || jsonb_build_object('mode', v_mode, 'applied_at', now(), 'reason', p_reason),
          updated_at = now(),
          updated_by = auth.uid();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN jsonb_build_object('mode', v_mode, 'cron_available', false, 'changed', v_changed);
  END IF;

  FOR r IN
    SELECT c.jobname,
           CASE v_mode WHEN 'low' THEN c.low WHEN 'high' THEN c.high ELSE c.balanced END AS target,
           j.jobid, j.schedule
      FROM public.cron_cadence c
      LEFT JOIN cron.job j ON j.jobname = c.jobname
  LOOP
    IF r.jobid IS NULL THEN
      v_missing := v_missing || to_jsonb(r.jobname);
    ELSIF r.schedule IS DISTINCT FROM r.target THEN
      PERFORM cron.alter_job(r.jobid, schedule := r.target);
      v_changed := v_changed || jsonb_build_object('job', r.jobname, 'from', r.schedule, 'to', r.target);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('mode', v_mode, 'cron_available', true, 'changed', v_changed, 'not_scheduled_yet', v_missing);
END;
$function$;
REVOKE ALL ON FUNCTION public.apply_performance_mode(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_performance_mode(text, text) TO authenticated, service_role;

-- Avläsningen: läget, vad det betyder, och pg_crons egen evidens senaste timmen.
CREATE OR REPLACE FUNCTION public.performance_mode_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'extensions'
AS $function$
DECLARE
  v_setting jsonb;
  v_mode text;
  v_runs int := 0;
  v_failed int := 0;
  v_startup_timeouts int := 0;
  v_jobs jsonb := '[]'::jsonb;
  v_cron boolean;
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR public.has_role(auth.uid(), 'admin'::app_role)
          OR session_user IN ('postgres', 'supabase_admin')) THEN
    RAISE EXCEPTION 'unauthorized: performance mode status requires admin or service role';
  END IF;

  SELECT value INTO v_setting FROM public.site_settings WHERE key = 'performance_mode';
  v_mode := coalesce(v_setting->>'mode', 'low');
  v_cron := EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron');

  IF v_cron THEN
    SELECT count(*),
           count(*) FILTER (WHERE status <> 'succeeded'),
           count(*) FILTER (WHERE return_message ILIKE '%timeout%')
      INTO v_runs, v_failed, v_startup_timeouts
      FROM cron.job_run_details
     WHERE start_time > now() - interval '1 hour';

    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'jobname', c.jobname,
             'schedule', j.schedule,
             'expected', CASE v_mode WHEN 'low' THEN c.low WHEN 'high' THEN c.high ELSE c.balanced END,
             'active', j.active,
             'scheduled', j.jobid IS NOT NULL,
             'pulsed', coalesce(j.command LIKE '%pulse_lane(%', false),
             'note', c.note
           ) ORDER BY c.jobname), '[]'::jsonb)
      INTO v_jobs
      FROM public.cron_cadence c
      LEFT JOIN cron.job j ON j.jobname = c.jobname;
  END IF;

  RETURN jsonb_build_object(
    'mode', v_mode,
    'applied_at', v_setting->>'applied_at',
    'reason', v_setting->>'reason',
    'cron_available', v_cron,
    'runs_last_hour', v_runs,
    'failed_last_hour', v_failed,
    'startup_timeouts_last_hour', v_startup_timeouts,
    'jobs', v_jobs,
    'cadence', (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.jobname), '[]'::jsonb) FROM public.cron_cadence c)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.performance_mode_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.performance_mode_status() TO authenticated, service_role;

-- ─── 5. Registrarerna schemalägger i pulsform och tillämpar läget ────────────
-- register_flowpilot_cron: kroppen från 20260822200000 (block 1–7 + städning),
-- med block 2 och 7 i pulsform, en uppgradering av redan registrerade jobb,
-- och läget tillämpat sist. Jobbnamnen är oförändrade — guardrailen
-- cron-jobs-have-a-runtime-registrar kräver att inget namn försvinner.
CREATE OR REPLACE FUNCTION public.register_flowpilot_cron(p_supabase_url text, p_anon_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'extensions'
AS $function$
DECLARE
  result jsonb := '{}'::jsonb;
  job_exists boolean;
  auth_header text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'unauthorized: cron scheduling requires admin or service role';
  END IF;

  auth_header := json_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || p_anon_key
  )::text;

  -- 1. Heartbeat (every 12h in balanced; the mode below may retune it)
  SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'flowpilot-heartbeat') INTO job_exists;
  IF NOT job_exists THEN
    PERFORM cron.schedule(
      'flowpilot-heartbeat',
      '0 0,12 * * *',
      format(
        'SELECT net.http_post(url := %L, headers := %L::jsonb, body := concat(''{"time":"'', now(), ''"}'')::jsonb) AS request_id;',
        p_supabase_url || '/functions/v1/flowpilot-heartbeat',
        auth_header
      )
    );
    result := result || '{"heartbeat": "registered"}'::jsonb;
  ELSE
    result := result || '{"heartbeat": "already_exists"}'::jsonb;
  END IF;

  -- 2. Automation dispatcher — pulsed: the HTTP hop only when something is due.
  SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'automation-dispatcher-every-minute') INTO job_exists;
  IF NOT job_exists THEN
    PERFORM cron.schedule(
      'automation-dispatcher-every-minute',
      '* * * * *',
      format(
        'SELECT public.pulse_lane(%L, %L, %L::jsonb, ''{"source":"pg_cron"}''::jsonb, %s) AS request_id;',
        'automation',
        p_supabase_url || '/functions/v1/automation-dispatcher',
        auth_header,
        10000
      )
    );
    result := result || '{"automation_dispatcher": "registered"}'::jsonb;
  ELSE
    result := result || jsonb_build_object('automation_dispatcher', public.pulse_wrap_job('automation-dispatcher-every-minute', 'automation'));
  END IF;

  -- 3. Publish scheduled pages (every 5 minutes). The logic is the DB function
  --    public.publish_scheduled_pages() — call it directly. There is NO edge
  --    function by this name; the old HTTP wiring 404ed every 5 minutes.
  SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'publish-scheduled-pages') INTO job_exists;
  IF NOT job_exists THEN
    PERFORM cron.schedule(
      'publish-scheduled-pages',
      '*/5 * * * *',
      'SELECT public.publish_scheduled_pages();'
    );
    result := result || '{"publish_scheduled_pages": "registered"}'::jsonb;
  ELSE
    result := result || '{"publish_scheduled_pages": "already_exists"}'::jsonb;
  END IF;

  -- 4. FlowPilot learn (daily at 03:00)
  SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'flowpilot-learn') INTO job_exists;
  IF NOT job_exists THEN
    PERFORM cron.schedule(
      'flowpilot-learn',
      '0 3 * * *',
      format(
        'SELECT net.http_post(url := %L, headers := %L::jsonb, body := concat(''{"time":"'', now(), ''"}'')::jsonb) AS request_id;',
        p_supabase_url || '/functions/v1/flowpilot-learn',
        auth_header
      )
    );
    result := result || '{"flowpilot_learn": "registered"}'::jsonb;
  ELSE
    result := result || '{"flowpilot_learn": "already_exists"}'::jsonb;
  END IF;

  -- 5. Daily briefing (daily at 07:00)
  SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'flowpilot-daily-briefing') INTO job_exists;
  IF NOT job_exists THEN
    PERFORM cron.schedule(
      'flowpilot-daily-briefing',
      '0 7 * * *',
      format(
        'SELECT net.http_post(url := %L, headers := %L::jsonb, body := ''{"source": "cron"}''::jsonb) AS request_id;',
        p_supabase_url || '/functions/v1/flowpilot-briefing',
        auth_header
      )
    );
    result := result || '{"daily_briefing": "registered"}'::jsonb;
  ELSE
    result := result || '{"daily_briefing": "already_exists"}'::jsonb;
  END IF;

  -- 6. Instance health check (every 6 hours)
  SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'instance-health-check') INTO job_exists;
  IF NOT job_exists THEN
    PERFORM cron.schedule(
      'instance-health-check',
      '0 */6 * * *',
      format(
        'SELECT net.http_post(url := %L, headers := %L::jsonb, body := ''{"source": "cron"}''::jsonb) AS request_id;',
        p_supabase_url || '/functions/v1/instance-health',
        auth_header
      )
    );
    result := result || '{"instance_health_check": "registered"}'::jsonb;
  ELSE
    result := result || '{"instance_health_check": "already_exists"}'::jsonb;
  END IF;

  -- 7. Event dispatcher — pulsed: drains agent_events only when a row is
  --    unprocessed. Migration 20260808130000 was the only scheduler and it
  --    bails on an empty vault, which is the state of every fresh install.
  SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'event-dispatcher-every-minute') INTO job_exists;
  IF NOT job_exists THEN
    PERFORM cron.schedule(
      'event-dispatcher-every-minute',
      '* * * * *',
      format(
        'SELECT public.pulse_lane(%L, %L, %L::jsonb, ''{"source":"pg_cron"}''::jsonb, %s) AS request_id;',
        'event',
        p_supabase_url || '/functions/v1/event-dispatcher',
        auth_header,
        10000
      )
    );
    result := result || '{"event_dispatcher": "registered"}'::jsonb;
  ELSE
    result := result || jsonb_build_object('event_dispatcher', public.pulse_wrap_job('event-dispatcher-every-minute', 'event'));
  END IF;

  -- Cleanup: remove duplicate heartbeat-12h if it exists
  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'flowpilot-heartbeat-12h') THEN
    PERFORM cron.unschedule('flowpilot-heartbeat-12h');
    result := result || '{"heartbeat_12h_duplicate": "removed"}'::jsonb;
  END IF;

  -- 8. The mode is the one dial for schedules: newly registered jobs were born
  --    at the balanced tick above; this retunes them to the instance's mode.
  result := result || jsonb_build_object('performance_mode', public.apply_performance_mode(NULL, 'register_flowpilot_cron'));

  RETURN result;
END;
$function$;

-- register_knowledge_indexer_cron: kroppen från 20260814145336 med
-- kommandona i pulsform (indexer + nyhetsbrev), uppgradering av redan
-- registrerade jobb, och läget tillämpat sist. knowledge-indexer anropar
-- den här på varje tick, så tillämpningen måste vara en no-op när scheman
-- redan stämmer — det är den (alter_job bara vid skillnad).
CREATE OR REPLACE FUNCTION public.register_knowledge_indexer_cron(p_supabase_url text, p_anon_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'extensions'
AS $function$
DECLARE
  v_own_host   text;
  v_headers    text;
  v_result     jsonb := '{}'::jsonb;
  v_command    text;
  r            record;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can register cron jobs';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN jsonb_build_object('status', 'pg_cron_missing');
  END IF;

  v_own_host := substring(p_supabase_url from '^https?://[^/]+');
  IF v_own_host IS NULL THEN
    RAISE EXCEPTION 'p_supabase_url does not look like a URL: %', p_supabase_url;
  END IF;

  v_headers := json_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || p_anon_key
  )::text;

  FOR r IN SELECT * FROM (VALUES
    ('knowledge-indexer',             '*/5 * * * *', 'knowledge-indexer',             'indexer'),
    ('newsletter-dispatch-scheduled', '*/5 * * * *', 'newsletter/dispatch-scheduled', 'newsletter')
  ) AS t(jobname, schedule, fn_path, lane)
  LOOP
    v_command := format(
      'SELECT public.pulse_lane(%L, %L, %L::jsonb, ''{"source":"pg_cron"}''::jsonb, %s) AS request_id;',
      r.lane,
      p_supabase_url || '/functions/v1/' || r.fn_path,
      v_headers,
      10000
    );

    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = r.jobname) THEN
      PERFORM cron.schedule(r.jobname, r.schedule, v_command);
      v_result := v_result || jsonb_build_object(r.jobname, 'registered');
    ELSIF EXISTS (
      SELECT 1 FROM cron.job
      WHERE jobname = r.jobname
        AND substring(command from 'https?://[^/'']+') IS DISTINCT FROM v_own_host
    ) THEN
      PERFORM cron.alter_job(
        (SELECT jobid FROM cron.job WHERE jobname = r.jobname),
        command := v_command,
        active  := true
      );
      v_result := v_result || jsonb_build_object(r.jobname, 're-anchored');
    ELSE
      v_result := v_result || jsonb_build_object(r.jobname, public.pulse_wrap_job(r.jobname, r.lane));
    END IF;
  END LOOP;

  FOR r IN
    SELECT jobid, jobname
      FROM cron.job
     WHERE command LIKE '%/functions/v1/%'
       AND active
       AND jobname NOT IN ('knowledge-indexer', 'newsletter-dispatch-scheduled')
       AND substring(command from 'https?://[^/'']+') IS DISTINCT FROM v_own_host
  LOOP
    PERFORM cron.alter_job(r.jobid, active := false);
    RAISE NOTICE 'cron job % pointed at a foreign instance — deactivated (re-register it with this instance''s identity)', r.jobname;
    v_result := v_result || jsonb_build_object(r.jobname, 'deactivated_foreign_host');
  END LOOP;

  v_result := v_result || jsonb_build_object('performance_mode', public.apply_performance_mode(NULL, 'register_knowledge_indexer_cron'));

  RETURN v_result;
END;
$function$;

-- ─── 6. Den här instansen: vakta pulsen nu, och sätt startläget ─────────────
DO $$
DECLARE
  v_has_cron boolean;
  v_existing boolean := false;
  v_mode text;
BEGIN
  v_has_cron := EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron');

  IF v_has_cron THEN
    PERFORM public.pulse_wrap_job('event-dispatcher-every-minute', 'event');
    PERFORM public.pulse_wrap_job('automation-dispatcher-every-minute', 'automation');
    PERFORM public.pulse_wrap_job('knowledge-indexer', 'indexer');
    PERFORM public.pulse_wrap_job('newsletter-dispatch-scheduled', 'newsletter');
    -- "Existing" = the registrar has already run here. On a fresh install the
    -- registrar is a runtime call the browser makes AFTER migrations, so the
    -- job is absent and the instance is born low.
    v_existing := EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'automation-dispatcher-every-minute');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.site_settings WHERE key = 'performance_mode') THEN
    v_mode := CASE WHEN v_existing THEN 'balanced' ELSE 'low' END;
    INSERT INTO public.site_settings (key, value)
    VALUES ('performance_mode', jsonb_build_object(
      'mode', v_mode,
      'applied_at', now(),
      'reason', CASE WHEN v_existing THEN 'kept the pulse this instance already had' ELSE 'born low' END
    ));
  END IF;

  PERFORM public.apply_performance_mode(NULL, 'migration 20260906170000');
END $$;
