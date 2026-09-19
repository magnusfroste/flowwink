-- Avskrivningen räknar månader.
--
-- Processbatteriet 2026-09-19 (acquire-to-retire):
--
--   ÅRSFÖRSLAGET propose_annual_depreciation föreslog ALLTID tolv månader av planen,
--                oavsett när tillgången togs i bruk och vad som redan bokats: en
--                tillgång i bruk från oktober med tre bokade månader fick 240 000
--                föreslaget där 0 återstod för året — och förslagets egen not säger
--                "bokför det".
--   RESTÖRET     Linjär avskrivning är heltalsdivision och resten placerades aldrig:
--                1 000 kr på tre månader slutade på 99 999, tillgången stod kvar som
--                aktiv och fick en fjärde månad på 1 öre.
--   RESTVÄRDET   register_fixed_asset tog emot ett restvärde ÖVER anskaffningsvärdet
--                (negativ avskrivningsbas).
--   UPPSKRIVNING revalue_fixed_asset tog emot ett värde över anskaffningsvärdet och
--                återförde all ackumulerad avskrivning — dess egen instruktion säger
--                att det vägras.
--
-- Idempotent: CREATE OR REPLACE + markerade in place-ändringar.

CREATE OR REPLACE FUNCTION public.compute_monthly_depreciation(p_asset fixed_assets, p_period_date date)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_remaining BIGINT;
  v_amount BIGINT;
  v_nbv BIGINT;
  v_years INT;
  v_elapsed_months INT;
  v_year_idx INT;
  v_syd NUMERIC;
BEGIN
  v_nbv := p_asset.cost_cents - p_asset.accumulated_cents;
  v_remaining := v_nbv - p_asset.salvage_cents;
  IF v_remaining <= 0 THEN RETURN 0; END IF;

  v_elapsed_months := GREATEST(
    (EXTRACT(YEAR FROM AGE(date_trunc('month', p_period_date), date_trunc('month', p_asset.in_service_date))) * 12
     + EXTRACT(MONTH FROM AGE(date_trunc('month', p_period_date), date_trunc('month', p_asset.in_service_date))))::INT, 0);

  IF p_asset.depreciation_method = 'straight_line' THEN
    v_amount := (p_asset.cost_cents - p_asset.salvage_cents) / GREATEST(p_asset.useful_life_months, 1);
    -- Sista månaden i nyttjandeperioden tar det heltalsdivisionen lämnade kvar.
    IF v_elapsed_months + 1 >= GREATEST(p_asset.useful_life_months, 1) THEN v_amount := v_remaining; END IF;
  ELSIF p_asset.depreciation_method = 'declining' THEN
    v_amount := ROUND(v_nbv * COALESCE(p_asset.declining_rate, 0.30) / 12.0);
  ELSIF p_asset.depreciation_method = 'sum_of_years' THEN
    -- Sum-of-years-digits on whole years, spread monthly within each year.
    v_years := GREATEST(CEIL(p_asset.useful_life_months / 12.0)::INT, 1);
    v_year_idx := LEAST((v_elapsed_months / 12) + 1, v_years);
    v_syd := v_years * (v_years + 1) / 2.0;
    v_amount := ROUND((p_asset.cost_cents - p_asset.salvage_cents) * (v_years - v_year_idx + 1) / v_syd / 12.0);
  ELSIF p_asset.depreciation_method = 'units_of_production' THEN
    -- Units-of-production is driven by actual usage, not the calendar:
    -- post via post_units_depreciation(). The monthly sweep skips these.
    v_amount := 0;
  ELSE
    v_amount := 0;
  END IF;

  IF v_amount > v_remaining THEN v_amount := v_remaining; END IF;
  RETURN GREATEST(v_amount, 0);
END;
$function$;

-- Årets förslag = årets PLAN (månader i bruk under året, inom nyttjandeperioden)
-- minus det som redan är bokat för året, aldrig mer än det som återstår.
CREATE OR REPLACE FUNCTION public.propose_annual_depreciation(p_year integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_year_start date := make_date(p_year, 1, 1);
  v_year_end date := make_date(p_year, 12, 31);
  v_proposals jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'fixedAssets')) THEN
    RAISE EXCEPTION 'Depreciation proposals require the fixed assets module' USING ERRCODE = '42501';
  END IF;

  WITH plan AS (
    SELECT fa.*,
           fa.cost_cents - fa.salvage_cents - fa.accumulated_cents AS remaining_cents,
           -- månader i bruk under året, inom nyttjandeperioden
           GREATEST(0,
             (EXTRACT(YEAR FROM AGE(
                date_trunc('month', LEAST(v_year_end, (date_trunc('month', fa.in_service_date) + make_interval(months => GREATEST(fa.useful_life_months, 1)) - interval '1 day')::date)) + interval '1 month',
                date_trunc('month', GREATEST(v_year_start, fa.in_service_date)))) * 12
              + EXTRACT(MONTH FROM AGE(
                date_trunc('month', LEAST(v_year_end, (date_trunc('month', fa.in_service_date) + make_interval(months => GREATEST(fa.useful_life_months, 1)) - interval '1 day')::date)) + interval '1 month',
                date_trunc('month', GREATEST(v_year_start, fa.in_service_date)))))::int) AS months_in_year,
           COALESCE((SELECT sum(de.amount_cents) FROM public.depreciation_entries de
                      WHERE de.asset_id = fa.id AND de.period_date BETWEEN v_year_start AND v_year_end), 0) AS booked_in_year
      FROM public.fixed_assets fa
     WHERE fa.status = 'active' AND fa.in_service_date <= v_year_end
       AND fa.accumulated_cents < (fa.cost_cents - fa.salvage_cents)
  ), calc AS (
    SELECT p.*,
           CASE
             WHEN p.depreciation_method = 'straight_line'
               THEN ((p.cost_cents - p.salvage_cents) / GREATEST(p.useful_life_months, 1)) * p.months_in_year
             WHEN p.depreciation_method = 'declining' AND p.declining_rate IS NOT NULL
               THEN ROUND((p.cost_cents - p.accumulated_cents + p.booked_in_year) * p.declining_rate * p.months_in_year / 12.0)::bigint
             ELSE 0 END AS planned_for_year
      FROM plan p
  ), proposal AS (
    SELECT c.*, GREATEST(LEAST(c.planned_for_year - c.booked_in_year, c.remaining_cents), 0) AS annual_amount_cents FROM calc c
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'asset_id', id, 'asset_name', name,
    'depreciation_account', depreciation_account,
    'accumulated_account', accumulated_account,
    'method', depreciation_method,
    'months_in_service_this_year', months_in_year,
    'planned_for_year_cents', planned_for_year,
    'already_booked_this_year_cents', booked_in_year,
    'annual_amount_cents', annual_amount_cents,
    'book_value_before_cents', cost_cents - accumulated_cents,
    'remaining_after_cents', cost_cents - accumulated_cents - annual_amount_cents
  )), '[]'::jsonb) INTO v_proposals
  FROM proposal; -- also the assets with nothing left to propose this year: "0, already booked" is an answer

  RETURN jsonb_build_object(
    'year', p_year, 'asset_count', jsonb_array_length(v_proposals),
    'to_post_count', (SELECT count(*) FROM jsonb_array_elements(v_proposals) e WHERE (e->>'annual_amount_cents')::bigint > 0),
    'proposals', v_proposals,
    'note', 'Each amount is this year''s plan (months in service) MINUS what is already booked for the year. Post each with post_manual_depreciation(asset_id, amount) — it books the entry AND updates the asset''s accumulated depreciation; manage_journal_entry alone leaves the asset''s book value untouched.'
  );
END; $function$;

DO $patch$
DECLARE v_def text; MARK constant text := '20260919210000';
BEGIN
  v_def := pg_get_functiondef('public.register_fixed_asset'::regproc);
  IF position('-- asset-bounds ' || MARK in v_def) = 0 THEN
    IF position(E'  INSERT INTO public.fixed_assets (\n    name, description, cost_cents, salvage_cents,' in v_def) = 0 THEN
      RAISE EXCEPTION 'avskrivningen: anchor missing in register_fixed_asset';
    END IF;
    v_def := replace(v_def, E'  INSERT INTO public.fixed_assets (\n    name, description, cost_cents, salvage_cents,',
      '  -- asset-bounds ' || MARK || E'\n' ||
      '  IF p_cost_cents IS NULL OR p_cost_cents <= 0 THEN RAISE EXCEPTION ''cost_cents must be positive''; END IF;' || E'\n' ||
      '  IF COALESCE(p_salvage_cents, 0) < 0 OR COALESCE(p_salvage_cents, 0) > p_cost_cents THEN' || E'\n' ||
      '    RAISE EXCEPTION ''salvage_cents % must be between 0 and the cost % — a residual value above the cost leaves nothing to depreciate'', p_salvage_cents, p_cost_cents;' || E'\n' ||
      '  END IF;' || E'\n' ||
      '  IF COALESCE(p_useful_life_months, 0) < 1 THEN RAISE EXCEPTION ''useful_life_months must be at least 1''; END IF;' || E'\n' ||
      E'  INSERT INTO public.fixed_assets (\n    name, description, cost_cents, salvage_cents,');
    EXECUTE v_def;
  END IF;

  v_def := pg_get_functiondef('public.revalue_fixed_asset'::regproc);
  IF position('-- no-write-up-above-cost ' || MARK in v_def) = 0 THEN
    IF position('IF v_asset.status = ''disposed'' THEN RAISE EXCEPTION ''Asset is disposed''; END IF;' in v_def) = 0 THEN
      RAISE EXCEPTION 'avskrivningen: anchor missing in revalue_fixed_asset';
    END IF;
    v_def := replace(v_def, 'IF v_asset.status = ''disposed'' THEN RAISE EXCEPTION ''Asset is disposed''; END IF;',
      'IF v_asset.status = ''disposed'' THEN RAISE EXCEPTION ''Asset is disposed''; END IF;' || E'\n' ||
      '  -- no-write-up-above-cost ' || MARK || E'\n' ||
      '  IF p_new_value_cents > v_asset.cost_cents THEN' || E'\n' ||
      '    RAISE EXCEPTION ''Cannot revalue above original cost: % is more than the cost % — the cost model reverses an impairment up to cost, never beyond it'', p_new_value_cents, v_asset.cost_cents;' || E'\n' ||
      '  END IF;');
    EXECUTE v_def;
  END IF;
END $patch$;

DO $proof$
DECLARE v_a fixed_assets; v_id uuid; v_sum bigint := 0; v_m bigint; i int;
BEGIN
  -- Restöret: 100 000 öre på tre månader = 33 333 + 33 333 + 33 334, sedan ingenting.
  v_a.cost_cents := 100000; v_a.salvage_cents := 0; v_a.accumulated_cents := 0; v_a.useful_life_months := 3;
  v_a.depreciation_method := 'straight_line'; v_a.in_service_date := date '2031-01-15';
  FOR i IN 0..3 LOOP
    v_m := public.compute_monthly_depreciation(v_a, (date '2031-01-01' + make_interval(months => i))::date);
    v_sum := v_sum + v_m; v_a.accumulated_cents := v_a.accumulated_cents + v_m;
  END LOOP;
  IF v_sum <> 100000 OR v_m <> 0 THEN RAISE EXCEPTION 'proof: three months of 100 000 depreciate to % with a fourth month of %', v_sum, v_m; END IF;

  IF position('20260919210000' in pg_get_functiondef('public.register_fixed_asset'::regproc)) = 0
     OR position('20260919210000' in pg_get_functiondef('public.revalue_fixed_asset'::regproc)) = 0 THEN
    RAISE EXCEPTION 'proof: the bounds are not in the live bodies';
  END IF;
  RAISE NOTICE 'avskrivningen-raknar-manader: proof passed';
END $proof$;
