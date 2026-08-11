CREATE OR REPLACE FUNCTION public.enqueue_subscription_billing_tasks(
  p_horizon_days int DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _sub record;
  _res jsonb;
  _scanned int := 0;
  _created int := 0;
  _existing int := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role) OR auth.uid() IS NULL) THEN
    RAISE EXCEPTION 'Only admins or system can enqueue subscription billing';
  END IF;

  FOR _sub IN
    SELECT id, next_invoice_date
      FROM public.subscriptions
     WHERE provider = 'manual'
       AND status = 'active'::subscription_status
       AND next_invoice_date IS NOT NULL
       AND next_invoice_date <= CURRENT_DATE + p_horizon_days
     ORDER BY next_invoice_date
     LIMIT 500
  LOOP
    _scanned := _scanned + 1;

    _res := public.enqueue_task(
      p_skill_name      => 'generate_subscription_invoice',
      p_reason          => format('Subscription billing period starting %s is due.', _sub.next_invoice_date),
      p_skill_arguments => jsonb_build_object('subscription_id', _sub.id),
      p_subject_type    => 'subscription',
      p_subject_id      => _sub.id,
      p_due_at          => GREATEST(_sub.next_invoice_date::timestamptz, now()),
      p_priority        => 10,
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

REVOKE EXECUTE ON FUNCTION public.enqueue_subscription_billing_tasks(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_subscription_billing_tasks(int) TO authenticated, service_role;

COMMENT ON FUNCTION public.enqueue_subscription_billing_tasks(int) IS
  'Enqueues one generate_subscription_invoice task per due manual subscription. Idempotent — an open task for the same subscription is left alone.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('enqueue-subscription-billing-tasks')
     WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'enqueue-subscription-billing-tasks');

    PERFORM cron.schedule(
      'enqueue-subscription-billing-tasks',
      '0 4 * * *',
      $cron$SELECT public.enqueue_subscription_billing_tasks();$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed — enqueue_subscription_billing_tasks must be scheduled manually';
  END IF;
END $$;

UPDATE public.agent_automations
   SET enabled = false,
       description = COALESCE(description, '') ||
         ' [Retired 2026-08-06: subscription billing moved to the work queue — see enqueue_subscription_billing_tasks and docs/architecture/work-queue.md.]'
 WHERE skill_name = 'run_subscription_billing'
   AND enabled = true;

DO $$
DECLARE _res jsonb;
BEGIN
  _res := public.enqueue_subscription_billing_tasks();
  RAISE NOTICE 'Subscription billing backfill: %', _res;
END $$;

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
      p_priority        => 10,
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

UPDATE public.agent_automations
   SET enabled = false,
       description = COALESCE(description, '') ||
         ' [Retired 2026-08-06: contract billing moved to the work queue — see enqueue_contract_billing_tasks and docs/architecture/work-queue.md.]'
 WHERE skill_name = 'run_contract_billing'
   AND enabled = true;

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
