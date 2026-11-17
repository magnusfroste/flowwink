-- ============================================================================
-- The invoice says who is asking and how to pay (2026-11-17).
--
-- Found by opening the link from the invoice mail in a browser, as the
-- customer: the page said "Invoice INV-…", the customer's own name, the lines,
-- a total and a due date. It did not say WHO the invoice is from, carried no
-- organisation or VAT number, and gave one way to pay — a card button that
-- answers "Failed to start payment" on every instance without Stripe. The PDF
-- had the same holes. A customer who wanted to pay by bank had nowhere to send
-- the money and nothing to write as reference.
--
-- The facts already exist and already have one home: Business Identity
-- (site_settings.company_profile: legal name, organisation number, VAT number,
-- address) and the e-invoice settings (site_settings.einvoice: bankgiro, IBAN,
-- BIC) — what the Peppol invoice has printed since 20261005060000. The page and
-- the PDF now read the same two rows.
--
--   invoice_seller_facts()            the seller and where to pay — for the
--                                     platform's own readers (the PDF).
--   get_invoice_payment_info(p_token) the same, for whoever holds an invoice's
--                                     link, plus the reference to state.
--
-- Whether a card can be taken is not a database fact (the key lives in the
-- edge runtime): the page asks create-invoice-payment.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.invoice_seller_facts()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH p AS (SELECT value AS v FROM public.site_settings WHERE key = 'company_profile'),
       e AS (SELECT value AS v FROM public.site_settings WHERE key = 'einvoice')
  SELECT jsonb_build_object(
    'seller', jsonb_strip_nulls(jsonb_build_object(
      'name', public.business_name(),
      'legal_name', nullif(btrim((SELECT v->>'legal_name' FROM p)), ''),
      'org_number', nullif(btrim((SELECT v->>'org_number' FROM p)), ''),
      'vat_number', nullif(btrim((SELECT v->>'vat_number' FROM p)), ''),
      'address', nullif(btrim((SELECT v->>'address' FROM p)), ''),
      'postal_code', nullif(btrim((SELECT v->>'postal_code' FROM p)), ''),
      'city', nullif(btrim((SELECT v->>'city' FROM p)), ''),
      'country', nullif(btrim((SELECT v->>'country' FROM p)), ''),
      'email', nullif(btrim((SELECT v->>'contact_email' FROM p)), ''),
      'phone', nullif(btrim((SELECT v->>'contact_phone' FROM p)), '')
    )),
    'payment', jsonb_strip_nulls(jsonb_build_object(
      'bankgiro', nullif(btrim((SELECT v->>'bankgiro' FROM e)), ''),
      'iban', nullif(btrim((SELECT v->>'iban' FROM e)), ''),
      'bic', nullif(btrim((SELECT v->>'bic' FROM e)), '')
    ))
  )
$$;

-- The platform's own readers only (the PDF function runs as the service role).
REVOKE ALL ON FUNCTION public.invoice_seller_facts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invoice_seller_facts() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_seller_facts() TO service_role;

CREATE OR REPLACE FUNCTION public.get_invoice_payment_info(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- NULL unless an invoice holds the token: what an invoice prints is for the
  -- one it was sent to, as the invoice itself is (get_invoice_by_token).
  SELECT public.invoice_seller_facts()
         || jsonb_build_object('reference', i.invoice_number)
    FROM public.invoices i
   WHERE public.token_is_plausible(p_token)
     AND i.public_token IS NOT NULL
     AND i.public_token = btrim(p_token)
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_invoice_payment_info(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invoice_payment_info(text) TO anon, authenticated, service_role;

-- ── Proof, rolled back: touches no row an instance already has ──────────────
DO $$
DECLARE
  v_token text := 'proof-' || replace(gen_random_uuid()::text, '-', '');
  v_number text := 'PROOF-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  v jsonb;
BEGIN
  IF public.get_invoice_payment_info('') IS NOT NULL OR public.get_invoice_payment_info('short') IS NOT NULL THEN
    RAISE EXCEPTION 'get_invoice_payment_info answered a token no invoice holds';
  END IF;
  IF public.get_invoice_payment_info(v_token) IS NOT NULL THEN
    RAISE EXCEPTION 'get_invoice_payment_info answered an unknown token';
  END IF;

  BEGIN
    INSERT INTO public.invoices (invoice_number, customer_name, customer_email, public_token, line_items, subtotal_cents, tax_cents, total_cents)
    VALUES (v_number, 'Proof', 'proof@example.test', v_token, '[]'::jsonb, 0, 0, 0);
    v := public.get_invoice_payment_info(v_token);
    IF v IS NULL OR v->>'reference' <> v_number OR NOT (v ? 'seller') OR NOT (v ? 'payment') THEN
      RAISE EXCEPTION 'get_invoice_payment_info did not answer the invoice''s holder: %', v;
    END IF;
    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'proof-rollback' THEN
      -- An instance whose invoices table refuses a bare row (a required column
      -- added later, a trigger with a rule of its own) proves nothing here.
      IF SQLERRM LIKE 'get_invoice_payment_info%' THEN RAISE; END IF;
      RAISE NOTICE 'invoice payment info: proof row not accepted (%), skipped', SQLERRM;
    END IF;
  END;
END $$;
