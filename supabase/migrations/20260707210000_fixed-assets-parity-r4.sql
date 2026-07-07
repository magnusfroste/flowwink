-- Fixed assets: parity round 4 (docs/parity/capabilities/fixed-assets.json)
-- Adds: impairment/revaluation, manual depreciation adjustment, depreciation
-- schedule report, sum-of-years + units-of-production methods, asset
-- location, and component (parent/child) tracking.
--
-- Accounts (BAS 2024): impairment loss Dt 7720 (Nedskrivningar av materiella
-- anläggningstillgångar) / Cr accumulated (1219); reversal Dt 1219 /
-- Cr 7788 (Återföring av nedskrivningar).
--
-- Idempotent DDL. Forward-dated for the Lovable-managed migrate runner
-- (backdated files are silently skipped).

-- ── 1. Schema additions ──────────────────────────────────────────────────────
ALTER TABLE public.fixed_assets
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS parent_asset_id uuid REFERENCES public.fixed_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS total_expected_units integer,
  ADD COLUMN IF NOT EXISTS units_depreciated integer NOT NULL DEFAULT 0;

ALTER TABLE public.fixed_assets DROP CONSTRAINT IF EXISTS fixed_assets_no_self_parent;
ALTER TABLE public.fixed_assets
  ADD CONSTRAINT fixed_assets_no_self_parent CHECK (parent_asset_id IS NULL OR parent_asset_id <> id);

-- Extra depreciation methods
ALTER TABLE public.fixed_assets DROP CONSTRAINT IF EXISTS fixed_assets_depreciation_method_check;
ALTER TABLE public.fixed_assets
  ADD CONSTRAINT fixed_assets_depreciation_method_check
  CHECK (depreciation_method = ANY (ARRAY['straight_line'::text, 'declining'::text, 'sum_of_years'::text, 'units_of_production'::text]));

ALTER TABLE public.depreciation_entries
  ADD COLUMN IF NOT EXISTS is_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS units integer;

-- The blanket UNIQUE (asset_id, period_date) exists for the monthly sweep's
-- idempotency, but it blocks legitimate manual adjustments and multiple
-- units-of-production postings in the same month. Scope it to sweep entries.
ALTER TABLE public.depreciation_entries DROP CONSTRAINT IF EXISTS depreciation_entries_asset_id_period_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS depreciation_entries_sweep_unique
  ON public.depreciation_entries (asset_id, period_date)
  WHERE is_manual = false AND units IS NULL;

-- Revaluation / impairment history
CREATE TABLE IF NOT EXISTS public.asset_revaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
  revaluation_date date NOT NULL DEFAULT CURRENT_DATE,
  amount_cents bigint NOT NULL, -- negative = impairment, positive = reversal/upward
  new_value_cents bigint NOT NULL,
  reason text,
  journal_entry_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.asset_revaluations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage asset_revaluations" ON public.asset_revaluations;
CREATE POLICY "Admins manage asset_revaluations" ON public.asset_revaluations
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ── 2. compute_monthly_depreciation with period + new methods ────────────────
-- New 2-arg overload (STABLE, not IMMUTABLE — SYD needs elapsed months).
CREATE OR REPLACE FUNCTION public.compute_monthly_depreciation(p_asset public.fixed_assets, p_period_date date)
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

  IF p_asset.depreciation_method = 'straight_line' THEN
    v_amount := (p_asset.cost_cents - p_asset.salvage_cents) / GREATEST(p_asset.useful_life_months, 1);
  ELSIF p_asset.depreciation_method = 'declining' THEN
    v_amount := ROUND(v_nbv * COALESCE(p_asset.declining_rate, 0.30) / 12.0);
  ELSIF p_asset.depreciation_method = 'sum_of_years' THEN
    -- Sum-of-years-digits on whole years, spread monthly within each year.
    v_years := GREATEST(CEIL(p_asset.useful_life_months / 12.0)::INT, 1);
    v_elapsed_months := GREATEST(
      (EXTRACT(YEAR FROM AGE(date_trunc('month', p_period_date), date_trunc('month', p_asset.in_service_date))) * 12
       + EXTRACT(MONTH FROM AGE(date_trunc('month', p_period_date), date_trunc('month', p_asset.in_service_date))))::INT, 0);
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

-- Keep the 1-arg signature working (frontend/back-compat) by delegating.
CREATE OR REPLACE FUNCTION public.compute_monthly_depreciation(p_asset public.fixed_assets)
 RETURNS bigint
 LANGUAGE sql
 STABLE
AS $function$
  SELECT public.compute_monthly_depreciation(p_asset, CURRENT_DATE);
$function$;

-- ── 3. run_monthly_depreciation: pass the period to compute ─────────────────
CREATE OR REPLACE FUNCTION public.run_monthly_depreciation(p_period_date date DEFAULT (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_asset public.fixed_assets; v_amount BIGINT; v_je_id UUID; v_total_amount BIGINT := 0; v_processed INT := 0; v_skipped INT := 0; v_period DATE;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'run_monthly_depreciation: admin role required'; END IF;
  v_period := date_trunc('month', p_period_date)::DATE;
  FOR v_asset IN SELECT * FROM public.fixed_assets WHERE status = 'active' AND in_service_date <= (v_period + INTERVAL '1 month - 1 day')::DATE LOOP
    IF EXISTS (SELECT 1 FROM public.depreciation_entries WHERE asset_id = v_asset.id AND period_date = v_period AND is_manual = false AND units IS NULL) THEN
      v_skipped := v_skipped + 1; CONTINUE; END IF;
    -- Usage-driven assets are posted via post_units_depreciation, not the sweep.
    IF v_asset.depreciation_method = 'units_of_production' THEN v_skipped := v_skipped + 1; CONTINUE; END IF;
    v_amount := public.compute_monthly_depreciation(v_asset, v_period);
    IF v_amount <= 0 THEN UPDATE public.fixed_assets SET status='fully_depreciated' WHERE id=v_asset.id; v_skipped := v_skipped + 1; CONTINUE; END IF;
    v_je_id := NULL;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entries') THEN
      INSERT INTO public.journal_entries (entry_date, description, source, status)
      VALUES ((v_period + INTERVAL '1 month - 1 day')::DATE, format('Depreciation %s — %s', to_char(v_period,'YYYY-MM'), v_asset.name), 'fixed_asset_depreciation', 'posted') RETURNING id INTO v_je_id;
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je_id, v_asset.depreciation_account, v_amount, 0, format('Depreciation: %s', v_asset.name)),
             (v_je_id, v_asset.accumulated_account, 0, v_amount, format('Accum depr: %s', v_asset.name));
    END IF;
    INSERT INTO public.depreciation_entries (asset_id, period_date, amount_cents, journal_entry_id) VALUES (v_asset.id, v_period, v_amount, v_je_id);
    UPDATE public.fixed_assets SET accumulated_cents = accumulated_cents + v_amount,
      status = CASE WHEN (cost_cents - (accumulated_cents + v_amount)) <= salvage_cents THEN 'fully_depreciated' ELSE status END
      WHERE id = v_asset.id;
    v_total_amount := v_total_amount + v_amount; v_processed := v_processed + 1;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'period', v_period, 'processed', v_processed, 'skipped', v_skipped, 'total_depreciation_cents', v_total_amount);
END; $function$;

-- ── 4. post_units_depreciation (units-of-production) ────────────────────────
CREATE OR REPLACE FUNCTION public.post_units_depreciation(
  p_asset_id uuid, p_units integer, p_period_date date DEFAULT CURRENT_DATE, p_notes text DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_asset public.fixed_assets; v_amount BIGINT; v_remaining BIGINT; v_je_id UUID; v_period DATE;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'post_units_depreciation: admin role required';
  END IF;
  IF p_units IS NULL OR p_units <= 0 THEN RAISE EXCEPTION 'units must be > 0'; END IF;
  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asset % not found', p_asset_id; END IF;
  IF v_asset.status <> 'active' THEN RAISE EXCEPTION 'Asset is % — only active assets can be depreciated', v_asset.status; END IF;
  IF v_asset.depreciation_method <> 'units_of_production' THEN
    RAISE EXCEPTION 'Asset method is % — post_units_depreciation only applies to units_of_production', v_asset.depreciation_method;
  END IF;
  IF COALESCE(v_asset.total_expected_units, 0) <= 0 THEN
    RAISE EXCEPTION 'Asset has no total_expected_units — set it via update_fixed_asset first';
  END IF;

  v_period := date_trunc('month', p_period_date)::DATE;
  v_amount := ROUND((v_asset.cost_cents - v_asset.salvage_cents)::numeric * p_units / v_asset.total_expected_units);
  v_remaining := v_asset.cost_cents - v_asset.accumulated_cents - v_asset.salvage_cents;
  IF v_amount > v_remaining THEN v_amount := v_remaining; END IF;
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Asset already fully depreciated');
  END IF;

  v_je_id := NULL;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entries') THEN
    INSERT INTO public.journal_entries (entry_date, description, source, status)
    VALUES (p_period_date, format('Units depreciation %s units — %s', p_units, v_asset.name), 'fixed_asset_depreciation', 'posted') RETURNING id INTO v_je_id;
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, v_asset.depreciation_account, v_amount, 0, format('Units depr: %s', v_asset.name)),
           (v_je_id, v_asset.accumulated_account, 0, v_amount, format('Accum depr: %s', v_asset.name));
  END IF;
  INSERT INTO public.depreciation_entries (asset_id, period_date, amount_cents, journal_entry_id, units, notes)
  VALUES (v_asset.id, v_period, v_amount, v_je_id, p_units, p_notes);
  UPDATE public.fixed_assets SET
    accumulated_cents = accumulated_cents + v_amount,
    units_depreciated = units_depreciated + p_units,
    status = CASE WHEN (cost_cents - (accumulated_cents + v_amount)) <= salvage_cents THEN 'fully_depreciated' ELSE status END
  WHERE id = v_asset.id;

  RETURN jsonb_build_object('success', true, 'asset_id', v_asset.id, 'units', p_units,
    'amount_cents', v_amount, 'journal_entry_id', v_je_id,
    'units_depreciated_total', v_asset.units_depreciated + p_units);
END; $function$;

-- ── 5. post_manual_depreciation (manual adjustment) ─────────────────────────
CREATE OR REPLACE FUNCTION public.post_manual_depreciation(
  p_asset_id uuid, p_amount_cents bigint, p_period_date date DEFAULT CURRENT_DATE, p_reason text DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_asset public.fixed_assets; v_remaining BIGINT; v_je_id UUID; v_period DATE;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'post_manual_depreciation: admin role required';
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN RAISE EXCEPTION 'amount_cents must be > 0'; END IF;
  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asset % not found', p_asset_id; END IF;
  IF v_asset.status = 'disposed' THEN RAISE EXCEPTION 'Asset is disposed'; END IF;

  v_remaining := v_asset.cost_cents - v_asset.accumulated_cents - v_asset.salvage_cents;
  IF p_amount_cents > v_remaining THEN
    RAISE EXCEPTION 'Adjustment % exceeds remaining depreciable base % (NBV minus salvage)', p_amount_cents, v_remaining;
  END IF;

  v_period := date_trunc('month', p_period_date)::DATE;
  v_je_id := NULL;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entries') THEN
    INSERT INTO public.journal_entries (entry_date, description, source, status)
    VALUES (p_period_date, format('Manual depreciation adjustment — %s%s', v_asset.name,
            CASE WHEN p_reason IS NOT NULL THEN ' ('||p_reason||')' ELSE '' END), 'fixed_asset_depreciation', 'posted') RETURNING id INTO v_je_id;
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, v_asset.depreciation_account, p_amount_cents, 0, format('Manual depr: %s', v_asset.name)),
           (v_je_id, v_asset.accumulated_account, 0, p_amount_cents, format('Accum depr: %s', v_asset.name));
  END IF;
  INSERT INTO public.depreciation_entries (asset_id, period_date, amount_cents, journal_entry_id, is_manual, notes)
  VALUES (v_asset.id, v_period, p_amount_cents, v_je_id, true, p_reason);
  UPDATE public.fixed_assets SET
    accumulated_cents = accumulated_cents + p_amount_cents,
    status = CASE WHEN (cost_cents - (accumulated_cents + p_amount_cents)) <= salvage_cents THEN 'fully_depreciated' ELSE status END
  WHERE id = v_asset.id;

  RETURN jsonb_build_object('success', true, 'asset_id', v_asset.id, 'amount_cents', p_amount_cents,
    'journal_entry_id', v_je_id, 'new_accumulated_cents', v_asset.accumulated_cents + p_amount_cents,
    'new_nbv_cents', v_asset.cost_cents - v_asset.accumulated_cents - p_amount_cents);
END; $function$;

-- ── 6. revalue_fixed_asset (impairment / reversal) ──────────────────────────
CREATE OR REPLACE FUNCTION public.revalue_fixed_asset(
  p_asset_id uuid, p_new_value_cents bigint, p_reason text DEFAULT NULL,
  p_revaluation_date date DEFAULT CURRENT_DATE,
  p_impairment_account text DEFAULT '7720', p_reversal_account text DEFAULT '7788'
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_asset public.fixed_assets; v_nbv BIGINT; v_delta BIGINT; v_amount BIGINT; v_je_id UUID;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'revalue_fixed_asset: admin role required';
  END IF;
  IF p_new_value_cents IS NULL OR p_new_value_cents < 0 THEN RAISE EXCEPTION 'new_value_cents must be >= 0'; END IF;
  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asset % not found', p_asset_id; END IF;
  IF v_asset.status = 'disposed' THEN RAISE EXCEPTION 'Asset is disposed'; END IF;

  v_nbv := v_asset.cost_cents - v_asset.accumulated_cents;
  v_delta := p_new_value_cents - v_nbv;
  IF v_delta = 0 THEN
    RETURN jsonb_build_object('success', true, 'asset_id', v_asset.id, 'message', 'New value equals current NBV — nothing to post', 'nbv_cents', v_nbv);
  END IF;

  v_je_id := NULL;
  IF v_delta < 0 THEN
    -- Impairment: Dt impairment loss / Cr accumulated
    v_amount := -v_delta;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entries') THEN
      INSERT INTO public.journal_entries (entry_date, description, source, status)
      VALUES (p_revaluation_date, format('Impairment — %s%s', v_asset.name,
              CASE WHEN p_reason IS NOT NULL THEN ' ('||p_reason||')' ELSE '' END), 'fixed_asset_revaluation', 'posted') RETURNING id INTO v_je_id;
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je_id, p_impairment_account, v_amount, 0, format('Impairment loss: %s', v_asset.name)),
             (v_je_id, v_asset.accumulated_account, 0, v_amount, format('Accum impairment: %s', v_asset.name));
    END IF;
    UPDATE public.fixed_assets SET
      accumulated_cents = accumulated_cents + v_amount,
      status = CASE WHEN (cost_cents - (accumulated_cents + v_amount)) <= salvage_cents THEN 'fully_depreciated' ELSE status END
    WHERE id = v_asset.id;
  ELSE
    -- Reversal of impairment / write-up: Dt accumulated / Cr reversal income.
    -- Capped so accumulated never goes negative (NBV never exceeds cost).
    v_amount := LEAST(v_delta, v_asset.accumulated_cents);
    IF v_amount <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Cannot revalue above original cost — no accumulated depreciation/impairment to reverse');
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entries') THEN
      INSERT INTO public.journal_entries (entry_date, description, source, status)
      VALUES (p_revaluation_date, format('Impairment reversal — %s%s', v_asset.name,
              CASE WHEN p_reason IS NOT NULL THEN ' ('||p_reason||')' ELSE '' END), 'fixed_asset_revaluation', 'posted') RETURNING id INTO v_je_id;
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je_id, v_asset.accumulated_account, v_amount, 0, format('Reversal: %s', v_asset.name)),
             (v_je_id, p_reversal_account, 0, v_amount, format('Impairment reversal income: %s', v_asset.name));
    END IF;
    UPDATE public.fixed_assets SET
      accumulated_cents = accumulated_cents - v_amount,
      status = CASE WHEN status = 'fully_depreciated' THEN 'active' ELSE status END
    WHERE id = v_asset.id;
    v_amount := v_amount; -- positive for reversal
  END IF;

  INSERT INTO public.asset_revaluations (asset_id, revaluation_date, amount_cents, new_value_cents, reason, journal_entry_id)
  VALUES (v_asset.id, p_revaluation_date, CASE WHEN v_delta < 0 THEN -v_amount ELSE v_amount END, p_new_value_cents, p_reason, v_je_id);

  RETURN jsonb_build_object('success', true, 'asset_id', v_asset.id,
    'kind', CASE WHEN v_delta < 0 THEN 'impairment' ELSE 'reversal' END,
    'amount_cents', v_amount, 'journal_entry_id', v_je_id,
    'old_nbv_cents', v_nbv,
    'new_nbv_cents', CASE WHEN v_delta < 0 THEN v_nbv - v_amount ELSE v_nbv + v_amount END);
END; $function$;

-- ── 7. update_fixed_asset (location / components / units metadata) ──────────
CREATE OR REPLACE FUNCTION public.update_fixed_asset(
  p_asset_id uuid, p_name text DEFAULT NULL, p_description text DEFAULT NULL,
  p_location text DEFAULT NULL, p_parent_asset_id uuid DEFAULT NULL,
  p_total_expected_units integer DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_asset public.fixed_assets;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'update_fixed_asset: admin role required';
  END IF;
  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asset % not found', p_asset_id; END IF;
  IF p_parent_asset_id IS NOT NULL THEN
    IF p_parent_asset_id = p_asset_id THEN RAISE EXCEPTION 'Asset cannot be its own parent'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.fixed_assets WHERE id = p_parent_asset_id) THEN
      RAISE EXCEPTION 'Parent asset % not found', p_parent_asset_id;
    END IF;
  END IF;

  UPDATE public.fixed_assets SET
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    location = COALESCE(p_location, location),
    parent_asset_id = COALESCE(p_parent_asset_id, parent_asset_id),
    total_expected_units = COALESCE(p_total_expected_units, total_expected_units),
    updated_at = now()
  WHERE id = p_asset_id;

  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id;
  RETURN jsonb_build_object('success', true, 'asset', jsonb_build_object(
    'id', v_asset.id, 'name', v_asset.name, 'location', v_asset.location,
    'parent_asset_id', v_asset.parent_asset_id, 'total_expected_units', v_asset.total_expected_units,
    'components', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'cost_cents', c.cost_cents)), '[]'::jsonb)
                   FROM public.fixed_assets c WHERE c.parent_asset_id = p_asset_id)));
END; $function$;

-- ── 8. get_depreciation_schedule (forward schedule report) ──────────────────
CREATE OR REPLACE FUNCTION public.get_depreciation_schedule(
  p_asset_id uuid DEFAULT NULL, p_months integer DEFAULT 120
) RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_asset public.fixed_assets; v_sim public.fixed_assets;
  v_assets jsonb := '[]'::jsonb; v_rows jsonb; v_period date; v_amount bigint; v_i int;
  v_estimated boolean; v_remaining bigint; v_monthly bigint; v_months_left int;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'approver') OR has_role(auth.uid(), 'writer')) THEN
    RAISE EXCEPTION 'get_depreciation_schedule: staff role required';
  END IF;
  FOR v_asset IN
    SELECT * FROM public.fixed_assets
    WHERE (p_asset_id IS NULL OR id = p_asset_id) AND status <> 'disposed'
    ORDER BY name
  LOOP
    v_sim := v_asset;
    v_rows := '[]'::jsonb;
    v_period := GREATEST(date_trunc('month', CURRENT_DATE)::date, date_trunc('month', v_sim.in_service_date)::date);
    v_estimated := (v_sim.depreciation_method = 'units_of_production');
    FOR v_i IN 1..LEAST(GREATEST(p_months,1), 600) LOOP
      v_remaining := v_sim.cost_cents - v_sim.accumulated_cents - v_sim.salvage_cents;
      EXIT WHEN v_remaining <= 0;
      IF v_estimated THEN
        -- UOP: even spread over remaining life as an estimate.
        v_months_left := GREATEST(v_sim.useful_life_months - (v_i - 1), 1);
        v_monthly := CEIL(v_remaining::numeric / v_months_left);
        v_amount := LEAST(v_monthly, v_remaining);
      ELSE
        v_amount := public.compute_monthly_depreciation(v_sim, v_period);
      END IF;
      EXIT WHEN v_amount <= 0;
      v_sim.accumulated_cents := v_sim.accumulated_cents + v_amount;
      v_rows := v_rows || jsonb_build_object(
        'period', to_char(v_period, 'YYYY-MM'),
        'amount_cents', v_amount,
        'accumulated_cents', v_sim.accumulated_cents,
        'nbv_cents', v_sim.cost_cents - v_sim.accumulated_cents);
      v_period := (v_period + interval '1 month')::date;
    END LOOP;
    v_assets := v_assets || jsonb_build_object(
      'asset_id', v_asset.id, 'name', v_asset.name, 'method', v_asset.depreciation_method,
      'cost_cents', v_asset.cost_cents, 'salvage_cents', v_asset.salvage_cents,
      'accumulated_cents', v_asset.accumulated_cents,
      'nbv_cents', v_asset.cost_cents - v_asset.accumulated_cents,
      'location', v_asset.location, 'parent_asset_id', v_asset.parent_asset_id,
      'estimated', v_estimated,
      'schedule', v_rows);
  END LOOP;
  RETURN jsonb_build_object('success', true, 'assets', v_assets, 'generated_at', now());
END; $function$;

-- ── Grants ───────────────────────────────────────────────────────────────────
GRANT ALL ON FUNCTION public.compute_monthly_depreciation(public.fixed_assets, date) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.post_units_depreciation(uuid, integer, date, text) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.post_manual_depreciation(uuid, bigint, date, text) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.revalue_fixed_asset(uuid, bigint, text, date, text, text) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.update_fixed_asset(uuid, text, text, text, uuid, integer) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.get_depreciation_schedule(uuid, integer) TO anon, authenticated, service_role;
