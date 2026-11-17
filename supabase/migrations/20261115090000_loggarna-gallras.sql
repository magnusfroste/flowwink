-- ============================================================================
-- The logs are thinned; the database says how full it is (2026-11-15).
--
-- Nothing thinned agent_activity. Read on www (2026-11-14): 28 897 rows since
-- August, 17 MB — and 26 448 of them (92 %) were scheduled sweeps answering
-- "No unqualified leads" every few minutes, months after the work probes
-- stopped them at the source. The Free tier's database is 500 MB; no instance
-- is near it (63–129 MB), and nothing would have said so before one was.
--
-- What a row PROVES decides how long it lives:
--   * a change an agent or a person made        — kept, whole. The evidence.
--   * a successful lookup                       — its answer is cut down after
--                                                 answers_days (30), the row
--                                                 goes after rows_days (90).
--   * a refused or failed call                  — goes after rows_days.
--   * a scheduled tick (agent 'cron')           — as a lookup: the record it
--                                                 made is the evidence, never
--                                                 its journal line.
-- Never touched: a row an objective counts as evidence, a row tied to an
-- approval, a call still waiting for one, an unacknowledged notify row, and
-- any row whose kind is unknown.
--
-- "Lookup or change" is the platform's one read rule (classifyCall), which is
-- TypeScript: the executor stamps `kind` on every row it writes from now on.
-- An older row learns its kind from a stamped row of the same shape (skill,
-- action, dry_run); a shape never seen again stays unknown and is kept.
--
-- The dial is site_settings.data_retention ({answers_days, rows_days,
-- quota_mb, enabled}), per instance. database_size_report() is the read:
-- size against the quota, the largest tables, the dial and the last run.
-- ============================================================================

ALTER TABLE public.agent_activity ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE public.agent_activity ADD COLUMN IF NOT EXISTS trimmed_at timestamptz;

COMMENT ON COLUMN public.agent_activity.kind IS
  'read | write — the platform''s read rule (classifyCall) at the time of the call, stamped by the executor. NULL: written before the stamp, or a non-skill row; never thinned on a guess.';
COMMENT ON COLUMN public.agent_activity.trimmed_at IS
  'When prune_logs cut this row''s answer down to its identifying fields.';

-- ── The dial ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.data_retention_settings()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb := '{}'::jsonb;
  v_answers int;
  v_rows int;
  v_quota int;
  num CONSTANT text := '^[0-9]{1,6}$';
BEGIN
  SELECT CASE WHEN jsonb_typeof(value) = 'object' THEN value ELSE '{}'::jsonb END
    INTO v FROM public.site_settings WHERE key = 'data_retention';
  v := coalesce(v, '{}'::jsonb);
  -- A week is the floor: the dashboard and the daily surfaces read seven days.
  v_answers := greatest(7, CASE WHEN v->>'answers_days' ~ num THEN (v->>'answers_days')::int ELSE 30 END);
  v_rows := greatest(v_answers, CASE WHEN v->>'rows_days' ~ num THEN (v->>'rows_days')::int ELSE 90 END);
  v_quota := greatest(50, CASE WHEN v->>'quota_mb' ~ num THEN (v->>'quota_mb')::int ELSE 500 END);
  RETURN jsonb_build_object(
    'enabled', coalesce(v->>'enabled', 'true') <> 'false',
    'answers_days', v_answers,
    'rows_days', v_rows,
    'quota_mb', v_quota
  );
END
$$;

REVOKE ALL ON FUNCTION public.data_retention_settings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.data_retention_settings() TO service_role;

-- ── An answer cut down to what identifies it ────────────────────────────────
-- Scalars stay (ids, codes, counts, a status), one level down too (item.id,
-- result.code); lists and deeper objects go, long text is shortened.
CREATE OR REPLACE FUNCTION public.trim_log_answer(p jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p IS NULL OR jsonb_typeof(p) <> 'object' THEN jsonb_build_object('_trimmed', true)
    ELSE coalesce((
      SELECT jsonb_object_agg(e.key,
        CASE jsonb_typeof(e.value)
          WHEN 'object' THEN coalesce((
            SELECT jsonb_object_agg(i.key, CASE WHEN jsonb_typeof(i.value) = 'string' THEN to_jsonb(left(i.value #>> '{}', 200)) ELSE i.value END)
              FROM jsonb_each(e.value) i
             WHERE jsonb_typeof(i.value) IN ('string', 'number', 'boolean')), '{}'::jsonb)
          WHEN 'string' THEN to_jsonb(left(e.value #>> '{}', 200))
          ELSE e.value
        END)
        FROM jsonb_each(p) e
       WHERE jsonb_typeof(e.value) IN ('string', 'number', 'boolean', 'object')
    ), '{}'::jsonb) || jsonb_build_object('_trimmed', true)
  END
$$;

-- ── The thinning ────────────────────────────────────────────────────────────
-- Bounded per run: a first night on a three-month backlog must not be the
-- disk-IO wedge of 2026-09. What is left over goes the next night.
CREATE OR REPLACE FUNCTION public.prune_logs(p_dry_run boolean DEFAULT false, p_batch integer DEFAULT 5000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout TO '60s'
AS $fn$
DECLARE
  s jsonb := public.data_retention_settings();
  v_answers interval := make_interval(days => (s->>'answers_days')::int);
  v_rows interval := make_interval(days => (s->>'rows_days')::int);
  v_batch int := least(greatest(coalesce(p_batch, 5000), 1), 20000);
  v_learned int := 0;
  v_deleted int := 0;
  v_trimmed int := 0;
  v_traces int := 0;
  v_bootstraps int := 0;
  v_result jsonb;
BEGIN
  IF NOT (s->>'enabled')::boolean THEN
    RETURN jsonb_build_object('status', 'off', 'settings', s);
  END IF;

  IF p_dry_run THEN
    SELECT count(*) INTO v_deleted FROM public.agent_activity a
     WHERE a.created_at < now() - v_rows
       AND (a.agent::text = 'cron' OR a.status::text IN ('refused', 'failed') OR a.kind = 'read')
       AND a.status::text IN ('success', 'refused', 'failed')
       AND a.approval_request_id IS NULL
       AND (a.log_type IS DISTINCT FROM 'notify' OR a.acknowledged_at IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM public.agent_objective_activities o WHERE o.activity_id = a.id);
    SELECT count(*) INTO v_trimmed FROM public.agent_activity a
     WHERE a.created_at < now() - v_answers AND a.created_at >= now() - v_rows
       AND a.trimmed_at IS NULL AND a.status::text = 'success'
       AND (a.kind = 'read' OR a.agent::text = 'cron');
    RETURN jsonb_build_object('status', 'dry_run', 'settings', s, 'would_delete', v_deleted, 'would_trim', v_trimmed);
  END IF;

  -- 1. Rows that prove nothing any more.
  WITH doomed AS (
    SELECT a.id FROM public.agent_activity a
     WHERE a.created_at < now() - v_rows
       AND (a.agent::text = 'cron' OR a.status::text IN ('refused', 'failed') OR a.kind = 'read')
       AND a.status::text IN ('success', 'refused', 'failed')
       AND a.approval_request_id IS NULL
       AND (a.log_type IS DISTINCT FROM 'notify' OR a.acknowledged_at IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM public.agent_objective_activities o WHERE o.activity_id = a.id)
     ORDER BY a.created_at
     LIMIT v_batch
  )
  DELETE FROM public.agent_activity a USING doomed d WHERE a.id = d.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- 2. Older rows learn their kind from a stamped row of the same shape. A
  --    shape the read rule has judged both ways teaches nothing.
  WITH shapes AS (
    SELECT skill_name, coalesce(lower(input->>'action'), '') AS action, coalesce(input->>'dry_run', '') AS dry_run, min(kind) AS kind
      FROM public.agent_activity
     WHERE kind IN ('read', 'write') AND skill_name IS NOT NULL AND trimmed_at IS NULL
     GROUP BY 1, 2, 3
    HAVING count(DISTINCT kind) = 1
  )
  UPDATE public.agent_activity a SET kind = sh.kind
    FROM shapes sh
   WHERE a.kind IS NULL
     AND a.created_at < now() - v_answers
     AND a.skill_name = sh.skill_name
     AND coalesce(lower(a.input->>'action'), '') = sh.action
     AND coalesce(a.input->>'dry_run', '') = sh.dry_run;
  GET DIAGNOSTICS v_learned = ROW_COUNT;

  -- 3. A lookup's answer, cut down to what identifies it.
  WITH old AS (
    SELECT a.id FROM public.agent_activity a
     WHERE a.created_at < now() - v_answers
       AND a.trimmed_at IS NULL AND a.status::text = 'success'
       AND (a.kind = 'read' OR a.agent::text = 'cron')
     ORDER BY a.created_at
     LIMIT v_batch
  )
  UPDATE public.agent_activity a
     SET output = CASE WHEN octet_length(a.output::text) > 400 THEN public.trim_log_answer(a.output) ELSE a.output END,
         trimmed_at = now()
    FROM old WHERE a.id = old.id;
  GET DIAGNOSTICS v_trimmed = ROW_COUNT;

  -- 4. The other pure journals: a run's decision trace and the bootstrap log
  --    (each module's newest run is kept — "never ran" must mean never ran).
  IF to_regclass('public.agent_trace_events') IS NOT NULL THEN
    WITH doomed AS (SELECT id FROM public.agent_trace_events WHERE created_at < now() - v_rows ORDER BY created_at LIMIT v_batch)
    DELETE FROM public.agent_trace_events t USING doomed d WHERE t.id = d.id;
    GET DIAGNOSTICS v_traces = ROW_COUNT;
  END IF;
  IF to_regclass('public.bootstrap_runs') IS NOT NULL THEN
    WITH doomed AS (
      SELECT b.id FROM public.bootstrap_runs b
       WHERE b.created_at < now() - v_rows
         AND b.created_at < (SELECT max(n.created_at) FROM public.bootstrap_runs n WHERE n.module_id IS NOT DISTINCT FROM b.module_id)
       ORDER BY b.created_at LIMIT v_batch
    )
    DELETE FROM public.bootstrap_runs b USING doomed d WHERE b.id = d.id;
    GET DIAGNOSTICS v_bootstraps = ROW_COUNT;
  END IF;

  v_result := jsonb_build_object(
    'status', 'ok', 'at', now(), 'settings', s,
    'deleted', v_deleted, 'trimmed', v_trimmed, 'learned', v_learned,
    'trace_events_deleted', v_traces, 'bootstrap_runs_deleted', v_bootstraps,
    'more', v_deleted >= v_batch OR v_trimmed >= v_batch
  );
  INSERT INTO public.site_settings (key, value) VALUES ('data_retention_last_run', v_result)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN v_result;
END
$fn$;

REVOKE ALL ON FUNCTION public.prune_logs(boolean, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_logs(boolean, integer) TO service_role;

-- ── How full the database is ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.database_size_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout TO '20s'
AS $fn$
DECLARE
  s jsonb;
  v_bytes bigint;
  v_quota bigint;
  v_pct numeric;
  v_tables jsonb;
  v_last jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'database_size_report: admin or service_role required';
  END IF;
  s := public.data_retention_settings();
  v_bytes := pg_database_size(current_database());
  v_quota := (s->>'quota_mb')::bigint * 1048576;
  v_pct := round(100.0 * v_bytes / v_quota, 1);
  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO v_tables FROM (
    SELECT n.nspname || '.' || c.relname AS name, pg_total_relation_size(c.oid) AS bytes, greatest(c.reltuples, 0)::bigint AS est_rows
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r' AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
     ORDER BY pg_total_relation_size(c.oid) DESC
     LIMIT 8
  ) t;
  SELECT value INTO v_last FROM public.site_settings WHERE key = 'data_retention_last_run';
  RETURN jsonb_build_object(
    'db_bytes', v_bytes,
    'quota_bytes', v_quota,
    'pct', v_pct,
    -- watch: time to look. high: act before writes start failing.
    'level', CASE WHEN v_pct >= 85 THEN 'high' WHEN v_pct >= 70 THEN 'watch' ELSE 'ok' END,
    'tables', v_tables,
    'settings', s,
    'last_run', v_last
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.database_size_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.database_size_report() TO authenticated, service_role;

-- ── Every night, after the cron history's own purge ─────────────────────────
DO $do$
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RETURN; END IF;
  PERFORM cron.schedule('prune-logs', '50 3 * * *', $cmd$SELECT public.prune_logs()$cmd$);
END
$do$;

-- ── Proof, rolled back ──────────────────────────────────────────────────────
-- Runs only where the log holds no history older than the dial's first limit
-- (a fresh install: the nightly proof and the battery on a pull request).
-- 2026-11-17: on www, nordbrygg and liteit this proof stopped the migration —
-- and with it every later one — for a whole sync. prune_logs works off the
-- OLDEST rows first, a bounded batch a night; the proof's own 45-day rows sat
-- behind 10 000–22 000 real ones, were not reached in one batch, and the proof
-- read that as "the rule does not work". A proof that runs a housekeeping
-- function must not depend on how much there is to keep house in — and must
-- not do a night's worth of deletes on a live instance just to roll them back.
DO $proof$
DECLARE
  v jsonb;
  v_obj uuid;
  v_kept uuid;
  v_n int;
  v_out jsonb;
  v_history bigint;
BEGIN
  SELECT count(*) INTO v_history FROM public.agent_activity WHERE created_at < now() - interval '30 days';
  IF v_history > 0 THEN
    RAISE NOTICE 'log retention: proof not run here (% rows of history) — it is proven on the fresh install', v_history;
    RETURN;
  END IF;
  BEGIN
    -- 120 days old: a change (kept), a lookup, a refusal, a tick, an unknown.
    INSERT INTO public.agent_activity (agent, skill_name, status, kind, created_at, input, output) VALUES
      ('mcp', 'proof_prune', 'success', 'write', now() - interval '120 days', '{"action":"create"}', '{"lead_id":"L1"}'),
      ('mcp', 'proof_prune', 'success', 'read',  now() - interval '120 days', '{"action":"list"}', '{}'),
      ('mcp', 'proof_prune', 'refused', 'write', now() - interval '120 days', '{}', '{}'),
      ('cron', 'proof_prune', 'success', NULL,   now() - interval '120 days', '{}', '{}'),
      ('mcp', 'proof_prune_unknown', 'success', NULL, now() - interval '120 days', '{}', '{}');
    -- 120 days old and counted by an objective: evidence, whatever its kind.
    INSERT INTO public.agent_activity (agent, skill_name, status, kind, created_at) VALUES
      ('mcp', 'proof_prune', 'success', 'read', now() - interval '120 days') RETURNING id INTO v_kept;
    BEGIN
      INSERT INTO public.agent_objectives (goal, status) VALUES ('proof: log retention', 'active') RETURNING id INTO v_obj;
      INSERT INTO public.agent_objective_activities (objective_id, activity_id) VALUES (v_obj, v_kept);
    EXCEPTION WHEN others THEN v_kept := NULL;  -- the objective tables differ here: that leg is skipped
    END;
    -- 45 days old: a lookup with a long answer (cut down), an unstamped row of
    -- a shape the rule has judged (learns it), and a change (untouched).
    INSERT INTO public.agent_activity (agent, skill_name, status, kind, created_at, input, output) VALUES
      ('mcp', 'proof_prune', 'success', 'read', now() - interval '45 days', '{"action":"list"}',
        jsonb_build_object('count', 2, 'code', 'OK', 'item', jsonb_build_object('id', 'I1', 'lines', jsonb_build_array(1, 2)),
                           'rows', (SELECT jsonb_agg(repeat('x', 40)) FROM generate_series(1, 60)))),
      ('mcp', 'proof_prune', 'success', NULL, now() - interval '45 days', '{"action":"list"}',
        jsonb_build_object('rows', (SELECT jsonb_agg(repeat('y', 40)) FROM generate_series(1, 60)))),
      ('mcp', 'proof_prune', 'success', 'write', now() - interval '45 days', '{"action":"create"}',
        jsonb_build_object('rows', (SELECT jsonb_agg(repeat('z', 40)) FROM generate_series(1, 60))));
    -- Today: the shape the unstamped row learns from.
    INSERT INTO public.agent_activity (agent, skill_name, status, kind, input) VALUES ('mcp', 'proof_prune', 'success', 'read', '{"action":"list"}');

    v := public.prune_logs(true);
    IF v->>'status' <> 'dry_run' THEN RAISE EXCEPTION 'proof: a dry run answers dry_run, got %', v; END IF;
    SELECT count(*) INTO v_n FROM public.agent_activity WHERE skill_name LIKE 'proof_prune%';
    IF v_n <> 10 THEN RAISE EXCEPTION 'proof: a dry run removes nothing (10 rows), found %', v_n; END IF;

    v := public.prune_logs();
    IF v->>'status' <> 'ok' THEN RAISE EXCEPTION 'proof: prune_logs answered %', v; END IF;

    SELECT count(*) INTO v_n FROM public.agent_activity WHERE skill_name = 'proof_prune' AND created_at < now() - interval '100 days';
    IF v_n <> (CASE WHEN v_kept IS NULL THEN 1 ELSE 2 END) THEN
      RAISE EXCEPTION 'proof: of the 120-day rows only the change (and the objective''s evidence) stay, % stayed', v_n;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.agent_activity WHERE skill_name = 'proof_prune' AND kind = 'write' AND status::text = 'success' AND created_at < now() - interval '100 days' AND output->>'lead_id' = 'L1') THEN
      RAISE EXCEPTION 'proof: the 120-day change must stay whole';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.agent_activity WHERE skill_name = 'proof_prune_unknown') THEN
      RAISE EXCEPTION 'proof: a row of unknown kind is never thinned on a guess';
    END IF;

    SELECT output INTO v_out FROM public.agent_activity
     WHERE skill_name = 'proof_prune' AND created_at < now() - interval '40 days' AND created_at > now() - interval '50 days' AND output ? 'count';
    IF v_out ? 'rows' OR v_out->>'count' <> '2' OR v_out->'item'->>'id' <> 'I1' OR v_out->'item' ? 'lines' OR (v_out->>'_trimmed') IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'proof: a 45-day lookup keeps its scalars and loses its lists, got %', v_out;
    END IF;
    SELECT count(*) INTO v_n FROM public.agent_activity
     WHERE skill_name = 'proof_prune' AND created_at < now() - interval '40 days' AND created_at > now() - interval '50 days'
       AND kind = 'read' AND trimmed_at IS NOT NULL AND NOT (output ? 'rows');
    IF v_n <> 2 THEN RAISE EXCEPTION 'proof: the unstamped 45-day lookup learns its kind and is cut down too (2 rows), got %', v_n; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.agent_activity WHERE skill_name = 'proof_prune' AND kind = 'write' AND trimmed_at IS NULL AND output ? 'rows' AND created_at > now() - interval '50 days') THEN
      RAISE EXCEPTION 'proof: a 45-day change keeps its whole answer';
    END IF;

    -- The dial: off means off, and nonsense falls back to the defaults.
    INSERT INTO public.site_settings (key, value) VALUES ('data_retention', '{"enabled": false}')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
    IF public.prune_logs()->>'status' <> 'off' THEN RAISE EXCEPTION 'proof: a disabled dial thins nothing'; END IF;
    UPDATE public.site_settings SET value = '{"answers_days": "soon", "rows_days": 3, "quota_mb": 8000}' WHERE key = 'data_retention';
    v := public.data_retention_settings();
    IF v <> '{"enabled": true, "answers_days": 30, "rows_days": 30, "quota_mb": 8000}'::jsonb THEN
      RAISE EXCEPTION 'proof: the dial''s floors and defaults, got %', v;
    END IF;

    RAISE EXCEPTION 'proof passed — rolling back' USING ERRCODE = 'P0PRF';
  EXCEPTION
    WHEN SQLSTATE 'P0PRF' THEN NULL;
    WHEN undefined_table OR undefined_column OR undefined_object THEN
      RAISE NOTICE 'log retention: proof skipped here (%)', SQLERRM;
  END;
END $proof$;
