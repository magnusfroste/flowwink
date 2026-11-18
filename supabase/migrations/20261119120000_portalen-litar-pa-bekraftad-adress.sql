-- ============================================================================
-- The portal trusts the confirmed address, everywhere (2026-11-19).
--
-- 20261118150000 gave the customer portal one rule for "which rows are this
-- customer's": portal_email() — the account's CONFIRMED address. Five older
-- readers still asked something weaker:
--
--   subscriptions  "Customers read own subscriptions"   auth.jwt() ->> 'email'
--   contracts      "Counterparty reads own contract"    auth.jwt() ->> 'email'
--   my_quotes()                                         auth.jwt() ->> 'email'
--   create_ticket_from_portal()                         auth.jwt() ->> 'email'
--   webinar_registrations "Registrants and staff …"     profiles.email
--
-- The token's e-mail claim is the address an account was opened with, whether
-- or not anyone proved they own it: where sign-up does not demand a confirmed
-- address, an account opened in a customer's name read that customer's
-- services, agreements and quotes. And profiles.email is the account holder's
-- to edit ("Users can update own profile"), so writing someone else's address
-- there showed their webinar registrations.
--
-- All five now ask portal_email(). Nothing changes for an account whose
-- address is confirmed — which is every account on an instance that demands
-- confirmation, and every account an admin invited.
-- ============================================================================

DROP POLICY IF EXISTS "Customers read own subscriptions" ON public.subscriptions;
CREATE POLICY "Customers read own subscriptions" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (
    public.can_access_module(auth.uid(), 'subscriptions')
    OR (customer_email IS NOT NULL AND lower(btrim(customer_email)) = public.portal_email())
  );

DROP POLICY IF EXISTS "Counterparty reads own contract" ON public.contracts;
CREATE POLICY "Counterparty reads own contract" ON public.contracts
  FOR SELECT TO authenticated
  USING (
    counterparty_email IS NOT NULL
    AND lower(btrim(counterparty_email)) = public.portal_email()
  );

DROP POLICY IF EXISTS "Registrants and staff can read registrations" ON public.webinar_registrations;
CREATE POLICY "Registrants and staff can read registrations" ON public.webinar_registrations
  FOR SELECT
  USING (
    public.can_access_module(auth.uid(), 'webinars')
    OR (auth.uid() IS NOT NULL AND email IS NOT NULL AND lower(btrim(email)) = public.portal_email())
  );

CREATE OR REPLACE FUNCTION public.my_quotes()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := public.portal_email();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to see your quotes' USING ERRCODE = '42501';
  END IF;
  -- An account whose address nobody has confirmed has no quotes to show yet.
  IF v_email IS NULL THEN
    RETURN jsonb_build_object('success', true, 'quotes', '[]'::jsonb, 'email_confirmed', false);
  END IF;
  RETURN jsonb_build_object('success', true,
    'quotes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', q.id, 'quote_number', q.quote_number, 'title', q.title,
               'status', CASE WHEN q.status::text IN ('sent', 'viewed') AND q.valid_until IS NOT NULL AND q.valid_until < public.platform_today()
                              THEN 'expired' ELSE q.status::text END,
               'total_cents', q.total_cents, 'currency', q.currency,
               'valid_until', q.valid_until, 'sent_at', q.sent_at,
               'accepted_at', q.accepted_at, 'rejected_at', q.rejected_at, 'paid_at', q.paid_at,
               'accept_token', q.accept_token)
             ORDER BY COALESCE(q.sent_at, q.created_at) DESC)
        FROM public.quotes q
       WHERE lower(q.customer_email) = v_email
         AND q.status::text IN ('sent', 'viewed', 'accepted', 'rejected', 'expired')
         AND q.accept_token IS NOT NULL), '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.create_ticket_from_portal(
  p_subject text,
  p_description text,
  p_subscription_id uuid DEFAULT NULL::uuid,
  p_priority public.ticket_priority DEFAULT 'medium'::public.ticket_priority
)
RETURNS TABLE(ticket_id uuid, ticket_no text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := public.portal_email();
  v_company uuid;
  v_sub public.subscriptions%ROWTYPE;
  v_new_id uuid;
  v_num text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to open a case' USING ERRCODE = '42501';
  END IF;
  -- The case is filed under contact_email and answered there: an address
  -- nobody has confirmed would file it in someone else's name.
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Confirm your e-mail address first — open the link we sent you when the account was created';
  END IF;
  IF coalesce(trim(p_subject), '') = '' THEN
    RAISE EXCEPTION 'A subject is required';
  END IF;

  -- If a service is named, it must belong to the caller — bind its company,
  -- and refuse a service the caller does not own (no cross-customer tickets).
  IF p_subscription_id IS NOT NULL THEN
    SELECT * INTO v_sub FROM public.subscriptions WHERE id = p_subscription_id;
    IF v_sub.id IS NULL OR lower(btrim(coalesce(v_sub.customer_email, ''))) <> v_email THEN
      RAISE EXCEPTION 'That service is not on your account';
    END IF;
    IF v_sub.contract_id IS NOT NULL THEN
      SELECT company_id INTO v_company FROM public.contracts WHERE id = v_sub.contract_id;
    END IF;
  END IF;

  INSERT INTO public.tickets (
    subject, description, status, priority,
    contact_email, subscription_id, company_id, source, created_by
  )
  VALUES (
    trim(p_subject), p_description, 'new', p_priority,
    v_email, p_subscription_id, v_company, 'portal', auth.uid()
  )
  RETURNING tickets.id, tickets.ticket_number INTO v_new_id, v_num;

  RETURN QUERY SELECT v_new_id, v_num;
END;
$$;

-- A signed-in customer's own; neither is for a visitor.
REVOKE ALL ON FUNCTION public.my_quotes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_quotes() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_ticket_from_portal(text, text, uuid, public.ticket_priority) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_ticket_from_portal(text, text, uuid, public.ticket_priority) TO authenticated, service_role;

-- ── Proof: the catalogue only — no row is read or written ───────────────────
DO $$
DECLARE
  v_left text;
BEGIN
  SELECT string_agg(tablename || ' "' || policyname || '"', ', ') INTO v_left
    FROM pg_policies
   WHERE schemaname = 'public'
     AND (coalesce(qual, '') || coalesce(with_check, '')) ~* 'auth\.jwt\(\)\s*->>\s*''email''';
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'a policy still trusts the token''s unconfirmed e-mail: %', v_left;
  END IF;
  SELECT string_agg(p.proname, ', ') INTO v_left
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosrc ~* 'auth\.jwt\(\)\s*->>\s*''email''';
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'a function still trusts the token''s unconfirmed e-mail: %', v_left;
  END IF;
END $$;
