-- Räkenskapsåret får en modell (2026-10-26).
--
-- accounting_preferences.fiscalYearStartMonth sparades men lästes ingenstans:
-- årsväljaren, rapporterna, ingående balanser, verifikationsnumreringen,
-- periodlåsen, budgetar och bokslutskontrollen räknade alla på kalenderår
-- (extract(year from entry_date), make_date(p_year, 1, 1)). Ett bolag med
-- brutet räkenskapsår (juli–juni) fick fel allt.
--
-- Modellen (Odoo account.fiscal.year, Accounted fiscal_periods):
--
--   1. NYCKELN för ett räkenskapsår är det kalenderår det SLUTAR i —
--      Skatteverkets beskattningsår, BFN:s "2025/26". Ett kalenderår behåller
--      därmed sin nyckel: accounting_periods.fiscal_year,
--      opening_balances.fiscal_year, budgets.fiscal_year, voucher_year och
--      varje p_year i skills betyder detsamma som förut för alla som bokför
--      januari–december. Ingen befintlig rad flyttar.
--   2. Ett räkenskapsår är antingen en EXPLICIT rad i fiscal_years (date_from,
--      date_to, etikett; överlapp vägras — ett förkortat första år, ett
--      omläggningsår) eller HÄRLETT ur startmånaden i inställningarna. Raden
--      vinner. fiscal_year_of(date) / fiscal_year_range(key) är de två
--      läsarna; allt annat går genom dem.
--   3. Perioderna (accounting_periods.period_month) förblir KALENDERMÅNADER
--      inom räkenskapsåret, så (fiscal_year, period_month) är fortfarande
--      unikt och periodlåsen fungerar som förut: juli 2026 i ett juli–juni-år
--      är period (2027, 7).
--   4. Momsen rör sig inte: Skatteverkets redovisningsperioder är kalender-
--      månader/kvartal/kalenderår oavsett räkenskapsår. VAT-rapporterna läser
--      kalendern som förut.
--
-- Allt idempotent. Beviset i slutet kör modellen på ett juli–juni-bolag med
-- ett förkortat första år och rullar tillbaka sig självt.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── 1. The table ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fiscal_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- the calendar year the fiscal year ends in
  key integer NOT NULL UNIQUE,
  label text,
  date_from date NOT NULL,
  date_to date NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fiscal_years_ordered CHECK (date_to >= date_from),
  CONSTRAINT fiscal_years_at_most_18_months CHECK (date_to < date_from + interval '18 months'),
  CONSTRAINT fiscal_years_key_is_end_year CHECK (key = EXTRACT(year FROM date_to)::int),
  CONSTRAINT fiscal_years_no_overlap EXCLUDE USING gist (daterange(date_from, date_to, '[]') WITH &&)
);
COMMENT ON TABLE public.fiscal_years IS 'Explicit fiscal years (a short first year, a changed start month). A year without a row is derived from accounting_preferences.fiscalYearStartMonth. key = the calendar year the fiscal year ends in.';

ALTER TABLE public.fiscal_years ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fiscal_years_read ON public.fiscal_years;
CREATE POLICY fiscal_years_read ON public.fiscal_years FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS fiscal_years_admin ON public.fiscal_years;
CREATE POLICY fiscal_years_admin ON public.fiscal_years FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
GRANT SELECT ON public.fiscal_years TO authenticated;
GRANT ALL ON public.fiscal_years TO service_role;

DROP TRIGGER IF EXISTS fiscal_years_set_updated_at ON public.fiscal_years;
CREATE TRIGGER fiscal_years_set_updated_at BEFORE UPDATE ON public.fiscal_years
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── 2. The two readers ─────────────────────────────────────────────────────
-- The start month from the settings (1 = January = calendar years).
CREATE OR REPLACE FUNCTION public.fiscal_start_month()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT COALESCE(
    NULLIF((SELECT value ->> 'fiscalYearStartMonth' FROM public.site_settings WHERE key = 'accounting_preferences'), '')::int,
    1);
$fn$;
GRANT EXECUTE ON FUNCTION public.fiscal_start_month() TO anon, authenticated, service_role;

-- The fiscal year a date belongs to (its key): an explicit row that contains
-- the date, else derived — with start month m, a date in month ≥ m belongs to
-- the year ending next calendar year.
CREATE OR REPLACE FUNCTION public.fiscal_year_of(p_date date)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_key integer;
  v_m integer := public.fiscal_start_month();
BEGIN
  IF p_date IS NULL THEN RETURN NULL; END IF;
  SELECT key INTO v_key FROM public.fiscal_years WHERE p_date BETWEEN date_from AND date_to LIMIT 1;
  IF v_key IS NOT NULL THEN RETURN v_key; END IF;
  IF v_m <= 1 THEN RETURN EXTRACT(year FROM p_date)::int; END IF;
  RETURN EXTRACT(year FROM p_date)::int + CASE WHEN EXTRACT(month FROM p_date)::int >= v_m THEN 1 ELSE 0 END;
END $fn$;
GRANT EXECUTE ON FUNCTION public.fiscal_year_of(date) TO anon, authenticated, service_role;

-- The dates of a fiscal year (by key): the explicit row, else derived from
-- the start month. A derived year never overlaps an explicit one: it is
-- clipped to the days the explicit rows leave free.
CREATE OR REPLACE FUNCTION public.fiscal_year_range(p_key integer)
RETURNS TABLE(date_from date, date_to date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_m integer := public.fiscal_start_month();
  v_from date; v_to date; v_clip date;
BEGIN
  SELECT f.date_from, f.date_to INTO v_from, v_to FROM public.fiscal_years f WHERE f.key = p_key;
  IF v_from IS NOT NULL THEN
    RETURN QUERY SELECT v_from, v_to; RETURN;
  END IF;
  IF v_m <= 1 THEN
    v_from := make_date(p_key, 1, 1); v_to := make_date(p_key, 12, 31);
  ELSE
    v_from := make_date(p_key - 1, v_m, 1);
    v_to := (make_date(p_key, v_m, 1) - interval '1 day')::date;
  END IF;
  -- The derived year starts after the latest explicit year that ends inside it.
  SELECT max(f.date_to) + 1 INTO v_clip FROM public.fiscal_years f WHERE f.date_to >= v_from AND f.date_to < v_to;
  IF v_clip IS NOT NULL THEN v_from := v_clip; END IF;
  SELECT min(f.date_from) - 1 INTO v_clip FROM public.fiscal_years f WHERE f.date_from > v_from AND f.date_from <= v_to;
  IF v_clip IS NOT NULL THEN v_to := v_clip; END IF;
  RETURN QUERY SELECT v_from, v_to;
END $fn$;
GRANT EXECUTE ON FUNCTION public.fiscal_year_range(integer) TO anon, authenticated, service_role;

-- "2026" for a calendar year, "2025/26" for one that starts earlier; the row's label wins.
CREATE OR REPLACE FUNCTION public.fiscal_year_label(p_key integer)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_label text; v_from date; v_to date;
BEGIN
  SELECT NULLIF(trim(label), '') INTO v_label FROM public.fiscal_years WHERE key = p_key;
  IF v_label IS NOT NULL THEN RETURN v_label; END IF;
  SELECT r.date_from, r.date_to INTO v_from, v_to FROM public.fiscal_year_range(p_key) r;
  IF EXTRACT(year FROM v_from)::int = p_key THEN RETURN p_key::text; END IF;
  RETURN EXTRACT(year FROM v_from)::int::text || '/' || right(p_key::text, 2);
END $fn$;
GRANT EXECUTE ON FUNCTION public.fiscal_year_label(integer) TO anon, authenticated, service_role;

-- How many calendar months a fiscal year spans (12, or fewer for a short one).
CREATE OR REPLACE FUNCTION public.fiscal_year_months(p_key integer)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT ((EXTRACT(year FROM r.date_to) - EXTRACT(year FROM r.date_from)) * 12
          + EXTRACT(month FROM r.date_to) - EXTRACT(month FROM r.date_from) + 1)::int
    FROM public.fiscal_year_range(p_key) r;
$fn$;
GRANT EXECUTE ON FUNCTION public.fiscal_year_months(integer) TO anon, authenticated, service_role;

-- The first day of calendar month p_month inside fiscal year p_key, or NULL
-- when that month is not in the year (a short year).
CREATE OR REPLACE FUNCTION public.fiscal_period_start(p_key integer, p_month integer)
RETURNS date
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_from date; v_to date; v_d date;
BEGIN
  SELECT r.date_from, r.date_to INTO v_from, v_to FROM public.fiscal_year_range(p_key) r;
  v_d := make_date(EXTRACT(year FROM v_from)::int, p_month, 1);
  IF v_d < date_trunc('month', v_from)::date THEN v_d := make_date(EXTRACT(year FROM v_from)::int + 1, p_month, 1); END IF;
  IF v_d > v_to OR (v_d + interval '1 month' - interval '1 day')::date < v_from THEN RETURN NULL; END IF;
  RETURN v_d;
END $fn$;
GRANT EXECUTE ON FUNCTION public.fiscal_period_start(integer, integer) TO anon, authenticated, service_role;

-- The closing status of the period a date falls in ('open' when no row).
CREATE OR REPLACE FUNCTION public.period_status_for_date(p_date date)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT COALESCE((SELECT p.status::text FROM public.accounting_periods p
                    WHERE p.fiscal_year = public.fiscal_year_of(p_date)
                      AND p.period_month = EXTRACT(month FROM p_date)::int), 'open');
$fn$;
GRANT EXECUTE ON FUNCTION public.period_status_for_date(date) TO authenticated, service_role;

-- The agent's and the admin's writer: set/delete an explicit year.
CREATE OR REPLACE FUNCTION public.manage_fiscal_year(p_action text, p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL, p_label text DEFAULT NULL, p_key integer DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_key integer; v_row public.fiscal_years; v_has_entries int;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Only admins can define fiscal years';
  END IF;
  IF p_action = 'list' THEN
    RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('key', f.key, 'label', public.fiscal_year_label(f.key),
                                       'date_from', f.date_from, 'date_to', f.date_to, 'notes', f.notes, 'explicit', true) ORDER BY f.date_from)
                       FROM public.fiscal_years f), '[]'::jsonb);
  ELSIF p_action = 'set' THEN
    IF p_date_from IS NULL OR p_date_to IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'p_date_from and p_date_to are required');
    END IF;
    v_key := EXTRACT(year FROM p_date_to)::int;
    IF p_key IS NOT NULL AND p_key <> v_key THEN
      RETURN jsonb_build_object('success', false, 'error', format('key must be the calendar year the fiscal year ends in: %s, not %s', v_key, p_key));
    END IF;
    INSERT INTO public.fiscal_years (key, label, date_from, date_to, notes)
    VALUES (v_key, NULLIF(trim(p_label), ''), p_date_from, p_date_to, p_notes)
    ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, date_from = EXCLUDED.date_from, date_to = EXCLUDED.date_to,
                                    notes = COALESCE(EXCLUDED.notes, public.fiscal_years.notes), updated_at = now()
    RETURNING * INTO v_row;
    RETURN jsonb_build_object('success', true, 'key', v_row.key, 'label', public.fiscal_year_label(v_row.key),
                              'date_from', v_row.date_from, 'date_to', v_row.date_to, 'months', public.fiscal_year_months(v_row.key));
  ELSIF p_action = 'delete' THEN
    IF p_key IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'p_key is required'); END IF;
    SELECT count(*) INTO v_has_entries FROM public.accounting_periods WHERE fiscal_year = p_key AND status <> 'open';
    IF v_has_entries > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', format('fiscal year %s has closed periods — reopen them before redefining the year', p_key));
    END IF;
    DELETE FROM public.fiscal_years WHERE key = p_key;
    RETURN jsonb_build_object('success', true, 'deleted', p_key);
  END IF;
  RETURN jsonb_build_object('success', false, 'error', 'p_action must be list, set or delete');
EXCEPTION WHEN exclusion_violation THEN
  RETURN jsonb_build_object('success', false, 'error', format('%s – %s overlaps another fiscal year', p_date_from, p_date_to));
END $fn$;
REVOKE ALL ON FUNCTION public.manage_fiscal_year(text, date, date, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_fiscal_year(text, date, date, text, integer, text) TO authenticated, service_role;

-- ── 3. Every reader of "which year" goes through the model ─────────────────
CREATE OR REPLACE FUNCTION public.is_period_closed(p_date date)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.accounting_periods
    WHERE fiscal_year = public.fiscal_year_of(p_date)
      AND period_month = EXTRACT(MONTH FROM p_date)::INTEGER
      AND status IN ('closed', 'locked')
  );
$fn$;
GRANT EXECUTE ON FUNCTION public.is_period_closed(date) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.close_accounting_period(p_year integer, p_month integer, p_notes text DEFAULT NULL::text)
RETURNS accounting_periods
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_row public.accounting_periods;
  v_start DATE;
  v_end DATE;
  v_total_debit BIGINT;
  v_total_credit BIGINT;
  v_count INTEGER;
  v_unposted INTEGER;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Only admins can close accounting periods';
  END IF;
  IF p_month NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'Invalid month: %', p_month;
  END IF;
  -- The calendar month inside fiscal year p_year (July of a July–June year
  -- 2027 is July 2026).
  v_start := public.fiscal_period_start(p_year, p_month);
  IF v_start IS NULL THEN
    RAISE EXCEPTION 'Month % is not in fiscal year % (%)', p_month, p_year, public.fiscal_year_label(p_year);
  END IF;
  v_end := (v_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  -- Block close if any draft entries remain
  SELECT COUNT(*) INTO v_unposted
  FROM public.journal_entries
  WHERE entry_date BETWEEN v_start AND v_end
    AND status <> 'posted';
  IF v_unposted > 0 THEN
    RAISE EXCEPTION 'Cannot close: % unposted journal entries in %-%', v_unposted, p_year, p_month;
  END IF;
  -- Aggregate snapshot
  SELECT COALESCE(SUM(jel.debit_cents), 0),
         COALESCE(SUM(jel.credit_cents), 0),
         COUNT(DISTINCT je.id)
  INTO v_total_debit, v_total_credit, v_count
  FROM public.journal_entries je
  LEFT JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
  WHERE je.entry_date BETWEEN v_start AND v_end;
  -- Upsert
  INSERT INTO public.accounting_periods (
    fiscal_year, period_month, status,
    closed_by, closed_at,
    total_debit_cents, total_credit_cents, entry_count, notes
  )
  VALUES (
    p_year, p_month, 'closed',
    auth.uid(), now(),
    v_total_debit, v_total_credit, v_count, p_notes
  )
  ON CONFLICT (fiscal_year, period_month) DO UPDATE
  SET status = 'closed',
      closed_by = auth.uid(),
      closed_at = now(),
      reopened_by = NULL,
      reopened_at = NULL,
      total_debit_cents = EXCLUDED.total_debit_cents,
      total_credit_cents = EXCLUDED.total_credit_cents,
      entry_count = EXCLUDED.entry_count,
      notes = COALESCE(EXCLUDED.notes, public.accounting_periods.notes),
      updated_at = now()
  WHERE public.accounting_periods.status <> 'locked'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Period %-% is locked and cannot be closed again', p_year, p_month;
  END IF;

  RETURN v_row;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.list_fiscal_years()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_now_year int := public.fiscal_year_of(public.platform_today());
  v_rows jsonb;
BEGIN
  -- SECURITY DEFINER reads straight past RLS on journal_entries, so the gate is
  -- explicit. Written so an unset JWT (NULL, not a mismatched string) is refused
  -- rather than falling through on three-valued logic.
  IF auth.uid() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Sign in to read fiscal years';
  END IF;
  WITH years AS (
    -- A year exists because bookkeeping happened in it …
    SELECT DISTINCT public.fiscal_year_of(entry_date) AS y FROM public.journal_entries
    UNION
    -- … or because it was opened with balances carried in …
    SELECT DISTINCT fiscal_year FROM public.opening_balances WHERE fiscal_year IS NOT NULL
    UNION
    -- … or because a month in it was closed …
    SELECT DISTINCT fiscal_year FROM public.accounting_periods WHERE fiscal_year IS NOT NULL
    UNION
    -- … or because the admin defined it …
    SELECT key FROM public.fiscal_years
    UNION
    -- … and the current year always exists: you can book into today.
    SELECT v_now_year
  ),
  facts AS (
    SELECT y.y AS fiscal_year,
           r.date_from, r.date_to,
           public.fiscal_year_label(y.y) AS label,
           public.fiscal_year_months(y.y) AS months,
           (SELECT count(*) FROM public.journal_entries je
             WHERE je.entry_date BETWEEN r.date_from AND r.date_to)             AS entry_count,
           (SELECT count(*) FROM public.journal_entries je
             WHERE je.entry_date BETWEEN r.date_from AND r.date_to
               AND je.status <> 'posted')                                     AS draft_count,
           (SELECT count(*) FROM public.accounting_periods p
             WHERE p.fiscal_year = y.y AND p.period_month IS NOT NULL
               AND p.status IN ('closed', 'locked'))                          AS months_closed,
           (SELECT count(*) FROM public.accounting_periods p
             WHERE p.fiscal_year = y.y AND p.status = 'locked')               AS months_locked
      FROM years y
      CROSS JOIN LATERAL public.fiscal_year_range(y.y) r
     WHERE y.y IS NOT NULL
  )
  SELECT jsonb_agg(jsonb_build_object(
           'fiscal_year',   f.fiscal_year,
           'label',         f.label,
           'date_from',     f.date_from,
           'date_to',       f.date_to,
           'months',        f.months,
           'entry_count',   f.entry_count,
           'draft_count',   f.draft_count,
           'months_closed', f.months_closed,
           'months_locked', f.months_locked,
           'is_current',    f.fiscal_year = v_now_year,
           'status', CASE
             -- Nothing booked and the year has not begun. The only honest
             -- 'upcoming'.
             WHEN f.entry_count = 0 AND f.date_from > public.platform_today() THEN 'upcoming'
             -- Every month accounted for and shut.
             WHEN f.months_closed >= f.months THEN 'closed'
             -- Everything else is open: it holds entries, or it is this year,
             -- or it is a past year still waiting to be closed. All three are
             -- states you can post into or must act on.
             ELSE 'open'
           END
         ) ORDER BY f.fiscal_year DESC)
    INTO v_rows
    FROM facts f;

  RETURN COALESCE(v_rows, '[]'::jsonb);
END $fn$;
GRANT EXECUTE ON FUNCTION public.list_fiscal_years() TO anon, authenticated, service_role;

-- The opening balance of a fiscal year is everything posted before its FIRST
-- DAY — on the fiscal calendar, not January 1st. Patched in place: the body
-- (20260810230000) stays as it is, only the two dates move.
DO $$
DECLARE v_def text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.opening_balances_for_year(integer)'::regprocedure);
  IF v_def LIKE '%fiscal_year_range(p_year)%' THEN RETURN; END IF;
  v_new := replace(v_def, 'v_start := make_date(p_year, 1, 1);',
    'SELECT r.date_from INTO v_start FROM public.fiscal_year_range(p_year) r;');
  v_new := replace(v_new, 'je.entry_date >= make_date(v_bridge_year, 1, 1)',
    'je.entry_date >= (SELECT r.date_from FROM public.fiscal_year_range(v_bridge_year) r)');
  IF v_new NOT LIKE '%fiscal_year_range(p_year)%' OR v_new NOT LIKE '%fiscal_year_range(v_bridge_year)%' THEN
    RAISE EXCEPTION 'opening_balances_for_year: the date lines were not found — patch by hand';
  END IF;
  EXECUTE v_new;
END $$;

CREATE OR REPLACE FUNCTION public.year_end_readiness(p_year integer DEFAULT (public.fiscal_year_of(platform_today()) - 1))
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_periods_open int; v_draft_entries int; v_voucher_gaps int; v_unreconciled int; v_unpaid_invoices int; v_open_expenses int; v_checks jsonb;
        v_from date; v_to date; v_months int;
BEGIN
  SELECT r.date_from, r.date_to INTO v_from, v_to FROM public.fiscal_year_range(p_year) r;
  v_months := public.fiscal_year_months(p_year);
  -- Months of the year not closed: the year's months minus the closed rows.
  SELECT v_months - COUNT(*) INTO v_periods_open FROM public.accounting_periods WHERE fiscal_year = p_year AND status IN ('closed', 'locked');
  SELECT COUNT(*) INTO v_draft_entries FROM public.journal_entries WHERE entry_date BETWEEN v_from AND v_to AND status = 'draft';
  SELECT COUNT(*) INTO v_voucher_gaps FROM public.list_voucher_gaps(p_year, NULL);
  BEGIN EXECUTE 'SELECT COUNT(*) FROM public.payment_reconciliations WHERE status = ''pending'' AND (created_at AT TIME ZONE public.business_timezone())::date <= $1' INTO v_unreconciled USING v_to;
  EXCEPTION WHEN OTHERS THEN v_unreconciled := NULL; END;
  BEGIN EXECUTE 'SELECT COUNT(*) FROM public.invoices WHERE status IN (''sent'',''overdue'') AND issue_date <= $1' INTO v_unpaid_invoices USING v_to;
  EXCEPTION WHEN OTHERS THEN v_unpaid_invoices := NULL; END;
  BEGIN EXECUTE 'SELECT COUNT(*) FROM public.expense_reports WHERE status NOT IN (''paid'',''rejected'') AND report_date <= $1' INTO v_open_expenses USING v_to;
  EXCEPTION WHEN OTHERS THEN v_open_expenses := NULL; END;
  v_checks := jsonb_build_array(
    jsonb_build_object('id','periods_closed','label','All ' || v_months || ' periods closed','pass', v_periods_open <= 0, 'detail', GREATEST(v_periods_open, 0) || ' periods still open'),
    jsonb_build_object('id','no_drafts','label','No draft journal entries','pass', v_draft_entries = 0, 'detail', v_draft_entries || ' draft entries remain'),
    jsonb_build_object('id','voucher_integrity','label','No voucher-number gaps','pass', v_voucher_gaps = 0, 'detail', v_voucher_gaps || ' gaps found'),
    jsonb_build_object('id','reconciliations','label','No pending reconciliations','pass', COALESCE(v_unreconciled,0) = 0, 'detail', COALESCE(v_unreconciled::text,'n/a')),
    jsonb_build_object('id','invoices_settled','label','No unpaid customer invoices','pass', COALESCE(v_unpaid_invoices,0) = 0, 'detail', COALESCE(v_unpaid_invoices::text,'n/a')),
    jsonb_build_object('id','expenses_settled','label','No open expense reports','pass', COALESCE(v_open_expenses,0) = 0, 'detail', COALESCE(v_open_expenses::text,'n/a'))
  );
  RETURN jsonb_build_object('fiscal_year', p_year, 'label', public.fiscal_year_label(p_year), 'date_from', v_from, 'date_to', v_to,
    'ready', NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_checks) c WHERE (c->>'pass')::boolean = false),
    'checks', v_checks, 'generated_at', now());
END; $fn$;
GRANT EXECUTE ON FUNCTION public.year_end_readiness(integer) TO authenticated, service_role;

-- Voucher numbers run per fiscal year (BFL 5 kap 7 §), not per calendar year.
DO $$
DECLARE v_def text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.assign_voucher_number()'::regprocedure);
  v_new := replace(v_def, 'v_year := EXTRACT(YEAR FROM NEW.entry_date)::int;', 'v_year := public.fiscal_year_of(NEW.entry_date);');
  IF v_new = v_def AND v_def NOT LIKE '%fiscal_year_of(NEW.entry_date)%' THEN
    RAISE EXCEPTION 'assign_voucher_number: the year line was not found — patch by hand';
  END IF;
  IF v_new <> v_def THEN EXECUTE v_new; END IF;
END $$;

-- The voucher-gap scan defaults to the current FISCAL year.
DO $$
DECLARE v_def text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.list_voucher_gaps(integer,text)'::regprocedure);
  IF v_def LIKE '%fiscal_year_of(platform_today())%' THEN RETURN; END IF;
  v_new := replace(v_def, 'DEFAULT (EXTRACT(year FROM platform_today()))::integer', 'DEFAULT public.fiscal_year_of(platform_today())');
  IF v_new = v_def THEN RAISE EXCEPTION 'list_voucher_gaps: the default was not found — patch by hand'; END IF;
  EXECUTE v_new;
END $$;

-- Budget vs actual: the year's months, period_month still the calendar month.
DO $$
DECLARE v_def text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.budget_vs_actual(integer,integer)'::regprocedure);
  IF v_def LIKE '%fiscal_year_of(je.entry_date)%' THEN RETURN; END IF;
  v_new := replace(v_def, 'EXTRACT(YEAR FROM je.entry_date)::int = p_fiscal_year', 'public.fiscal_year_of(je.entry_date) = p_fiscal_year');
  IF v_new = v_def THEN RAISE EXCEPTION 'budget_vs_actual: the year line was not found — patch by hand'; END IF;
  EXECUTE v_new;
END $$;

CREATE OR REPLACE FUNCTION public.propose_accruals(p_year integer)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_year_start date;
  v_year_end date;
  v_invoices jsonb := '[]'::jsonb;
  v_expenses jsonb := '[]'::jsonb;
BEGIN
  SELECT r.date_from, r.date_to INTO v_year_start, v_year_end FROM public.fiscal_year_range(p_year) r;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'source','invoice','source_id',i.id,'reference',i.invoice_number,
    'issue_date',i.issue_date,'due_date',i.due_date,
    'amount_cents',i.total_cents - COALESCE(i.paid_amount_cents,0),
    'suggested_action', CASE WHEN i.due_date > v_year_end THEN 'defer_revenue' ELSE 'accrue_receivable' END
  )), '[]'::jsonb) INTO v_invoices
  FROM public.invoices i
  WHERE i.issue_date BETWEEN v_year_start AND v_year_end
    AND i.status::text NOT IN ('paid','cancelled','void')
    AND (i.total_cents - COALESCE(i.paid_amount_cents,0)) > 0;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'source','expense_report','source_id',er.id,
    'amount_cents',er.total_cents,'status',er.status,
    'suggested_action','accrue_payable'
  )), '[]'::jsonb) INTO v_expenses
  FROM public.expense_reports er
  WHERE er.status IN ('approved','booked') AND er.total_cents > 0;
  RETURN jsonb_build_object(
    'year', p_year, 'label', public.fiscal_year_label(p_year), 'year_start', v_year_start, 'year_end', v_year_end,
    'proposals', v_invoices || v_expenses,
    'proposal_count', jsonb_array_length(v_invoices) + jsonb_array_length(v_expenses),
    'note', 'Universal accrual scan. Locale packs add country-specific proposals via year_end_proposals callback.'
  );
END; $fn$;
GRANT EXECUTE ON FUNCTION public.propose_accruals(integer) TO authenticated, service_role;

-- The depreciation plan for a year: its own months, not January–December.
DO $$
DECLARE v_def text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.propose_annual_depreciation(integer)'::regprocedure);
  IF v_def LIKE '%fiscal_year_range(p_year)%' THEN RETURN; END IF;
  v_new := replace(v_def,
    E'  v_year_start date := make_date(p_year, 1, 1);\n  v_year_end date := make_date(p_year, 12, 31);',
    E'  v_year_start date := (SELECT r.date_from FROM public.fiscal_year_range(p_year) r);\n  v_year_end date := (SELECT r.date_to FROM public.fiscal_year_range(p_year) r);');
  IF v_new = v_def THEN
    RAISE EXCEPTION 'propose_annual_depreciation: the year lines were not found — patch by hand';
  END IF;
  EXECUTE v_new;
END $$;

-- ── Bevisas där den körs ───────────────────────────────────────────────────
-- A July–June business with a short first year (January–June 2026), rolled
-- back by its own exception.
DO $$
DECLARE
  v_prefs jsonb;
  v_from date; v_to date;
  v_res jsonb;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    SELECT value INTO v_prefs FROM public.site_settings WHERE key = 'accounting_preferences';
    INSERT INTO public.site_settings (key, value) VALUES ('accounting_preferences', COALESCE(v_prefs, '{}'::jsonb) || '{"fiscalYearStartMonth": 7}'::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

    -- Derived: 15 July 2026 belongs to the year ending 2027; its dates.
    IF public.fiscal_year_of('2026-07-15') <> 2027 THEN RAISE EXCEPTION 'fiscal proof: 2026-07-15 → %, expected 2027', public.fiscal_year_of('2026-07-15'); END IF;
    IF public.fiscal_year_of('2027-06-30') <> 2027 THEN RAISE EXCEPTION 'fiscal proof: 2027-06-30 → %, expected 2027', public.fiscal_year_of('2027-06-30'); END IF;
    SELECT r.date_from, r.date_to INTO v_from, v_to FROM public.fiscal_year_range(2027) r;
    IF v_from <> '2026-07-01' OR v_to <> '2027-06-30' THEN RAISE EXCEPTION 'fiscal proof: range(2027) = % – %', v_from, v_to; END IF;
    IF public.fiscal_year_label(2027) <> '2026/27' THEN RAISE EXCEPTION 'fiscal proof: label(2027) = %', public.fiscal_year_label(2027); END IF;
    IF public.fiscal_year_months(2027) <> 12 THEN RAISE EXCEPTION 'fiscal proof: months(2027) = %', public.fiscal_year_months(2027); END IF;

    -- Explicit: a short first year January–June 2026 (key 2026), and the
    -- derived 2027 is unchanged by it.
    v_res := public.manage_fiscal_year('set', '2026-01-01', '2026-06-30', 'Startår 2026');
    IF NOT (v_res ->> 'success')::boolean THEN RAISE EXCEPTION 'fiscal proof: set failed: %', v_res; END IF;
    IF public.fiscal_year_of('2026-03-01') <> 2026 THEN RAISE EXCEPTION 'fiscal proof: 2026-03-01 → %, expected 2026', public.fiscal_year_of('2026-03-01'); END IF;
    IF public.fiscal_year_months(2026) <> 6 THEN RAISE EXCEPTION 'fiscal proof: months(2026) = %', public.fiscal_year_months(2026); END IF;
    IF public.fiscal_year_label(2026) <> 'Startår 2026' THEN RAISE EXCEPTION 'fiscal proof: label(2026) = %', public.fiscal_year_label(2026); END IF;
    -- An overlapping year is refused.
    v_res := public.manage_fiscal_year('set', '2026-05-01', '2027-04-30');
    IF (v_res ->> 'success')::boolean THEN RAISE EXCEPTION 'fiscal proof: an overlapping year was accepted'; END IF;

    -- Periods are calendar months inside the fiscal year: July 2026 is (2027, 7).
    IF public.fiscal_period_start(2027, 7) <> '2026-07-01' THEN RAISE EXCEPTION 'fiscal proof: period_start(2027,7) = %', public.fiscal_period_start(2027, 7); END IF;
    IF public.fiscal_period_start(2027, 3) <> '2027-03-01' THEN RAISE EXCEPTION 'fiscal proof: period_start(2027,3) = %', public.fiscal_period_start(2027, 3); END IF;
    IF public.fiscal_period_start(2026, 9) IS NOT NULL THEN RAISE EXCEPTION 'fiscal proof: September is not in the short year 2026'; END IF;
    PERFORM public.close_accounting_period(2027, 7, 'proof');
    IF NOT public.is_period_closed('2026-07-15') THEN RAISE EXCEPTION 'fiscal proof: July 2026 should be closed'; END IF;
    IF public.is_period_closed('2027-07-15') THEN RAISE EXCEPTION 'fiscal proof: July 2027 should be open'; END IF;
    IF public.period_status_for_date('2026-07-15') <> 'closed' THEN RAISE EXCEPTION 'fiscal proof: status(2026-07-15) = %', public.period_status_for_date('2026-07-15'); END IF;

    -- Calendar years are untouched by the model: with start month 1 the key is the year.
    UPDATE public.site_settings SET value = value || '{"fiscalYearStartMonth": 1}'::jsonb WHERE key = 'accounting_preferences';
    IF public.fiscal_year_of('2028-07-15') <> 2028 THEN RAISE EXCEPTION 'fiscal proof: calendar year broke'; END IF;
    IF public.fiscal_year_label(2028) <> '2028' THEN RAISE EXCEPTION 'fiscal proof: calendar label = %', public.fiscal_year_label(2028); END IF;

    RAISE EXCEPTION '__fiscal_proof_ok__';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> '__fiscal_proof_ok__' THEN RAISE; END IF;
  END;
END $$;
