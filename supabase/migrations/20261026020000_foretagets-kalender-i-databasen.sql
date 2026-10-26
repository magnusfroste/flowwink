-- The business's calendar in the database: "today", "now" and a timestamp's
-- day are the business's, not the UTC session's.
--
-- docs/architecture/locale-and-formatting.md §3b/§3c. The database runs in
-- UTC. Every CURRENT_DATE, now()::date and LOCALTIME therefore answered on the
-- UTC calendar: an invoice, journal entry or expense created between 00:00
-- and 02:00 in Stockholm was dated YESTERDAY, in the previous and maybe
-- locked period; a webshop order paid at 01:30 on 1 November was posted to
-- October; in New York every evening's sales were posted to tomorrow and the
-- overdue reminder went out on the evening of the due date. SLA deadlines
-- measured "open 08–17" on the UTC clock (09/10–18/19 in Stockholm), and
-- happy-hour price rules applied at the wrong hours.
--
-- platform_today() (20260922100000) already answered correctly — almost
-- nothing used it. This migration DISCOVERS the uses rather than listing
-- them, like 20261025040000 did for currency, so it reaches the ~100
-- functions, 2 views and 24 column defaults nobody would have enumerated;
-- running it again finds nothing and does nothing.

-- ── 1. Column defaults: a document dated "today" is dated the business's today
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND (c.column_default ~* '^\(?CURRENT_DATE\)?$' OR c.column_default ~* '^\(?now\(\)\)?::date$')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I SET DEFAULT public.platform_today()', r.table_name, r.column_name);
  END LOOP;
END
$do$;

-- ── 2. SLA business hours on the business's clock ────────────────────────
-- Opening hours are wall-clock times; a day is the business's day.
CREATE OR REPLACE FUNCTION public.business_minutes_add(p_start timestamp with time zone, p_minutes numeric)
RETURNS timestamp with time zone
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $fn$
DECLARE
  v_left numeric := GREATEST(COALESCE(p_minutes, 0), 0);
  v_tz text := public.business_timezone();
  v_day date;
  v_win record;
  v_open timestamptz;
  v_close timestamptz;
  v_seg_start timestamptz;
  v_avail numeric;
  v_guard integer := 0;
BEGIN
  -- No calendar configured → a round-the-clock clock, the same assumption
  -- business_minutes_between() makes in the sweep.
  IF NOT EXISTS (SELECT 1 FROM public.business_hours WHERE is_open) THEN
    RETURN p_start + (v_left * interval '1 minute');
  END IF;

  v_day := (p_start AT TIME ZONE v_tz)::date;
  WHILE v_guard < 800 LOOP
    v_guard := v_guard + 1;
    IF NOT EXISTS (SELECT 1 FROM public.business_holidays h WHERE h.day = v_day) THEN
      FOR v_win IN
        SELECT open_time, close_time FROM public.business_hours
         WHERE is_open AND weekday = EXTRACT(DOW FROM v_day)::int
         ORDER BY open_time
      LOOP
        v_open  := (v_day + v_win.open_time) AT TIME ZONE v_tz;
        v_close := (v_day + v_win.close_time) AT TIME ZONE v_tz;
        v_seg_start := GREATEST(v_open, p_start);
        IF v_close > v_seg_start THEN
          v_avail := EXTRACT(EPOCH FROM (v_close - v_seg_start)) / 60.0;
          IF v_left <= v_avail THEN
            RETURN v_seg_start + (v_left * interval '1 minute');
          END IF;
          v_left := v_left - v_avail;
        END IF;
      END LOOP;
    END IF;
    v_day := v_day + 1;
  END LOOP;

  -- The budget outlives the horizon (>800 days of opening hours). A monotone
  -- wall-clock answer beats NULL — a NULL deadline reads as "no SLA" in the UI.
  RETURN p_start + (GREATEST(COALESCE(p_minutes, 0), 0) * interval '1 minute');
END;
$fn$;

CREATE OR REPLACE FUNCTION public.business_minutes_between(p_start timestamp with time zone, p_end timestamp with time zone)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $fn$
DECLARE
  v_total numeric := 0; v_day date; v_end_day date; v_win RECORD;
  v_tz text := public.business_timezone();
  v_open timestamptz; v_close timestamptz; v_seg_start timestamptz; v_seg_end timestamptz;
BEGIN
  IF p_end <= p_start THEN RETURN 0; END IF;
  v_day := (p_start AT TIME ZONE v_tz)::date; v_end_day := (p_end AT TIME ZONE v_tz)::date;
  WHILE v_day <= v_end_day LOOP
    IF NOT EXISTS (SELECT 1 FROM business_holidays h WHERE h.day = v_day) THEN
      FOR v_win IN SELECT open_time, close_time FROM business_hours
        WHERE is_open AND weekday = EXTRACT(DOW FROM v_day)::int LOOP
        v_open  := (v_day + v_win.open_time) AT TIME ZONE v_tz;
        v_close := (v_day + v_win.close_time) AT TIME ZONE v_tz;
        v_seg_start := GREATEST(v_open, p_start); v_seg_end := LEAST(v_close, p_end);
        IF v_seg_end > v_seg_start THEN
          v_total := v_total + EXTRACT(EPOCH FROM (v_seg_end - v_seg_start)) / 60.0;
        END IF;
      END LOOP;
    END IF;
    v_day := v_day + 1;
  END LOOP;
  RETURN ROUND(v_total)::int;
END;
$fn$;

-- ── 3. Function bodies and parameter defaults ────────────────────────────
-- CURRENT_DATE / now()::date → platform_today(); LOCALTIME → the business's
-- wall-clock time; a timestamp's day (created_at / updated_at / closed_at /
-- paid_at on invoices — timestamptz everywhere in this schema) → its day on
-- the business's clock. The calendar helpers themselves are skipped.
DO $do$
DECLARE
  r record;
  v_def text;
  v_new text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname NOT IN ('platform_today', 'platform_timezone', 'business_timezone', 'business_currency',
                            'business_country', 'business_country_defaults', 'format_business_amount',
                            'business_minutes_add', 'business_minutes_between')
      AND (p.prosrc ~* '\mcurrent_date\M|now\(\)::date|\mlocaltime\M(?!stamp)'
        OR pg_get_function_arguments(p.oid) ~* '\mcurrent_date\M'
        OR p.prosrc ~ '\m(created_at|updated_at|closed_at)::date'
        OR (p.proname IN ('book_invoice_paid', 'record_invoice_payment') AND p.prosrc ~ 'paid_at::date'))
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_new := regexp_replace(v_def, '\mCURRENT_DATE\M', 'public.platform_today()', 'gi');
    v_new := regexp_replace(v_new, 'now\(\)::date', 'public.platform_today()', 'gi');
    v_new := regexp_replace(v_new, '\mLOCALTIME\M(?!STAMP)', '(now() AT TIME ZONE public.business_timezone())::time', 'gi');
    v_new := regexp_replace(v_new, '(\m(?:[A-Za-z_]+\.)?(?:created_at|updated_at|closed_at))::date', '(\1 AT TIME ZONE public.business_timezone())::date', 'g');
    IF r.proname IN ('book_invoice_paid', 'record_invoice_payment') THEN
      v_new := regexp_replace(v_new, '(\m(?:[A-Za-z_]+\.)?paid_at)::date', '(\1 AT TIME ZONE public.business_timezone())::date', 'g');
    END IF;
    IF v_new IS DISTINCT FROM v_def THEN
      EXECUTE v_new;
    END IF;
  END LOOP;
END
$do$;

-- ── 4. Views ────────────────────────────────────────────────────────────
DO $do$
DECLARE
  r record;
  v_def text;
  v_new text;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v'
      AND pg_get_viewdef(c.oid) ~* '\mcurrent_date\M|now\(\)::date'
  LOOP
    v_def := pg_get_viewdef(format('public.%I', r.relname)::regclass);
    v_new := regexp_replace(v_def, '\mCURRENT_DATE\M', 'public.platform_today()', 'gi');
    v_new := regexp_replace(v_new, 'now\(\)::date', 'public.platform_today()', 'gi');
    IF v_new IS DISTINCT FROM v_def THEN
      EXECUTE format('CREATE OR REPLACE VIEW public.%I AS %s', r.relname, v_new);
    END IF;
  END LOOP;
END
$do$;
