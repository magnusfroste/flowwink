-- ============================================================================
-- UB blir IB — and the database is what knows it.
--
-- 20260810230000 made the opening balance DERIVED: the bridge (the opening
-- balances of the first fiscal year the books carry) plus everything posted
-- since, read through opening_balances_for_year(). A stored row for a later
-- year is ignored by that function by design.
--
-- Ignored is not refused. The admin tab, manage_opening_balances and an agent
-- reading a later SIE file could all still store a later year's opening
-- balance and get a success back, while every reader went on deriving it.
-- On LiteIT (2026-11-08) the agent report, which still read the stored rows
-- for the report's year, showed 2026 opening at zero; the agent concluded the
-- opening balance was missing and booked 2025's closing balance as a voucher
-- on 2026-01-01 — every balance-sheet account counted twice.
--
-- The rule, enforced where every writer passes: a fiscal year may store
-- opening balances only when it is the FIRST year — no bridge is stored for an
-- earlier year, and no posted entry is dated before it. A later SIE file's
-- #IB rows are a control against the derived figure, never an input.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.opening_balances_only_the_bridge()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_start date;
  v_first int;
BEGIN
  SELECT r.date_from INTO v_start FROM public.fiscal_year_range(NEW.fiscal_year) r;

  SELECT min(ob.fiscal_year) INTO v_first
    FROM public.opening_balances ob
   WHERE ob.id IS DISTINCT FROM NEW.id;

  IF v_first IS NOT NULL AND NEW.fiscal_year > v_first THEN
    RAISE EXCEPTION 'IB_IS_DERIVED: the opening balance of % is derived from the bridge stored for % plus everything posted since — it is not stored', NEW.fiscal_year, v_first
      USING HINT = 'Read it with opening_balances_for_year(). A difference against the expected figure lives in an earlier year: correct that year, or the bridge.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.journal_entries je
     WHERE je.status = 'posted' AND je.entry_date < v_start
  ) THEN
    RAISE EXCEPTION 'IB_IS_DERIVED: entries are posted before % (the start of fiscal year %), so its opening balance is derived from them — it is not stored', v_start, NEW.fiscal_year
      USING HINT = 'The bridge belongs to the first year the books carry. Read a later year with opening_balances_for_year().';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.opening_balances_only_the_bridge() IS
  'Refuses a stored opening balance for any fiscal year but the first the books carry (IB_IS_DERIVED). Later years are derived by opening_balances_for_year().';

DROP TRIGGER IF EXISTS trg_opening_balances_only_the_bridge ON public.opening_balances;
CREATE TRIGGER trg_opening_balances_only_the_bridge
  BEFORE INSERT OR UPDATE OF fiscal_year, account_code, amount_cents, balance_type
  ON public.opening_balances
  FOR EACH ROW EXECUTE FUNCTION public.opening_balances_only_the_bridge();
