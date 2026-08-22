-- The escalation sweep could not compare a rule to a ticket — so it never ran.
--
-- `public.run_ticket_escalations()` aborted with
--
--     ERROR: operator does not exist: ticket_priority = text
--
-- for ANY active rule, which means the whole ticket-escalation engine — the
-- "Escalation" tab on /admin/tickets and its "Run sweep now" button — has been
-- dead fleet-wide since the function was introduced (20260708124322, carried
-- forward unchanged by the role-matrix sweep in 20260821010000).
--
-- The two sides of that comparison were never the same type:
--
--     tickets.priority                              → enum public.ticket_priority
--     ticket_escalation_rules.action_raise_priority → text
--
-- and the body compared them directly:
--
--     IF v_rule.action_raise_priority IS NOT NULL
--        AND v_ticket.priority IS DISTINCT FROM v_rule.action_raise_priority THEN
--
-- The `IS NOT NULL` in front looks like it protects the NULL case. It does not.
-- PL/pgSQL PLANS the whole IF expression the first time the statement is
-- reached, and planning is where `ticket_priority = text` fails — there is no
-- such operator and no implicit cast to find one. So the sweep died on the
-- first matching ticket whether the rule raised priority or left the column
-- NULL. Verified live on the nordbrygg instance with one rule of each kind:
-- both abort.
--
-- The fix is a cast on the left side. And then a second one, two lines down:
--
--     SET priority = v_rule.action_raise_priority
--
-- fails too, with `column "priority" is of type ticket_priority but expression
-- is of type text`. Assignment context does NOT hand you text → enum for free
-- — PostgreSQL only does that I/O-conversion coercion when the TARGET is a
-- string type, never into one. Nobody had ever seen that error because the IF
-- above it killed the sweep first; the regression at the bottom of this file
-- found it on the very first green run. Both casts, or the engine is still dead
-- for exactly the rules that do the work.
--
-- The dynamic-SQL filter (`priority = %L`) needs nothing: %L renders an untyped
-- literal, which resolves to the enum. That is the direction that works.
--
-- Forward-dated and idempotent, because a back-dated CREATE OR REPLACE is
-- silently skipped by every managed ledger already past that timestamp — and
-- this body has to reach instances that are.

CREATE OR REPLACE FUNCTION public.run_ticket_escalations()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rule record;
  v_ticket record;
  v_applied integer := 0;
  v_rules_evaluated integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_invalid jsonb := '[]'::jsonb;
BEGIN
  -- Only admins or service_role (edge functions / MCP gateway) may run the sweep.
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'tickets')) THEN
    RAISE EXCEPTION 'Requires the tickets module — an admin can grant it under Users → Role Permissions';
  END IF;

  FOR v_rule IN
    SELECT * FROM public.ticket_escalation_rules WHERE is_active = true
  LOOP
    v_rules_evaluated := v_rules_evaluated + 1;

    -- action_raise_priority is free text, so it can hold something that is not
    -- a ticket priority at all ('kritisk', 'P1', a trailing space). With the
    -- cast below that value would abort the UPDATE — and with it the sweep, and
    -- with it every OTHER rule. That is the same shape as the bug this file
    -- fixes: one unusable rule taking down the engine. So the rule is skipped
    -- and named in the result instead, and the rest of the sweep runs.
    IF v_rule.action_raise_priority IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM pg_enum e
           JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typnamespace = 'public'::regnamespace
            AND t.typname = 'ticket_priority'
            AND e.enumlabel = v_rule.action_raise_priority)
    THEN
      v_invalid := v_invalid || jsonb_build_object(
        'rule_id', v_rule.id,
        'rule_name', v_rule.name,
        'action_raise_priority', v_rule.action_raise_priority,
        'problem', format(
          '"%s" is not a ticket priority — use one of: %s',
          v_rule.action_raise_priority,
          (SELECT string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
             FROM pg_enum e
             JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typnamespace = 'public'::regnamespace
              AND t.typname = 'ticket_priority')));
      CONTINUE;
    END IF;

    FOR v_ticket IN
      EXECUTE format(
        'SELECT id, priority, assigned_to, team_id, status FROM public.tickets
          WHERE status NOT IN (''resolved'',''closed'')
            AND (%L IS NULL OR status = %L)
            AND (%L IS NULL OR priority = %L)
            AND (NOT %L OR assigned_to IS NULL)
            AND %I < now() - (%L || '' hours'')::interval',
        v_rule.match_status, v_rule.match_status,
        v_rule.match_priority, v_rule.match_priority,
        v_rule.match_unassigned,
        v_rule.age_field,
        v_rule.age_hours::text
      )
    LOOP
      -- Raise priority.
      -- ::text on the left: enum vs text has no operator, and PL/pgSQL plans
      -- this expression before it evaluates the IS NOT NULL in front of it, so
      -- without the cast the sweep aborts on every rule.
      -- ::ticket_priority on the SET: assignment context does not coerce text
      -- INTO an enum, only out of one. The validation at the top of the rule
      -- loop is what guarantees the value casts cleanly by the time it lands
      -- here.
      IF v_rule.action_raise_priority IS NOT NULL
         AND v_ticket.priority::text IS DISTINCT FROM v_rule.action_raise_priority THEN
        UPDATE public.tickets
          SET priority = v_rule.action_raise_priority::public.ticket_priority,
              updated_at = now()
          WHERE id = v_ticket.id;
      END IF;

      -- Reassign
      IF v_rule.action_reassign_to IS NOT NULL AND v_rule.action_reassign_kind = 'user' THEN
        UPDATE public.tickets
          SET assigned_to = v_rule.action_reassign_to, updated_at = now()
          WHERE id = v_ticket.id;
      ELSIF v_rule.action_reassign_to IS NOT NULL AND v_rule.action_reassign_kind = 'team' THEN
        UPDATE public.tickets
          SET team_id = v_rule.action_reassign_to, updated_at = now()
          WHERE id = v_ticket.id;
      END IF;

      -- Notify (create support_escalations row if that table exists)
      IF v_rule.action_notify THEN
        BEGIN
          INSERT INTO public.support_escalations (ticket_id, reason, escalated_at, resolved)
          VALUES (v_ticket.id,
                  format('Auto-escalation rule: %s', v_rule.name),
                  now(),
                  false);
        EXCEPTION WHEN OTHERS THEN
          -- swallow (table may have different columns on some instances)
          NULL;
        END;
      END IF;

      v_applied := v_applied + 1;
      v_results := v_results || jsonb_build_object(
        'ticket_id', v_ticket.id,
        'rule_id', v_rule.id,
        'rule_name', v_rule.name
      );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'rules_evaluated', v_rules_evaluated,
    'tickets_escalated', v_applied,
    'details', v_results,
    -- Additive: existing callers read rules_evaluated/tickets_escalated and are
    -- untouched. A misconfigured rule is worth saying out loud, not swallowing.
    'rules_skipped', jsonb_array_length(v_invalid),
    'invalid_rules', v_invalid
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- The regression: a sweep that runs with a rule present
-- ---------------------------------------------------------------------------
-- Pinning the cast in CI is cheap and worth doing (see
-- src/lib/__tests__/ticket-escalation-enum-cast.guardrails.test.ts), but it can
-- only read text. It cannot tell you that the sweep RUNS on the instance in
-- front of you — and "runs" is the claim that was false for two months.
--
-- So this is the check that actually calls it. Two properties matter, and both
-- need a ticket the rules can match: PL/pgSQL plans the raise-priority
-- statement only when it is first REACHED, so a rule with no matching ticket
-- would have sailed straight past the bug and reported green.
--
--   1. a rule that raises priority                  → sweep completes, ticket rises
--   2. a rule that leaves action_raise_priority NULL → sweep completes too
--   3. a rule naming a priority that does not exist  → skipped and named, the
--                                                      other two still run
--
-- 1 and 2 were both fatal before the cast; keeping both is the point, because
-- the NULL rule is the one that looks like it should have been safe. 3 is the
-- failure the cast newly makes possible, so it is checked in the same breath.
--
-- Hermetic by construction. Everything happens inside a subtransaction that
-- ends in a deliberate ZZ001 — fixtures, the ticket, the parking of whatever
-- real rules the instance has, even the request.jwt.claims override — so the
-- database is byte-identical afterwards. PL/pgSQL variables survive the
-- rollback (they are not transactional), which is how the verdict gets out.
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
    IF COALESCE(v_sweep -> 'invalid_rules' -> 0 ->> 'rule_name', '') <> '[regression] bogus priority' THEN
      RAISE EXCEPTION 'the skipped rule was not named in invalid_rules: %',
        COALESCE(v_sweep ->> 'invalid_rules', '<null>');
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
