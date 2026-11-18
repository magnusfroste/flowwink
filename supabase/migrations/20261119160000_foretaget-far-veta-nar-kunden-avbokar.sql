-- ============================================================================
-- The business hears when a customer calls off their booking (2026-11-19).
--
-- 20261119090000 gave the customer a link to move or cancel a booking. A move
-- told the admins; a cancellation told nobody — the booking just changed
-- status, and the first anyone knew was an empty chair. The customer's own
-- cancellation now raises booking.cancelled_by_customer, which the booking
-- module's automation answers with a mail to the admins (who, when, and the
-- customer's words). A cancellation by staff or an agent raises nothing new:
-- they were there.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancel_booking_by_token(p_token text, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
BEGIN
  IF NOT public.token_is_plausible(p_token) THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'error', 'No booking answers to this link.');
  END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE manage_token = btrim(p_token) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'error', 'No booking answers to this link.');
  END IF;
  IF v_booking.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', true, 'already', true, 'status', 'cancelled');
  END IF;
  IF v_booking.status NOT IN ('pending', 'confirmed') OR v_booking.start_time <= now() THEN
    RETURN jsonb_build_object('success', false, 'code', 'TOO_LATE', 'error', 'This booking has already taken place and can no longer be changed.');
  END IF;

  UPDATE public.bookings
     SET status = 'cancelled',
         cancelled_at = now(),
         cancelled_reason = left('Cancelled by the customer' || COALESCE(': ' || NULLIF(btrim(p_reason), ''), ''), 500)
   WHERE id = v_booking.id;
  -- booking.cancelled says the slot is free (whoever called it off). This says
  -- the CUSTOMER did, from their link — the one cancellation nobody at the
  -- business saw happen.
  PERFORM public.emit_platform_event(
    'booking.cancelled_by_customer',
    jsonb_build_object('id', v_booking.id, 'data', jsonb_build_object(
      'start_time', v_booking.start_time, 'end_time', v_booking.end_time,
      'customer_name', v_booking.customer_name, 'customer_email', v_booking.customer_email,
      'service_id', v_booking.service_id, 'reason', COALESCE(NULLIF(btrim(p_reason), ''), '—'))),
    'bookings');
  RETURN jsonb_build_object('success', true, 'status', 'cancelled');
END;
$$;
