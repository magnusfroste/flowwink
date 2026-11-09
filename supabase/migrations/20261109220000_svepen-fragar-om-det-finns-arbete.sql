-- ============================================================================
-- A sweep asks whether there is work before anything wakes (2026-11-09).
--
-- Four automations fire every fifteen minutes on every instance — qualify new
-- leads, score visitor intent, webinar reminders, the social post scheduler —
-- and on most instances find nothing: www ran each ~6 900 times against empty
-- tables. Every tick was a dispatcher invocation plus an agent-execute
-- invocation (~380 a day per instance, ~11 500 a month of the Free tier's
-- 500 000), for a skill whose first line is "nothing to do".
--
-- The lane already asks before it pulses (lane_has_work, 2026-09-06): "is an
-- automation due?". A sweep that is ALWAYS due made that question worthless.
-- Now an automation may DECLARE its own probe:
--
--   trigger_config.work_probe = '<name>'  →  public.work_probe_<name>() boolean
--
-- Declared by the automation, never looked up by skill name (discover, don't
-- enumerate): a module ships its probe beside its sweep. No probe, an unknown
-- probe, or a probe that raises → there IS work (an unnecessary pulse beats a
-- silent queue). A probe must be a SUPERSET of what its skill would pick up.
--
--   automation_has_work(trigger_config)  — the one question, asked by the lane
--                                          and by the dispatcher.
--   note_idle_automations()              — a due, enabled, probed automation
--                                          with no work gets last_triggered_at
--                                          refreshed (at most every 5 minutes),
--                                          so "stale" readers see it alive. The
--                                          row stays due: the minute work
--                                          appears, the lane pulses.
--   lane_has_work('automation')          — counts a due automation only when
--                                          it has work.
--
-- Module off: the module switch already disables an off module's automations;
-- the dispatcher now also skips one whose skill's owning module is off.
-- ============================================================================

-- ── The probes: each a superset of its skill's own selection ────────────────

-- qualify_lead (sweep): leads with status 'lead' and no ai_qualified_at.
CREATE OR REPLACE FUNCTION public.work_probe_leads_to_qualify()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$ SELECT EXISTS (SELECT 1 FROM public.leads WHERE ai_qualified_at IS NULL AND status = 'lead') $$;

-- score_visitor_intent: visitors identified as a lead in the last 30 days.
CREATE OR REPLACE FUNCTION public.work_probe_visitor_intent()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$ SELECT EXISTS (SELECT 1 FROM public.visitor_identities
                     WHERE lead_id IS NOT NULL AND identified_at >= now() - interval '30 days') $$;

-- process_due_social_posts: scheduled posts whose time has come.
CREATE OR REPLACE FUNCTION public.work_probe_social_posts_due()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$ SELECT EXISTS (SELECT 1 FROM public.social_posts WHERE status = 'scheduled' AND scheduled_at <= now()) $$;

-- send_webinar_reminders: a registration still owed one of its four mails
-- (confirmation, T-24h, T-1h, post-event). Windows are the handler's, widened
-- by a tick so nothing falls between two sweeps.
CREATE OR REPLACE FUNCTION public.work_probe_webinar_reminders()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.webinar_registrations r
    JOIN public.webinars w ON w.id = r.webinar_id
    WHERE (r.reminder_confirm_sent_at IS NULL AND w.status IN ('draft', 'published', 'live') AND w.date >= now())
       OR (r.reminder_t24_sent_at IS NULL AND w.status IN ('published', 'live')
           AND w.date BETWEEN now() + interval '22 hours 30 minutes' AND now() + interval '25 hours 30 minutes')
       OR (r.reminder_t1_sent_at IS NULL AND w.status IN ('published', 'live')
           AND w.date BETWEEN now() + interval '20 minutes' AND now() + interval '110 minutes')
       OR (r.reminder_post_sent_at IS NULL AND w.status = 'completed'
           AND w.date BETWEEN now() - interval '7 days' AND now())
  )
$$;

-- The lane and the dispatcher ask as the owner / the service role; no browser does.
REVOKE ALL ON FUNCTION public.work_probe_leads_to_qualify() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.work_probe_leads_to_qualify() TO service_role;
REVOKE ALL ON FUNCTION public.work_probe_visitor_intent() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.work_probe_visitor_intent() TO service_role;
REVOKE ALL ON FUNCTION public.work_probe_social_posts_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.work_probe_social_posts_due() TO service_role;
REVOKE ALL ON FUNCTION public.work_probe_webinar_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.work_probe_webinar_reminders() TO service_role;

-- ── The one question ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.automation_has_work(p_trigger_config jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE
  v_probe text := nullif(trim(coalesce(p_trigger_config->>'work_probe', '')), '');
  v_fn regprocedure;
  v boolean;
BEGIN
  IF v_probe IS NULL THEN RETURN true; END IF;          -- no probe declared: always work
  IF v_probe !~ '^[a-z][a-z0-9_]{1,50}$' THEN RETURN true; END IF;
  v_fn := to_regprocedure(format('public.work_probe_%s()', v_probe));
  IF v_fn IS NULL THEN RETURN true; END IF;              -- unknown probe: always work
  BEGIN
    EXECUTE format('SELECT public.%I()', 'work_probe_' || v_probe) INTO v;
  EXCEPTION WHEN OTHERS THEN
    RETURN true;                                          -- a broken probe never silences its sweep
  END;
  RETURN coalesce(v, true);
END;
$$;
REVOKE ALL ON FUNCTION public.automation_has_work(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.automation_has_work(jsonb) TO service_role;
COMMENT ON FUNCTION public.automation_has_work(jsonb) IS
  'Does this automation have work? Reads trigger_config.work_probe and asks public.work_probe_<name>(). No probe, unknown probe or a probe that raises = true.';

-- ── Idle is not stale ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.note_idle_automations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE v integer;
BEGIN
  UPDATE public.agent_automations a
  SET last_triggered_at = now()
  WHERE a.enabled AND a.trigger_type = 'cron'
    AND a.next_run_at IS NOT NULL AND a.next_run_at <= now()
    AND a.trigger_config ? 'work_probe'
    AND (a.last_triggered_at IS NULL OR a.last_triggered_at < now() - interval '5 minutes')
    AND NOT public.automation_has_work(a.trigger_config);
  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.note_idle_automations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.note_idle_automations() TO service_role;

-- ── The lane: a due automation counts only when it has work ─────────────────
-- Body is 20260906200000's with one changed condition (the automations EXISTS).
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
    IF to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
      EXECUTE 'SELECT (SELECT count(*) FROM vault.decrypted_secrets WHERE name IN ($1, $2)) < 2'
        INTO v_vault_missing USING 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY';
    END IF;
    IF v_vault_missing THEN RETURN true; END IF;

    IF EXISTS (SELECT 1 FROM public.agent_automations a
               WHERE a.enabled AND a.trigger_type = 'cron'
                 AND (a.next_run_at IS NULL OR a.next_run_at <= now())
                 AND (a.next_run_at IS NULL OR public.automation_has_work(a.trigger_config))) THEN
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
GRANT EXECUTE ON FUNCTION public.lane_has_work(text) TO service_role;

-- ── The pulse: note the idle ones, then ask ──────────────────────────────────
-- Body is 20261109160000's plus the note.
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
  IF p_lane = 'automation' THEN
    BEGIN
      PERFORM public.note_idle_automations();
    EXCEPTION WHEN OTHERS THEN
      NULL; -- a marker that could not be written never stops the pulse
    END;
  END IF;
  IF NOT public.lane_has_work(p_lane) THEN
    RETURN NULL; -- skipped: nothing to do, no cold start
  END IF;
  RETURN net.http_post(url := p_url, headers := public.cron_secret_header(p_headers), body := p_body, timeout_milliseconds := p_timeout_ms);
END;
$function$;
REVOKE ALL ON FUNCTION public.pulse_lane(text, text, jsonb, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pulse_lane(text, text, jsonb, jsonb, integer) TO service_role;

-- ── Existing instances: the four sweeps declare their probe ─────────────────
-- Seeds are inserted by name and never updated (a retuned cron survives), so the
-- probe is added here — one key merged in, the schedule untouched, and only
-- where no probe is declared yet.
UPDATE public.agent_automations a
SET trigger_config = a.trigger_config || jsonb_build_object('work_probe', p.probe)
FROM (VALUES
  ('qualify_lead',             'leads_to_qualify'),
  ('score_visitor_intent',     'visitor_intent'),
  ('process_due_social_posts', 'social_posts_due'),
  ('send_webinar_reminders',   'webinar_reminders')
) AS p(skill, probe)
WHERE a.skill_name = p.skill
  AND a.trigger_type = 'cron'
  AND NOT (a.trigger_config ? 'work_probe')
  AND coalesce(a.skill_arguments, '{}'::jsonb) = '{}'::jsonb;  -- the sweep, not a targeted run
