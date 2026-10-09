-- Besökarens svar följer med bokningen.
--
-- #637 lät en tjänst ställa frågor före bokning: det publika blocket skickar
-- svaren i metadata.intake, triggern booking_meeting_and_intake lyfter dem till
-- bookings.intake_answers och vägrar en bokning som saknar ett obligatoriskt
-- svar (intake_required: …). Men besökarens enda dörr, request_booking, släpper
-- bara igenom de metadata-nycklar ett block får sätta — source, block_id,
-- page_id, awaiting_payment — och intake var inte en av dem. Svaren nådde
-- aldrig triggern: en tjänst med en obligatorisk fråga hade nekat varje publik
-- bokning, också när besökaren svarat (hittat på synclair 2026-10-09).
--
-- intake blir en tillåten nyckel, och bara som ett objekt (det triggern läser).
-- Allt annat i metadata är fortfarande plattformens.
--
-- Idempotent: CREATE OR REPLACE med samma signatur; behörigheten sätts om.

CREATE OR REPLACE FUNCTION public.request_booking(
  p_service_id uuid, p_customer_name text, p_customer_email text, p_start_time timestamptz,
  p_customer_phone text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_svc record; v_id uuid; v_end timestamptz;
  v_email text := lower(trim(p_customer_email));
BEGIN
  IF COALESCE(trim(p_customer_name), '') = '' THEN RAISE EXCEPTION 'a name is required'; END IF;
  IF v_email IS NULL OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'a valid email is required'; END IF;
  SELECT id, duration_minutes INTO v_svc FROM booking_services WHERE id = p_service_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service % not found or inactive', p_service_id; END IF;
  v_end := p_start_time + make_interval(mins => COALESCE(v_svc.duration_minutes, 60));

  INSERT INTO bookings (service_id, customer_name, customer_email, customer_phone, start_time, end_time, notes, status, metadata)
  VALUES (p_service_id, trim(p_customer_name), v_email, NULLIF(trim(COALESCE(p_customer_phone, '')), ''), p_start_time, v_end,
          NULLIF(trim(COALESCE(p_notes, '')), ''), 'pending',
          -- Bara de nycklar ett block får sätta; resten av metadata är plattformens.
          -- intake = besökarens svar på tjänstens frågor (läses av booking_meeting_and_intake).
          jsonb_strip_nulls(jsonb_build_object(
            'source', COALESCE(p_metadata->>'source', 'public'),
            'block_id', p_metadata->>'block_id', 'page_id', p_metadata->>'page_id',
            'awaiting_payment', CASE WHEN (p_metadata->>'awaiting_payment')::boolean THEN true END,
            'intake', CASE WHEN jsonb_typeof(p_metadata->'intake') = 'object' THEN p_metadata->'intake' END)))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'booking_id', v_id, 'start_time', p_start_time, 'end_time', v_end, 'status', 'pending');
END $fn$;

REVOKE ALL ON FUNCTION public.request_booking(uuid, text, text, timestamptz, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_booking(uuid, text, text, timestamptz, text, text, jsonb) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
