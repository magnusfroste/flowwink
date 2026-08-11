-- Contract billing moves into the work queue — the second family member.
-- Subscriptions: 20260806220000_billing-into-work-queue.sql
-- Design: docs/architecture/work-queue.md
--
-- A clean analogue of the subscription move, and deliberately built the same
-- way rather than cleverly:
--
--   * contracts.billing_next_date is already a true due date; the sweep only
--     exists to go looking for it.
--   * generate_contract_invoice carries the same refusal guard —
--     `IF _c.billing_next_date > CURRENT_DATE THEN RAISE` — so a task and any
--     surviving sweep cannot both invoice. The late one errors cleanly instead
--     of double-charging. That property is what makes the move safe.
--   * A daily enqueuer, NOT a trigger. A trigger on billing_next_date
--     deadlocks against the queue's idempotency guard: generate_contract_invoice
--     advances the date while its task is still status='running', so the
--     trigger finds that open task and creates nothing — and billing stops
--     silently after one cycle. Same trap, same answer.
--
-- Parameter name verified live against the gateway: the skill's tool_definition
-- exposes `contract_id`, and a probe with it reached the RPC ("Contract … not
-- found"). Getting this wrong fails every task.

CREATE OR REPLACE FUNCTION public.enqueue_contract_billing_tasks(
  p_horizon_days int DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _c record;
  _res jsonb;
  _scanned int := 0;
  _created int := 0;
  _existing int := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role) OR auth.uid() IS NULL) THEN
    RAISE EXCEPTION 'Only admins or system can enqueue contract billing';
  END IF;

  -- The sweep's own WHERE clause, verbatim, so the queue picks up exactly the
  -- rows it used to and nothing falls between the two mechanisms.
  FOR _c IN
    SELECT id, title, billing_next_date
      FROM public.contracts
     WHERE status = 'active'
       AND billing_enabled IS TRUE
       AND billing_next_date IS NOT NULL
       AND billing_next_date <= CURRENT_DATE + p_horizon_days
     ORDER BY billing_next_date
     LIMIT 500
  LOOP
    _scanned := _scanned + 1;

    _res := public.enqueue_task(
      p_skill_name      => 'generate_contract_invoice',
      p_reason          => format('Contract billing for %s is due %s.',
                                  COALESCE(NULLIF(_c.title, ''), 'contract'), _c.billing_next_date),
      p_skill_arguments => jsonb_build_object('contract_id', _c.id),
      p_subject_type    => 'contract',
      p_subject_id      => _c.id,
      p_due_at          => GREATEST(_c.billing_next_date::timestamptz, now()),
      p_priority        => 10,   -- money ahead of housekeeping in a backlog
      p_created_by      => 'platform'
    );

    IF (_res ->> 'created')::boolean THEN
      _created := _created + 1;
    ELSE
      _existing := _existing + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'scanned', _scanned, 'enqueued', _created, 'already_open', _existing
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.enqueue_contract_billing_tasks(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_contract_billing_tasks(int) TO authenticated, service_role;

COMMENT ON FUNCTION public.enqueue_contract_billing_tasks(int) IS
  'Enqueues one generate_contract_invoice task per due active contract. Idempotent — an open task for the same contract is left alone.';

-- Scheduled in-database: a pure SQL cron call cannot 404 on a deleted target,
-- carry another instance''s host, or time out on DNS. 04:05 — five minutes after
-- the subscription enqueuer, so the two do not contend for the same minute,
-- which is the pile-up the work-queue doc set out to dissolve.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('enqueue-contract-billing-tasks')
     WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'enqueue-contract-billing-tasks');

    PERFORM cron.schedule(
      'enqueue-contract-billing-tasks',
      '5 4 * * *',
      $cron$SELECT public.enqueue_contract_billing_tasks();$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed — enqueue_contract_billing_tasks must be scheduled manually';
  END IF;
END $$;

-- Retire the sweep it replaces. Disabled, not deleted: module bootstrap only
-- INSERTs automations missing by name and never rewrites `enabled`, so a DELETE
-- would let the next sync silently restore a second owner of contract billing.
UPDATE public.agent_automations
   SET enabled = false,
       description = COALESCE(description, '') ||
         ' [Retired 2026-08-06: contract billing moved to the work queue — see enqueue_contract_billing_tasks and docs/architecture/work-queue.md.]'
 WHERE skill_name = 'run_contract_billing'
   AND enabled = true;

-- Backfill, so nothing falls between the sweep's last run and the queue's first.
DO $$
DECLARE _res jsonb;
BEGIN
  _res := public.enqueue_contract_billing_tasks();
  RAISE NOTICE 'Contract billing backfill: %', _res;
END $$;

-- Fresh-replay quiescence (2026-08-11): jobs must not fire into a half-built
-- schema. A from-scratch replay deadlocked (SQLSTATE 40P01) on the very first
-- GitHub-integration run. Every migration that schedules cron jobs at replay
-- time now ends by deactivating ALL jobs; the always-last finalizer
-- (99999999999999) activates everything once the schema is complete. Existing
-- instances never re-run this file (ledger), so they are unaffected.
DO $quiesce$
DECLARE r record;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    -- cron.alter_job, not UPDATE: on fresh (PG17) projects the postgres role
    -- has no table UPDATE privilege on cron.job — the API function is the
    -- portable path. Verified live on ypkhjjkywgnqhuyiilcz 2026-08-11.
    FOR r IN SELECT jobid FROM cron.job LOOP
      PERFORM cron.alter_job(r.jobid, active => false);
    END LOOP;
  END IF;
END $quiesce$;
