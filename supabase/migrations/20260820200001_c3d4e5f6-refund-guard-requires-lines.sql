-- ============================================================================
-- The refund guard that guarded nothing
-- ============================================================================
-- refund_return computed the expected payout from the RMA's return_items and
-- then wrote the guard as:
--
--     IF v_expected > 0 AND v_new_total > v_expected THEN RAISE ...
--
-- The `v_expected > 0` half was meant to say "no lines priced yet, don't be
-- pedantic". What it actually said is "an RMA with no lines has no ceiling".
-- QA refunded 149 999,99 kr against a 499 kr order, repeatedly, through the
-- ordinary skill surface: create_return → approve_return → receive_return →
-- refund_return, never adding a single line. Zero expected total meant zero
-- checking, and the money went out.
--
-- Same class one step upstream: inspect_return accepted any restocking fee,
-- including one that pushes the expected total BELOW what has already been
-- paid out (fee 1500 after a 1800 partial refund on lines worth 1998 →
-- expected 498 < paid 1800). Every later refund_return call then raised, so
-- the RMA could never reach 'refunded' — permanently wedged, mid-payout.
--
-- Three changes, all on live bodies (pg_get_functiondef on sandbox):
--
--   1. An RMA with no return lines is rejected outright, naming the fix
--      (manage_return_item). Lines that exist but carry no unit_refund_cents
--      get their own message — same hole, different shape.
--   2. p_final is evaluated BEFORE the over-refund guard, and the guard only
--      fires on calls that actually move money. A wedged RMA can now be closed
--      administratively with p_refund_cents = 0 + p_final = true; p_final can
--      still NOT be used to push a payout past the expected total, because the
--      bypass would be the very leak this migration closes.
--   3. inspect_return refuses a fee that would strand an already-paid RMA, and
--      says both numbers so the operator can choose which one to move.
--
-- Everything QA verified as correct is preserved verbatim: partial refunds
-- accumulate, the RMA closes on exact total, p_final closes early.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.refund_return(
  p_return_id uuid,
  p_refund_cents integer,
  p_method text DEFAULT 'manual'::text,
  p_final boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ret RECORD;
  v_line_count integer;
  v_gross bigint;
  v_expected bigint;
  v_already bigint;
  v_new_total bigint;
  v_done boolean;
BEGIN
  SELECT * INTO v_ret FROM returns WHERE id = p_return_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return % not found', p_return_id; END IF;
  IF v_ret.status NOT IN ('received','approved') THEN
    RAISE EXCEPTION 'Return not in refundable state (status %)', v_ret.status;
  END IF;
  IF p_refund_cents IS NULL OR p_refund_cents < 0 THEN
    RAISE EXCEPTION 'refund_cents must not be negative';
  END IF;
  IF p_refund_cents = 0 AND NOT p_final THEN
    RAISE EXCEPTION 'refund_cents must be positive (pass p_final: true with refund_cents 0 only to close an RMA without a further payout)';
  END IF;

  -- The ceiling comes from the lines. No lines, no ceiling — so no refund.
  SELECT COUNT(*), COALESCE(SUM(quantity * unit_refund_cents), 0)
    INTO v_line_count, v_gross
    FROM return_items WHERE return_id = p_return_id;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'Return % has no return lines — add lines via manage_return_item (return_id, quantity, unit_refund_cents) before refunding', p_return_id;
  END IF;

  IF v_gross <= 0 THEN
    RAISE EXCEPTION 'Return % has % line(s) but an expected refund of 0 — set unit_refund_cents on the lines via manage_return_item before refunding', p_return_id, v_line_count;
  END IF;

  v_expected := v_gross - v_ret.restocking_fee_cents;
  IF v_expected < 0 THEN v_expected := 0; END IF;

  v_already := COALESCE(v_ret.refund_amount_cents, 0);
  v_new_total := v_already + p_refund_cents;

  -- p_final decided first: closing an RMA is an administrative act and must
  -- stay possible even for one that a later restocking fee pushed past its
  -- expected total (see inspect_return below — that door is now shut, but
  -- RMAs wedged before this migration still need a way out).
  v_done := p_final OR v_new_total >= v_expected;

  -- ...and the ceiling still applies to every call that moves money, p_final
  -- or not. A final call may close early; it may never over-pay.
  IF p_refund_cents > 0 AND v_new_total > v_expected THEN
    RAISE EXCEPTION 'Refund % would exceed expected total % (items % − restocking fee %); already refunded %. To close this RMA without a further payout, call again with refund_cents 0 and p_final true',
      v_new_total, v_expected, v_gross, v_ret.restocking_fee_cents, v_already;
  END IF;

  UPDATE returns
     SET refund_amount_cents = v_new_total,
         refund_method = CASE WHEN p_refund_cents > 0 THEN p_method ELSE refund_method END,
         refund_processed_at = now(),
         status = CASE WHEN v_done THEN 'refunded' ELSE status END
   WHERE id = p_return_id;

  RETURN jsonb_build_object('success', true, 'return_id', p_return_id,
    'refunded_cents', v_new_total, 'expected_cents', v_expected,
    'remaining_cents', GREATEST(v_expected - v_new_total, 0),
    'line_count', v_line_count,
    'status', CASE WHEN v_done THEN 'refunded' ELSE v_ret.status END);
END $function$;

CREATE OR REPLACE FUNCTION public.inspect_return(
  p_return_id uuid,
  p_notes text DEFAULT NULL::text,
  p_restocking_fee_cents bigint DEFAULT NULL::bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_gross bigint;
  v_already bigint;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can inspect returns';
  END IF;

  IF p_restocking_fee_cents IS NOT NULL THEN
    IF p_restocking_fee_cents < 0 THEN
      RAISE EXCEPTION 'restocking_fee_cents must not be negative';
    END IF;

    SELECT COALESCE(SUM(quantity * unit_refund_cents), 0) INTO v_gross
      FROM return_items WHERE return_id = p_return_id;
    SELECT COALESCE(refund_amount_cents, 0) INTO v_already
      FROM returns WHERE id = p_return_id;

    -- A fee is a deduction from a payout that may already have started. If it
    -- deducts past what was paid, the RMA can never be reconciled: refund_return
    -- would reject every remaining call and the return stays open forever.
    IF v_gross - p_restocking_fee_cents < v_already THEN
      RAISE EXCEPTION 'Restocking fee % would drop the expected refund total to % (lines % − fee %), below the % already refunded on this RMA — lower the fee to at most %',
        p_restocking_fee_cents,
        v_gross - p_restocking_fee_cents,
        v_gross,
        p_restocking_fee_cents,
        v_already,
        GREATEST(v_gross - v_already, 0);
    END IF;
  END IF;

  UPDATE returns
     SET inspected_at = now(),
         inspection_notes = COALESCE(p_notes, inspection_notes),
         restocking_fee_cents = COALESCE(p_restocking_fee_cents, restocking_fee_cents)
   WHERE id = p_return_id AND status = 'received';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found or not in received state', p_return_id;
  END IF;
  RETURN jsonb_build_object('success', true, 'return_id', p_return_id, 'inspected', true);
END $function$;
