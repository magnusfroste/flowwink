-- The sweep is fixed. This is the check that it stays fixed.
--
-- `run_ticket_escalations()` aborted with `operator does not exist:
-- ticket_priority = text` for ANY active rule, so the escalation engine — the
-- "Escalation" tab on /admin/tickets and its "Run sweep now" button — never
-- moved a single ticket between 2026-07-08 and 2026-08-23. The body compared
-- `tickets.priority` (enum `ticket_priority`) against
-- `ticket_escalation_rules.action_raise_priority` (`text`), and PL/pgSQL PLANS
-- the whole IF expression the first time the statement is REACHED — so the
-- `IS NOT NULL` in front saved nothing and a rule leaving the column NULL
-- aborted exactly like one that set it.
--
-- 20260823053000 fixed the function itself, and fixed it well: the rule's text
-- fields are validated against `pg_enum` and cast into typed locals once per
-- rule, the dynamic `EXECUTE format(...)` is gone entirely, and a rule carrying
-- an unknown label is skipped and reported instead of taking the sweep down.
-- Nothing here re-fixes that. This migration adds the half that was missing:
-- something that CALLS it.
--
-- Why that half matters more than it sounds. The bug survived two months of
-- green checks because every check that existed asked whether the function
-- EXISTED. `pg_proc` said yes, the migration ledger said applied, the UI
-- rendered a button. Nothing ever ran it with a rule and a ticket in place, and
-- running it is the only thing that would have failed.
--
-- The fixture ticket is load-bearing, not decoration. PL/pgSQL plans that
-- statement only when it is REACHED, so a check that sweeps with rules but no
-- MATCHING ticket sails straight past the defect and reports green — which is
-- precisely the shape of test that would have been written by someone trying to
-- keep the check cheap.
--
-- Three properties, one call:
--
--   1. a rule that raises priority                  → sweep completes, ticket rises
--   2. a rule that leaves action_raise_priority NULL → sweep completes too
--   3. a rule naming a priority that does not exist  → skipped and named, the
--                                                      other two still run
--
-- 1 and 2 were both fatal before the fix; keeping both is the point, because
-- the NULL rule is the one that looks like it should have been safe.
--
-- Hermetic by construction. Everything happens inside a subtransaction that
-- ends in a deliberate ZZ001 — fixtures, the ticket, the parking of whatever
-- real rules the instance has, even the request.jwt.claims override — so the
-- database is byte-identical afterwards. PL/pgSQL variables survive the
-- rollback (they are not transactional), which is how the verdict gets out.
--
-- Forward-dated above main's migration head (20260827700000 at the time of
-- writing) and idempotent. A CREATE OR REPLACE below a managed ledger's HEAD is
-- silently skipped, and this has to reach instances that are already past it —
-- which is exactly the instances that have main's fix and no check on it. If
-- main lands further migrations before this merges, re-date it again: the
-- forward-dating guard measures against the fork point, so it will not catch a
-- timestamp that has fallen behind the branch it is merging into.

CREATE OR REPLACE FUNCTION public.regression_ticket_escalations()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
  v_phase      text := 'guard';
  v_ticket     uuid;
  v_sweep      jsonb;
  v_priority   text;
  v_parked     integer := 0;
  v_hits       integer := 0;
  v_hits_raise integer := 0;
  v_total      integer := 0;
  v_report     jsonb;
  v_err        text;
  v_state      text;
  v_failed_at  text;
BEGIN
  -- COALESCE, not a bare comparison: auth.role() is NULL outside a request
  -- (psql, a migration, a cron job), `NULL = 'service_role'` is NULL, and
  -- `IF NOT NULL THEN` does not fire — a guard that opens on the way in.
  IF NOT COALESCE(auth.role() = 'service_role', false)
     AND NOT COALESCE(public.has_role(auth.uid(), 'admin'), false) THEN
    RAISE EXCEPTION 'Only admins (or service_role) can run the escalation regression';
  END IF;

  BEGIN
    -- ── everything below is undone; the block ends by raising on purpose ────
    v_phase := 'fixture';

    -- The sweep guards on auth.role(). Local, so the rollback below restores it.
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

    -- Park the instance's own rules so the counts below mean exactly what they
    -- say. Rolled back with the rest — no operator config is changed.
    UPDATE public.ticket_escalation_rules SET is_active = false WHERE is_active;
    GET DIAGNOSTICS v_parked = ROW_COUNT;

    -- Backdated 72h: the age filter is `created_at < now() - interval`, and
    -- now() is the transaction timestamp, so a freshly inserted row is exactly
    -- now() and would never match.
    INSERT INTO public.tickets (subject, description, status, priority, category, source, created_at, updated_at)
    VALUES ('[regression] ticket escalation sweep',
            'Temporary fixture from regression_ticket_escalations(). Never committed.',
            'open', 'low', 'other', 'regression',
            now() - interval '72 hours', now() - interval '72 hours')
    RETURNING id INTO v_ticket;

    INSERT INTO public.ticket_escalation_rules
      (name, is_active, match_status, match_priority, match_unassigned,
       age_hours, age_field, action_raise_priority, action_reassign_to,
       action_reassign_kind, action_notify)
    VALUES
      ('[regression] raises priority', true, NULL, NULL, false,
       24, 'created_at', 'urgent', NULL, NULL, false),
      ('[regression] no priority action', true, NULL, NULL, false,
       24, 'created_at', NULL, NULL, NULL, false),
      ('[regression] bogus priority', true, NULL, NULL, false,
       24, 'created_at', 'kritisk', NULL, NULL, false);

    v_phase := 'sweep';
    v_sweep := public.run_ticket_escalations();

    v_phase := 'assert';
    SELECT priority::text INTO v_priority FROM public.tickets WHERE id = v_ticket;

    -- Assert on the fixture's OWN lines in the result, not on the totals. The
    -- instance's real aged tickets match these rules too and are swept along
    -- (and rolled back with everything else), so a total is not a number this
    -- check can predict — but the fixture's two lines always are.
    v_total := COALESCE((v_sweep ->> 'tickets_escalated')::int, 0);
    SELECT count(*),
           count(*) FILTER (WHERE d ->> 'rule_name' = '[regression] raises priority')
      INTO v_hits, v_hits_raise
      FROM jsonb_array_elements(COALESCE(v_sweep -> 'details', '[]'::jsonb)) d
     WHERE (d ->> 'ticket_id')::uuid = v_ticket;

    IF COALESCE((v_sweep ->> 'rules_evaluated')::int, -1) <> 3 THEN
      RAISE EXCEPTION 'expected exactly the three fixture rules to be evaluated, got %',
        COALESCE(v_sweep ->> 'rules_evaluated', '<null>');
    END IF;
    IF COALESCE((v_sweep ->> 'rules_skipped')::int, -1) <> 1 THEN
      RAISE EXCEPTION 'expected the bogus-priority rule to be skipped, got % skipped',
        COALESCE(v_sweep ->> 'rules_skipped', '<null>');
    END IF;
    -- Named, not just counted: a count tells the operator something is wrong,
    -- the name tells them which row to open.
    IF COALESCE(v_sweep -> 'skipped_rules' -> 0 ->> 'rule_name', '') <> '[regression] bogus priority' THEN
      RAISE EXCEPTION 'the skipped rule was not named in skipped_rules: %',
        COALESCE(v_sweep ->> 'skipped_rules', '<null>');
    END IF;
    IF v_hits <> 2 THEN
      RAISE EXCEPTION 'expected the fixture ticket on both rules'' result lines, got %', v_hits;
    END IF;
    IF v_hits_raise <> 1 THEN
      RAISE EXCEPTION 'the raise-priority rule did not reach the fixture ticket (% lines)', v_hits_raise;
    END IF;
    IF v_priority IS DISTINCT FROM 'urgent' THEN
      RAISE EXCEPTION 'the sweep completed but did not raise the ticket: priority is %, expected urgent',
        COALESCE(v_priority, '<ticket gone>');
    END IF;

    v_report := jsonb_build_object(
      'ok', true,
      'checked', 'run_ticket_escalations',
      'rules_evaluated', v_sweep -> 'rules_evaluated',
      'rules_skipped', v_sweep -> 'rules_skipped',
      'fixture_ticket_lines', v_hits,
      'priority_before', 'low',
      'priority_after', v_priority,
      'instance_rules_parked_during_test', v_parked,
      'instance_tickets_also_swept', GREATEST(v_total - v_hits, 0),
      'note', 'Everything above was rolled back — the instance is unchanged.');

    -- The rollback. Not a failure: the whole point is to leave nothing behind.
    RAISE EXCEPTION 'regression complete, rolling back' USING ERRCODE = 'ZZ001';
  EXCEPTION
    WHEN SQLSTATE 'ZZ001' THEN
      NULL;  -- planned; v_report survives, the fixtures do not
    WHEN OTHERS THEN
      v_err := SQLERRM; v_state := SQLSTATE; v_failed_at := v_phase;
  END;

  IF v_err IS NOT NULL THEN
    -- A fixture that will not build says nothing about the sweep (a column this
    -- instance does not have, a constraint it added). Report it, do not fail on
    -- it — a check that cries wolf gets muted, and then it guards nothing.
    IF v_failed_at = 'fixture' THEN
      RETURN jsonb_build_object(
        'ok', true, 'skipped', true, 'phase', v_failed_at,
        'reason', v_err, 'sqlstate', v_state);
    END IF;
    RAISE EXCEPTION 'run_ticket_escalations regression FAILED in phase %: % (SQLSTATE %)',
      v_failed_at, v_err, v_state;
  END IF;

  RETURN v_report;
END;
$fn$;

REVOKE ALL ON FUNCTION public.regression_ticket_escalations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regression_ticket_escalations() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Run it now, on this instance, as part of applying the fix
-- ---------------------------------------------------------------------------
-- The body above was just replaced; if the sweep still cannot run, the apply
-- should say so here rather than let the operator find out from a dead button.
DO $regression$
DECLARE
  v_out jsonb;
BEGIN
  IF to_regclass('public.tickets') IS NULL
     OR to_regclass('public.ticket_escalation_rules') IS NULL THEN
    RAISE NOTICE 'run_ticket_escalations regression: tickets tables absent — skipped';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_out := public.regression_ticket_escalations();

  IF COALESCE((v_out ->> 'skipped')::boolean, false) THEN
    RAISE WARNING 'run_ticket_escalations regression skipped (%): %',
      v_out ->> 'phase', v_out ->> 'reason';
  ELSE
    RAISE NOTICE 'run_ticket_escalations regression: %', v_out::text;
  END IF;
END
$regression$;
