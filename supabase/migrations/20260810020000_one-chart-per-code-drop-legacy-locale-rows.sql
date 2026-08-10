-- ============================================================================
-- An account code must name ONE account on an instance.
--
-- chart_of_accounts was globally UNIQUE (account_code) until 2026-08-09, when
-- import_accounting_standard made it UNIQUE (locale, account_code) so a German
-- 1200 ("Bank") and a Swedish 1200 ("Inventarier") could coexist. Correct for
-- the chart as reference data — but it removed the thing that had been quietly
-- preventing a second row for the same code on the SAME instance.
--
-- liteit carried five accounts still tagged with the legacy locale `sv-SE`
-- (1640, 2081, 2086, 2393, 8220). Under the old constraint they blocked their
-- own re-seeding, which is the incident the seed-parity guard was written about.
-- Under the new one they no longer block anything, so seeding the full BAS chart
-- created a second row for each: two "2081 Aktiekapital", differing only by a
-- locale tag nobody looks at. Journal lines reference account_code as text, so
-- both rows answer to the same postings and any listing that does not filter by
-- locale shows the account twice.
--
-- These are mislabelled rows, not a second chart. Re-tagging them would collide
-- with the row that now exists under the active locale, so the stale one goes —
-- but ONLY where the same code already exists under another locale, so an
-- instance whose only copy of an account carries a legacy tag keeps it.
-- Nothing references chart_of_accounts by id (no foreign keys), so no history
-- moves.
-- ============================================================================

DO $$
DECLARE
  v_removed int;
  v_rows text;
BEGIN
  SELECT string_agg(DISTINCT c.locale || ':' || c.account_code, ', ')
    INTO v_rows
    FROM public.chart_of_accounts c
   WHERE EXISTS (
     SELECT 1 FROM public.chart_of_accounts o
      WHERE o.account_code = c.account_code AND o.locale <> c.locale
        AND o.locale = COALESCE(
          (SELECT value #>> '{}' FROM public.site_settings WHERE key = 'accounting_locale'),
          'se-bas2024'))
     AND c.locale <> COALESCE(
       (SELECT value #>> '{}' FROM public.site_settings WHERE key = 'accounting_locale'),
       'se-bas2024');

  DELETE FROM public.chart_of_accounts c
   WHERE EXISTS (
     SELECT 1 FROM public.chart_of_accounts o
      WHERE o.account_code = c.account_code AND o.locale <> c.locale
        AND o.locale = COALESCE(
          (SELECT value #>> '{}' FROM public.site_settings WHERE key = 'accounting_locale'),
          'se-bas2024'))
     AND c.locale <> COALESCE(
       (SELECT value #>> '{}' FROM public.site_settings WHERE key = 'accounting_locale'),
       'se-bas2024');
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  IF v_removed > 0 THEN
    RAISE NOTICE 'Chart: removed % duplicate account row(s) carrying a stale locale tag — %', v_removed, v_rows;
  ELSE
    RAISE NOTICE 'Chart: no account code exists under more than one locale.';
  END IF;
END $$;
