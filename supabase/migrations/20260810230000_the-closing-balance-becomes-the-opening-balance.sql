-- ============================================================================
-- UB blir IB. The opening balance is derived, never stored twice.
--
-- The balance sheet read `opening_balances` for the SELECTED year, so a year
-- with no stored row got no opening balance at all. On liteit — 2022 through
-- 2026 bookkept and reconciled against three annual reports — only 2026 had
-- rows. 2023, 2024 and 2025 opened at zero.
--
-- But the missing rows were the symptom. The defect is that an opening balance
-- was STORED per year, which puts the same number in two places: 2025's closing
-- balance and 2026's opening balance. Two records of one fact drift, and these
-- already had:
--
--     derived from the ledger        stored as opening balance 2026
--     151 983 on 1351               151 983 on 1350
--    -166 549,84 on 2893           -166 550 on 2393
--
-- Same money, different accounts — and 2393 is a long-term liability while 2893
-- is short-term, so the two records disagreed about the SHAPE of the balance
-- sheet, not merely about ören. Nothing could detect it, because the two were
-- never compared. (Magnus confirmed 1351 and 2893 — the ledger — are correct.)
--
-- The rule that replaces it:
--
--     opening balance of year Y = everything posted before Y-01-01
--
-- No storage, no copy, no drift. Correct a prior year and every later year's
-- opening balance follows automatically, which is precisely what a carry-forward
-- means.
--
-- `opening_balances` keeps exactly one job: the BRIDGE into the system — the
-- first year, where the numbers come from somewhere else (a Bokio SIE file, a
-- previous accountant). After that the ledger is the only source. On liteit the
-- bridge is already a verification (IB-2022, nine lines from the SIE), so the
-- rule needs no special case there at all: the bridge is simply the oldest
-- entries.
--
-- Result accounts do not carry forward — they reset each year and the net goes
-- to equity. Which accounts those are is read from `account_type` in the chart,
-- NOT inferred from the leading digit: 2641 is an asset in class 2, and class 8
-- holds income, revenue and expense side by side. Same ruling as the 8999
-- result-carrier incident — classification belongs to the chart of accounts.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.opening_balances_for_year(p_year integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_start date;
  v_bridge_year int;
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Sign in to read opening balances';
  END IF;
  IF p_year IS NULL THEN
    RAISE EXCEPTION 'p_year is required (the fiscal year whose OPENING balance you want)';
  END IF;

  v_start := make_date(p_year, 1, 1);

  -- The bridge is the earliest year anyone entered opening balances for. Later
  -- years are legacy copies of a carry-forward and are deliberately ignored —
  -- they are the drift this function exists to end.
  SELECT min(fiscal_year) INTO v_bridge_year FROM public.opening_balances;

  WITH bridge AS (
    SELECT ob.account_code,
           ob.account_name,
           sum(CASE WHEN ob.balance_type = 'credit' THEN -ob.amount_cents ELSE ob.amount_cents END)::bigint AS net_cents
      FROM public.opening_balances ob
     WHERE v_bridge_year IS NOT NULL
       AND ob.fiscal_year = v_bridge_year
       -- A bridge dated after the year being asked about has not happened yet.
       AND p_year >= v_bridge_year
     GROUP BY 1, 2
  ),
  movements AS (
    SELECT l.account_code,
           max(l.account_name)                            AS account_name,
           sum(l.debit_cents - l.credit_cents)::bigint    AS net_cents
      FROM public.journal_entry_lines l
      JOIN public.journal_entries je ON je.id = l.journal_entry_id
     WHERE je.status = 'posted'
       AND je.entry_date < v_start
       -- Only what the bridge covers; entries before the bridge year would be
       -- counted twice, since the bridge already states the position then.
       AND (v_bridge_year IS NULL OR je.entry_date >= make_date(v_bridge_year, 1, 1))
     GROUP BY 1
  ),
  combined AS (
    SELECT coalesce(b.account_code, m.account_code)                       AS account_code,
           coalesce(b.account_name, m.account_name)                       AS account_name,
           coalesce(b.net_cents, 0) + coalesce(m.net_cents, 0)            AS net_cents
      FROM bridge b FULL OUTER JOIN movements m ON m.account_code = b.account_code
  )
  SELECT jsonb_agg(jsonb_build_object(
           'account_code', c.account_code,
           'account_name', coalesce(c.account_name, coa.account_name),
           -- Signed against the debit side. The caller applies normal_balance.
           'net_cents',    c.net_cents
         ) ORDER BY c.account_code)
    INTO v_rows
    FROM combined c
    JOIN public.chart_of_accounts coa ON coa.account_code = c.account_code
   WHERE c.net_cents <> 0
     -- Balance-sheet accounts only. A result account opens every year at zero.
     AND coa.account_type IN ('asset', 'equity', 'liability');

  RETURN COALESCE(v_rows, '[]'::jsonb);
END; $function$;

COMMENT ON FUNCTION public.opening_balances_for_year(integer) IS
  'The opening balance of each balance-sheet account at the start of p_year, derived: the bridge (earliest year in opening_balances, if any) plus every posted entry after it and before p_year. net_cents is signed against the debit side — apply normal_balance to display. Result accounts are excluded because they open at zero. Storing an opening balance per year is what this replaces: it puts one number in two places and they drift.';

GRANT EXECUTE ON FUNCTION public.opening_balances_for_year(integer) TO authenticated, service_role;

-- ── Does this instance still hold a stored carry-forward? ───────────────────
DO $$
DECLARE
  v_years int;
  v_bridge int;
  v_list text;
BEGIN
  SELECT count(DISTINCT fiscal_year), min(fiscal_year) INTO v_years, v_bridge
    FROM public.opening_balances;

  IF v_years > 1 THEN
    SELECT string_agg(DISTINCT fiscal_year::text, ', ' ORDER BY fiscal_year::text)
      INTO v_list FROM public.opening_balances WHERE fiscal_year <> v_bridge;
    RAISE WARNING 'Opening balances: % is the bridge year, but rows also exist for %. Those are stored carry-forwards — they are IGNORED from now on and the ledger decides. Compare them before deleting: a disagreement is a real bookkeeping difference, not a formatting one.',
      v_bridge, v_list;
  ELSIF v_years = 1 THEN
    RAISE NOTICE 'Opening balances: one bridge year (%). Every later year now carries forward from the ledger.', v_bridge;
  ELSE
    RAISE NOTICE 'Opening balances: none stored — the bridge is a verification in the ledger, and carry-forward is derived.';
  END IF;
END $$;
