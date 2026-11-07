-- Öppna dörrar utan besökare (2026-11-07).
--
-- A security pass over the local database with the advisor's own questions
-- (RLS, permissive policies, SECURITY DEFINER views and functions). Four
-- things were open with nobody meant to walk through:
--
-- 1. The public feedback board writes through content-api (the public-block
--    rule: anon key, no JWT, the service client inside) — its rate caps and
--    the cross-instance checks live there. The anon INSERT policies on
--    feedback_posts / feedback_comments / feedback_votes and the DELETE
--    policy on feedback_votes (qual = true: anyone could delete every vote)
--    were a second door around all of it. Nothing in the browser uses them.
-- 2. returns_awaiting_inspection — a SECURITY DEFINER view (RMA numbers,
--    quantities off the books) — was SELECTable by anon. It is read by
--    check_operations as the service role; nobody else needs it, and the
--    three other definer views (contract obligations, expiring lots, vendor
--    scorecards) read as their caller from now on: a portal customer is
--    `authenticated` too, and a definer view hands them staff data past RLS.
-- 3. feedback_record_ping is called by content-api with the service key; the
--    anon/authenticated EXECUTE it was born with let anyone log pings for any
--    instance id.
--
-- Idempotent: policies and grants are dropped IF EXISTS / revoked; the view
-- option is set regardless of its current value.
DROP POLICY IF EXISTS "anyone posts to the board" ON public.feedback_posts;
DROP POLICY IF EXISTS "anyone comments on the board" ON public.feedback_comments;
DROP POLICY IF EXISTS "anyone votes on the board" ON public.feedback_votes;
DROP POLICY IF EXISTS "a voter withdraws a vote" ON public.feedback_votes;

DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['returns_awaiting_inspection', 'contract_obligations_with_status', 'v_expiring_lots', 'v_vendor_scorecard'] LOOP
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = v AND c.relkind = 'v') THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', v);
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'feedback_record_ping') THEN
    REVOKE EXECUTE ON FUNCTION public.feedback_record_ping(uuid, text, text, text, text, text[], text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.feedback_record_ping(uuid, text, text, text, text, text[], text) TO service_role;
  END IF;
END $$;
