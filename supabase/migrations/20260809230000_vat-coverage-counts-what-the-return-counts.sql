-- ============================================================================
-- vat_box_coverage must count exactly what the return counts: posted entries.
--
-- Found by running the chain end-to-end on dev. The coverage filter said
-- `COALESCE(e.status,'posted') <> 'void'` — but the status this platform writes
-- when an entry is reversed is 'voided', not 'void'. The comparison was
-- therefore always true and excluded nothing, while the return itself sums
-- `status = 'posted'` only.
--
-- So the two halves of the same filing disagreed about which entries exist. An
-- account whose only movement was on a voided entry would be reported as a gap
-- on books that are perfectly correct — the same shape as the 3001 false
-- positive: a warning that fires on a correct book, which teaches the reader to
-- stop reading the list.
--
-- The lesson is not "use the right string". It is that a near-miss literal
-- ('void' vs 'voided') fails OPEN and silently: no error, no type mismatch,
-- just a filter that quietly matches everything. Coverage now states the same
-- condition the return states, positively — `status = 'posted'` — so the two
-- can only agree.
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
       -- Stated positively, and identical to the handler's own filter. The
       -- previous version excluded status 'void', which this platform never
       -- writes — it writes 'voided' — so a reversed entry counted here and not
       -- on the return.
       AND e.status = 'posted'
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
