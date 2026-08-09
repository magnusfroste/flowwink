-- ============================================================================
-- The rink, not the players: an agent sets up a country's accounting.
-- ============================================================================

ALTER TABLE public.chart_of_accounts
  DROP CONSTRAINT IF EXISTS chart_of_accounts_account_code_key;
DO $$ BEGIN
  ALTER TABLE public.chart_of_accounts
    ADD CONSTRAINT chart_of_accounts_locale_code_key UNIQUE (locale, account_code);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.import_accounting_standard(
  p_locale text DEFAULT NULL,
  p_label text DEFAULT NULL,
  p_source_url text DEFAULT NULL,
  p_source_sha256 text DEFAULT NULL,
  p_accounts jsonb DEFAULT NULL,
  p_roles jsonb DEFAULT NULL,
  p_replace boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_errors text[] := ARRAY[]::text[];
  v_warnings text[] := ARRAY[]::text[];
  v_acc jsonb;
  v_code text;
  v_name text;
  v_type text;
  v_balance text;
  v_codes text[] := ARRAY[]::text[];
  v_role text;
  v_role_code text;
  v_known_roles text[];
  v_required_roles text[] := ARRAY['bank','accounts_receivable','accounts_payable','sales_revenue','vat_output','vat_input'];
  v_existing int;
  v_inserted int := 0;
  v_updated int := 0;
  v_roles_set int := 0;
  v_unchanged int := 0;
  v_idx int := 0;
  v_provenance jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can import an accounting standard';
  END IF;

  IF COALESCE(btrim(p_source_url), '') !~* '^https?://' THEN
    v_errors := v_errors || 'source_url is required and must be the http(s) address of the OFFICIAL standard file (the publisher''s own site, not a blog). An unsourced chart cannot be verified later — that is how a hand-written "BAS 2024" shipped 166 wrong names.'::text;
  END IF;
  IF COALESCE(btrim(p_source_sha256), '') !~ '^[0-9a-f]{64}$' THEN
    v_errors := v_errors || 'source_sha256 is required: the lowercase hex sha256 of the file you downloaded. You have the file — hash it. This is what lets anyone re-download and prove the import matches.'::text;
  END IF;

  IF COALESCE(btrim(p_locale), '') !~ '^[a-z]{2}-[a-z0-9-]{2,30}$' THEN
    v_errors := v_errors || 'locale must look like de-skr03 or fr-pcg: ISO country code, dash, short standard id (lowercase).'::text;
  END IF;
  IF COALESCE(btrim(p_label), '') = '' THEN
    v_errors := v_errors || 'label is required, e.g. "Germany — SKR03 2024".'::text;
  END IF;

  IF p_accounts IS NULL OR jsonb_typeof(p_accounts) <> 'array' OR jsonb_array_length(p_accounts) < 40 THEN
    v_errors := v_errors || format('accounts must be an array of at least 40 entries (got %s). A real standard has hundreds; fewer than 40 is a parsing failure, not a chart.',
      COALESCE(jsonb_array_length(p_accounts)::text, 'none'))::text;
  ELSE
    FOR v_acc IN SELECT * FROM jsonb_array_elements(p_accounts) LOOP
      v_idx := v_idx + 1;
      v_code := btrim(COALESCE(v_acc ->> 'code', ''));
      v_name := btrim(COALESCE(v_acc ->> 'name', ''));
      v_type := lower(btrim(COALESCE(v_acc ->> 'type', '')));

      IF v_code !~ '^\d{3,6}$' THEN
        v_errors := v_errors || format('accounts[%s]: code "%s" is not a 3–6 digit account number', v_idx, v_code)::text;
        CONTINUE;
      END IF;
      IF v_code = ANY (v_codes) THEN
        v_errors := v_errors || format('accounts[%s]: duplicate code %s', v_idx, v_code)::text;
        CONTINUE;
      END IF;
      v_codes := v_codes || v_code;
      IF v_name = '' THEN
        v_errors := v_errors || format('accounts[%s] (%s): name is required — take it VERBATIM from the official file, never paraphrase. Paraphrased names are how 2611 ended up carrying 2614''s meaning.', v_idx, v_code)::text;
      END IF;
      IF v_type NOT IN ('asset','liability','equity','revenue','expense') THEN
        v_errors := v_errors || format('accounts[%s] (%s): type "%s" must be one of asset|liability|equity|revenue|expense', v_idx, v_code, v_type)::text;
      END IF;
    END LOOP;
  END IF;

  SELECT array_agg(DISTINCT role) INTO v_known_roles FROM public.account_roles;
  IF p_roles IS NULL OR jsonb_typeof(p_roles) <> 'object' THEN
    v_errors := v_errors || format('roles is required: an object mapping platform roles to account codes, e.g. {"bank":"1200","sales_revenue":"8400"}. Required roles: %s.', array_to_string(v_required_roles, ', '))::text;
  ELSE
    FOREACH v_role IN ARRAY v_required_roles LOOP
      IF NOT (p_roles ? v_role) THEN
        v_errors := v_errors || format('roles.%s is required — the engine cannot post an invoice without it', v_role)::text;
      END IF;
    END LOOP;
    FOR v_role, v_role_code IN SELECT key, value #>> '{}' FROM jsonb_each(p_roles) LOOP
      IF NOT (v_role = ANY (v_known_roles)) THEN
        v_errors := v_errors || format('roles.%s is not a platform role. Valid roles: %s', v_role, array_to_string(v_known_roles, ', '))::text;
      ELSIF NOT (v_role_code = ANY (v_codes)) THEN
        v_errors := v_errors || format('roles.%s → %s, but that code is not in the accounts you delivered', v_role, v_role_code)::text;
      END IF;
    END LOOP;
  END IF;

  SELECT count(*) INTO v_existing FROM public.chart_of_accounts WHERE locale = p_locale;
  IF v_existing > 0 AND NOT p_replace THEN
    v_errors := v_errors || format('locale %s already has %s accounts. Pass replace=true to update it (existing accounts are renamed to the delivered names, missing ones inserted, none deleted — posted-to accounts always survive).', p_locale, v_existing)::text;
  END IF;

  IF array_length(v_errors, 1) IS NOT NULL THEN
    RETURN jsonb_build_object('imported', false, 'errors', to_jsonb(v_errors));
  END IF;

  FOR v_acc IN SELECT * FROM jsonb_array_elements(p_accounts) LOOP
    v_code := btrim(v_acc ->> 'code');
    v_name := btrim(v_acc ->> 'name');
    v_type := lower(btrim(v_acc ->> 'type'));
    v_balance := lower(btrim(COALESCE(v_acc ->> 'normal_balance',
      CASE WHEN v_type IN ('asset','expense') THEN 'debit' ELSE 'credit' END)));

    IF EXISTS (SELECT 1 FROM public.chart_of_accounts
                WHERE locale = p_locale AND account_code = v_code) THEN
      UPDATE public.chart_of_accounts
         SET account_name = v_name, account_type = v_type,
             account_category = COALESCE(NULLIF(btrim(v_acc ->> 'category'), ''), account_category),
             normal_balance = v_balance, updated_at = now()
       WHERE locale = p_locale AND account_code = v_code
         AND (account_name <> v_name OR account_type <> v_type OR normal_balance <> v_balance);
      IF FOUND THEN v_updated := v_updated + 1; ELSE v_unchanged := v_unchanged + 1; END IF;
    ELSE
      INSERT INTO public.chart_of_accounts
        (account_code, account_name, account_type, account_category, normal_balance, is_active, locale)
      VALUES
        (v_code, v_name, v_type, COALESCE(NULLIF(btrim(v_acc ->> 'category'), ''), 'Imported'), v_balance, true, p_locale);
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  IF v_inserted + v_updated + v_unchanged <> jsonb_array_length(p_accounts) THEN
    RAISE EXCEPTION 'accounting integrity: % accounts delivered but only % accounted for (% inserted, % updated, % unchanged)',
      jsonb_array_length(p_accounts), v_inserted + v_updated + v_unchanged, v_inserted, v_updated, v_unchanged;
  END IF;

  FOR v_role, v_role_code IN SELECT key, value #>> '{}' FROM jsonb_each(p_roles) LOOP
    INSERT INTO public.account_roles (locale, role, account_code, description)
    VALUES (p_locale, v_role, v_role_code, p_label)
    ON CONFLICT (locale, role) DO UPDATE SET account_code = EXCLUDED.account_code, updated_at = now();
    v_roles_set := v_roles_set + 1;
  END LOOP;

  v_provenance := jsonb_build_object(
    'label', p_label, 'source_url', p_source_url, 'sha256', p_source_sha256,
    'account_count', jsonb_array_length(p_accounts), 'imported_at', now());
  INSERT INTO public.site_settings (key, value, updated_at)
  VALUES ('accounting_standard_sources', jsonb_build_object(p_locale, v_provenance), now())
  ON CONFLICT (key) DO UPDATE
    SET value = public.site_settings.value || jsonb_build_object(p_locale, v_provenance),
        updated_at = now();

  RETURN jsonb_build_object(
    'imported', true,
    'locale', p_locale,
    'accounts_inserted', v_inserted,
    'accounts_updated', v_updated,
    'accounts_unchanged', v_unchanged,
    'roles_set', v_roles_set,
    'provenance', v_provenance,
    'note', 'The chart and role layer are live. The engine can now post in this locale. Next: propose_posting_templates for the recurring transactions this company actually has — the chart says what accounts exist, not how this business uses them.');
END; $function$;

-- ============================================================================
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

GRANT EXECUTE ON FUNCTION public.import_accounting_standard(text, text, text, text, jsonb, jsonb, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.propose_posting_templates(text, jsonb) TO authenticated, service_role;