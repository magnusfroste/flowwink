-- ============================================================================
-- Agent work is read per module (2026-11-11, #869).
--
-- agent_activity was admin-only: a salesperson could not see what the agents
-- did in the sales chain, a support lead not what was done to the tickets.
-- "People see; agents do" held for one role.
--
-- The executor now stamps every skill call with the module that OWNS the skill
-- (the generated owner map — the same answer the module gate uses), and staff
-- may read the rows of the modules their role is granted in the role matrix.
-- Platform skills and every row written before this (module NULL) stay
-- admin-only; nothing is backfilled, the panel's seven-day window fills by
-- itself. One fact (the owner), one reader (can_access_module).
-- ============================================================================

ALTER TABLE public.agent_activity ADD COLUMN IF NOT EXISTS module text;

COMMENT ON COLUMN public.agent_activity.module IS
  'The module that owns the skill this call ran (the generated owner map). NULL for platform skills and non-skill rows: admin-only.';

CREATE INDEX IF NOT EXISTS agent_activity_module_idx
  ON public.agent_activity (module, created_at DESC) WHERE module IS NOT NULL;

DROP POLICY IF EXISTS "Staff read agent activity of their modules" ON public.agent_activity;
CREATE POLICY "Staff read agent activity of their modules" ON public.agent_activity
  FOR SELECT TO authenticated
  USING (module IS NOT NULL AND public.can_access_module(auth.uid(), module));

-- Proof, rolled back: a role reads its own module's rows and nobody else's.
DO $proof$
DECLARE
  v_user uuid := '00000000-0000-4000-8000-00000000ab02';
  v_n int;
BEGIN
  BEGIN
    INSERT INTO auth.users (id, email) VALUES (v_user, 'proof-agent-work@example.test');
    -- On a virgin instance handle_new_user makes the FIRST account the admin —
    -- and an admin reads everything, so the proof read 3 rows and stopped every
    -- fresh install (2026-11-11, found by the pull-request battery). The proof
    -- is about a plain sales role: take the operator's role away again.
    DELETE FROM public.user_roles WHERE user_id = v_user;
    INSERT INTO public.user_roles (user_id, role) VALUES (v_user, 'sales'::public.app_role);
    INSERT INTO public.role_module_access (role, module_id) VALUES ('sales'::public.app_role, 'deals') ON CONFLICT DO NOTHING;
    DELETE FROM public.role_module_access WHERE role = 'sales'::public.app_role AND module_id = 'accounting';
    INSERT INTO public.agent_activity (agent, skill_name, status, module) VALUES
      ('mcp', 'proof_agent_work', 'success', 'deals'),
      ('mcp', 'proof_agent_work', 'success', 'accounting'),
      ('mcp', 'proof_agent_work', 'success', NULL);
    PERFORM set_config('request.jwt.claims', format('{"role":"authenticated","sub":"%s"}', v_user), true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_n FROM public.agent_activity WHERE skill_name = 'proof_agent_work';
    RESET ROLE;
    IF v_n <> 1 THEN RAISE EXCEPTION 'proof: a sales role should read 1 of 3 rows (its own module), read %', v_n; END IF;
    RAISE EXCEPTION 'proof passed — rolling back' USING ERRCODE = 'P0PRF';
  EXCEPTION
    WHEN SQLSTATE 'P0PRF' THEN RESET ROLE;
    WHEN undefined_table OR undefined_column OR undefined_object THEN RESET ROLE;
      RAISE NOTICE 'agent work per module: proof skipped here (%)', SQLERRM;
  END;
END $proof$;
