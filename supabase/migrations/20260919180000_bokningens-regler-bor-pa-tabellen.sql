-- Bokningens regler bor på tabellen.
--
-- Processbatteriet 2026-09-19 (book-to-meet). Öppettider, spärrade dagar och
-- dåtid respekterades bara av check_availability — alltså av FRÅGAN, inte av
-- SKRIVNINGEN:
--
--   book_appointment_slot   kollade tjänsten och överlapp, inget annat: en
--                           bokning 03:00, på en spärrad dag och år 2020 togs emot.
--   book_appointment        (den gamla, fortfarande exponerad) satte in utan
--                           överlappskoll.
--   det publika blocket     satte in direkt i tabellen under policyn "Anyone can
--                           create bookings" WITH CHECK (true).
--   överlappet              var IF EXISTS … INSERT utan lås: tre av fyra samtidiga
--                           anrop fick samma tid.
--   manage_bookings         skrev vilken status som helst över vilken som helst:
--                           en avbokad tid återupplivades ovanpå kunden som tagit
--                           den, och ett genomfört möte gick tillbaka till pending.
--   tidszonen               öppettiderna är klockslag utan zon; de jämfördes med
--                           UTC-minuter, så 10:00 i Stockholm tog bort 09:00 ur
--                           de lediga tiderna och lät 10:00 stå kvar som ledig.
--
-- Principen (samma som webinaret): regeln ligger i en BEFORE-trigger, så VARJE
-- skrivare lyder — RPC, gammal handler, publikt block, admin-UI, generisk CRUD.
-- Öppettiderna tolkas i plattformens tidszon (site_settings.platform_locale).
-- Historik (en rad som föds completed/no_show/cancelled) får ligga i dåtid.
-- En instans som aldrig satt öppettider har inga att bryta mot (fail forward).
--
-- Idempotent: CREATE OR REPLACE, DROP … IF EXISTS.

CREATE OR REPLACE FUNCTION public.platform_timezone()
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $fn$
  -- Samma nyckel och samma reservvärde som klienten (usePlatformFormat läser
  -- platform_locale.default_timezone, reserv Europe/Stockholm): en fakta, en läsare per lager.
  SELECT COALESCE(
    (SELECT COALESCE(NULLIF(value ->> 'default_timezone', ''), NULLIF(value ->> 'timezone', ''))
       FROM public.site_settings WHERE key = 'platform_locale' LIMIT 1),
    'Europe/Stockholm');
$fn$;

GRANT EXECUTE ON FUNCTION public.platform_timezone() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.booking_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_live boolean := NEW.status IN ('pending', 'confirmed');
  v_check_slot boolean := false;
  v_duration integer;
  v_tz text;
  v_local timestamp; v_local_end timestamp;
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

  IF EXISTS (
    SELECT 1 FROM bookings b
     WHERE b.service_id IS NOT DISTINCT FROM NEW.service_id
       AND b.id IS DISTINCT FROM NEW.id
       AND b.status IN ('pending', 'confirmed')
       AND tstzrange(b.start_time, b.end_time, '[)') && tstzrange(NEW.start_time, NEW.end_time, '[)')
  ) THEN
    RAISE EXCEPTION 'slot_unavailable: % overlaps an existing booking', NEW.start_time USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END $fn$;

REVOKE ALL ON FUNCTION public.booking_rules() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS booking_rules_trg ON public.bookings;
CREATE TRIGGER booking_rules_trg
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.booking_rules();

-- set_hours ERSÄTTER dagens tider (skillens egen text har alltid sagt det); den
-- lade till en rad varje gång, och dubbla fönster gav dubbla lediga tider.
CREATE OR REPLACE FUNCTION public.set_booking_hours(p_day_of_week integer, p_start_time time, p_end_time time, p_service_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_id uuid; v_replaced integer;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'bookings')) THEN
    RAISE EXCEPTION 'Setting opening hours requires the bookings module' USING ERRCODE = '42501';
  END IF;
  IF p_day_of_week NOT BETWEEN 0 AND 6 THEN RAISE EXCEPTION 'day_of_week is 0 (Sunday) – 6 (Saturday)'; END IF;
  IF p_end_time <= p_start_time THEN RAISE EXCEPTION 'end_time must be after start_time'; END IF;
  DELETE FROM booking_availability
   WHERE day_of_week = p_day_of_week AND service_id IS NOT DISTINCT FROM p_service_id;
  GET DIAGNOSTICS v_replaced = ROW_COUNT;
  INSERT INTO booking_availability (day_of_week, start_time, end_time, is_active, service_id)
  VALUES (p_day_of_week, p_start_time, p_end_time, true, p_service_id) RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'availability_id', v_id, 'replaced', v_replaced);
END $fn$;

REVOKE ALL ON FUNCTION public.set_booking_hours(integer, time, time, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_booking_hours(integer, time, time, uuid) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Besökarens dörr
-- ═══════════════════════════════════════════════════════════════════════════
-- Det publika blocket satte in direkt i tabellen och läste tillbaka raden med
-- .insert().select('id') — som anonym, utan läsrätt (samma klass som
-- formulär→lead), och med statusen 'awaiting_payment' som CHECK-villkoret inte
-- känner. Besökaren får en egen dörr: den väljer tjänst, tid och sina uppgifter
-- — aldrig status, personal eller interna anteckningar — och får bokningens id
-- tillbaka utan läsrätt på tabellen. Reglerna ovan gäller förstås också här.
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
          jsonb_strip_nulls(jsonb_build_object(
            'source', COALESCE(p_metadata->>'source', 'public'),
            'block_id', p_metadata->>'block_id', 'page_id', p_metadata->>'page_id',
            'awaiting_payment', CASE WHEN (p_metadata->>'awaiting_payment')::boolean THEN true END)))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'booking_id', v_id, 'start_time', p_start_time, 'end_time', v_end, 'status', 'pending');
END $fn$;

REVOKE ALL ON FUNCTION public.request_booking(uuid, text, text, timestamptz, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_booking(uuid, text, text, timestamptz, text, text, jsonb) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Anyone can create bookings" ON public.bookings;
DROP POLICY IF EXISTS "Staff can create bookings" ON public.bookings;
CREATE POLICY "Staff can create bookings" ON public.bookings
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_module(auth.uid(), 'bookings'));

-- book_appointment_slot: matrisen i stället för handskrivna roller. Reglerna
-- ligger i triggern; funktionen behåller sin vänliga överlappskoll.
DO $patch$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.book_appointment_slot(uuid,text,text,timestamptz,text,text)'::regprocedure);
  IF position('-- matrix-guard 20260919180000' in v_def) = 0 THEN
    IF position('IF NOT (auth.role() = ''service_role'' OR has_role(auth.uid(), ''admin'') OR has_role(auth.uid(), ''writer'')) THEN' in v_def) = 0 THEN
      RAISE EXCEPTION 'bokningens-regler: anchor missing in book_appointment_slot';
    END IF;
    v_def := replace(v_def,
      'IF NOT (auth.role() = ''service_role'' OR has_role(auth.uid(), ''admin'') OR has_role(auth.uid(), ''writer'')) THEN',
      '-- matrix-guard 20260919180000' || E'\n' ||
      '  IF NOT (auth.role() = ''service_role'' OR public.can_access_module(auth.uid(), ''bookings'')) THEN');
    EXECUTE v_def;
  END IF;
END $patch$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Beviset
-- ═══════════════════════════════════════════════════════════════════════════
DO $proof$
DECLARE
  v_svc uuid; v_day date; v_a uuid; v_r jsonb; v_tz text := public.platform_timezone();
  v_had_hours boolean;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    INSERT INTO booking_services (name, duration_minutes, price_cents, currency, is_active) VALUES ('proof: booking rules', 60, 0, 'SEK', true) RETURNING id INTO v_svc;
    -- En tisdag långt fram som ingen rört; öppet 09–12 för just den här tjänsten.
    v_day := (date_trunc('week', now() + interval '400 years'))::date + 1;
    INSERT INTO booking_availability (day_of_week, start_time, end_time, is_active, service_id) VALUES (2, '09:00', '12:00', true, v_svc);

    v_r := public.request_booking(v_svc, 'Proof A', 'Proof.A@example.test', (v_day::text || ' 10:00')::timestamp AT TIME ZONE v_tz);
    v_a := (v_r->>'booking_id')::uuid;

    BEGIN PERFORM public.request_booking(v_svc, 'Proof B', 'proof.b@example.test', (v_day::text || ' 10:30')::timestamp AT TIME ZONE v_tz);
      RAISE EXCEPTION 'proof: an overlapping booking was accepted';
    EXCEPTION WHEN exclusion_violation THEN NULL; END;
    BEGIN PERFORM public.request_booking(v_svc, 'Proof C', 'proof.c@example.test', (v_day::text || ' 03:00')::timestamp AT TIME ZONE v_tz);
      RAISE EXCEPTION 'proof: 03:00 was accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN PERFORM public.request_booking(v_svc, 'Proof D', 'proof.d@example.test', (v_day::text || ' 11:30')::timestamp AT TIME ZONE v_tz);
      RAISE EXCEPTION 'proof: a booking that runs past closing was accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN PERFORM public.request_booking(v_svc, 'Proof E', 'proof.e@example.test', '2020-01-07 10:00+01');
      RAISE EXCEPTION 'proof: a booking in 2020 was accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    -- Regeln bor på tabellen: även en rå insert vägras.
    BEGIN INSERT INTO bookings (service_id, customer_name, customer_email, start_time, end_time, status)
          VALUES (v_svc, 'raw', 'raw@example.test', (v_day::text || ' 10:00')::timestamp AT TIME ZONE v_tz, (v_day::text || ' 11:00')::timestamp AT TIME ZONE v_tz, 'confirmed');
      RAISE EXCEPTION 'proof: a raw insert double-booked 10:00';
    EXCEPTION WHEN exclusion_violation THEN NULL; END;

    INSERT INTO booking_blocked_dates (date, reason, is_all_day) VALUES (v_day + 7, 'proof', true);
    BEGIN PERFORM public.request_booking(v_svc, 'Proof F', 'proof.f@example.test', ((v_day + 7)::text || ' 10:00')::timestamp AT TIME ZONE v_tz);
      RAISE EXCEPTION 'proof: a booking on a blocked day was accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;

    -- Avbokad är slutgiltig; tiden blir fri för nästa.
    UPDATE bookings SET status = 'cancelled' WHERE id = v_a;
    IF (SELECT cancelled_at FROM bookings WHERE id = v_a) IS NULL THEN RAISE EXCEPTION 'proof: cancelling did not stamp cancelled_at'; END IF;
    PERFORM public.request_booking(v_svc, 'Proof K', 'proof.k@example.test', (v_day::text || ' 10:00')::timestamp AT TIME ZONE v_tz);
    BEGIN UPDATE bookings SET status = 'confirmed' WHERE id = v_a;
      RAISE EXCEPTION 'proof: a cancelled booking was revived';
    EXCEPTION WHEN check_violation THEN NULL; END;

    -- Historik får ligga i dåtid.
    INSERT INTO bookings (service_id, customer_name, customer_email, start_time, end_time, status)
    VALUES (v_svc, 'history', 'history@example.test', now() - interval '30 days', now() - interval '30 days' + interval '1 hour', 'completed');

    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bookings' AND cmd = 'INSERT' AND with_check = 'true') THEN
      RAISE EXCEPTION 'proof: an INSERT policy WITH CHECK (true) is still on bookings';
    END IF;
    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'bokningens-regler: proof passed';
END $proof$;
