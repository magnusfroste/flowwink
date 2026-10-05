-- Kreditnotan bär sin part och sina rader.
--
-- create_credit_note skrev beloppen (subtotal, moms, total) men varken rader,
-- company_id, partner_id eller buyer_reference. Som PDF såg det ut som en
-- kreditnota; som e-faktura (UBL/Peppol, 20261005060000) föll den på BR-16
-- (inga rader), BR-11 (ingen köparadress) och PEPPOL-EN16931-R010 (ingen
-- elektronisk adress) — hittat av processbatteriet quote-to-cash första gången
-- en kreditnota exporterades. En kreditnota är ett dokument till samma part som
-- fakturan den krediterar; nu säger raden det själv.
--
-- Kroppen är den live-körande (pg_get_functiondef 2026-10-05) med ENBART
-- INSERT-listan utökad; över-krediteringsskyddet och momsfördelningen är
-- orörda. Full kreditering kopierar fakturans rader negerade (Σ rader =
-- subtotal_cents); delkreditering får en rad för det krediterade nettot.

CREATE OR REPLACE FUNCTION public.create_credit_note(p_invoice_id uuid, p_reason text DEFAULT NULL::text, p_amount_cents integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inv RECORD;
  v_seq int;
  v_number text;
  v_sub int;
  v_tax int;
  v_tot int;
  v_id uuid;
  v_already_credited bigint;
  v_remaining bigint;
  v_amount int;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'invoicing')) THEN
    RAISE EXCEPTION 'Requires the invoicing module — an admin can grant it under Users → Role Permissions';
  END IF;

  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_id; END IF;
  IF v_inv.invoice_type <> 'invoice' THEN RAISE EXCEPTION 'Cannot credit a credit note'; END IF;

  SELECT COALESCE(SUM(ABS(total_cents)), 0) INTO v_already_credited
    FROM invoices
   WHERE credited_invoice_id = p_invoice_id AND invoice_type = 'credit_note' AND status::text <> 'cancelled';

  v_remaining := GREATEST(0, v_inv.total_cents - v_already_credited);
  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'Invoice % is already fully credited (total %, already credited %)', p_invoice_id, v_inv.total_cents, v_already_credited;
  END IF;

  v_amount := COALESCE(p_amount_cents, v_remaining::int);
  IF v_amount <= 0 THEN RAISE EXCEPTION 'p_amount_cents must be positive'; END IF;
  IF v_amount > v_remaining THEN
    RAISE EXCEPTION 'Credit % exceeds remaining creditable amount % (invoice total %, already credited %)', v_amount, v_remaining, v_inv.total_cents, v_already_credited;
  END IF;

  -- The credited amount is gross. Its VAT share is the invoice's own ratio, so
  -- that crediting the whole invoice in parts reverses exactly the VAT charged.
  IF v_amount = v_remaining AND v_already_credited = 0 THEN
    v_sub := -v_inv.subtotal_cents; v_tax := -v_inv.tax_cents; v_tot := -v_inv.total_cents;
  ELSE
    v_tax := CASE WHEN COALESCE(v_inv.total_cents, 0) > 0
                  THEN -round(v_amount::numeric * COALESCE(v_inv.tax_cents, 0) / v_inv.total_cents)::int
                  ELSE 0 END;
    -- The last part reverses whatever VAT is still un-reversed, so rounding can never leave an öre behind.
    IF v_amount = v_remaining THEN
      SELECT -(COALESCE(v_inv.tax_cents, 0) - COALESCE(SUM(ABS(tax_cents)), 0)) INTO v_tax
        FROM invoices WHERE credited_invoice_id = p_invoice_id AND invoice_type = 'credit_note' AND status::text <> 'cancelled';
    END IF;
    v_tot := -v_amount;
    v_sub := v_tot - v_tax;
  END IF;

  SELECT count(*) + 1 INTO v_seq FROM invoices WHERE credited_invoice_id = p_invoice_id;
  v_number := COALESCE(v_inv.invoice_number, v_inv.id::text) || '-CN' || v_seq::text;

  INSERT INTO invoices (
    invoice_number, invoice_type, credited_invoice_id, lead_id, customer_name, customer_email,
    currency, subtotal_cents, tax_cents, total_cents, status, issue_date, due_date, notes,
    -- credit-note-is-a-document 20261005060100: the same party and reference as the
    -- invoice it credits, and lines that sum to its subtotal — a credit note with
    -- no lines and no buyer fails EN 16931 (BR-16, BR-11, PEPPOL-EN16931-R010).
    company_id, partner_id, buyer_reference, line_items
  ) VALUES (
    v_number, 'credit_note', p_invoice_id, v_inv.lead_id, v_inv.customer_name, v_inv.customer_email,
    v_inv.currency, v_sub, v_tax, v_tot, 'sent', CURRENT_DATE, CURRENT_DATE,
    COALESCE(p_reason, 'Credit note for ' || COALESCE(v_inv.invoice_number, v_inv.id::text)),
    v_inv.company_id, v_inv.partner_id, v_inv.buyer_reference,
    CASE
      -- Full credit: the invoice's own lines, negated, so Σ lines = subtotal_cents.
      WHEN v_amount = v_remaining AND v_already_credited = 0 AND jsonb_typeof(COALESCE(v_inv.line_items, '[]'::jsonb)) = 'array' AND jsonb_array_length(COALESCE(v_inv.line_items, '[]'::jsonb)) > 0 THEN
        (SELECT jsonb_agg(l || jsonb_build_object('unit_price_cents', -COALESCE((l->>'unit_price_cents')::numeric, 0)))
           FROM jsonb_array_elements(v_inv.line_items) l)
      -- Partial credit: one line for the credited amount (net), in the reason's words.
      ELSE jsonb_build_array(jsonb_build_object(
        'description', COALESCE(p_reason, 'Credit note for ' || COALESCE(v_inv.invoice_number, v_inv.id::text)),
        'qty', 1, 'unit_price_cents', v_sub))
    END
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true, 'credit_note_id', v_id, 'invoice_number', v_number,
    'subtotal_cents', v_sub, 'tax_cents', v_tax, 'total_cents', v_tot,
    'already_credited_cents', v_already_credited, 'remaining_creditable_cents', v_remaining - v_amount);
END;
$function$
