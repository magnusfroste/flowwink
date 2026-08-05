-- The billing family moves into the work queue, starting with subscriptions.
-- Machinery: 20260806000000_agent-tasks-work-queue.sql
-- Design: docs/architecture/work-queue.md
--
-- Before: one daily sweep (`run_subscription_billing`) loops every due manual
-- subscription inside a single RPC. A failure on subscription #7 of 40 is
-- invisible — the automation's run_count still climbs, last_error holds only
-- the final message, and nobody can say which documents were invoiced.
--
-- After: one task per subscription, due at its own next_invoice_date, each with
-- a lease, an attempt count and an outcome sentence. A failure is one failed
-- row naming one subscription; the other 39 are unaffected.
--
-- WHY A DAILY ENQUEUER AND NOT A TRIGGER ON subscriptions:
-- The obvious design — trigger on next_invoice_date changing — deadlocks
-- against the queue's own idempotency guard. generate_subscription_invoice
-- advances next_invoice_date WHILE its task is still status='running', so the
-- trigger's enqueue finds that open task and returns it instead of creating the
-- next period's. Billing would then stop silently after one cycle, which is the
-- exact failure class this queue exists to remove. A daily enqueuer has no such
-- ordering trap, and the unique partial index makes re-runs free.
--
-- Honest about the gain: this does NOT remove a daily scan (the enqueuer scans
-- once a day, same cadence the sweep did). It buys per-document durability,
-- retry and visibility. The scan is now INSERT-only and runs in-database — no
-- pg_net, no DNS, no HTTP timeout, so the failure modes that produced this
-- month's incidents are absent from it by construction.

-- ── the enqueuer ───────────────────────────────────────────────────────────
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
      -- The reason is shown next to the task in the admin UI. Naming the date
      -- it is due for is what makes "why is the platform invoicing on Tuesday"
      -- answerable without reading code.
      p_reason          => format('Subscription billing period starting %s is due.', _sub.next_invoice_date),
      -- Parameter name verified live against the gateway: the skill's
      -- tool_definition exposes `subscription_id`, which agent-execute maps to
      -- the RPC's _subscription_id. Getting this wrong fails every task.
      p_skill_arguments => jsonb_build_object('subscription_id', _sub.id),
      p_subject_type    => 'subscription',
      p_subject_id      => _sub.id,
      -- Due at its own date, never "now" — a subscription due in three days
      -- waits three days. This is the whole point of a due_at.
      p_due_at          => GREATEST(_sub.next_invoice_date::timestamptz, now()),
      -- Money ahead of housekeeping when a backlog drains.
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

-- ── schedule it in-database ────────────────────────────────────────────────
-- No edge function, no pg_net: a pure SQL call from pg_cron cannot 404 on a
-- deleted target, cannot carry another instance's host, and cannot time out on
-- DNS — the three ways scheduled work broke this month. 04:00 is before the
-- old sweep's 05:30, so the first tick of the day already has its tasks.
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

-- ── retire the sweep ───────────────────────────────────────────────────────
-- A moved job may not leave its old trigger behind: the sweep and the queue
-- would both invoice. (They could not actually double-charge —
-- generate_subscription_invoice RAISES when the period is already invoiced —
-- but the loser produces a failed task with a confusing outcome, and "two
-- things own billing" is how the next incident starts.)
--
-- Disabled, not deleted: the row stays visible, and module bootstrap only
-- INSERTs automations that are missing by name — it never rewrites `enabled` on
-- an existing row — so this survives a re-sync.
--
-- NOTE: run_subscription_billing also called run_trial_conversions as an
-- advisory first step. That is NOT orphaned — the separate "Trial Conversion"
-- automation runs it daily at 05:00.
UPDATE public.agent_automations
   SET enabled = false,
       description = COALESCE(description, '') ||
         ' [Retired 2026-08-06: subscription billing moved to the work queue — see enqueue_subscription_billing_tasks and docs/architecture/work-queue.md.]'
 WHERE skill_name = 'run_subscription_billing'
   AND enabled = true;

-- ── backfill ───────────────────────────────────────────────────────────────
-- The first deploy enqueues tasks for what the sweep would have picked up on
-- its next run, so nothing falls between the two mechanisms.
DO $$
DECLARE _res jsonb;
BEGIN
  _res := public.enqueue_subscription_billing_tasks();
  RAISE NOTICE 'Subscription billing backfill: %', _res;
END $$;
