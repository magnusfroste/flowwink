-- Four platform functions a signed-in customer could call (2026-11-25).
--
-- Customers sign in to the portal since #1087, so `authenticated` includes
-- them. Four SECURITY DEFINER functions still carried EXECUTE for every
-- session although no browser code calls them — only triggers, other definer
-- functions and the executor (service role) do:
--
--   dispatch_automation_event — posts any event name and payload to
--     send-webhook and signal-dispatcher WITH THE SERVICE KEY. A customer could
--     put a forged order.paid or subscription.created on the bus and run the
--     automations that answer it.
--   request_entity_approval  — opens an approval request; definer, so it went
--     round the staff-only insert policy of #1088.
--   run_gmail_reconcile      — wakes the mailbox poll on demand.
--   booking_staff_conflict   — tells whether a named employee is busy.
--
-- Their callers keep working: the trigger functions that dispatch and the
-- approval / booking functions that call these are SECURITY DEFINER (they run
-- as the owner), and the executor and pg_cron run as the service role. The
-- two invoker-side guards (guard_expense_chain_approval, guard_po_chain_approval)
-- only NAME request_entity_approval in their error text.

DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.dispatch_automation_event(text,text,jsonb,text,text)',
    'public.request_entity_approval(text,text,bigint,text)',
    'public.run_gmail_reconcile()',
    'public.booking_staff_conflict(uuid,timestamp with time zone,timestamp with time zone,integer,integer,uuid,boolean)'
  ] LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    ELSE
      RAISE NOTICE '% is not here — nothing to close', f;
    END IF;
  END LOOP;
END
$$;

-- Proof: no session can call them.
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.dispatch_automation_event(text,text,jsonb,text,text)',
    'public.request_entity_approval(text,text,bigint,text)',
    'public.run_gmail_reconcile()'
  ] LOOP
    IF to_regprocedure(f) IS NOT NULL
       AND (has_function_privilege('authenticated', to_regprocedure(f), 'EXECUTE')
            OR has_function_privilege('anon', to_regprocedure(f), 'EXECUTE')) THEN
      RAISE EXCEPTION 'proof failed: % is still callable by a session', f;
    END IF;
  END LOOP;
END
$$;
