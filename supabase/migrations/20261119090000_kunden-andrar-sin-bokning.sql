-- ============================================================================
-- The customer changes their own booking (2026-11-19).
--
-- The confirmation mail ended "If you need to change or cancel your booking,
-- please contact us as soon as possible" — and that was all a customer could
-- do. There was no link, no page, and no way to move a booking at all: not for
-- the customer, not for an agent. A customer who could not come had to phone,
-- and a slot nobody would use stayed taken.
--
-- A booking now carries a link of its own:
--   bookings.manage_token              the key in the confirmation mail
--   get_booking_by_token(token)        what the customer already knows about it
--   cancel_booking_by_token(token, …)  calls it off — the slot is free again and
--                                      the waiting list is offered it, as ever
--   reschedule_booking_by_token(token, new_start)
--                                      moves it. Every rule a visitor's booking
--                                      meets (opening hours, blocked days, the
--                                      service's capacity and buffers, the
--                                      person's calendar) is met again: the
--                                      move is an UPDATE, and booking_rules
--                                      judges it.
-- A moved booking raises booking.rescheduled; the booking module's automation
-- answers it with a new confirmation.
-- ============================================================================

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS manage_token text;
ALTER TABLE public.bookings ALTER COLUMN manage_token SET DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
COMMENT ON COLUMN public.bookings.manage_token IS 'The key in the confirmation mail: whoever holds it may read, move or call off this one booking.';

-- Bookings still ahead get their key now; what has passed needs none. The
-- update touches neither time nor status, so no booking rule is asked.
UPDATE public.bookings
   SET manage_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
 WHERE manage_token IS NULL
   AND status IN ('pending', 'confirmed')
   AND start_time > now();

CREATE UNIQUE INDEX IF NOT EXISTS bookings_manage_token_key ON public.bookings (manage_token) WHERE manage_token IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_booking_by_token(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- A view of the booking, never the row: no internal notes, no other customer.
  SELECT jsonb_build_object(
           'id', b.id,
           'status', b.status,
           'start_time', b.start_time,
           'end_time', b.end_time,
           'customer_name', b.customer_name,
           'service_id', b.service_id,
           'service_name', s.name,
           'duration_minutes', s.duration_minutes,
           'employee_id', b.assigned_employee_id,
           'meeting_url', b.meeting_url,
           'cancelled_at', b.cancelled_at,
           'timezone', public.platform_timezone(),
           'business_name', public.business_name(),
           'can_change', b.status IN ('pending', 'confirmed') AND b.start_time > now())
    FROM public.bookings b
    LEFT JOIN public.booking_services s ON s.id = b.service_id
   WHERE public.token_is_plausible(p_token)
     AND b.manage_token IS NOT NULL
     AND b.manage_token = btrim(p_token)
   LIMIT 1
$$;

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
  RETURN jsonb_build_object('success', true, 'status', 'cancelled');
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_booking_by_token(p_token text, p_new_start timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_length interval;
BEGIN
  IF NOT public.token_is_plausible(p_token) THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'error', 'No booking answers to this link.');
  END IF;
  IF p_new_start IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT', 'error', 'Choose the new time.');
  END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE manage_token = btrim(p_token) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'error', 'No booking answers to this link.');
  END IF;
  IF v_booking.status NOT IN ('pending', 'confirmed') OR v_booking.start_time <= now() THEN
    RETURN jsonb_build_object('success', false, 'code', 'TOO_LATE', 'error', 'This booking can no longer be changed.');
  END IF;
  IF p_new_start <= now() THEN
    RETURN jsonb_build_object('success', false, 'code', 'SLOT_UNAVAILABLE', 'error', 'That time has passed — choose a later one.');
  END IF;
  IF p_new_start = v_booking.start_time THEN
    RETURN jsonb_build_object('success', true, 'unchanged', true, 'start_time', v_booking.start_time, 'end_time', v_booking.end_time);
  END IF;

  v_length := COALESCE(v_booking.end_time - v_booking.start_time, interval '60 minutes');
  BEGIN
    -- The move is an UPDATE: booking_rules judges the new time as it judges a
    -- visitor's new booking. A reminder or confirmation already sent was for
    -- the old time: both stamps are given back, so the new time is confirmed.
    UPDATE public.bookings
       SET start_time = p_new_start,
           end_time = p_new_start + v_length,
           reminder_sent_at = NULL,
           confirmation_sent_at = NULL
     WHERE id = v_booking.id;
  EXCEPTION WHEN check_violation OR exclusion_violation OR raise_exception THEN
    RETURN jsonb_build_object('success', false, 'code', 'SLOT_UNAVAILABLE',
      'error', 'That time is not available — choose another.', 'detail', SQLERRM);
  END;

  PERFORM public.emit_platform_event(
    'booking.rescheduled',
    jsonb_build_object('id', v_booking.id, 'data', jsonb_build_object(
      'previous_start_time', v_booking.start_time, 'start_time', p_new_start, 'end_time', p_new_start + v_length,
      'customer_name', v_booking.customer_name, 'customer_email', v_booking.customer_email, 'service_id', v_booking.service_id)),
    'bookings');
  RETURN jsonb_build_object('success', true, 'start_time', p_new_start, 'end_time', p_new_start + v_length);
END;
$$;

-- For whoever holds the booking's key — the visitor who made it.
REVOKE ALL ON FUNCTION public.get_booking_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_booking_by_token(text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_booking_by_token(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_booking_by_token(text, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reschedule_booking_by_token(text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reschedule_booking_by_token(text, timestamptz) TO anon, authenticated, service_role;

-- ── Proof: reads only — no booking an instance has is moved or called off ────
DO $$
DECLARE
  v_unknown text := 'proof-' || replace(gen_random_uuid()::text, '-', '');
  v_row record;
  v jsonb;
BEGIN
  IF public.get_booking_by_token('') IS NOT NULL OR public.get_booking_by_token('short') IS NOT NULL
     OR public.get_booking_by_token(v_unknown) IS NOT NULL THEN
    RAISE EXCEPTION 'get_booking_by_token answered a key no booking holds';
  END IF;
  IF (public.cancel_booking_by_token(v_unknown, NULL)->>'code') IS DISTINCT FROM 'NOT_FOUND'
     OR (public.reschedule_booking_by_token(v_unknown, now() + interval '1 day')->>'code') IS DISTINCT FROM 'NOT_FOUND' THEN
    RAISE EXCEPTION 'a key no booking holds was not refused';
  END IF;

  SELECT id, manage_token INTO v_row FROM public.bookings WHERE manage_token IS NOT NULL LIMIT 1;
  IF NOT FOUND THEN
    RAISE NOTICE 'customer booking link: no booking ahead on this instance, the read is proven on the next one made';
    RETURN;
  END IF;
  v := public.get_booking_by_token(v_row.manage_token);
  IF v IS NULL OR (v->>'id')::uuid <> v_row.id OR v ? 'customer_email' OR v ? 'internal_notes' THEN
    RAISE EXCEPTION 'get_booking_by_token did not answer its holder as it should: %', v;
  END IF;
END $$;
