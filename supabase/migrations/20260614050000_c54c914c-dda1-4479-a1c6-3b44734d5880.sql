-- Booking duration rules (docs/parity/capabilities/booking.json#duration_rules).
-- booking_services already carries duration_minutes and bookings has start/end —
-- but nothing derived the end from the service length or prevented double-booking.
-- book_appointment_slot() resolves the service duration, computes end_time, and
-- rejects any overlapping non-cancelled booking for the same service. Idempotent.

CREATE OR REPLACE FUNCTION "public"."book_appointment_slot"(
  "p_service_id" "uuid",
  "p_customer_name" "text",
  "p_customer_email" "text",
  "p_start_time" timestamptz,
  "p_customer_phone" "text" DEFAULT NULL,
  "p_notes" "text" DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  v_duration int;
  v_end timestamptz;
  v_id uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'writer')) THEN
    RAISE EXCEPTION 'Not authorized to create bookings';
  END IF;

  SELECT duration_minutes INTO v_duration
  FROM booking_services WHERE id = p_service_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service % not found or inactive', p_service_id; END IF;

  v_end := p_start_time + make_interval(mins => v_duration);

  -- reject overlap on the same service (excluding cancelled bookings)
  IF EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.service_id = p_service_id
      AND b.status <> 'cancelled'
      AND tstzrange(b.start_time, b.end_time, '[)') && tstzrange(p_start_time, v_end, '[)')
  ) THEN
    RAISE EXCEPTION 'slot_unavailable: % overlaps an existing booking', p_start_time
      USING ERRCODE = 'exclusion_violation';
  END IF;

  INSERT INTO bookings (service_id, customer_name, customer_email, customer_phone, start_time, end_time, notes, status)
  VALUES (p_service_id, p_customer_name, p_customer_email, p_customer_phone, p_start_time, v_end, p_notes, 'pending')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_id,
    'start_time', p_start_time,
    'end_time', v_end,
    'duration_minutes', v_duration
  );
END;
$$;

ALTER FUNCTION "public"."book_appointment_slot"("uuid","text","text",timestamptz,"text","text") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."book_appointment_slot"("uuid","text","text",timestamptz,"text","text") TO "anon", "authenticated", "service_role";
