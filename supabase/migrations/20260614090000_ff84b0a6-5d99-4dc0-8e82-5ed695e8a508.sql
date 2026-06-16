-- Invoicing: credit notes (docs/parity/capabilities/invoicing.json#credit_notes).
-- Adds invoice_type ('invoice'|'credit_note') + credited_invoice_id, and
-- create_credit_note() which issues a credit note that negates the original
-- (full) or a given amount (partial), copying customer + currency. Idempotent.

ALTER TABLE "public"."invoices"
  ADD COLUMN IF NOT EXISTS "invoice_type" "text" DEFAULT 'invoice' NOT NULL,
  ADD COLUMN IF NOT EXISTS "credited_invoice_id" "uuid";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name='invoices_invoice_type_check' AND table_name='invoices') THEN
    ALTER TABLE "public"."invoices" ADD CONSTRAINT "invoices_invoice_type_check"
      CHECK ("invoice_type" IN ('invoice','credit_note'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name='invoices_credited_invoice_id_fkey' AND table_name='invoices') THEN
    ALTER TABLE "public"."invoices" ADD CONSTRAINT "invoices_credited_invoice_id_fkey"
      FOREIGN KEY ("credited_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "invoices_credited_invoice_id_idx"
  ON "public"."invoices" ("credited_invoice_id") WHERE "credited_invoice_id" IS NOT NULL;

-- create_credit_note: issue a credit note against an invoice. Full credit (no
-- amount) negates subtotal/tax/total; partial credit negates p_amount_cents only.
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
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can issue credit notes';
  END IF;

  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_id; END IF;
  IF v_inv.invoice_type <> 'invoice' THEN RAISE EXCEPTION 'Cannot credit a credit note'; END IF;

  IF p_amount_cents IS NULL THEN
    -- full credit: negate the original
    v_sub := -v_inv.subtotal_cents; v_tax := -v_inv.tax_cents; v_tot := -v_inv.total_cents;
  ELSE
    IF p_amount_cents <= 0 THEN RAISE EXCEPTION 'p_amount_cents must be positive'; END IF;
    IF p_amount_cents > v_inv.total_cents THEN
      RAISE EXCEPTION 'Credit % exceeds invoice total %', p_amount_cents, v_inv.total_cents;
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
