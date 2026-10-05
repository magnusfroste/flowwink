-- Varje medarbetare har sin egen kalender — resource calendars (Odoo Appointments).
--
-- Bokningen kände en kalender: verksamhetens öppettider och spärrdagar. En
-- medarbetare kunde tilldelas en bokning (assigned_employee_id), men ingenting
-- visste när hen jobbade, var ledig eller redan satt i ett annat möte — samma
-- rådgivare kunde bokas på två tjänster samtidigt, och en besökare erbjöds
-- en tid när ingen fanns på plats.
--
--   1. booking_staff_hours     — en medarbetares veckoschema (tomt = följer öppettiderna).
--   2. booking_staff_time_off  — frånvaro som tidsintervall (semester, sjukdom, utbildning).
--   3. booking_service_staff   — vem som utför en tjänst. En tjänst med pool bokas per
--                                PERSON: varje medlem är en plats.
--   4. booking_staff_conflict  — den enda frågan "kan den här personen ta den här tiden?",
--                                läst av tabellens regel OCH av läsaren för lediga tider.
--   5. booking_rules           — dubbelbokning av en person vägras för alla skrivare;
--                                schema och frånvaro binder besökare och agenter (personal
--                                i admin får överstyra, som med öppettiderna). En ny bokning
--                                på en pooltjänst får den minst belastade lediga medarbetaren.
--   6. booking_free_slots      — nu med p_employee_id; en tid är ledig när minst en ur
--                                poolen är ledig. Utan pool: oförändrat.
--   7. manage_staff_calendar   — admin och agent på samma RPC.

CREATE TABLE IF NOT EXISTS public.booking_staff_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_staff_hours_order CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS booking_staff_hours_employee ON public.booking_staff_hours (employee_id, day_of_week);

CREATE TABLE IF NOT EXISTS public.booking_staff_time_off (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_staff_time_off_order CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS booking_staff_time_off_employee ON public.booking_staff_time_off (employee_id, starts_at);

CREATE TABLE IF NOT EXISTS public.booking_service_staff (
  service_id uuid NOT NULL REFERENCES public.booking_services(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (service_id, employee_id)
);
CREATE INDEX IF NOT EXISTS booking_service_staff_employee ON public.booking_service_staff (employee_id);

ALTER TABLE public.booking_staff_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_staff_time_off ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_service_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Bookings module manages staff hours" ON public.booking_staff_hours;
CREATE POLICY "Bookings module manages staff hours" ON public.booking_staff_hours
  FOR ALL TO authenticated
  USING (can_access_module(auth.uid(), 'bookings'))
  WITH CHECK (can_access_module(auth.uid(), 'bookings'));
DROP POLICY IF EXISTS "Bookings module manages staff time off" ON public.booking_staff_time_off;
CREATE POLICY "Bookings module manages staff time off" ON public.booking_staff_time_off
  FOR ALL TO authenticated
  USING (can_access_module(auth.uid(), 'bookings'))
  WITH CHECK (can_access_module(auth.uid(), 'bookings'));
DROP POLICY IF EXISTS "Bookings module manages service staff" ON public.booking_service_staff;
CREATE POLICY "Bookings module manages service staff" ON public.booking_service_staff
  FOR ALL TO authenticated
  USING (can_access_module(auth.uid(), 'bookings'))
  WITH CHECK (can_access_module(auth.uid(), 'bookings'));

REVOKE ALL ON public.booking_staff_hours, public.booking_staff_time_off, public.booking_service_staff FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_staff_hours, public.booking_staff_time_off, public.booking_service_staff TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Den enda frågan om en person
-- ─────────────────────────────────────────────────────────────────────────
-- NULL = free. Otherwise the reason, phrased to follow the person's name.
CREATE OR REPLACE FUNCTION public.booking_staff_conflict(
  p_employee_id uuid, p_start timestamptz, p_end timestamptz,
  p_before integer DEFAULT 0, p_after integer DEFAULT 0,
  p_exclude_booking uuid DEFAULT NULL, p_ignore_schedule boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tz text := public.platform_timezone();
  v_ls timestamp := p_start AT TIME ZONE public.platform_timezone();
  v_le timestamp := p_end AT TIME ZONE public.platform_timezone();
BEGIN
  IF EXISTS (SELECT 1 FROM bookings b
              WHERE b.assigned_employee_id = p_employee_id
                AND b.id IS DISTINCT FROM p_exclude_booking
                AND b.status IN ('pending', 'confirmed')
                AND tstzrange(b.start_time - make_interval(mins => COALESCE(p_before, 0)), b.end_time + make_interval(mins => COALESCE(p_after, 0)), '[)')
                    && tstzrange(p_start - make_interval(mins => COALESCE(p_before, 0)), p_end + make_interval(mins => COALESCE(p_after, 0)), '[)')) THEN
    RETURN 'is already booked then';
  END IF;
  IF p_ignore_schedule THEN RETURN NULL; END IF;

  IF EXISTS (SELECT 1 FROM booking_staff_time_off t
              WHERE t.employee_id = p_employee_id
                AND tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(p_start, p_end, '[)')) THEN
    RETURN 'is off then';
  END IF;

  -- No hours of their own = they follow the opening hours (checked by the caller).
  IF EXISTS (SELECT 1 FROM booking_staff_hours h WHERE h.employee_id = p_employee_id AND h.is_active)
     AND NOT EXISTS (SELECT 1 FROM booking_staff_hours h
                      WHERE h.employee_id = p_employee_id AND h.is_active
                        AND h.day_of_week = EXTRACT(dow FROM v_ls)::int
                        AND h.start_time <= v_ls::time
                        AND CASE WHEN v_le::date > v_ls::date
                                 THEN v_le::time = time '00:00' AND h.end_time = time '24:00'
                                 ELSE h.end_time >= v_le::time END) THEN
    RETURN format('is not working then (%s – %s, %s)', to_char(v_ls, 'Dy HH24:MI'), to_char(v_le, 'HH24:MI'), v_tz);
  END IF;
  RETURN NULL;
END $function$;

REVOKE ALL ON FUNCTION public.booking_staff_conflict(uuid, timestamptz, timestamptz, integer, integer, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.booking_staff_conflict(uuid, timestamptz, timestamptz, integer, integer, uuid, boolean) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Tabellens regel (ersätts i sin helhet; senast definierad i 20260920040000)
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
  v_pool boolean := false; v_emp uuid; v_conflict text; v_emp_name text;
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
                             OR NEW.service_id IS DISTINCT FROM OLD.service_id
                             OR NEW.assigned_employee_id IS DISTINCT FROM OLD.assigned_employee_id);
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

  -- staff-calendars 20261005040000
  -- A service with a staff pool is booked per PERSON: each member is one place, so the
  -- service-wide capacity count gives way to the per-staff check below.
  v_pool := EXISTS (SELECT 1 FROM booking_service_staff ss WHERE ss.service_id = NEW.service_id);

  IF NOT v_pool THEN
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
  END IF;

  -- A new booking for a pooled service gets the least-loaded member who is free then.
  IF TG_OP = 'INSERT' AND NEW.assigned_employee_id IS NULL AND v_pool THEN
    SELECT ss.employee_id INTO v_emp
      FROM booking_service_staff ss
     WHERE ss.service_id = NEW.service_id
       AND public.booking_staff_conflict(ss.employee_id, NEW.start_time, NEW.end_time, v_before, v_after, NEW.id, v_staff) IS NULL
     ORDER BY (SELECT count(*) FROM bookings b2
                WHERE b2.assigned_employee_id = ss.employee_id AND b2.status IN ('pending', 'confirmed')
                  AND (b2.start_time AT TIME ZONE v_tz)::date = v_local::date), ss.employee_id
     LIMIT 1;
    IF v_emp IS NULL THEN
      RAISE EXCEPTION 'slot_unavailable: % — nobody who performs this service is free then', NEW.start_time
        USING ERRCODE = 'exclusion_violation';
    END IF;
    NEW.assigned_employee_id := v_emp;
  END IF;

  -- One person is in one place: no double booking across services, for any writer. Their
  -- own hours and time off bind visitors and agents; staff in the admin may override those.
  IF NEW.assigned_employee_id IS NOT NULL THEN
    IF v_pool AND NOT EXISTS (SELECT 1 FROM booking_service_staff ss
                               WHERE ss.service_id = NEW.service_id AND ss.employee_id = NEW.assigned_employee_id) THEN
      RAISE EXCEPTION 'slot_unavailable: that staff member does not perform this service'
        USING ERRCODE = 'check_violation';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('booking-staff:' || NEW.assigned_employee_id::text, 0));
    v_conflict := public.booking_staff_conflict(NEW.assigned_employee_id, NEW.start_time, NEW.end_time, v_before, v_after, NEW.id, v_staff);
    IF v_conflict IS NOT NULL THEN
      SELECT e.name INTO v_emp_name FROM employees e WHERE e.id = NEW.assigned_employee_id;
      RAISE EXCEPTION 'slot_unavailable: % %', COALESCE(v_emp_name, 'the staff member'), v_conflict
        USING ERRCODE = 'exclusion_violation';
    END IF;
  END IF;

  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public.booking_rules() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.booking_rules() TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Den enda läsaren, nu per person
-- ─────────────────────────────────────────────────────────────────────────
-- The two-argument version is replaced, not overloaded: two signatures would make
-- PostgREST guess, and every caller passing two named arguments still lands here.
DROP FUNCTION IF EXISTS public.booking_free_slots(uuid, date);

CREATE OR REPLACE FUNCTION public.booking_free_slots(p_service_id uuid, p_date date, p_employee_id uuid DEFAULT NULL)
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
  v_staffset uuid[] := '{}';
  v_use_staff boolean := false;
  v_open_any boolean;
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

  -- staff-calendars 20261005040000: one person (p_employee_id), or the service's staff pool.
  -- A slot is free when at least one of them is: not booked (any service), not off, and
  -- inside their own hours when they have any. Without a pool the service capacity rules.
  IF p_employee_id IS NOT NULL THEN
    v_use_staff := true;
    IF p_service_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM booking_service_staff ss WHERE ss.service_id = p_service_id)
       OR EXISTS (SELECT 1 FROM booking_service_staff ss WHERE ss.service_id = p_service_id AND ss.employee_id = p_employee_id) THEN
      v_staffset := ARRAY[p_employee_id];
    END IF;
  ELSIF p_service_id IS NOT NULL THEN
    SELECT COALESCE(array_agg(ss.employee_id), '{}') INTO v_staffset FROM booking_service_staff ss WHERE ss.service_id = p_service_id;
    v_use_staff := COALESCE(array_length(v_staffset, 1), 0) > 0;
  END IF;
  v_open_any := EXISTS (SELECT 1 FROM booking_availability a WHERE a.is_active);

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
      UNION
      SELECT h.start_time, h.end_time FROM booking_staff_hours h
       WHERE v_use_staff AND h.is_active AND h.employee_id = ANY (v_staffset)
         AND h.day_of_week = EXTRACT(dow FROM p_date)::int
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
                                  c.starts_at + make_interval(mins => v_duration + v_after), '[)')) AS taken,
             CASE WHEN v_use_staff THEN
               (SELECT count(*) FROM unnest(v_staffset) AS e(id)
                 WHERE public.booking_staff_conflict(e.id, c.starts_at, c.starts_at + make_interval(mins => v_duration),
                                                     v_before, v_after, NULL, false) IS NULL)
             ELSE 0 END AS staff_free
        FROM candidates c
       WHERE c.local_start > v_now
         -- A staff member's hours widen the grid, never the opening hours.
         AND (NOT v_open_any OR EXISTS (
               SELECT 1 FROM booking_availability a
                WHERE a.is_active AND a.day_of_week = EXTRACT(dow FROM p_date)::int
                  AND (a.service_id IS NULL OR a.service_id = p_service_id)
                  AND a.start_time <= c.local_start::time
                  AND a.end_time >= (c.local_start + make_interval(mins => v_duration))::time))
         AND NOT EXISTS (SELECT 1 FROM booking_blocked_dates bd
                          WHERE bd.date = p_date AND bd.start_time IS NOT NULL AND bd.end_time IS NOT NULL
                            AND c.local_start::time < bd.end_time
                            AND (c.local_start + make_interval(mins => v_duration))::time > bd.start_time)
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'time', to_char(local_start, 'HH24:MI'), 'starts_at', starts_at,
             'places_left', CASE WHEN v_use_staff THEN staff_free ELSE v_capacity - taken END)
             ORDER BY m), '[]'::jsonb)
      INTO v_slots FROM counted
     WHERE CASE WHEN v_use_staff THEN staff_free > 0 ELSE taken < v_capacity END;
  END IF;

  RETURN jsonb_build_object('success', true, 'date', p_date, 'service_id', p_service_id, 'timezone', v_tz,
    'slot_minutes', v_duration, 'buffer_before_minutes', v_before, 'buffer_after_minutes', v_after, 'capacity', v_capacity,
    'is_blocked', v_blocked, 'blocked_reasons', v_reasons,
    'employee_id', p_employee_id, 'staff_pool_size', COALESCE(array_length(v_staffset, 1), 0),
    'slots', v_slots,
    'free_slots', COALESCE((SELECT jsonb_agg(s->>'time') FROM jsonb_array_elements(v_slots) s), '[]'::jsonb));
END;
$function$;

-- Widgeten är publik: en besökare måste kunna se lediga tider. Svaret bär bara klockslag
-- och antal lediga — aldrig vem.
REVOKE ALL ON FUNCTION public.booking_free_slots(uuid, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.booking_free_slots(uuid, date, uuid) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. Admin och agent på samma RPC
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.manage_staff_calendar(
  p_action text,
  p_employee_id uuid DEFAULT NULL,
  p_hours jsonb DEFAULT NULL,
  p_starts_at timestamptz DEFAULT NULL,
  p_ends_at timestamptz DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_time_off_id uuid DEFAULT NULL,
  p_service_ids uuid[] DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_h jsonb; v_n int := 0; v_id uuid; v_out jsonb;
  v_tz text := public.platform_timezone();
BEGIN
  IF p_action NOT IN ('set_hours','add_time_off','remove_time_off','set_services','get','list') THEN
    RAISE EXCEPTION 'action must be one of set_hours, add_time_off, remove_time_off, set_services, get, list';
  END IF;
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'bookings')) THEN
    RAISE EXCEPTION 'Requires the bookings module — an admin can grant it under Users → Role Permissions';
  END IF;
  IF p_action NOT IN ('list','remove_time_off') THEN
    IF p_employee_id IS NULL THEN RAISE EXCEPTION 'employee_id is required (manage_employee action:list)'; END IF;
    IF NOT EXISTS (SELECT 1 FROM employees WHERE id = p_employee_id) THEN RAISE EXCEPTION 'employee % not found', p_employee_id; END IF;
  END IF;

  IF p_action = 'set_hours' THEN
    -- Replaces the whole week. An empty array clears it: the person follows the opening hours.
    IF p_hours IS NULL OR jsonb_typeof(p_hours) <> 'array' THEN
      RAISE EXCEPTION 'hours is required: [{day_of_week 0-6 (0 = Sunday), start_time "09:00", end_time "17:00"}], or [] to clear';
    END IF;
    DELETE FROM booking_staff_hours WHERE employee_id = p_employee_id;
    FOR v_h IN SELECT * FROM jsonb_array_elements(p_hours) LOOP
      INSERT INTO booking_staff_hours (employee_id, day_of_week, start_time, end_time)
      VALUES (p_employee_id, (v_h->>'day_of_week')::int, (v_h->>'start_time')::time, (v_h->>'end_time')::time);
      v_n := v_n + 1;
    END LOOP;
    RETURN jsonb_build_object('success', true, 'employee_id', p_employee_id, 'windows', v_n);

  ELSIF p_action = 'add_time_off' THEN
    IF p_starts_at IS NULL OR p_ends_at IS NULL THEN
      RAISE EXCEPTION 'starts_at and ends_at are required (ISO time with offset)';
    END IF;
    INSERT INTO booking_staff_time_off (employee_id, starts_at, ends_at, reason, created_by)
    VALUES (p_employee_id, p_starts_at, p_ends_at, p_reason, auth.uid()) RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'time_off_id', v_id,
      'conflicting_bookings', (SELECT count(*) FROM bookings b
                                WHERE b.assigned_employee_id = p_employee_id AND b.status IN ('pending', 'confirmed')
                                  AND tstzrange(b.start_time, b.end_time, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')));

  ELSIF p_action = 'remove_time_off' THEN
    DELETE FROM booking_staff_time_off WHERE id = p_time_off_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'time_off_not_found'; END IF;
    RETURN jsonb_build_object('success', true, 'time_off_id', p_time_off_id);

  ELSIF p_action = 'set_services' THEN
    -- Replaces which services this person performs. A service with at least one person is
    -- booked per person from then on.
    DELETE FROM booking_service_staff WHERE employee_id = p_employee_id;
    INSERT INTO booking_service_staff (service_id, employee_id)
    SELECT DISTINCT sid, p_employee_id FROM unnest(COALESCE(p_service_ids, '{}')) AS sid;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN jsonb_build_object('success', true, 'employee_id', p_employee_id, 'services', v_n);

  ELSIF p_action = 'get' THEN
    SELECT jsonb_build_object(
      'employee', jsonb_build_object('id', e.id, 'name', e.name, 'title', e.title),
      'timezone', v_tz,
      'hours', COALESCE((SELECT jsonb_agg(jsonb_build_object('day_of_week', h.day_of_week,
                  'start_time', to_char(h.start_time, 'HH24:MI'), 'end_time', to_char(h.end_time, 'HH24:MI'))
                  ORDER BY h.day_of_week, h.start_time) FROM booking_staff_hours h WHERE h.employee_id = e.id AND h.is_active), '[]'::jsonb),
      'follows_opening_hours', NOT EXISTS (SELECT 1 FROM booking_staff_hours h WHERE h.employee_id = e.id AND h.is_active),
      'time_off', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'starts_at', t.starts_at, 'ends_at', t.ends_at, 'reason', t.reason)
                  ORDER BY t.starts_at) FROM booking_staff_time_off t
                  WHERE t.employee_id = e.id AND t.ends_at > COALESCE(p_from::timestamptz, now())), '[]'::jsonb),
      'services', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) ORDER BY s.name)
                  FROM booking_service_staff ss JOIN booking_services s ON s.id = ss.service_id WHERE ss.employee_id = e.id), '[]'::jsonb),
      'bookings', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'start_time', b.start_time, 'end_time', b.end_time,
                  'status', b.status, 'service_id', b.service_id) ORDER BY b.start_time)
                  FROM bookings b WHERE b.assigned_employee_id = e.id AND b.status IN ('pending', 'confirmed')
                    AND b.start_time >= COALESCE(p_from::timestamptz, now())
                    AND b.start_time < COALESCE(p_to::timestamptz + interval '1 day', COALESCE(p_from::timestamptz, now()) + interval '14 days')), '[]'::jsonb))
      INTO v_out FROM employees e WHERE e.id = p_employee_id;
    RETURN v_out;

  ELSE -- list: everyone with a calendar of their own or a service to perform
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name,
             'has_hours', EXISTS (SELECT 1 FROM booking_staff_hours h WHERE h.employee_id = e.id AND h.is_active),
             'services', (SELECT count(*) FROM booking_service_staff ss WHERE ss.employee_id = e.id),
             'upcoming_bookings', (SELECT count(*) FROM bookings b WHERE b.assigned_employee_id = e.id
                                     AND b.status IN ('pending', 'confirmed') AND b.start_time >= now()))
             ORDER BY e.name), '[]'::jsonb)
      INTO v_out FROM employees e
     WHERE e.status = 'active'
        OR EXISTS (SELECT 1 FROM booking_service_staff ss WHERE ss.employee_id = e.id);
    RETURN jsonb_build_object('staff', v_out);
  END IF;
END $function$;

REVOKE ALL ON FUNCTION public.manage_staff_calendar(text, uuid, jsonb, timestamptz, timestamptz, text, uuid, uuid[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_staff_calendar(text, uuid, jsonb, timestamptz, timestamptz, text, uuid, uuid[], date, date) TO authenticated, service_role;
