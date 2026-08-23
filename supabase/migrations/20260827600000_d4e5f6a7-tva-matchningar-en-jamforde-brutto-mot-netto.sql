-- match_po_to_invoice compared the invoice GROSS against the receipt NET, so
-- every VAT-bearing bill read as a variance exactly the size of the VAT rate.
--
-- Measured on the Nordbrygg testbed 2026-08-23: a perfectly matched 12 % bill
-- was reported with 12 % variance. On a 25 % instance every correct invoice
-- would land outside a 2 % tolerance and be flagged for a human who would find
-- nothing wrong — the fastest way to teach an operator to ignore the flag.
--
-- It is the same shape as three other bugs found the same day: TWO functions for
-- one truth, and the less-used one is wrong. `vendor_invoice_match_eval`
-- (20260827100000) already compares subtotal to receipt value and already
-- subtracts what sibling invoices have claimed — it is what the payment gate
-- reads, which is why the gate was never fooled. This one kept its own
-- arithmetic and its own opinion.
--
-- A THIRD defect surfaced when the new state-machine guard met the old
-- function: matching WRITES a status as a side effect, and it happily tried to
-- move a PAID invoice to 'variance'. Re-grading a bill after the money has left
-- was always wrong; nothing had ever refused it. The guard made it visible by
-- raising, which turned an agent's "match this invoice" into a hard error.
--
-- So: one arithmetic (delegate), and status is only written when the transition
-- is legal. A paid or cancelled invoice is still re-evaluated and still reports
-- its true match — the label just no longer rewrites history.
CREATE OR REPLACE FUNCTION public.match_po_to_invoice(
  p_invoice_id uuid, p_variance_tolerance_pct numeric DEFAULT 2.0
) RETURNS vendor_invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv public.vendor_invoices;
  v_eval jsonb;
  v_match_status text;
  v_variance bigint;
  v_notes text;
  v_terminal boolean;
BEGIN
  IF auth.uid() IS NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_inv FROM public.vendor_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Vendor invoice not found'; END IF;
  IF v_inv.purchase_order_id IS NULL THEN
    RAISE EXCEPTION 'Invoice has no linked purchase order';
  END IF;

  -- ONE arithmetic. It compares net to net and already nets off sibling claims.
  v_eval := public.vendor_invoice_match_eval(p_invoice_id, p_variance_tolerance_pct);
  v_match_status := v_eval ->> 'match_status';
  v_variance     := (v_eval ->> 'variance_cents')::bigint;
  v_notes        := v_eval ->> 'notes';

  -- The label always tells the truth; the STATUS is only advanced where that is
  -- a legal step. Money that has moved is not re-graded by a read.
  v_terminal := v_inv.status IN ('paid', 'cancelled');

  UPDATE public.vendor_invoices
     SET match_status   = v_match_status,
         variance_cents = v_variance,
         variance_notes = CASE WHEN v_terminal
                               THEN v_notes || ' (status left at ' || v_inv.status || '; already settled)'
                               ELSE v_notes END,
         status         = CASE WHEN v_terminal THEN v_inv.status
                               WHEN v_match_status = 'matched' THEN 'matched'
                               ELSE 'variance' END,
         updated_at     = now()
   WHERE id = p_invoice_id
  RETURNING * INTO v_inv;

  RETURN v_inv;
END; $function$;
