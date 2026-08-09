-- ============================================================================
-- vat_box_coverage: which accounts COULD belong on the return is derived from
-- the instance's own box map, not from a hardcoded range list.
--
-- Found by running the chain against optic. Coverage reported one gap:
--   3001 "Försäljning inom Sverige, 25 % moms", -24 000 kr, belongs to no box.
-- Which is correct as a fact and wrong as a warning. On SKV 4700 the sales base
-- (box 05) is DERIVED from the VAT boxes by dividing by the rate — the form
-- never sums revenue accounts, so 3001 belonging to no box is the design, not a
-- hole. The first version's filter said `account_code LIKE '3%'`, which swept in
-- every revenue account on the chart.
--
-- A warning that fires on a correct book is worse than no warning: the reader
-- learns to skip the list, and the real gap — a migrated company's VAT account
-- outside the map — arrives in a list they have stopped reading.
--
-- So the rule now reads the map: an account is REPORTABLE if some box in this
-- locale draws from its two-digit group. Under the SE pack that is {26, 31, 33,
-- 45} — 2645 unmapped still gets flagged, 3001 does not. It also drops the last
-- hardcoded account ranges out of this function, which is the same principle the
-- box map itself exists for: the engine does not know what BAS is.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.vat_box_coverage(
  p_from date,
  p_to date,
  p_locale text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_locale text;
  v_unmapped jsonb;
  v_mapped int;
  v_total int;
  v_groups text[];
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can read VAT box coverage';
  END IF;

  v_locale := COALESCE(NULLIF(btrim(p_locale), ''),
    (SELECT value #>> '{}' FROM public.site_settings WHERE key = 'accounting_locale'),
    'se-bas2024');

  -- The account groups this locale's return actually draws from. Derived from
  -- the map, so a country whose form sums revenue accounts gets those groups
  -- and Sweden — whose base is derived from the VAT — does not.
  SELECT array_agg(DISTINCT left(account_code, 2))
    INTO v_groups
    FROM public.account_tax_boxes WHERE locale = v_locale;

  IF v_groups IS NULL THEN
    RETURN jsonb_build_object(
      'locale', v_locale,
      'period', jsonb_build_object('from', p_from, 'to', p_to),
      'checked', false,
      'complete', null,
      'note', format('No box map exists for %s, so coverage cannot be checked — every account is equally unclassified. Seed the locale pack or add the map with manage_account_tax_boxes.', v_locale));
  END IF;

  WITH moved AS (
    SELECT l.account_code, SUM(l.debit_cents - l.credit_cents) AS net_cents
      FROM public.journal_entry_lines l
      JOIN public.journal_entries e ON e.id = l.journal_entry_id
     WHERE e.entry_date BETWEEN p_from AND p_to
       AND COALESCE(e.status, 'posted') <> 'void'
     GROUP BY l.account_code
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'account_code', m.account_code,
      'account_name', c.account_name,
      'net_cents', m.net_cents) ORDER BY m.account_code)
      FILTER (WHERE b.account_code IS NULL
                AND left(m.account_code, 2) = ANY(v_groups)),
      '[]'::jsonb),
    count(*) FILTER (WHERE b.account_code IS NOT NULL),
    count(*)
  INTO v_unmapped, v_mapped, v_total
  FROM moved m
  LEFT JOIN LATERAL (
    SELECT account_code FROM public.account_tax_boxes
     WHERE locale = v_locale AND account_code = m.account_code LIMIT 1) b ON true
  LEFT JOIN public.chart_of_accounts c
    ON c.locale = v_locale AND c.account_code = m.account_code;

  RETURN jsonb_build_object(
    'locale', v_locale,
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'checked', true,
    'account_groups_on_this_return', v_groups,
    'accounts_with_movement', v_total,
    'accounts_in_a_box', v_mapped,
    'unmapped_but_reportable', v_unmapped,
    'complete', jsonb_array_length(v_unmapped) = 0,
    'note', CASE WHEN jsonb_array_length(v_unmapped) = 0
      THEN format('Every account that moved and could belong on the return is in a box. Groups this return draws from: %s.', array_to_string(v_groups, ', '))
      ELSE format('%s account(s) carried money this period and belong to NO box on the return — those amounts are simply absent from the filing, with no error anywhere. This is what a migrated chart looks like: the accounts are real, the classification is missing. Map them with manage_account_tax_boxes.',
        jsonb_array_length(v_unmapped)) END);
END; $function$;

GRANT EXECUTE ON FUNCTION public.vat_box_coverage(date, date, text) TO authenticated, service_role;
