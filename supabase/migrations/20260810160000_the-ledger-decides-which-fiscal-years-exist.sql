-- ============================================================================
-- Which fiscal years exist is a question for the LEDGER, not for the closing
-- register.
--
-- The fiscal-year selector asked `accounting_periods` which years exist. That
-- table gets a row only when someone CLOSES a month — close_accounting_period()
-- is its sole writer. An open period has no row. A year nobody has closed has
-- no rows at all.
--
-- So on liteit, which holds 135 posted verifications across 2022–2026, the
-- table is empty and the selector offered exactly three years: 2027, 2026, 2025
-- — the current year ±1, its hardcoded fallback. 2022, 2023 and 2024 were
-- unreachable in the UI, 83 verifications you could not navigate to. And every
-- year in the list, including 2026 with 19 posted entries booked this week, wore
-- the badge "Upcoming".
--
-- The table is empty on every instance in the fleet. Nobody has ever closed a
-- period, which is normal — closing is a year-end act, and the platform is
-- younger than a year-end.
--
-- Two separate defects, one cause:
--
--   1. Absence of a row was read as absence of a YEAR. But a year exists
--      because it holds bookkeeping, not because someone locked a month in it.
--   2. Absence of a row was DEFAULTED to 'upcoming'. "I have no information"
--      was rendered as a confident claim about the future — the same shape as
--      the `<> 'void'` filter that never matched: a default that reads as an
--      answer. A year is upcoming when it has not started, and 2026 has.
--
-- This function answers the question from the ledger, and reserves 'upcoming'
-- for years that genuinely lie ahead. The closing register keeps its own job —
-- "is March closed?" — which it answers correctly and which nothing here
-- changes.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.list_fiscal_years()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_now_year int := extract(year FROM current_date)::int;
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
    SELECT DISTINCT extract(year FROM entry_date)::int AS y FROM public.journal_entries
    UNION
    -- … or because it was opened with balances carried in …
    SELECT DISTINCT fiscal_year FROM public.opening_balances WHERE fiscal_year IS NOT NULL
    UNION
    -- … or because a month in it was closed …
    SELECT DISTINCT fiscal_year FROM public.accounting_periods WHERE fiscal_year IS NOT NULL
    UNION
    -- … and the current year always exists: you can book into today.
    SELECT v_now_year
  ),
  facts AS (
    SELECT y.y AS fiscal_year,
           (SELECT count(*) FROM public.journal_entries je
             WHERE extract(year FROM je.entry_date)::int = y.y)          AS entry_count,
           (SELECT count(*) FROM public.journal_entries je
             WHERE extract(year FROM je.entry_date)::int = y.y
               AND je.status <> 'posted')                                AS draft_count,
           (SELECT count(*) FROM public.accounting_periods p
             WHERE p.fiscal_year = y.y AND p.period_month IS NOT NULL
               AND p.status IN ('closed', 'locked'))                     AS months_closed,
           (SELECT count(*) FROM public.accounting_periods p
             WHERE p.fiscal_year = y.y AND p.status = 'locked')          AS months_locked
      FROM years y
  )
  SELECT jsonb_agg(jsonb_build_object(
           'fiscal_year',   f.fiscal_year,
           'entry_count',   f.entry_count,
           'draft_count',   f.draft_count,
           'months_closed', f.months_closed,
           'months_locked', f.months_locked,
           'is_current',    f.fiscal_year = v_now_year,
           'status', CASE
             -- Nothing booked and the year has not begun. The only honest
             -- 'upcoming'.
             WHEN f.entry_count = 0 AND f.fiscal_year > v_now_year THEN 'upcoming'
             -- Every month accounted for and shut.
             WHEN f.months_closed >= 12 THEN 'closed'
             -- Everything else is open: it holds entries, or it is this year,
             -- or it is a past year still waiting to be closed. All three are
             -- states you can post into or must act on.
             ELSE 'open'
           END
         ) ORDER BY f.fiscal_year DESC)
    INTO v_rows
    FROM facts f;

  RETURN COALESCE(v_rows, '[]'::jsonb);
END; $function$;

COMMENT ON FUNCTION public.list_fiscal_years() IS
  'The fiscal years this company has, derived from the ledger (journal entries, opening balances, closed periods, plus the current year). status=upcoming means the year has not started; a year holding entries is never upcoming. Use this to populate a year selector — accounting_periods alone cannot answer it, because it only gets rows when a month is CLOSED.';

GRANT EXECUTE ON FUNCTION public.list_fiscal_years() TO authenticated, service_role;

-- ── What this instance would have shown, and what it shows now ──────────────
DO $$
DECLARE
  v_ledger int;
  v_periods int;
  v_years text;
BEGIN
  SELECT count(DISTINCT extract(year FROM entry_date)::int) INTO v_ledger FROM public.journal_entries;
  SELECT count(DISTINCT fiscal_year) INTO v_periods FROM public.accounting_periods;
  SELECT string_agg(DISTINCT extract(year FROM entry_date)::int::text, ', ' ORDER BY extract(year FROM entry_date)::int::text)
    INTO v_years FROM public.journal_entries;

  IF v_ledger > v_periods THEN
    RAISE NOTICE 'Fiscal years: the ledger holds % year(s) (%) but the closing register knows %. Those years were unreachable in the selector until now.',
      v_ledger, coalesce(v_years, '-'), v_periods;
  ELSE
    RAISE NOTICE 'Fiscal years: ledger and closing register agree (% year(s)).', v_ledger;
  END IF;
END $$;
