-- The public quote page has never worked for an actual customer.
--
-- Same disease as the contract page, one surface over: /quote/:token read the
-- quotes table directly with the anon key, and quotes has admin-only policies.
-- Every internal test passed because the tester was logged in as admin in the
-- same browser — the ONE audience the page exists for, the customer following
-- an emailed link, got "quote not found" on every instance since the feature
-- shipped.
--
-- Second fault, found in the same sweep: line items live twice. The admin
-- sheet edits quotes.line_items (jsonb); the public page reads the
-- quote_items TABLE (built for the optional-items feature). On quotes
-- composed in the admin UI the table is empty, so even an admin previewing
-- the customer link saw a quote without a single line on it.
--
-- One token-keyed SECURITY DEFINER function fixes both: it returns the quote
-- plus items from the table when populated, falling back to the jsonb — and
-- stamps viewed_at on first customer open (the anon UPDATE that
-- markQuoteViewed could never perform).

CREATE OR REPLACE FUNCTION public.get_public_quote(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      'created_at', v_quote.created_at
    ),
    'items', v_items
  );
END;
$$;

-- Deliberately anon-callable: the token is the credential, like
-- get_public_contract and ingest_form_lead.
GRANT EXECUTE ON FUNCTION public.get_public_quote(text) TO anon, authenticated, service_role;
