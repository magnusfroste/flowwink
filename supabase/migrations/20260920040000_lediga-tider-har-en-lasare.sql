-- Lediga tider har EN läsare.
--
-- Paritetsrunda 4, booking. Fyndet som styr rundan: den publika bokningswidgeten
-- räknade lediga tider i WEBBLÄSAREN genom att läsa tabellen `bookings`. Sedan
-- 20260919180000 får en anonym besökare inte läsa den tabellen (den bar kunders
-- namn och mejl) — så widgeten såg noll bokningar och erbjöd varje upptagen tid.
-- Tabellen vägrade sedan bokningen ("no longer available"), men först efter att
-- besökaren fyllt i hela formuläret. Agentens check_availability räknade samma
-- sak en gång till, i TypeScript, med egna regler. Två läsare, två svar.
--
--   1. booking_free_slots(service, datum) — den enda läsaren. Öppettider,
--      spärrar, plattformens tidszon, dåtid, buffert och kapacitet: exakt det
--      booking_rules vägrar. Anonymt anropbar; svarar bara med klockslag.
--   2. Buffert före/efter och kapacitet per tjänst — i tabellens regel OCH i
--      läsaren, ur samma kolumner.
--   3. booking.confirmed / booking.cancelled emitteras av tabellen, en gång per
--      övergång, oavsett skrivare (förut: ingen emitterade dem på agentvägen).
--   4. Väntelista: en besökare kan ställa sig i kö för en fullbokad dag; när en
--      bokning avbokas får kön ett erbjudande (händelsen booking.waitlist_slot_opened).
--
-- booking_rules ersätts i sin helhet: den definieras av 20260919180000 och
-- ingen annanstans, och kroppen på nordbrygg är identisk med den lokala
-- (md5 301dd4f5… verifierat 2026-09-19).

ALTER TABLE public.booking_services
  ADD COLUMN IF NOT EXISTS buffer_before_minutes integer NOT NULL DEFAULT 0 CHECK (buffer_before_minutes >= 0 AND buffer_before_minutes <= 1440),
  ADD COLUMN IF NOT EXISTS buffer_after_minutes  integer NOT NULL DEFAULT 0 CHECK (buffer_after_minutes  >= 0 AND buffer_after_minutes  <= 1440),
  ADD COLUMN IF NOT EXISTS capacity              integer NOT NULL DEFAULT 1 CHECK (capacity >= 1 AND capacity <= 10000);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Tabellens regel
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.booking_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_live boolean := NEW.status IN ('pending', 'confirmed');
  v_check_slot boolean := false;
  v_duration integer;
  v_tz text;
  v_local timestamp; v_local_end timestamp;
  v_before integer := 0; v_after integer := 0; v_capacity integer := 1; v_taken integer;
  -- En inloggad medarbetare med bokningsmodulen får lägga en tid utanför öppettid, på en
  -- spärrad dag eller i efterhand (ett drop-in som förs in efteråt) — det är ett medvetet
  -- mänskligt beslut i admin-UI:t. Besökare och agenter (service-rollen) lyder alla regler,
  -- och ÖVERLAPP vägras för alla: två kunder på samma tid är aldrig ett beslut.
  -- service_role är med flit INTE personal här: agenten ska lyda reglerna, inte kringgå dem.
  v_staff boolean := auth.role() <> 'service_role' AND auth.uid() IS NOT NULL AND public.can_access_module(auth.uid(), 'bookings');
BEGIN
  -- Telefonnumret lagras utan mellanslag och streck, oavsett skrivare: uppslaget på de sista
  -- siffrorna hittade inte '+46 70 555 01 01' som den föredragna vägen sparade rått.
  IF NEW.customer_phone IS NOT NULL THEN
    NEW.customer_phone := NULLIF(regexp_replace(NEW.customer_phone, '[^0-9+]', '', 'g'), '');
  END IF;

  -- ── Statusmaskinen ────────────────────────────────────────────────────────
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
         (OLD.status = 'pending'   AND NEW.status IN ('confirmed', 'cancelled', 'no_show', 'completed'))
      OR (OLD.status = 'confirmed' AND NEW.status IN ('pending', 'cancelled', 'no_show', 'completed'))
    ) THEN
      RAISE EXCEPTION 'booking status cannot go from % to % — cancelled, completed and no_show are terminal; book a new time instead', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'cancelled' AND NEW.cancelled_at IS NULL THEN NEW.cancelled_at := now(); END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_check_slot := v_live;
  ELSE
    v_check_slot := v_live AND (NEW.start_time IS DISTINCT FROM OLD.start_time
                             OR NEW.end_time   IS DISTINCT FROM OLD.end_time
                             OR NEW.service_id IS DISTINCT FROM OLD.service_id);
  END IF;
  IF NOT v_check_slot THEN RETURN NEW; END IF;

  IF NEW.start_time IS NULL THEN RAISE EXCEPTION 'a booking needs a start_time'; END IF;
  IF NEW.end_time IS NULL THEN
    SELECT duration_minutes INTO v_duration FROM booking_services WHERE id = NEW.service_id;
    NEW.end_time := NEW.start_time + make_interval(mins => COALESCE(v_duration, 60));
  END IF;
  IF NEW.end_time <= NEW.start_time THEN RAISE EXCEPTION 'a booking must end after it starts'; END IF;

  IF NOT v_staff AND NEW.start_time < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'slot_unavailable: % is in the past', NEW.start_time USING ERRCODE = 'check_violation';
  END IF;

  -- Serialisera skrivare mot samma tjänst: nästa kontroll ser den här bokningen.
  PERFORM pg_advisory_xact_lock(hashtextextended('booking:' || COALESCE(NEW.service_id::text, 'any'), 0));

  v_tz := public.platform_timezone();
  v_local := NEW.start_time AT TIME ZONE v_tz;
  v_local_end := NEW.end_time AT TIME ZONE v_tz;

  IF NOT v_staff AND EXISTS (SELECT 1 FROM booking_blocked_dates bd
              WHERE bd.date = v_local::date
                AND (COALESCE(bd.is_all_day, true)
                     OR (bd.start_time IS NOT NULL AND bd.end_time IS NOT NULL
                         AND v_local::time < bd.end_time AND v_local_end::time > bd.start_time))) THEN
    RAISE EXCEPTION 'slot_unavailable: % is blocked (closed that day)', v_local::date USING ERRCODE = 'check_violation';
  END IF;

  -- Öppettider: bara om instansen har satt några. Fönstret måste rymma HELA bokningen.
  IF NOT v_staff AND EXISTS (SELECT 1 FROM booking_availability a WHERE a.is_active) THEN
    IF v_local::date <> v_local_end::date AND v_local_end::time <> time '00:00' THEN
      RAISE EXCEPTION 'slot_unavailable: a booking cannot run past midnight' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM booking_availability a
       WHERE a.is_active AND a.day_of_week = EXTRACT(dow FROM v_local)::int
         AND (a.service_id IS NULL OR a.service_id = NEW.service_id)
         AND a.start_time <= v_local::time AND a.end_time >= v_local_end::time
    ) THEN
      RAISE EXCEPTION 'slot_unavailable: % – % (%) is outside opening hours', to_char(v_local, 'YYYY-MM-DD HH24:MI'), to_char(v_local_end, 'HH24:MI'), v_tz
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- capacity-and-buffer 20260920040000
  -- En bokning upptar sin tid PLUS tjänstens buffert före och efter (ställtid, städning,
  -- restid). Två bokningar krockar när de upptagna fönstren överlappar. En tjänst med
  -- kapacitet > 1 (en klass, en visning) är full först när så många redan står där.
  SELECT COALESCE(s.buffer_before_minutes, 0), COALESCE(s.buffer_after_minutes, 0), GREATEST(COALESCE(s.capacity, 1), 1)
    INTO v_before, v_after, v_capacity
    FROM booking_services s WHERE s.id = NEW.service_id;
  v_before := COALESCE(v_before, 0); v_after := COALESCE(v_after, 0); v_capacity := COALESCE(v_capacity, 1);

  SELECT count(*) INTO v_taken FROM bookings b
   WHERE b.service_id IS NOT DISTINCT FROM NEW.service_id
     AND b.id IS DISTINCT FROM NEW.id
     AND b.status IN ('pending', 'confirmed')
     AND tstzrange(b.start_time - make_interval(mins => v_before), b.end_time + make_interval(mins => v_after), '[)')
         && tstzrange(NEW.start_time - make_interval(mins => v_before), NEW.end_time + make_interval(mins => v_after), '[)');
  IF v_taken >= v_capacity THEN
    RAISE EXCEPTION 'slot_unavailable: % %', NEW.start_time,
      CASE WHEN v_capacity > 1 THEN format('is full (%s of %s places taken)', v_taken, v_capacity)
           WHEN v_before + v_after > 0 THEN format('overlaps an existing booking or its buffer (%s min before, %s min after)', v_before, v_after)
           ELSE 'overlaps an existing booking' END
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public.booking_rules() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.booking_rules() TO authenticated, service_role;

-- book_appointment_slot bar en EGEN överlappskontroll framför tabellens regel —
-- en tredje läsare, som varken kände buffert eller kapacitet: en klass med två
-- platser vägrade sin andra deltagare ("overlaps an existing booking") innan
-- tabellen ens fick frågan. Bort med den; booking_rules avgör, under sitt lås.
DO $patch$
DECLARE
  v_def text;
  v_anchor text := $a$  -- reject overlap on the same service (excluding cancelled bookings)
  IF EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.service_id = p_service_id
      AND b.status <> 'cancelled'
      AND tstzrange(b.start_time, b.end_time, '[)') && tstzrange(p_start_time, v_end, '[)')
  ) THEN
    RAISE EXCEPTION 'slot_unavailable: % overlaps an existing booking', p_start_time
      USING ERRCODE = 'exclusion_violation';
  END IF;
$a$;
BEGIN
  v_def := pg_get_functiondef('public.book_appointment_slot(uuid, text, text, timestamptz, text, text)'::regprocedure);
  IF position('one-rule 20260920040000' in v_def) > 0 THEN
    RETURN;
  END IF;
  IF position(v_anchor in v_def) = 0 THEN
    RAISE EXCEPTION 'anchor missing in book_appointment_slot — read the live body before patching';
  END IF;
  v_def := replace(v_def, v_anchor,
    E'  -- one-rule 20260920040000\n  -- Överlapp, buffert och kapacitet avgörs av tabellens regel (booking_rules), under dess lås.\n');
  EXECUTE v_def;
END
$patch$;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Den enda läsaren
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.booking_free_slots(p_service_id uuid, p_date date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tz text := public.platform_timezone();
  v_now timestamp := now() AT TIME ZONE public.platform_timezone();
  v_duration integer := 30;
  v_before integer := 0;
  v_after integer := 0;
  v_capacity integer := 1;
  v_name text;
  v_blocked boolean;
  v_reasons jsonb;
  v_slots jsonb;
BEGIN
  IF p_date IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_date is required (YYYY-MM-DD)');
  END IF;
  IF p_service_id IS NOT NULL THEN
    SELECT s.name, s.duration_minutes, COALESCE(s.buffer_before_minutes, 0), COALESCE(s.buffer_after_minutes, 0), GREATEST(COALESCE(s.capacity, 1), 1)
      INTO v_name, v_duration, v_before, v_after, v_capacity
      FROM booking_services s WHERE s.id = p_service_id AND s.is_active;
    IF v_name IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Service not found or not active');
    END IF;
    v_duration := GREATEST(COALESCE(v_duration, 30), 5);
  END IF;

  SELECT COALESCE(bool_or(COALESCE(bd.is_all_day, true) OR bd.start_time IS NULL OR bd.end_time IS NULL), false),
         COALESCE(jsonb_agg(bd.reason) FILTER (WHERE bd.reason IS NOT NULL), '[]'::jsonb)
    INTO v_blocked, v_reasons
    FROM booking_blocked_dates bd WHERE bd.date = p_date;

  -- En dag som passerat har inga tider. Ingen gräns framåt: tabellen har ingen, och
  -- läsaren ska svara exakt det tabellen tar emot.
  IF v_blocked OR p_date < v_now::date THEN
    v_slots := '[]'::jsonb;
  ELSE
    WITH windows AS (
      SELECT a.start_time, a.end_time FROM booking_availability a
       WHERE a.is_active AND a.day_of_week = EXTRACT(dow FROM p_date)::int
         AND (a.service_id IS NULL OR a.service_id = p_service_id)
    ), grid AS (
      SELECT DISTINCT m FROM windows w,
             generate_series((EXTRACT(epoch FROM w.start_time) / 60)::int,
                             (EXTRACT(epoch FROM w.end_time) / 60)::int - v_duration, v_duration) AS m
    ), candidates AS (
      SELECT g.m,
             (p_date + make_interval(mins => g.m)) AS local_start,
             ((p_date + make_interval(mins => g.m)) AT TIME ZONE v_tz) AS starts_at
        FROM grid g
    ), counted AS (
      SELECT c.m, c.local_start, c.starts_at,
             (SELECT count(*) FROM bookings b
               WHERE b.service_id IS NOT DISTINCT FROM p_service_id
                 AND b.status IN ('pending', 'confirmed')
                 AND tstzrange(b.start_time - make_interval(mins => v_before), b.end_time + make_interval(mins => v_after), '[)')
                     && tstzrange(c.starts_at - make_interval(mins => v_before),
                                  c.starts_at + make_interval(mins => v_duration + v_after), '[)')) AS taken
        FROM candidates c
       WHERE c.local_start > v_now
         AND NOT EXISTS (SELECT 1 FROM booking_blocked_dates bd
                          WHERE bd.date = p_date AND bd.start_time IS NOT NULL AND bd.end_time IS NOT NULL
                            AND c.local_start::time < bd.end_time
                            AND (c.local_start + make_interval(mins => v_duration))::time > bd.start_time)
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'time', to_char(local_start, 'HH24:MI'), 'starts_at', starts_at, 'places_left', v_capacity - taken)
             ORDER BY m), '[]'::jsonb)
      INTO v_slots FROM counted WHERE taken < v_capacity;
  END IF;

  RETURN jsonb_build_object('success', true, 'date', p_date, 'service_id', p_service_id, 'timezone', v_tz,
    'slot_minutes', v_duration, 'buffer_before_minutes', v_before, 'buffer_after_minutes', v_after, 'capacity', v_capacity,
    'is_blocked', v_blocked, 'blocked_reasons', v_reasons,
    'slots', v_slots,
    'free_slots', COALESCE((SELECT jsonb_agg(s->>'time') FROM jsonb_array_elements(v_slots) s), '[]'::jsonb));
END;
$function$;

-- Widgeten är publik: en besökare måste kunna se lediga tider. Svaret bär bara klockslag.
REVOKE ALL ON FUNCTION public.booking_free_slots(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.booking_free_slots(uuid, date) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Tabellen berättar själv
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_emit_booking_status_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tz text;
  v_offered integer := 0;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  IF NEW.status = 'confirmed' THEN
    PERFORM public.emit_platform_event('booking.confirmed', jsonb_build_object('id', NEW.id, 'data', to_jsonb(NEW)), 'bookings');
  ELSIF NEW.status = 'cancelled' THEN
    PERFORM public.emit_platform_event('booking.cancelled', jsonb_build_object('id', NEW.id, 'data', to_jsonb(NEW)), 'bookings');

    -- En avbokad tid i framtiden är en öppning för den som står i kö den dagen.
    IF NEW.start_time > now() THEN
      v_tz := public.platform_timezone();
      UPDATE booking_waitlist w SET status = 'offered', offered_at = now()
       WHERE w.status = 'waiting'
         AND w.service_id IS NOT DISTINCT FROM NEW.service_id
         AND w.desired_date = (NEW.start_time AT TIME ZONE v_tz)::date;
      GET DIAGNOSTICS v_offered = ROW_COUNT;
      IF v_offered > 0 THEN
        PERFORM public.emit_platform_event('booking.waitlist_slot_opened', jsonb_build_object(
          'service_id', NEW.service_id, 'date', (NEW.start_time AT TIME ZONE v_tz)::date,
          'opened_start_time', NEW.start_time, 'offered_count', v_offered), 'bookings');
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.tg_emit_booking_status_events() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tg_emit_booking_status_events() TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Väntelistan
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.booking_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid REFERENCES public.booking_services(id) ON DELETE CASCADE,
  desired_date date NOT NULL,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text,
  notes text,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'offered', 'booked', 'expired', 'cancelled')),
  offered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- En person står en gång i kön för en tjänst och dag, oavsett skiftläge i adressen.
CREATE UNIQUE INDEX IF NOT EXISTS booking_waitlist_one_per_person
  ON public.booking_waitlist (COALESCE(service_id, '00000000-0000-0000-0000-000000000000'::uuid), desired_date, lower(customer_email))
  WHERE status IN ('waiting', 'offered');
CREATE INDEX IF NOT EXISTS booking_waitlist_open ON public.booking_waitlist (service_id, desired_date) WHERE status = 'waiting';

ALTER TABLE public.booking_waitlist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Bookings module manages the waitlist" ON public.booking_waitlist;
CREATE POLICY "Bookings module manages the waitlist" ON public.booking_waitlist
  FOR ALL TO authenticated
  USING (can_access_module(auth.uid(), 'bookings'))
  WITH CHECK (can_access_module(auth.uid(), 'bookings'));
REVOKE ALL ON public.booking_waitlist FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_waitlist TO authenticated, service_role;

DROP TRIGGER IF EXISTS tg_emit_booking_status_events ON public.bookings;
CREATE TRIGGER tg_emit_booking_status_events
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.tg_emit_booking_status_events();

-- Besökarens dörr: anonym, men den skriver bara en rad om en aktiv tjänst, en dag
-- som inte passerat, och bara när dagen faktiskt saknar lediga tider.
CREATE OR REPLACE FUNCTION public.join_booking_waitlist(
  p_service_id uuid, p_date date, p_customer_name text, p_customer_email text,
  p_customer_phone text DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email text := lower(btrim(COALESCE(p_customer_email, '')));
  v_name text := btrim(COALESCE(p_customer_name, ''));
  v_free jsonb;
  v_id uuid;
BEGIN
  IF v_name = '' OR length(v_name) > 200 THEN
    RETURN jsonb_build_object('success', false, 'error', 'A name is required');
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(v_email) > 320 THEN
    RETURN jsonb_build_object('success', false, 'error', 'A valid e-mail address is required');
  END IF;
  v_free := public.booking_free_slots(p_service_id, p_date);
  IF NOT COALESCE((v_free->>'success')::boolean, false) THEN
    RETURN v_free;
  END IF;
  IF p_date < (now() AT TIME ZONE public.platform_timezone())::date THEN
    RETURN jsonb_build_object('success', false, 'error', 'That day has passed');
  END IF;
  IF jsonb_array_length(v_free->'slots') > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'That day still has free times — book one instead of queueing.',
                              'free_slots', v_free->'free_slots');
  END IF;

  SELECT id INTO v_id FROM booking_waitlist
   WHERE service_id IS NOT DISTINCT FROM p_service_id AND desired_date = p_date
     AND lower(customer_email) = v_email AND status IN ('waiting', 'offered');
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_waiting', true, 'waitlist_id', v_id);
  END IF;
  BEGIN
    INSERT INTO booking_waitlist (service_id, desired_date, customer_name, customer_email, customer_phone, notes)
    VALUES (p_service_id, p_date, v_name, v_email,
            NULLIF(regexp_replace(COALESCE(p_customer_phone, ''), '[^0-9+]', '', 'g'), ''), left(p_notes, 1000))
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_id FROM booking_waitlist
     WHERE service_id IS NOT DISTINCT FROM p_service_id AND desired_date = p_date
       AND lower(customer_email) = v_email AND status IN ('waiting', 'offered');
    RETURN jsonb_build_object('success', true, 'already_waiting', true, 'waitlist_id', v_id);
  END;
  RETURN jsonb_build_object('success', true, 'waitlist_id', v_id, 'date', p_date,
    'position', (SELECT count(*) FROM booking_waitlist w WHERE w.service_id IS NOT DISTINCT FROM p_service_id
                  AND w.desired_date = p_date AND w.status = 'waiting'));
END;
$function$;

REVOKE ALL ON FUNCTION public.join_booking_waitlist(uuid, date, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_booking_waitlist(uuid, date, text, text, text, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.manage_booking_waitlist(
  p_action text, p_waitlist_id uuid DEFAULT NULL, p_service_id uuid DEFAULT NULL, p_date date DEFAULT NULL, p_status text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_row booking_waitlist;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'bookings')) THEN
    RAISE EXCEPTION 'Requires the bookings module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  IF p_action = 'list' THEN
    RETURN jsonb_build_object('success', true, 'entries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('waitlist_id', w.id, 'service_id', w.service_id, 'service', s.name,
               'date', w.desired_date, 'customer_name', w.customer_name, 'customer_email', w.customer_email,
               'customer_phone', w.customer_phone, 'notes', w.notes, 'status', w.status,
               'offered_at', w.offered_at, 'created_at', w.created_at)
             ORDER BY w.desired_date, w.created_at)
        FROM booking_waitlist w LEFT JOIN booking_services s ON s.id = w.service_id
       WHERE (p_service_id IS NULL OR w.service_id = p_service_id)
         AND (p_date IS NULL OR w.desired_date = p_date)
         AND (p_status IS NULL AND w.status IN ('waiting', 'offered') OR w.status = p_status)), '[]'::jsonb));
  ELSIF p_action = 'set_status' THEN
    IF p_waitlist_id IS NULL OR p_status IS NULL OR p_status NOT IN ('waiting', 'offered', 'booked', 'expired', 'cancelled') THEN
      RETURN jsonb_build_object('success', false, 'error', 'set_status needs p_waitlist_id and p_status (waiting|offered|booked|expired|cancelled)');
    END IF;
    UPDATE booking_waitlist SET status = p_status, updated_at = now(),
           offered_at = CASE WHEN p_status = 'offered' THEN now() ELSE offered_at END
     WHERE id = p_waitlist_id RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Waitlist entry not found'); END IF;
    RETURN jsonb_build_object('success', true, 'waitlist_id', v_row.id, 'status', v_row.status);
  END IF;
  RETURN jsonb_build_object('success', false, 'error', 'p_action is "list" or "set_status"');
END;
$function$;

REVOKE ALL ON FUNCTION public.manage_booking_waitlist(text, uuid, uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_booking_waitlist(text, uuid, uuid, date, text) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Beviset
-- ─────────────────────────────────────────────────────────────────────────
DO $proof$
DECLARE
  v_svc uuid; v_class uuid; v_day date; v_tz text := public.platform_timezone();
  v_r jsonb; v_b uuid; v_n integer; v_dow integer;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    -- Beviset äger sin dag: en egen tjänst, egna öppettider, ingen spärr.
    v_day := ((now() AT TIME ZONE v_tz)::date + 40);
    v_dow := EXTRACT(dow FROM v_day)::int;
    DELETE FROM booking_blocked_dates WHERE date = v_day;
    INSERT INTO booking_services (name, duration_minutes, is_active, buffer_after_minutes)
    VALUES ('Proof 040000 treatment', 60, true, 30) RETURNING id INTO v_svc;
    INSERT INTO booking_services (name, duration_minutes, is_active, capacity)
    VALUES ('Proof 040000 class', 60, true, 2) RETURNING id INTO v_class;
    INSERT INTO booking_availability (day_of_week, start_time, end_time, is_active, service_id)
    VALUES (v_dow, '09:00', '13:00', true, v_svc), (v_dow, '09:00', '11:00', true, v_class);

    v_r := public.booking_free_slots(v_svc, v_day);
    IF (v_r->'free_slots') <> '["09:00","10:00","11:00","12:00"]'::jsonb THEN
      RAISE EXCEPTION 'proof failed: an empty day should offer four slots → %', v_r->'free_slots';
    END IF;

    -- 10:00–11:00 bokas. Med 30 min buffert efter är 11:00 inte längre ledig; 09:00 krockar
    -- med bufferten efter SIN egen tid (09–10 + 30 → 10:30 > 10:00).
    INSERT INTO bookings (service_id, customer_name, customer_email, start_time, status)
    VALUES (v_svc, 'Proof', 'proof-040000@example.test', (v_day + time '10:00') AT TIME ZONE v_tz, 'confirmed') RETURNING id INTO v_b;
    v_r := public.booking_free_slots(v_svc, v_day);
    IF (v_r->'free_slots') <> '["12:00"]'::jsonb THEN
      RAISE EXCEPTION 'proof failed: with a 30 min buffer only 12:00 should remain → %', v_r->'free_slots';
    END IF;
    BEGIN
      INSERT INTO bookings (service_id, customer_name, customer_email, start_time, status)
      VALUES (v_svc, 'Proof 2', 'proof2-040000@example.test', (v_day + time '11:00') AT TIME ZONE v_tz, 'pending');
      RAISE EXCEPTION 'proof failed: the table accepted a booking inside the buffer the reader refused';
    EXCEPTION WHEN exclusion_violation THEN NULL;
    END;

    -- Klassen: två platser, den tredje vägras, läsaren visar en plats kvar efter den första.
    INSERT INTO bookings (service_id, customer_name, customer_email, start_time, status)
    VALUES (v_class, 'A', 'a-040000@example.test', (v_day + time '09:00') AT TIME ZONE v_tz, 'confirmed');
    v_r := public.booking_free_slots(v_class, v_day);
    IF (v_r->'slots'->0->>'places_left')::int <> 1 THEN
      RAISE EXCEPTION 'proof failed: one of two places should be left → %', v_r->'slots';
    END IF;
    INSERT INTO bookings (service_id, customer_name, customer_email, start_time, status)
    VALUES (v_class, 'B', 'b-040000@example.test', (v_day + time '09:00') AT TIME ZONE v_tz, 'confirmed');
    BEGIN
      INSERT INTO bookings (service_id, customer_name, customer_email, start_time, status)
      VALUES (v_class, 'C', 'c-040000@example.test', (v_day + time '09:00') AT TIME ZONE v_tz, 'confirmed');
      RAISE EXCEPTION 'proof failed: a third booking entered a class of two';
    EXCEPTION WHEN exclusion_violation THEN NULL;
    END;

    -- Väntelistan: bara när dagen är full; avbokningen erbjuder kön och berättar det.
    v_r := public.join_booking_waitlist(v_svc, v_day, 'Kö', 'ko-040000@example.test');
    IF (v_r->>'success')::boolean THEN
      RAISE EXCEPTION 'proof failed: the waitlist accepted someone while 12:00 was free';
    END IF;
    INSERT INTO bookings (service_id, customer_name, customer_email, start_time, status)
    VALUES (v_svc, 'Proof 3', 'proof3-040000@example.test', (v_day + time '12:00') AT TIME ZONE v_tz, 'confirmed');
    v_r := public.join_booking_waitlist(v_svc, v_day, 'Kö', 'KO-040000@example.test');
    IF NOT (v_r->>'success')::boolean THEN RAISE EXCEPTION 'proof failed: waitlist → %', v_r; END IF;
    v_r := public.join_booking_waitlist(v_svc, v_day, 'Kö', 'ko-040000@example.test');
    IF NOT COALESCE((v_r->>'already_waiting')::boolean, false) THEN
      RAISE EXCEPTION 'proof failed: the same person queued twice';
    END IF;

    UPDATE bookings SET status = 'cancelled' WHERE id = v_b;
    SELECT count(*) INTO v_n FROM agent_events WHERE event_name = 'booking.cancelled' AND payload->>'id' = v_b::text;
    IF v_n <> 1 THEN RAISE EXCEPTION 'proof failed: booking.cancelled emitted % times', v_n; END IF;
    IF (SELECT status FROM booking_waitlist WHERE desired_date = v_day AND service_id = v_svc) <> 'offered' THEN
      RAISE EXCEPTION 'proof failed: the cancellation did not offer the slot to the queue';
    END IF;
    SELECT count(*) INTO v_n FROM agent_events WHERE event_name = 'booking.waitlist_slot_opened' AND payload->>'service_id' = v_svc::text;
    IF v_n <> 1 THEN RAISE EXCEPTION 'proof failed: waitlist_slot_opened emitted % times', v_n; END IF;

    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'proof passed: reader and table agree on buffer and capacity; the queue opens only on a full day; a cancellation is announced once and offers the slot.';
END
$proof$;
