-- propose_posting_templates: an omitted locale means the active one.
--
-- Found by the skill smoke (2026-10-01): called without p_locale the function
-- answered "locale  has no chart of accounts" — a blank where the instance's
-- own accounting_locale was one settings row away. The body below is the one
-- from 20260809214625 with two additions right after the admin gate: default
-- p_locale from site_settings.accounting_locale, and say so plainly when
-- neither is set. Idempotent: CREATE OR REPLACE, same signature.

CREATE OR REPLACE FUNCTION public.propose_posting_templates(
  p_locale text DEFAULT NULL,
  p_templates jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tpl jsonb;
  v_line jsonb;
  v_name text;
  v_category text;
  v_reasons text[];
  v_accepted jsonb := '[]'::jsonb;
  v_rejected jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_corrections jsonb;
  v_lines jsonb;
  v_debit numeric;
  v_credit numeric;
  v_code text;
  v_chart_name text;
  v_seen_names text[] := ARRAY[]::text[];
  v_chart_count int;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can propose posting templates';
  END IF;

  -- No locale given → the instance's active accounting locale. Before this,
  -- an omitted p_locale produced "locale  has no chart of accounts" — a blank
  -- where the answer was one settings row away (skill smoke, 2026-10-01).
  IF p_locale IS NULL OR btrim(p_locale) = '' THEN
    SELECT btrim(value::text, '"') INTO p_locale
      FROM public.site_settings WHERE key = 'accounting_locale';
  END IF;
  IF p_locale IS NULL OR btrim(p_locale) = '' THEN
    RETURN jsonb_build_object('error',
      'No accounting locale is active on this instance and none was given. Run import_accounting_standard (or install a template with a country) first, or pass p_locale.');
  END IF;

  SELECT count(*) INTO v_chart_count FROM public.chart_of_accounts WHERE locale = p_locale;
  IF v_chart_count = 0 THEN
    RETURN jsonb_build_object('error',
      format('locale %s has no chart of accounts. Run import_accounting_standard first — templates are verified against the chart, and there is nothing to verify against.', p_locale));
  END IF;
  IF p_templates IS NULL OR jsonb_typeof(p_templates) <> 'array' OR jsonb_array_length(p_templates) = 0 THEN
    RETURN jsonb_build_object('error', 'templates must be a non-empty array');
  END IF;

  FOR v_tpl IN SELECT * FROM jsonb_array_elements(p_templates) LOOP
    v_reasons := ARRAY[]::text[];
    v_corrections := '[]'::jsonb;
    v_name := btrim(COALESCE(v_tpl ->> 'template_name', v_tpl ->> 'name', ''));
    v_category := lower(btrim(COALESCE(v_tpl ->> 'category', '')));
    v_lines := '[]'::jsonb;
    v_debit := 0; v_credit := 0;

    IF v_name = '' THEN
      v_reasons := v_reasons || 'template_name is required'::text;
    ELSIF v_name = ANY (v_seen_names) THEN
      v_reasons := v_reasons || format('duplicate template_name "%s" within this batch', v_name)::text;
    END IF;
    v_seen_names := v_seen_names || v_name;

    IF v_category NOT IN ('revenue','expense','payment','payroll','tax','asset','adjustment') THEN
      v_reasons := v_reasons || format('category "%s" must be one of revenue|expense|payment|payroll|tax|asset|adjustment', v_category)::text;
    END IF;
    IF v_tpl -> 'keywords' IS NULL OR jsonb_typeof(v_tpl -> 'keywords') <> 'array' OR jsonb_array_length(v_tpl -> 'keywords') = 0 THEN
      v_reasons := v_reasons || 'keywords is required and non-empty — it is how the matching engine finds this template from a transaction description'::text;
    END IF;

    IF v_tpl -> 'template_lines' IS NULL OR jsonb_typeof(v_tpl -> 'template_lines') <> 'array'
       OR jsonb_array_length(v_tpl -> 'template_lines') < 2 THEN
      v_reasons := v_reasons || 'template_lines must be an array of at least 2 lines (double-entry has two sides)'::text;
    ELSE
      FOR v_line IN SELECT * FROM jsonb_array_elements(v_tpl -> 'template_lines') LOOP
        v_code := btrim(COALESCE(v_line ->> 'account_code', ''));

        SELECT account_name INTO v_chart_name FROM public.chart_of_accounts
         WHERE locale = p_locale AND account_code = v_code;
        IF v_chart_name IS NULL THEN
          v_reasons := v_reasons || format('line account %s does not exist in the %s chart — a template may only reference accounts the chart has', v_code, p_locale)::text;
          CONTINUE;
        END IF;

        IF COALESCE(v_line ->> 'account_name', '') <> v_chart_name THEN
          v_corrections := v_corrections || jsonb_build_object(
            'account_code', v_code, 'given', v_line ->> 'account_name', 'chart', v_chart_name);
        END IF;

        v_debit := v_debit + COALESCE((v_line ->> 'debit_pct')::numeric, 0);
        v_credit := v_credit + COALESCE((v_line ->> 'credit_pct')::numeric, 0);
        v_lines := v_lines || jsonb_build_object(
          'account_code', v_code,
          'account_name', v_chart_name,
          'debit_pct', COALESCE((v_line ->> 'debit_pct')::numeric, 0),
          'credit_pct', COALESCE((v_line ->> 'credit_pct')::numeric, 0));
      END LOOP;

      IF v_debit <= 0 OR v_credit <= 0 THEN
        v_reasons := v_reasons || 'a template needs at least one debit line and one credit line'::text;
      ELSIF abs(v_debit - v_credit) > 0.01 THEN
        v_reasons := v_reasons || format('lines do not balance: debit %s%% vs credit %s%% — an entry booked from this would never balance either', v_debit, v_credit)::text;
      END IF;
    END IF;

    IF array_length(v_reasons, 1) IS NOT NULL THEN
      v_rejected := v_rejected || jsonb_build_object('template_name', v_name, 'reasons', to_jsonb(v_reasons));
      CONTINUE;
    END IF;

    IF EXISTS (SELECT 1 FROM public.accounting_templates
                WHERE locale = p_locale AND lower(template_name) = lower(v_name)) THEN
      v_skipped := v_skipped || jsonb_build_object('template_name', v_name,
        'reason', 'already exists in this locale — use manage_accounting_template action=update to change it');
      CONTINUE;
    END IF;

    BEGIN
      INSERT INTO public.accounting_templates
        (template_name, description, category, keywords, template_lines, is_system, locale)
      VALUES
        (v_name, COALESCE(NULLIF(btrim(COALESCE(v_tpl ->> 'description', '')), ''), v_name), v_category,
         ARRAY(SELECT jsonb_array_elements_text(v_tpl -> 'keywords')),
         v_lines, false, p_locale);
      v_accepted := v_accepted || jsonb_build_object('template_name', v_name,
        'name_corrections', v_corrections);
    EXCEPTION WHEN OTHERS THEN
      v_rejected := v_rejected || jsonb_build_object('template_name', v_name,
        'reasons', jsonb_build_array('database refused the write: ' || SQLERRM));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'locale', p_locale,
    'accepted', v_accepted,
    'rejected', v_rejected,
    'skipped', v_skipped,
    'note', 'Rejected templates were NOT stored — fix the reasons and resubmit only those. Accepted ones are operator-owned (is_system=false). name_corrections show where your wording was replaced by the chart''s: the chart is the single truth for account names.');
END; $function$;
