-- SLA business hours (docs/parity/capabilities/sla.json#business_hours).
-- SLA timers today assume 24/7. This adds a configurable business-hours calendar
-- (per weekday open/close) + holidays, and business_minutes_between(start,end) which
-- counts only minutes that fall inside business hours and outside holidays — the
-- function the SLA sweep can use instead of raw elapsed wall-clock. Pure/STABLE.
-- Seeds a default Mon–Fri 09:00–17:00. Idempotent throughout.

CREATE TABLE IF NOT EXISTS "public"."business_hours" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "weekday" integer NOT NULL,   -- Postgres DOW: 0=Sun … 6=Sat
    "open_time" time NOT NULL,
    "close_time" time NOT NULL,
    "is_open" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "business_hours_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "business_hours_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6),
    CONSTRAINT "business_hours_window_check" CHECK ("close_time" > "open_time"),
    CONSTRAINT "business_hours_weekday_window_key" UNIQUE ("weekday", "open_time")
);

CREATE TABLE IF NOT EXISTS "public"."business_holidays" (
    "day" "date" NOT NULL,
    "name" "text",
    CONSTRAINT "business_holidays_pkey" PRIMARY KEY ("day")
);

ALTER TABLE "public"."business_hours" OWNER TO "postgres";
ALTER TABLE "public"."business_holidays" OWNER TO "postgres";

ALTER TABLE "public"."business_hours" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."business_holidays" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['business_hours','business_holidays'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Admins manage %1$s" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "Admins manage %1$s" ON public.%1$s USING (public.has_role(auth.uid(), ''admin''::public.app_role))', t);
    EXECUTE format('DROP POLICY IF EXISTS "Anyone reads %1$s" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "Anyone reads %1$s" ON public.%1$s FOR SELECT USING (true)', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO anon, authenticated, service_role', t);
  END LOOP;
END $$;

-- Seed default Mon–Fri 09:00–17:00 (weekday 1..5)
INSERT INTO "public"."business_hours" ("weekday","open_time","close_time")
SELECT d, TIME '09:00', TIME '17:00' FROM generate_series(1,5) AS d
ON CONFLICT ("weekday","open_time") DO NOTHING;

-- business_minutes_between: minutes within business hours, excluding holidays.
CREATE OR REPLACE FUNCTION "public"."business_minutes_between"(
  "p_start" timestamptz, "p_end" timestamptz
) RETURNS integer
LANGUAGE "plpgsql" STABLE
SET "search_path" TO 'public'
AS $$
DECLARE
  v_total numeric := 0;
  v_day date;
  v_end_day date;
  v_win RECORD;
  v_open timestamptz;
  v_close timestamptz;
  v_seg_start timestamptz;
  v_seg_end timestamptz;
BEGIN
  IF p_end <= p_start THEN RETURN 0; END IF;
  v_day := p_start::date;
  v_end_day := p_end::date;
  WHILE v_day <= v_end_day LOOP
    IF NOT EXISTS (SELECT 1 FROM business_holidays h WHERE h.day = v_day) THEN
      FOR v_win IN
        SELECT open_time, close_time FROM business_hours
        WHERE is_open AND weekday = EXTRACT(DOW FROM v_day)::int
      LOOP
        v_open  := (v_day + v_win.open_time)::timestamptz;
        v_close := (v_day + v_win.close_time)::timestamptz;
        v_seg_start := GREATEST(v_open, p_start);
        v_seg_end   := LEAST(v_close, p_end);
        IF v_seg_end > v_seg_start THEN
          v_total := v_total + EXTRACT(EPOCH FROM (v_seg_end - v_seg_start)) / 60.0;
        END IF;
      END LOOP;
    END IF;
    v_day := v_day + 1;
  END LOOP;
  RETURN ROUND(v_total)::int;
END;
$$;

ALTER FUNCTION "public"."business_minutes_between"(timestamptz, timestamptz) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."business_minutes_between"(timestamptz, timestamptz) TO "anon", "authenticated", "service_role";

-- manage_business_hours: CRUD the calendar + holidays (backs the skill). Writer-gated.
CREATE OR REPLACE FUNCTION "public"."manage_business_hours"(
  "p_action" "text",
  "p_weekday" integer DEFAULT NULL,
  "p_open_time" time DEFAULT NULL,
  "p_close_time" time DEFAULT NULL,
  "p_is_open" boolean DEFAULT NULL,
  "p_holiday" "date" DEFAULT NULL,
  "p_holiday_name" "text" DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
  v_result jsonb;
BEGIN
  IF p_action <> 'list' AND NOT v_writer THEN
    RAISE EXCEPTION 'Only admins can modify business hours';
  END IF;

  IF p_action = 'list' THEN
    RETURN jsonb_build_object(
      'success', true,
      'hours', (SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.weekday, b.open_time), '[]'::jsonb) FROM business_hours b),
      'holidays', (SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.day), '[]'::jsonb) FROM business_holidays h)
    );
  ELSIF p_action = 'set_hours' THEN
    IF p_weekday IS NULL OR p_open_time IS NULL OR p_close_time IS NULL THEN
      RAISE EXCEPTION 'weekday, open_time, close_time required';
    END IF;
    INSERT INTO business_hours (weekday, open_time, close_time, is_open)
    VALUES (p_weekday, p_open_time, p_close_time, COALESCE(p_is_open, true))
    ON CONFLICT (weekday, open_time) DO UPDATE SET close_time = EXCLUDED.close_time, is_open = EXCLUDED.is_open;
    RETURN jsonb_build_object('success', true);
  ELSIF p_action = 'clear_day' THEN
    IF p_weekday IS NULL THEN RAISE EXCEPTION 'weekday required'; END IF;
    DELETE FROM business_hours WHERE weekday = p_weekday;
    RETURN jsonb_build_object('success', true);
  ELSIF p_action = 'add_holiday' THEN
    IF p_holiday IS NULL THEN RAISE EXCEPTION 'holiday date required'; END IF;
    INSERT INTO business_holidays (day, name) VALUES (p_holiday, p_holiday_name)
    ON CONFLICT (day) DO UPDATE SET name = EXCLUDED.name;
    RETURN jsonb_build_object('success', true);
  ELSIF p_action = 'remove_holiday' THEN
    DELETE FROM business_holidays WHERE day = p_holiday;
    RETURN jsonb_build_object('success', true);
  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|set_hours|clear_day|add_holiday|remove_holiday', p_action;
  END IF;
END;
$$;

ALTER FUNCTION "public"."manage_business_hours"("text",integer,time,time,boolean,"date","text") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."manage_business_hours"("text",integer,time,time,boolean,"date","text") TO "anon", "authenticated", "service_role";
