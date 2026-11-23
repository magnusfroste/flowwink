-- Four functions a visitor could call that no visitor should (2026-11-23).
--
-- Found by reading pg_catalog on the live instances for SECURITY DEFINER
-- functions that anon may execute and whose body asks nobody who is calling:
--
--   • request_callback(...)           — action 'list' answered the hundred
--     latest callback requests: name, e-mail, phone, notes. 'mark_attempted'
--     wrote to any of them. The browser never calls it; the chat's agent does,
--     as the service role.
--   • unsubscribe_newsletter_by_email — the address was the whole credential:
--     anyone who knew one could take that subscriber off the list. Leaving
--     goes through the newsletter function now, with the key from the mail
--     (_shared/email/address-token.ts).
--   • stitch_visitor_to_lead          — tied any visitor's page views to any
--     contact whose id the caller knew. Called by the lead triggers and the
--     analytics skill, never by a browser.
--   • get_team_member_ids             — an employee tree for whoever asked.
--     Staff pages still call it; a visitor has no reason to.
--
-- A definer function the browser never calls carries no EXECUTE for anon or
-- authenticated (the rule of 20261029120000). Idempotent: a REVOKE of what is
-- not granted is a no-op.

REVOKE EXECUTE ON FUNCTION public.request_callback(text, uuid, uuid, text, text, text, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_callback(text, uuid, uuid, text, text, text, timestamptz, text)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.unsubscribe_newsletter_by_email(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unsubscribe_newsletter_by_email(text)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.stitch_visitor_to_lead(text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stitch_visitor_to_lead(text, uuid, text)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_team_member_ids(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_member_ids(uuid)
  TO authenticated, service_role;

-- The proof reads privileges only — no row of the instance is touched.
DO $$
DECLARE
  v_open text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO v_open
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('request_callback', 'unsubscribe_newsletter_by_email',
                       'stitch_visitor_to_lead', 'get_team_member_ids')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'still open to a visitor: %', v_open;
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_team_member_ids(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'staff lost get_team_member_ids';
  END IF;
END $$;
