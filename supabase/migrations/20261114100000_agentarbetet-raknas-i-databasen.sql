-- ============================================================================
-- Agent work is counted in the database (2026-11-14).
--
-- The dashboard's Agent work panel read the week's agent_activity rows and
-- counted them in the browser. PostgREST answers at most 1000 rows, so on an
-- instance where the agents made more than a thousand calls in seven days the
-- panel counted the newest thousand and called it the week: "This week, by
-- area" and the refused/failed tiles were too low, silently.
--
-- The count now happens here and the answer is one row per (agent, key, skill,
-- outcome, action, dry_run, today-or-earlier) — a few hundred rows whatever
-- the volume. SECURITY INVOKER: the reader's own RLS decides which rows are
-- counted, exactly as when the panel read the table (admin: all; staff: the
-- modules their role is granted). No new grant of sight.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.agent_work_counts(p_since timestamptz, p_today timestamptz)
RETURNS TABLE (
  agent text,
  api_key_id uuid,
  skill_name text,
  status text,
  action text,
  dry_run text,
  is_today boolean,
  calls bigint,
  last_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT a.agent::text,
         a.api_key_id,
         a.skill_name::text,
         a.status::text,
         a.input->>'action',
         a.input->>'dry_run',
         a.created_at >= p_today,
         count(*),
         max(a.created_at)
    FROM public.agent_activity a
   WHERE a.created_at >= p_since
     AND a.status::text IN ('success', 'refused', 'failed')
   GROUP BY 1, 2, 3, 4, 5, 6, 7
$$;

COMMENT ON FUNCTION public.agent_work_counts(timestamptz, timestamptz) IS
  'The Agent work panel''s counts: agent calls since p_since grouped by agent, key, skill, outcome, action, dry_run and whether they fall on or after p_today. Invoker rights — the reader''s RLS on agent_activity decides what is counted.';

REVOKE ALL ON FUNCTION public.agent_work_counts(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_work_counts(timestamptz, timestamptz) TO authenticated, service_role;

-- Proof, rolled back: 1500 calls are counted as 1500 (not 1000), today is told
-- from earlier, and a role that may not read a module's rows counts none of them.
DO $proof$
DECLARE
  v_user uuid := '00000000-0000-4000-8000-00000000ab03';
  v_total bigint;
  v_today bigint;
  v_groups int;
BEGIN
  BEGIN
    INSERT INTO public.agent_activity (agent, skill_name, status, module, input, created_at)
    SELECT 'mcp', 'proof_agent_counts', 'success', 'deals', '{"action":"list"}'::jsonb,
           CASE WHEN g <= 400 THEN now() ELSE now() - interval '2 days' END
      FROM generate_series(1, 1500) g;
    INSERT INTO public.agent_activity (agent, skill_name, status, module)
    VALUES ('mcp', 'proof_agent_counts', 'refused', 'accounting');

    SELECT coalesce(sum(calls), 0), coalesce(sum(calls) FILTER (WHERE is_today), 0), count(*)
      INTO v_total, v_today, v_groups
      FROM public.agent_work_counts(now() - interval '7 days', now() - interval '1 hour')
     WHERE skill_name = 'proof_agent_counts';
    IF v_total <> 1501 THEN RAISE EXCEPTION 'proof: 1501 calls should count as 1501, counted %', v_total; END IF;
    IF v_today <> 401 THEN RAISE EXCEPTION 'proof: 401 of them are today''s, counted %', v_today; END IF;
    IF v_groups <> 3 THEN RAISE EXCEPTION 'proof: three groups expected (today, earlier, refused), got %', v_groups; END IF;

    -- The reader's own sight: a sales role granted Deals and not Accounting.
    INSERT INTO auth.users (id, email) VALUES (v_user, 'proof-agent-counts@example.test');
    DELETE FROM public.user_roles WHERE user_id = v_user;
    INSERT INTO public.user_roles (user_id, role) VALUES (v_user, 'sales'::public.app_role);
    INSERT INTO public.role_module_access (role, module_id) VALUES ('sales'::public.app_role, 'deals') ON CONFLICT DO NOTHING;
    DELETE FROM public.role_module_access WHERE role = 'sales'::public.app_role AND module_id = 'accounting';
    PERFORM set_config('request.jwt.claims', format('{"role":"authenticated","sub":"%s"}', v_user), true);
    SET LOCAL ROLE authenticated;
    SELECT coalesce(sum(calls), 0) INTO v_total
      FROM public.agent_work_counts(now() - interval '7 days', now() - interval '1 hour')
     WHERE skill_name = 'proof_agent_counts';
    RESET ROLE;
    IF v_total <> 1500 THEN RAISE EXCEPTION 'proof: a sales role should count its 1500 Deals calls and not the Accounting one, counted %', v_total; END IF;
    RAISE EXCEPTION 'proof passed — rolling back' USING ERRCODE = 'P0PRF';
  EXCEPTION
    WHEN SQLSTATE 'P0PRF' THEN RESET ROLE;
    WHEN undefined_table OR undefined_column OR undefined_object THEN RESET ROLE;
      RAISE NOTICE 'agent work counts: proof skipped here (%)', SQLERRM;
  END;
END $proof$;
