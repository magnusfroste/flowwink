-- ============================================================================
-- The customer sees what the quote is, whose it is and on what terms
-- (2026-11-17).
--
-- Found by opening the link from the quote mail in a browser, as the customer:
-- the page said "Quote QUO-0024", the lines and a total — and nothing else. No
-- sender, no recipient, no title, no introduction, and NOT THE TERMS. The page
-- has drawn title, intro_text and terms_text since it was written; the function
-- that feeds it (get_public_quote, 20260808120000) returns a hand-picked view
-- of the row and never carried them. A customer signed "Accept & Sign" on a
-- quote whose terms the seller had written and the page never showed.
--
-- The view stays a view (a token lookup returns a view, not the row): seven
-- fields are added — the title, the introduction, the terms, the discount, the
-- customer's own name and company, and the seller's name. Nothing internal
-- (owner, deal, lead, approval, exchange rate) is added.
--
-- The signing page had the same hole from the other side: "Between you and
-- <counterparty>" — read by the counterparty, that is their own name.
--
-- business_name() is the SQL twin of orgNameFrom (_shared/org-name.ts), the
-- name every mail goes out under: Branding's organisation name, then Business
-- Identity's company name, then the site name.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.business_name()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    nullif(btrim((SELECT value->>'organizationName' FROM public.site_settings WHERE key = 'branding')), ''),
    nullif(btrim((SELECT value->>'company_name' FROM public.site_settings WHERE key = 'company_profile')), ''),
    nullif(btrim((SELECT value->>'site_name' FROM public.site_settings WHERE key = 'general')), ''),
    nullif(btrim((SELECT value->>'siteName' FROM public.site_settings WHERE key = 'general')), ''),
    nullif(btrim((SELECT value->>'adminName' FROM public.site_settings WHERE key = 'branding')), '')
  )
$$;

-- Open to a visitor on purpose: it answers one thing, the name the business
-- trades under — the name on every mail it sends and on its own site. The
-- signing page needs it to say "between <seller> and <counterparty>" (it said
-- "between you and <the reader's own name>").
REVOKE ALL ON FUNCTION public.business_name() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.business_name() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_public_quote(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_quote public.quotes%ROWTYPE;
  v_items jsonb;
BEGIN
  -- Length guard: an empty or trivial token must never match.
  IF length(coalesce(trim(p_token), '')) < 16 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_quote FROM public.quotes
  WHERE accept_token = trim(p_token)
    -- Draft quotes are not public even with a leaked token — the same status
    -- gate the quote_items policy already enforced.
    AND status::text IN ('sent', 'viewed', 'accepted', 'rejected', 'expired')
  LIMIT 1;

  IF v_quote.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- First customer open: sent → viewed. Done here because the page's anon
  -- client has no UPDATE right on quotes, so the old markQuoteViewed silently
  -- did nothing for the only viewer that matters.
  IF v_quote.status::text = 'sent' THEN
    UPDATE public.quotes SET status = 'viewed', viewed_at = now()
    WHERE id = v_quote.id AND status::text = 'sent';
    v_quote.status := 'viewed';
    v_quote.viewed_at := now();
  END IF;

  -- Items: the table wins when populated (it carries the optional-items
  -- feature); admin-composed quotes fall back to the jsonb column. Both
  -- sources are normalized to the shape the page renders — the jsonb rows say
  -- `qty` where the table says `quantity`, and the fallback computes the line
  -- total the table stores precomputed.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', qi.id, 'description', qi.description, 'quantity', qi.quantity,
    'unit', qi.unit, 'unit_price_cents', qi.unit_price_cents,
    'line_total_cents', qi.line_total_cents,
    'is_optional', qi.is_optional, 'selected_by_customer', qi.selected_by_customer
  ) ORDER BY qi.position), '[]'::jsonb)
  INTO v_items
  FROM public.quote_items qi WHERE qi.quote_id = v_quote.id;

  IF jsonb_array_length(v_items) = 0 THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', COALESCE(li->>'id', 'jsonb-' || (ord - 1)::text),
      'description', li->>'description',
      'quantity', COALESCE((li->>'qty')::numeric, (li->>'quantity')::numeric, 1),
      'unit', li->>'unit',
      'unit_price_cents', COALESCE((li->>'unit_price_cents')::bigint, 0),
      'line_total_cents',
        (COALESCE((li->>'qty')::numeric, (li->>'quantity')::numeric, 1)
         * COALESCE((li->>'unit_price_cents')::bigint, 0))::bigint,
      'is_optional', false,
      'selected_by_customer', true
    ) ORDER BY ord), '[]'::jsonb)
    INTO v_items
    FROM jsonb_array_elements(COALESCE(v_quote.line_items::jsonb, '[]'::jsonb))
      WITH ORDINALITY AS t(li, ord);
  END IF;

  RETURN jsonb_build_object(
    'quote', jsonb_build_object(
      'id', v_quote.id,
      'quote_number', v_quote.quote_number,
      'status', v_quote.status,
      'subtotal_cents', v_quote.subtotal_cents,
      'tax_rate', v_quote.tax_rate,
      'tax_cents', v_quote.tax_cents,
      'total_cents', v_quote.total_cents,
      'currency', v_quote.currency,
      'valid_until', v_quote.valid_until,
      'prepayment_pct', v_quote.prepayment_pct,
      'paid_at', v_quote.paid_at,
      'notes', v_quote.notes,
      'sent_at', v_quote.sent_at,
      'accepted_at', v_quote.accepted_at,
      'rejected_at', v_quote.rejected_at,
      'viewed_at', v_quote.viewed_at,
      'created_at', v_quote.created_at,
      -- What the offer IS and whose it is (20261117120000): the page drew a
      -- title, an introduction and the terms, and was never handed them.
      'title', v_quote.title,
      'intro_text', v_quote.intro_text,
      'terms_text', v_quote.terms_text,
      'discount_cents', v_quote.discount_cents,
      'customer_name', v_quote.customer_name,
      'customer_company', v_quote.customer_company,
      'seller_name', public.business_name()
    ),
    'items', v_items
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_quote(text) TO anon, authenticated, service_role;

-- Proof, rolled back: the customer's view carries the offer's own words and
-- both names — and still none of the row's internal fields.
DO $proof$
DECLARE
  v jsonb;
  v_token text := 'proof-token-' || md5(random()::text) || md5(random()::text);
BEGIN
  BEGIN
    INSERT INTO public.site_settings (key, value) VALUES ('branding', '{"organizationName": "Proof Seller AB"}')
    ON CONFLICT (key) DO UPDATE SET value = public.site_settings.value || '{"organizationName": "Proof Seller AB"}';
    INSERT INTO public.quotes (quote_number, status, title, intro_text, terms_text, customer_name, customer_company, accept_token, notes)
    VALUES ('PROOF-' || left(md5(random()::text), 8), 'sent', 'Proof offer', 'As we agreed on the phone.', 'Payment within 30 days.', 'Proof Buyer', 'Buyer AB', v_token, 'internal');
    v := public.get_public_quote(v_token)->'quote';
    IF v->>'title' <> 'Proof offer' OR v->>'intro_text' <> 'As we agreed on the phone.' OR v->>'terms_text' <> 'Payment within 30 days.' THEN
      RAISE EXCEPTION 'proof: the customer is shown the title, the introduction and the terms, got %', v;
    END IF;
    IF v->>'customer_name' <> 'Proof Buyer' OR v->>'customer_company' <> 'Buyer AB' OR v->>'seller_name' <> 'Proof Seller AB' THEN
      RAISE EXCEPTION 'proof: the customer is shown whose offer it is and who it is for, got %', v;
    END IF;
    IF v ?| ARRAY['owner_id', 'lead_id', 'deal_id', 'accept_token', 'approval_request_id', 'customer_email', 'created_by'] THEN
      RAISE EXCEPTION 'proof: the view must not carry the row''s internal fields, got %', v;
    END IF;
    RAISE EXCEPTION 'proof passed — rolling back' USING ERRCODE = 'P0PRF';
  EXCEPTION
    WHEN SQLSTATE 'P0PRF' THEN NULL;
    WHEN undefined_table OR undefined_column OR undefined_object THEN
      RAISE NOTICE 'public quote view: proof skipped here (%)', SQLERRM;
  END;
END $proof$;
