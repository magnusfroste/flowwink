-- Mötet har en länk, och frågorna ställs före.
--
-- Odoo Appointments: en bokad tjänst kan vara ett videomöte (länken skapas när
-- tiden bokas) och kan ställa frågor före bokningen (intake). FlowWink hade
-- tjänst, tid, namn och e-post — mötesplatsen stod i fritexten och frågorna
-- ställdes i mejl efteråt. WebMeet-rummen fanns sedan juni men skapades för
-- hand och kopierades in i bokningen (webmeet#calendar_booking_integration).
--
--   1. booking_services.location_type  in_person | video | phone
--      booking_services.video_provider  webmeet (ett eget rum per bokning) | url (en
--                                        fast länk: Zoom/Teams-rum, telefonnummer)
--      booking_services.video_url        den fasta länken
--      booking_services.intake_fields    [{id, label, type, required, options}]
--   2. bookings.meeting_url, bookings.intake_answers
--   3. Triggern booking_meeting_and_intake (BEFORE INSERT/UPDATE på bookings):
--      - lyfter metadata->'intake' (det publika blocket) till intake_answers,
--      - vägrar en ny bokning som saknar ett obligatoriskt intagsfält,
--      - ger en videotjänst sin länk: ett WebMeet-rum som går ut efter mötet,
--        eller tjänstens fasta länk; en avbokning stänger rummet.
--   4. book_appointment_slot tar p_intake och svarar med meeting_url.
--   5. Bekräftelsemallen får {{meeting_block}} efter {{notes_block}} där den
--      saknas — operatörens egen text behålls, platshållaren läggs till.

-- 1 ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.booking_services
  ADD COLUMN IF NOT EXISTS location_type text NOT NULL DEFAULT 'in_person',
  ADD COLUMN IF NOT EXISTS video_provider text NOT NULL DEFAULT 'webmeet',
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS intake_fields jsonb NOT NULL DEFAULT '[]'::jsonb;
DO $$ BEGIN
  ALTER TABLE public.booking_services DROP CONSTRAINT IF EXISTS booking_services_location_type_check;
  ALTER TABLE public.booking_services ADD CONSTRAINT booking_services_location_type_check
    CHECK (location_type IN ('in_person', 'video', 'phone'));
  ALTER TABLE public.booking_services DROP CONSTRAINT IF EXISTS booking_services_video_provider_check;
  ALTER TABLE public.booking_services ADD CONSTRAINT booking_services_video_provider_check
    CHECK (video_provider IN ('webmeet', 'url'));
  ALTER TABLE public.booking_services DROP CONSTRAINT IF EXISTS booking_services_intake_fields_array;
  ALTER TABLE public.booking_services ADD CONSTRAINT booking_services_intake_fields_array
    CHECK (jsonb_typeof(intake_fields) = 'array');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
COMMENT ON COLUMN public.booking_services.intake_fields IS
  'Questions asked before booking: [{id, label, type: text|textarea|select|checkbox|email|phone|number, required, options: [..]}]. Answers land on bookings.intake_answers keyed by id.';

-- 2 ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS meeting_url text,
  ADD COLUMN IF NOT EXISTS intake_answers jsonb;
COMMENT ON COLUMN public.bookings.meeting_url IS
  'Where the meeting happens for a video service: /meet/<slug> (own WebMeet room) or the service''s fixed URL. Set by the table when the booking is made.';

-- 3 ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.booking_meeting_and_intake()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_svc RECORD;
  v_field jsonb;
  v_missing text[] := '{}';
  v_slug text;
  v_live boolean := NEW.status IN ('pending', 'confirmed');
BEGIN
  -- The public block sends its answers inside metadata; one column holds them.
  IF NEW.intake_answers IS NULL AND NEW.metadata ? 'intake' AND jsonb_typeof(NEW.metadata->'intake') = 'object' THEN
    NEW.intake_answers := NEW.metadata->'intake';
  END IF;

  IF NEW.service_id IS NULL THEN RETURN NEW; END IF;
  SELECT location_type, video_provider, video_url, intake_fields, name INTO v_svc
    FROM booking_services WHERE id = NEW.service_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- A new booking answers the questions the service asks. Staff in the admin may
  -- book without them (a phone booking is filled in afterwards); visitors and the
  -- agent are held to it, like opening hours.
  IF TG_OP = 'INSERT' AND v_live
     AND NOT (auth.role() <> 'service_role' AND auth.uid() IS NOT NULL AND public.can_access_module(auth.uid(), 'bookings')) THEN
    FOR v_field IN SELECT * FROM jsonb_array_elements(COALESCE(v_svc.intake_fields, '[]'::jsonb)) LOOP
      IF COALESCE((v_field->>'required')::boolean, false)
         AND NULLIF(trim(COALESCE(NEW.intake_answers->>(v_field->>'id'), '')), '') IS NULL THEN
        v_missing := v_missing || COALESCE(v_field->>'label', v_field->>'id');
      END IF;
    END LOOP;
    IF array_length(v_missing, 1) > 0 THEN
      RAISE EXCEPTION 'intake_required: % asks for % before booking', v_svc.name, array_to_string(v_missing, ', ')
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- The meeting place, decided by the service when the booking is made.
  IF v_svc.location_type = 'video' AND NEW.meeting_url IS NULL AND v_live THEN
    IF v_svc.video_provider = 'url' THEN
      NEW.meeting_url := NULLIF(trim(COALESCE(v_svc.video_url, '')), '');
    ELSE
      v_slug := public.gen_webmeet_slug();
      INSERT INTO webmeet_rooms (slug, name, host_user_id, max_participants, expires_at)
      VALUES (v_slug, left(v_svc.name || ' — ' || COALESCE(NEW.customer_name, ''), 120), NULL, 8, NEW.end_time + interval '2 hours');
      NEW.meeting_url := '/meet/' || v_slug;
    END IF;
  END IF;

  -- A cancelled or no-show booking closes its own room; a fixed URL is not ours to close.
  IF TG_OP = 'UPDATE' AND NEW.status IN ('cancelled', 'no_show') AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.meeting_url LIKE '/meet/%' THEN
    UPDATE webmeet_rooms SET ended_at = COALESCE(ended_at, now()) WHERE slug = substr(NEW.meeting_url, 7);
  END IF;
  RETURN NEW;
END $$;

-- Runs AFTER booking_rules (alphabetical order of trigger names: "booking_rules_trg" < "zz_…"),
-- so a time the rules refuse never creates a room.
DROP TRIGGER IF EXISTS zz_booking_meeting_and_intake_trg ON public.bookings;
CREATE TRIGGER zz_booking_meeting_and_intake_trg BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.booking_meeting_and_intake();
REVOKE EXECUTE ON FUNCTION public.booking_meeting_and_intake() FROM PUBLIC, anon, authenticated;

-- 4 ────────────────────────────────────────────────────────────────────────
-- The six-argument version is replaced, not overloaded: two signatures would make
-- PostgREST guess, and callers passing the six named arguments still land here.
DROP FUNCTION IF EXISTS public.book_appointment_slot(uuid, text, text, timestamptz, text, text);
CREATE OR REPLACE FUNCTION public.book_appointment_slot(
  p_service_id uuid, p_customer_name text, p_customer_email text, p_start_time timestamptz,
  p_customer_phone text DEFAULT NULL, p_notes text DEFAULT NULL, p_intake jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_duration int;
  v_end timestamptz;
  v_id uuid;
  v_meeting text;
BEGIN
  -- matrix-guard 20260919180000
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'bookings')) THEN
    RAISE EXCEPTION 'Not authorized to create bookings';
  END IF;

  SELECT duration_minutes INTO v_duration
  FROM booking_services WHERE id = p_service_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service % not found or inactive', p_service_id; END IF;

  v_end := p_start_time + make_interval(mins => v_duration);

  -- one-rule 20260920040000
  -- Överlapp, buffert och kapacitet avgörs av tabellens regel (booking_rules), under dess lås.
  -- intake-and-meeting 20261005080000: required questions and the meeting link are the table's too.

  INSERT INTO bookings (service_id, customer_name, customer_email, customer_phone, start_time, end_time, notes, status, intake_answers)
  VALUES (p_service_id, p_customer_name, p_customer_email, p_customer_phone, p_start_time, v_end, p_notes, 'pending',
          CASE WHEN p_intake IS NOT NULL AND jsonb_typeof(p_intake) = 'object' THEN p_intake END)
  RETURNING id, meeting_url INTO v_id, v_meeting;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_id,
    'start_time', p_start_time,
    'end_time', v_end,
    'duration_minutes', v_duration,
    'meeting_url', v_meeting
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.book_appointment_slot(uuid, text, text, timestamptz, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_appointment_slot(uuid, text, text, timestamptz, text, text, jsonb) TO authenticated, service_role;

-- 5 ────────────────────────────────────────────────────────────────────────
UPDATE public.email_templates
   SET html = replace(html, '{{notes_block}}', '{{notes_block}}{{meeting_block}}')
 WHERE name = 'booking_confirmation'
   AND html LIKE '%{{notes_block}}%'
   AND html NOT LIKE '%{{meeting_block}}%';
