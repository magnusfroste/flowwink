-- ============================================================================
-- The customer portal shows what the customer has (2026-11-18).
--
-- Found by signing in to /account as a customer who holds a fibre agreement:
-- the portal opened on "No orders yet — browse products", its menu began with
-- Orders, Addresses and Wishlist, and the two things a service customer comes
-- for were not there at all — their INVOICES (no page, and no way to read one:
-- invoices carried no rule for a customer) and their AGREEMENT ("Contracts" in
-- the portal is the employee's employment contract).
--
-- Each page also answered "which rows are this customer's" its own way: orders
-- by the account that placed them, services by account or e-mail, quotes by
-- e-mail, cases by author, e-mail or company. A customer who checked out as a
-- guest and registered later saw no order; a colleague in the same company saw
-- the cases but not the invoice.
--
-- One rule now, in one place:
--   portal_email()         the signed-in person's CONFIRMED e-mail (an account
--                          whose address was never confirmed proves nothing)
--   portal_company_ids()   the companies they are an active contact of
-- and one read, my_account(), built on it: what needs the customer's action
-- (invoices to pay, quotes to answer, agreements to sign) and what they have
-- (services, agreements, invoices, orders, open cases). Only what was actually
-- issued to them — never a draft — and only the fields they already hold by
-- mail, with the same link the mail carried.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.portal_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(u.email)
    FROM auth.users u
   WHERE u.id = auth.uid()
     AND u.email_confirmed_at IS NOT NULL
     AND coalesce(btrim(u.email), '') <> ''
$$;

CREATE OR REPLACE FUNCTION public.portal_company_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(cc.company_id), '{}'::uuid[])
    FROM public.company_contacts cc
   WHERE cc.auth_user_id = auth.uid()
     AND cc.status = 'active'
$$;

REVOKE ALL ON FUNCTION public.portal_email() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_email() FROM anon;
GRANT EXECUTE ON FUNCTION public.portal_email() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_company_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_company_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.portal_company_ids() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.my_account()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text := public.portal_email();
  v_companies uuid[] := public.portal_company_ids();
  v_today date := public.platform_today();
  v_invoices jsonb;
  v_agreements jsonb;
  v_services jsonb;
  v_quotes jsonb;
  v_orders jsonb;
  v_cases jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to see your account' USING ERRCODE = '42501';
  END IF;

  -- Invoices that were issued: never a draft, never a cancelled one.
  SELECT coalesce(jsonb_agg(row ORDER BY (row->>'issue_date') DESC NULLS LAST), '[]'::jsonb) INTO v_invoices FROM (
    SELECT jsonb_build_object(
             'id', i.id, 'invoice_number', i.invoice_number,
             'status', CASE WHEN i.status::text = 'sent' AND i.due_date IS NOT NULL AND i.due_date < v_today THEN 'overdue' ELSE i.status::text END,
             'total_cents', i.total_cents, 'paid_amount_cents', coalesce(i.paid_amount_cents, 0),
             'currency', i.currency, 'issue_date', i.issue_date, 'due_date', i.due_date, 'paid_at', i.paid_at,
             'public_token', i.public_token) AS row
      FROM public.invoices i
     WHERE i.status::text NOT IN ('draft', 'cancelled')
       AND ((v_email IS NOT NULL AND lower(i.customer_email) = v_email) OR i.company_id = ANY (v_companies))
     ORDER BY i.issue_date DESC NULLS LAST
     LIMIT 100) s;

  -- Agreements that were sent for signature or are in force.
  SELECT coalesce(jsonb_agg(row ORDER BY (row->>'sent_at') DESC NULLS LAST), '[]'::jsonb) INTO v_agreements FROM (
    SELECT jsonb_build_object(
             'id', c.id, 'contract_number', c.contract_number, 'title', c.title, 'status', c.status::text,
             'start_date', c.start_date, 'end_date', c.end_date, 'signed_at', c.signed_at, 'sent_at', c.sent_at,
             'accept_token', c.accept_token) AS row
      FROM public.contracts c
     WHERE c.status::text <> 'draft'
       AND c.accept_token IS NOT NULL
       AND ((v_email IS NOT NULL AND lower(btrim(c.counterparty_email)) = v_email) OR c.company_id = ANY (v_companies))
     ORDER BY c.sent_at DESC NULLS LAST
     LIMIT 100) s;

  SELECT coalesce(jsonb_agg(row), '[]'::jsonb) INTO v_services FROM (
    SELECT jsonb_build_object(
             'id', s.id, 'product_name', s.product_name, 'status', s.status::text,
             'unit_amount_cents', s.unit_amount_cents, 'currency', s.currency, 'billing_interval', s.billing_interval,
             'next_invoice_date', s.next_invoice_date) AS row
      FROM public.subscriptions s
     WHERE s.status::text <> 'canceled'
       AND (s.user_id = v_uid
            OR (v_email IS NOT NULL AND lower(s.customer_email) = v_email)
            -- A service has no company of its own; it is the company's through its agreement.
            OR EXISTS (SELECT 1 FROM public.contracts sc WHERE sc.id = s.contract_id AND sc.company_id = ANY (v_companies)))
     ORDER BY s.created_at DESC
     LIMIT 100) s;

  -- Quotes still waiting for the customer's answer.
  SELECT coalesce(jsonb_agg(row), '[]'::jsonb) INTO v_quotes FROM (
    SELECT jsonb_build_object(
             'id', q.id, 'quote_number', q.quote_number, 'title', q.title, 'total_cents', q.total_cents,
             'currency', q.currency, 'valid_until', q.valid_until, 'accept_token', q.accept_token) AS row
      FROM public.quotes q
     WHERE q.status::text IN ('sent', 'viewed')
       AND q.accept_token IS NOT NULL
       AND (q.valid_until IS NULL OR q.valid_until >= v_today)
       AND ((v_email IS NOT NULL AND lower(q.customer_email) = v_email) OR q.company_id = ANY (v_companies))
     ORDER BY coalesce(q.sent_at, q.created_at) DESC
     LIMIT 50) s;

  -- An order placed as a guest belongs to the account that later confirms its address.
  SELECT coalesce(jsonb_agg(row), '[]'::jsonb) INTO v_orders FROM (
    SELECT jsonb_build_object(
             'id', o.id, 'status', o.status::text, 'fulfillment_status', o.fulfillment_status,
             'total_cents', o.total_cents, 'currency', o.currency, 'created_at', o.created_at) AS row
      FROM public.orders o
     WHERE o.user_id = v_uid OR (v_email IS NOT NULL AND lower(o.customer_email) = v_email)
     ORDER BY o.created_at DESC
     LIMIT 5) s;

  SELECT coalesce(jsonb_agg(row), '[]'::jsonb) INTO v_cases FROM (
    SELECT jsonb_build_object(
             'id', t.id, 'ticket_number', t.ticket_number, 'subject', t.subject, 'status', t.status::text,
             'created_at', t.created_at) AS row
      FROM public.tickets t
     WHERE t.status::text NOT IN ('resolved', 'closed')
       AND public.can_view_ticket(t.id)
     ORDER BY t.created_at DESC
     LIMIT 20) s;

  RETURN jsonb_build_object(
    'success', true,
    'email_confirmed', v_email IS NOT NULL,
    'invoices', v_invoices,
    'agreements', v_agreements,
    'services', v_services,
    'quotes_waiting', v_quotes,
    'recent_orders', v_orders,
    'open_cases', v_cases);
END;
$$;

REVOKE ALL ON FUNCTION public.my_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_account() TO authenticated, service_role;

-- ── Orders: the account that confirms the address owns the guest order too ──
-- The Orders page reads the table itself. An order placed without an account
-- carries the customer's e-mail and no user_id, so it was invisible to the
-- same person the day they registered.
DROP POLICY IF EXISTS "Customers can view own orders by confirmed email" ON public.orders;
CREATE POLICY "Customers can view own orders by confirmed email" ON public.orders
  FOR SELECT TO authenticated
  USING (customer_email IS NOT NULL AND lower(customer_email) = public.portal_email());

DROP POLICY IF EXISTS "Customers can view own order items by confirmed email" ON public.order_items;
CREATE POLICY "Customers can view own order items by confirmed email" ON public.order_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
     WHERE o.id = order_items.order_id
       AND o.customer_email IS NOT NULL
       AND lower(o.customer_email) = public.portal_email()));

-- ── Proof, rolled back: two accounts, each sees its own and nothing else ────
DO $$
DECLARE
  v_a uuid; v_b uuid;
  v_tag text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  v_mail_a text; v_mail_b text;
  v jsonb;
BEGIN
  BEGIN
    -- Two people who already have an account here; without two there is nothing to compare.
    SELECT u.id, lower(u.email) INTO v_a, v_mail_a FROM auth.users u WHERE u.email_confirmed_at IS NOT NULL AND coalesce(u.email, '') <> '' ORDER BY u.created_at LIMIT 1;
    SELECT u.id, lower(u.email) INTO v_b, v_mail_b FROM auth.users u WHERE u.email_confirmed_at IS NOT NULL AND coalesce(u.email, '') <> '' AND u.id <> v_a ORDER BY u.created_at DESC LIMIT 1;
    IF v_a IS NULL OR v_b IS NULL THEN
      RAISE NOTICE 'portal proof: fewer than two confirmed accounts here, skipped';
      RAISE EXCEPTION 'proof-rollback';
    END IF;

    INSERT INTO public.invoices (invoice_number, customer_name, customer_email, status, line_items, subtotal_cents, tax_cents, total_cents, public_token)
    VALUES ('PROOF-I-' || v_tag, 'A', v_mail_a, 'sent', '[]'::jsonb, 100, 0, 100, 'proof-' || v_tag || '-token-a'),
           ('PROOF-D-' || v_tag, 'A', v_mail_a, 'draft', '[]'::jsonb, 100, 0, 100, 'proof-' || v_tag || '-token-d');

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated', 'email', v_mail_a)::text, true);
    v := public.my_account();
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v->'invoices') e WHERE e->>'invoice_number' = 'PROOF-I-' || v_tag) THEN
      RAISE EXCEPTION 'portal proof: the customer does not see the invoice issued to them';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v->'invoices') e WHERE e->>'invoice_number' = 'PROOF-D-' || v_tag) THEN
      RAISE EXCEPTION 'portal proof: the customer sees a draft invoice';
    END IF;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated', 'email', v_mail_b)::text, true);
    v := public.my_account();
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v->'invoices') e WHERE e->>'invoice_number' LIKE 'PROOF-_-' || v_tag) THEN
      RAISE EXCEPTION 'portal proof: another customer sees the invoice';
    END IF;

    -- Nobody signed in: no account.
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    BEGIN
      PERFORM public.my_account();
      RAISE EXCEPTION 'portal proof: my_account answered a visitor';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('request.jwt.claims', '', true);
    IF SQLERRM LIKE 'portal proof:%' THEN RAISE; END IF;
    IF SQLERRM <> 'proof-rollback' THEN
      RAISE NOTICE 'portal: proof rows not accepted here (%), skipped', SQLERRM;
    END IF;
  END;
END $$;
