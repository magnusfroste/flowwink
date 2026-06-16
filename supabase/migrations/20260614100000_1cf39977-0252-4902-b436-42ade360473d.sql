-- Invoicing: manual partial payments (docs/parity/capabilities/invoicing.json#partial_payment).
-- Bank-reconciliation partial payments already exist (reconcile_invoice_payments →
-- invoices.paid_amount_cents). This adds a manual payment path (cash/Swish/etc.
-- without a bank transaction): record_invoice_payment increments paid_amount_cents,
-- rejects overpayment, and flips the invoice to paid when fully settled. Idempotent.

CREATE OR REPLACE FUNCTION "public"."record_invoice_payment"(
  "p_invoice_id" "uuid",
  "p_amount_cents" bigint,
  "p_method" "text" DEFAULT 'manual',
  "p_paid_at" timestamptz DEFAULT now()
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  v_inv RECORD;
  v_remaining bigint;
  v_new_paid bigint;
  v_fully boolean;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'approver')) THEN
    RAISE EXCEPTION 'Not authorized to record payments';
  END IF;
  IF p_amount_cents <= 0 THEN RAISE EXCEPTION 'p_amount_cents must be positive'; END IF;

  SELECT id, total_cents, COALESCE(paid_amount_cents,0) AS paid_amount_cents, status, invoice_type
    INTO v_inv FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_id; END IF;
  IF v_inv.status::text = 'cancelled' THEN RAISE EXCEPTION 'Cannot pay a cancelled invoice'; END IF;
  IF COALESCE(v_inv.invoice_type,'invoice') <> 'invoice' THEN RAISE EXCEPTION 'Cannot pay a credit note'; END IF;

  v_remaining := GREATEST(0, v_inv.total_cents - v_inv.paid_amount_cents);
  IF p_amount_cents > v_remaining THEN
    RAISE EXCEPTION 'Payment % exceeds remaining balance %', p_amount_cents, v_remaining;
  END IF;

  v_new_paid := v_inv.paid_amount_cents + p_amount_cents;
  v_fully := (v_new_paid >= v_inv.total_cents);

  UPDATE invoices
    SET paid_amount_cents = v_new_paid,
        status = CASE WHEN v_fully THEN 'paid'::invoice_status ELSE status END,
        paid_at = CASE WHEN v_fully THEN COALESCE(paid_at, p_paid_at) ELSE paid_at END
  WHERE id = p_invoice_id;

  INSERT INTO audit_logs (action, entity_type, entity_id, user_id, metadata)
  VALUES ('invoice.payment_recorded', 'invoice', p_invoice_id, auth.uid(),
    jsonb_build_object('amount_cents', p_amount_cents, 'method', p_method,
      'paid_amount_cents', v_new_paid, 'fully_paid', v_fully));

  RETURN jsonb_build_object(
    'success', true, 'invoice_id', p_invoice_id,
    'amount_cents', p_amount_cents, 'paid_amount_cents', v_new_paid,
    'remaining_cents', GREATEST(0, v_inv.total_cents - v_new_paid),
    'fully_paid', v_fully,
    'status', CASE WHEN v_fully THEN 'paid' ELSE v_inv.status::text END
  );
END;
$$;

ALTER FUNCTION "public"."record_invoice_payment"("uuid",bigint,"text",timestamptz) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."record_invoice_payment"("uuid",bigint,"text",timestamptz) TO "anon", "authenticated", "service_role";
