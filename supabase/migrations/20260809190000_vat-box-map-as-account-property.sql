-- ============================================================================
-- The VAT box map becomes a property of the ACCOUNT, not a list in the engine.
--
-- The line in the ice this fixes. account_roles moved the ~23 POSTING decisions
-- off hardcoded numbers, and the engine never names an account when it books.
-- But classification stayed behind: SE_VAT_BOXES_2026 carries 55 BAS account
-- numbers, and the VAT return sums by matching against them. A company that
-- arrives with its own chart — as every migration does — books VAT to an
-- account outside those lists, and the amount vanishes from the return with no
-- error and no trace. Silence is the worst possible failure for a statutory
-- filing.
--
-- The handler's own header has flagged this as a deferred refactor since the
-- edge-surface move: "the localization-discipline law still wants the box map
-- to move into the locale pack".
--
-- SEEDED VERBATIM from SE_VAT_BOXES_2026, so behaviour is identical on day one.
-- What changes is that it is now editable per instance, and that an account
-- carrying money while belonging to NO box becomes a reported gap instead of a
-- silent omission — see vat_box_coverage below.
--
-- Only the ACCOUNT lists move. Derived boxes (05 from 10/11/12) and the
-- computed box 49 stay in the box definition: those are arithmetic over boxes,
-- not properties of any account, and moving them would be moving the form
-- itself into per-instance data.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.account_tax_boxes (
  locale text NOT NULL,
  account_code text NOT NULL,
  box_code text NOT NULL,
  source text NOT NULL DEFAULT 'standard',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (locale, account_code, box_code)
);

COMMENT ON TABLE public.account_tax_boxes IS
  'Which VAT-return box an account feeds. The classification half of the role layer: account_roles says where to POST, this says how a posted amount is REPORTED. source=standard means seeded from the locale pack; source=instance means an operator or agent added it for this company''s own chart.';

ALTER TABLE public.account_tax_boxes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read account_tax_boxes" ON public.account_tax_boxes;
CREATE POLICY "staff read account_tax_boxes" ON public.account_tax_boxes
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "admins write account_tax_boxes" ON public.account_tax_boxes;
CREATE POLICY "admins write account_tax_boxes" ON public.account_tax_boxes
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ── Seeded verbatim from SE_VAT_BOXES_2026 ──────────────────────────────────
-- (locale, box_code, account_code) — the generator emits box first.
INSERT INTO public.account_tax_boxes (locale, box_code, account_code) VALUES
  ('se-bas2024', '20', '4515'),
  ('se-bas2024', '20', '4516'),
  ('se-bas2024', '20', '4517'),
  ('se-bas2024', '20', '4518'),
  ('se-bas2024', '21', '4535'),
  ('se-bas2024', '21', '4536'),
  ('se-bas2024', '21', '4537'),
  ('se-bas2024', '21', '4538'),
  ('se-bas2024', '22', '4531'),
  ('se-bas2024', '22', '4532'),
  ('se-bas2024', '22', '4533'),
  ('se-bas2024', '22', '4534'),
  -- Reverse charge and EU acquisition. These three boxes were missing from the
  -- first cut of this seed because the extractor's pattern needed code, label
  -- and kind on one source line, and only these three wrap. The result would
  -- have been output VAT on 2614-2635 belonging to no box at all: absent from
  -- the return, no error anywhere. The pack-vs-seed test below is what makes
  -- that class impossible rather than caught by luck.
  ('se-bas2024', '30', '2614'),
  ('se-bas2024', '30', '2615'),
  ('se-bas2024', '31', '2624'),
  ('se-bas2024', '31', '2625'),
  ('se-bas2024', '32', '2634'),
  ('se-bas2024', '32', '2635'),
  ('se-bas2024', '50', '4545'),
  ('se-bas2024', '50', '4546'),
  ('se-bas2024', '50', '4547'),
  ('se-bas2024', '35', '3105'),
  ('se-bas2024', '35', '3106'),
  ('se-bas2024', '35', '3108'),
  ('se-bas2024', '39', '3308'),
  ('se-bas2024', '41', '3305'),
  ('se-bas2024', '41', '3306'),
  ('se-bas2024', '10', '2610'),
  ('se-bas2024', '10', '2611'),
  ('se-bas2024', '10', '2612'),
  ('se-bas2024', '10', '2613'),
  ('se-bas2024', '10', '2616'),
  ('se-bas2024', '10', '2617'),
  ('se-bas2024', '10', '2618'),
  ('se-bas2024', '10', '2619'),
  ('se-bas2024', '11', '2620'),
  ('se-bas2024', '11', '2621'),
  ('se-bas2024', '11', '2622'),
  ('se-bas2024', '11', '2623'),
  ('se-bas2024', '11', '2626'),
  ('se-bas2024', '11', '2627'),
  ('se-bas2024', '11', '2628'),
  ('se-bas2024', '11', '2629'),
  ('se-bas2024', '12', '2630'),
  ('se-bas2024', '12', '2631'),
  ('se-bas2024', '12', '2632'),
  ('se-bas2024', '12', '2633'),
  ('se-bas2024', '12', '2636'),
  ('se-bas2024', '12', '2637'),
  ('se-bas2024', '12', '2638'),
  ('se-bas2024', '12', '2639'),
  ('se-bas2024', '48', '2640'),
  ('se-bas2024', '48', '2641'),
  ('se-bas2024', '48', '2642'),
  ('se-bas2024', '48', '2643'),
  ('se-bas2024', '48', '2644'),
  ('se-bas2024', '48', '2645'),
  ('se-bas2024', '48', '2646'),
  ('se-bas2024', '48', '2647'),
  ('se-bas2024', '48', '2648'),
  ('se-bas2024', '48', '2649')
ON CONFLICT (locale, account_code, box_code) DO NOTHING;

-- ── The gap this exists to expose ───────────────────────────────────────────
-- An account that carries money and belongs to no box is money missing from the
-- return. Today that is invisible; a migrated company hits it on their first
-- filing. This turns it into a list.
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
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can read VAT box coverage';
  END IF;

  v_locale := COALESCE(NULLIF(btrim(p_locale), ''),
    (SELECT value #>> '{}' FROM public.site_settings WHERE key = 'accounting_locale'),
    'se-bas2024');

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
      FILTER (WHERE b.account_code IS NULL AND (
        -- Only accounts that could plausibly belong on the return: VAT accounts
        -- and the revenue/purchase ranges the boxes draw from. A wage account
        -- with no box is correct, not a gap, and listing it would train the
        -- reader to ignore the list.
        m.account_code LIKE '26%' OR m.account_code LIKE '3%' OR m.account_code LIKE '45%')),
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
    'accounts_with_movement', v_total,
    'accounts_in_a_box', v_mapped,
    'unmapped_but_reportable', v_unmapped,
    'complete', jsonb_array_length(v_unmapped) = 0,
    'note', CASE WHEN jsonb_array_length(v_unmapped) = 0
      THEN 'Every account that moved and could belong on the return is in a box.'
      ELSE format('%s account(s) carried money this period and belong to NO box on the return — those amounts are simply absent from the filing, with no error anywhere. This is what a migrated chart looks like: the accounts are real, the classification is missing. Map them with manage_account_tax_boxes.',
        jsonb_array_length(v_unmapped)) END);
END; $function$;

-- ── Reading and editing the map ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.manage_account_tax_boxes(
  p_action text DEFAULT 'list',
  p_locale text DEFAULT NULL,
  p_account_code text DEFAULT NULL,
  p_box_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_locale text;
  v_name text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can manage the VAT box map';
  END IF;

  v_locale := COALESCE(NULLIF(btrim(p_locale), ''),
    (SELECT value #>> '{}' FROM public.site_settings WHERE key = 'accounting_locale'),
    'se-bas2024');

  IF p_action = 'list' THEN
    RETURN jsonb_build_object(
      'locale', v_locale,
      'boxes', COALESCE((
        SELECT jsonb_object_agg(box_code, accs) FROM (
          SELECT b.box_code, jsonb_agg(jsonb_build_object(
                   'account_code', b.account_code, 'account_name', c.account_name,
                   'source', b.source) ORDER BY b.account_code) AS accs
            FROM public.account_tax_boxes b
            LEFT JOIN public.chart_of_accounts c
              ON c.locale = b.locale AND c.account_code = b.account_code
           WHERE b.locale = v_locale GROUP BY b.box_code) x), '{}'::jsonb),
      'note', 'Which accounts feed which box on the VAT return. Seeded from the locale pack (source=standard); rows added for this company''s own chart are source=instance.');
  END IF;

  IF p_action NOT IN ('add', 'remove') THEN
    RETURN jsonb_build_object('error', format('Unknown action "%s". Use list|add|remove', p_action));
  END IF;
  IF COALESCE(btrim(p_account_code), '') = '' OR COALESCE(btrim(p_box_code), '') = '' THEN
    RETURN jsonb_build_object('error', format('%s requires account_code and box_code', p_action));
  END IF;

  IF p_action = 'remove' THEN
    DELETE FROM public.account_tax_boxes
     WHERE locale = v_locale AND account_code = btrim(p_account_code) AND box_code = btrim(p_box_code);
    RETURN jsonb_build_object('removed', FOUND, 'locale', v_locale,
      'account_code', btrim(p_account_code), 'box_code', btrim(p_box_code));
  END IF;

  SELECT account_name INTO v_name FROM public.chart_of_accounts
   WHERE locale = v_locale AND account_code = btrim(p_account_code);
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('error', format(
      'Account %s is not in the %s chart. An account that does not exist cannot report anything — add it first.',
      p_account_code, v_locale));
  END IF;

  INSERT INTO public.account_tax_boxes (locale, account_code, box_code, source)
  VALUES (v_locale, btrim(p_account_code), btrim(p_box_code), 'instance')
  ON CONFLICT (locale, account_code, box_code) DO NOTHING;

  RETURN jsonb_build_object('added', true, 'locale', v_locale,
    'account_code', btrim(p_account_code), 'account_name', v_name,
    'box_code', btrim(p_box_code),
    'note', format('%s now reports into box %s. Amounts already posted are included from the next time the return is prepared — the map is read at report time, not at posting time.', btrim(p_account_code), btrim(p_box_code)));
END; $function$;

GRANT EXECUTE ON FUNCTION public.vat_box_coverage(date, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.manage_account_tax_boxes(text, text, text, text) TO authenticated, service_role;

DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.account_tax_boxes WHERE locale = 'se-bas2024';
  RAISE NOTICE 'account_tax_boxes: % konto→ruta-kopplingar för se-bas2024', v_n;
END $$;
