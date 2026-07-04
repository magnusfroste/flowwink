-- Fix create_credit_note: the over-credit guard only compared a SINGLE credit
-- against the invoice total, not the CUMULATIVE credited amount. So two partial
-- credits (e.g. 5000 then 10000 on a 12500 invoice) both passed the per-call
-- check while together exceeding the total — leaving -15000 credited against a
-- 12500 invoice (an AR-integrity break). Caught by live verification on rzhj
-- 2026-07-04; the earlier scratch check only exercised a single over-total
-- credit (which the per-call guard does catch).
--
-- Fix: sum existing credit notes for the invoice and reject when the running
-- total would exceed the invoice total. Full credit (no amount) negates the
-- REMAINING creditable balance, and a fully-credited invoice is rejected.
-- Forward-dated CREATE OR REPLACE so it reaches managed/forked instances and
-- supersedes both prior definitions (20260614090000, 20260627220000).

CREATE OR REPLACE FUNCTION "public"."create_credit_note"(
  "p_invoice_id" "uuid",
  "p_reason" "text" DEFAULT NULL,
  "p_amount_cents" integer DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  v_inv RECORD;
  v_seq int;
  v_number text;
  v_sub int; v_tax int; v_tot int;
  v_id uuid;
  v_already_credited int;
  v_remaining int;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can issue credit notes';
  END IF;

  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_id; END IF;
  IF v_inv.invoice_type <> 'invoice' THEN RAISE EXCEPTION 'Cannot credit a credit note'; END IF;

  -- Sum what has already been credited (credit notes carry negative total_cents,
  -- so -SUM(total_cents) is the positive amount already credited).
  SELECT COALESCE(-SUM(total_cents), 0)::int INTO v_already_credited
    FROM invoices
    WHERE credited_invoice_id = p_invoice_id
      AND invoice_type = 'credit_note';

  v_remaining := v_inv.total_cents - v_already_credited;
  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'Invoice % is already fully credited (% of %)',
      v_inv.invoice_number, v_already_credited, v_inv.total_cents;
  END IF;

  IF p_amount_cents IS NULL THEN
    -- Full credit of the REMAINING creditable balance.
    IF v_already_credited = 0 THEN
      v_sub := -v_inv.subtotal_cents; v_tax := -v_inv.tax_cents; v_tot := -v_inv.total_cents;
    ELSE
      v_tot := -v_remaining; v_sub := v_tot; v_tax := 0;
    END IF;
  ELSE
    IF p_amount_cents <= 0 THEN RAISE EXCEPTION 'p_amount_cents must be positive'; END IF;
    IF p_amount_cents > v_remaining THEN
      RAISE EXCEPTION 'Credit % exceeds remaining creditable % (invoice total %, already credited %)',
        p_amount_cents, v_remaining, v_inv.total_cents, v_already_credited;
    END IF;
    v_sub := -p_amount_cents; v_tax := 0; v_tot := -p_amount_cents;
  END IF;

  SELECT count(*) + 1 INTO v_seq FROM invoices WHERE credited_invoice_id = p_invoice_id;
  v_number := 'CN-' || v_inv.invoice_number || '-' || v_seq;

  INSERT INTO invoices (
    invoice_number, invoice_type, credited_invoice_id,
    customer_email, customer_name, status, line_items,
    subtotal_cents, tax_rate, tax_cents, total_cents, currency,
    notes, created_by, issue_date
  ) VALUES (
    v_number, 'credit_note', p_invoice_id,
    v_inv.customer_email, v_inv.customer_name, 'sent', v_inv.line_items,
    v_sub, v_inv.tax_rate, v_tax, v_tot, v_inv.currency,
    COALESCE(p_reason, 'Credit note for ' || v_inv.invoice_number), auth.uid(), CURRENT_DATE
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true, 'credit_note_id', v_id, 'credit_note_number', v_number,
    'credited_invoice_id', p_invoice_id, 'total_cents', v_tot,
    'kind', CASE WHEN p_amount_cents IS NULL THEN 'full' ELSE 'partial' END
  );
END;
$$;

ALTER FUNCTION "public"."create_credit_note"("uuid","text",integer) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."create_credit_note"("uuid","text",integer) TO "anon", "authenticated", "service_role";
