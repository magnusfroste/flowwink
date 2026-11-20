-- The customer portal shows the customer's bookings.
--
-- my_account() carried invoices, agreements, quotes, services, orders and
-- open cases — not one booking. A customer who booked a time found it only in
-- the confirmation mail; to move it they had to find that mail again. The
-- portal now lists what is coming (with the same "change or cancel" door the
-- mail linked to) and what passed in the last 90 days.
--
-- One rule for which rows are the customer's, as for everything else here:
-- the account's CONFIRMED address (portal_email()). Nothing but my_account()
-- changes; every other part of the answer is as before.
--
-- Idempotent: CREATE OR REPLACE.

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
  v_bookings jsonb;
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

  -- Bookings: what is coming, and the last few that passed. The key that moves
  -- or calls off a booking is the one the confirmation mail carried, so it is
  -- handed back only for a booking that can still be changed.
  SELECT coalesce(jsonb_agg(row ORDER BY (row->>'start_time')), '[]'::jsonb) INTO v_bookings FROM (
    SELECT jsonb_build_object(
             'id', b.id, 'status', b.status, 'start_time', b.start_time, 'end_time', b.end_time,
             'service_name', s.name, 'meeting_url', b.meeting_url,
             'upcoming', b.start_time >= now(),
             'manage_token', CASE WHEN b.status IN ('pending', 'confirmed') AND b.start_time >= now() THEN b.manage_token END) AS row
      FROM public.bookings b
      LEFT JOIN public.booking_services s ON s.id = b.service_id
     WHERE v_email IS NOT NULL
       AND lower(btrim(b.customer_email)) = v_email
       AND (b.start_time >= now() - interval '90 days')
     ORDER BY b.start_time DESC
     LIMIT 50) s;

  RETURN jsonb_build_object(
    'success', true,
    'email_confirmed', v_email IS NOT NULL,
    'invoices', v_invoices,
    'agreements', v_agreements,
    'services', v_services,
    'quotes_waiting', v_quotes,
    'recent_orders', v_orders,
    'open_cases', v_cases,
    'bookings', v_bookings);
END;
$$;

REVOKE ALL ON FUNCTION public.my_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_account() TO authenticated, service_role;
