
-- ============================================================================
-- FIXED ASSETS MODULE — register, depreciate, dispose
-- BAS 2024 defaults: 1219 (ack avskrivning inventarier), 7832 (avskrivning inventarier)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fixed_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  asset_account TEXT NOT NULL DEFAULT '1210',           -- inventarier
  depreciation_account TEXT NOT NULL DEFAULT '7832',    -- avskrivning inventarier
  accumulated_account TEXT NOT NULL DEFAULT '1219',     -- ack avskrivning inventarier
  cost_cents BIGINT NOT NULL CHECK (cost_cents >= 0),
  salvage_cents BIGINT NOT NULL DEFAULT 0 CHECK (salvage_cents >= 0),
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  in_service_date DATE NOT NULL DEFAULT CURRENT_DATE,
  useful_life_months INT NOT NULL CHECK (useful_life_months > 0),
  depreciation_method TEXT NOT NULL DEFAULT 'straight_line'
    CHECK (depreciation_method IN ('straight_line','declining')),
  declining_rate NUMERIC(6,4),                          -- e.g. 0.30 for 30%/yr (declining only)
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','fully_depreciated','disposed')),
  accumulated_cents BIGINT NOT NULL DEFAULT 0,
  disposed_at DATE,
  disposed_amount_cents BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fixed_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fixed_assets_admin_all" ON public.fixed_assets;
CREATE POLICY "fixed_assets_admin_all" ON public.fixed_assets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS fixed_assets_updated_at ON public.fixed_assets;
CREATE TRIGGER fixed_assets_updated_at
  BEFORE UPDATE ON public.fixed_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.depreciation_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
  period_date DATE NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  journal_entry_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_id, period_date)
);

CREATE INDEX IF NOT EXISTS depreciation_entries_period
  ON public.depreciation_entries (period_date DESC);

ALTER TABLE public.depreciation_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "depreciation_entries_admin_all" ON public.depreciation_entries;
CREATE POLICY "depreciation_entries_admin_all" ON public.depreciation_entries
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ── register_fixed_asset ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.register_fixed_asset(
  p_name TEXT,
  p_cost_cents BIGINT,
  p_useful_life_months INT,
  p_purchase_date DATE DEFAULT CURRENT_DATE,
  p_in_service_date DATE DEFAULT NULL,
  p_salvage_cents BIGINT DEFAULT 0,
  p_method TEXT DEFAULT 'straight_line',
  p_declining_rate NUMERIC DEFAULT NULL,
  p_asset_account TEXT DEFAULT '1210',
  p_depreciation_account TEXT DEFAULT '7832',
  p_accumulated_account TEXT DEFAULT '1219',
  p_credit_account TEXT DEFAULT '1930',                 -- bank (or 2440 if vendor bill)
  p_description TEXT DEFAULT NULL,
  p_create_journal_entry BOOLEAN DEFAULT true
)
RETURNS public.fixed_assets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asset public.fixed_assets;
  v_je_id UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'register_fixed_asset: admin role required';
  END IF;

  INSERT INTO public.fixed_assets (
    name, description, cost_cents, salvage_cents, purchase_date, in_service_date,
    useful_life_months, depreciation_method, declining_rate,
    asset_account, depreciation_account, accumulated_account
  ) VALUES (
    p_name, p_description, p_cost_cents, COALESCE(p_salvage_cents,0),
    p_purchase_date, COALESCE(p_in_service_date, p_purchase_date),
    p_useful_life_months, p_method, p_declining_rate,
    p_asset_account, p_depreciation_account, p_accumulated_account
  ) RETURNING * INTO v_asset;

  IF p_create_journal_entry
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entries')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entry_lines') THEN
    INSERT INTO public.journal_entries (entry_date, description, source, status)
    VALUES (
      v_asset.purchase_date,
      format('Acquisition of fixed asset: %s', v_asset.name),
      'fixed_asset_register',
      'posted'
    ) RETURNING id INTO v_je_id;

    INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description)
    VALUES
      (v_je_id, p_asset_account,  p_cost_cents, 0, format('Asset: %s', v_asset.name)),
      (v_je_id, p_credit_account, 0, p_cost_cents, format('Acquisition: %s', v_asset.name));
  END IF;

  RETURN v_asset;
END;
$$;

-- ── compute_monthly_depreciation (helper) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.compute_monthly_depreciation(
  p_asset public.fixed_assets
)
RETURNS BIGINT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_remaining BIGINT;
  v_amount BIGINT;
  v_nbv BIGINT;
BEGIN
  v_nbv := p_asset.cost_cents - p_asset.accumulated_cents;
  v_remaining := v_nbv - p_asset.salvage_cents;
  IF v_remaining <= 0 THEN RETURN 0; END IF;

  IF p_asset.depreciation_method = 'straight_line' THEN
    v_amount := (p_asset.cost_cents - p_asset.salvage_cents) / GREATEST(p_asset.useful_life_months, 1);
  ELSIF p_asset.depreciation_method = 'declining' THEN
    -- monthly rate = annual_rate / 12 applied to current NBV
    v_amount := ROUND(v_nbv * COALESCE(p_asset.declining_rate, 0.30) / 12.0);
  ELSE
    v_amount := 0;
  END IF;

  -- Don't depreciate below salvage
  IF v_amount > v_remaining THEN v_amount := v_remaining; END IF;
  RETURN GREATEST(v_amount, 0);
END;
$$;

-- ── run_monthly_depreciation ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_monthly_depreciation(
  p_period_date DATE DEFAULT (date_trunc('month', CURRENT_DATE)::DATE)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asset public.fixed_assets;
  v_amount BIGINT;
  v_je_id UUID;
  v_total_amount BIGINT := 0;
  v_processed INT := 0;
  v_skipped INT := 0;
  v_period DATE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'run_monthly_depreciation: admin role required';
  END IF;

  v_period := date_trunc('month', p_period_date)::DATE;

  FOR v_asset IN
    SELECT * FROM public.fixed_assets
    WHERE status = 'active' AND in_service_date <= (v_period + INTERVAL '1 month - 1 day')::DATE
  LOOP
    -- Skip if already booked this period
    IF EXISTS (SELECT 1 FROM public.depreciation_entries WHERE asset_id = v_asset.id AND period_date = v_period) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_amount := public.compute_monthly_depreciation(v_asset);
    IF v_amount <= 0 THEN
      -- Mark fully depreciated
      UPDATE public.fixed_assets SET status='fully_depreciated' WHERE id=v_asset.id;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_je_id := NULL;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entries') THEN
      INSERT INTO public.journal_entries (entry_date, description, source, status)
      VALUES (
        (v_period + INTERVAL '1 month - 1 day')::DATE,
        format('Depreciation %s — %s', to_char(v_period,'YYYY-MM'), v_asset.name),
        'fixed_asset_depreciation',
        'posted'
      ) RETURNING id INTO v_je_id;

      INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description)
      VALUES
        (v_je_id, v_asset.depreciation_account, v_amount, 0, format('Depreciation: %s', v_asset.name)),
        (v_je_id, v_asset.accumulated_account, 0, v_amount, format('Accum depr: %s', v_asset.name));
    END IF;

    INSERT INTO public.depreciation_entries (asset_id, period_date, amount_cents, journal_entry_id)
    VALUES (v_asset.id, v_period, v_amount, v_je_id);

    UPDATE public.fixed_assets
       SET accumulated_cents = accumulated_cents + v_amount,
           status = CASE WHEN (cost_cents - (accumulated_cents + v_amount)) <= salvage_cents
                         THEN 'fully_depreciated' ELSE status END
     WHERE id = v_asset.id;

    v_total_amount := v_total_amount + v_amount;
    v_processed := v_processed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'period', v_period,
    'processed', v_processed,
    'skipped', v_skipped,
    'total_depreciation_cents', v_total_amount
  );
END;
$$;

-- ── dispose_fixed_asset ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispose_fixed_asset(
  p_asset_id UUID,
  p_sale_amount_cents BIGINT DEFAULT 0,
  p_disposal_date DATE DEFAULT CURRENT_DATE,
  p_proceeds_account TEXT DEFAULT '1930',  -- bank
  p_gain_account TEXT DEFAULT '3970',      -- vinst vid avyttring
  p_loss_account TEXT DEFAULT '7970'       -- förlust vid avyttring
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asset public.fixed_assets;
  v_nbv BIGINT;
  v_gain_loss BIGINT;
  v_je_id UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'dispose_fixed_asset: admin role required';
  END IF;

  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id;
  IF v_asset.id IS NULL THEN RAISE EXCEPTION 'Asset not found'; END IF;
  IF v_asset.status = 'disposed' THEN RAISE EXCEPTION 'Asset already disposed'; END IF;

  v_nbv := v_asset.cost_cents - v_asset.accumulated_cents;
  v_gain_loss := COALESCE(p_sale_amount_cents,0) - v_nbv;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entries') THEN
    INSERT INTO public.journal_entries (entry_date, description, source, status)
    VALUES (p_disposal_date, format('Disposal: %s', v_asset.name), 'fixed_asset_disposal', 'posted')
    RETURNING id INTO v_je_id;

    -- Remove cost
    INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, v_asset.asset_account, 0, v_asset.cost_cents, 'Reverse cost');
    -- Remove accumulated depreciation
    IF v_asset.accumulated_cents > 0 THEN
      INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je_id, v_asset.accumulated_account, v_asset.accumulated_cents, 0, 'Reverse accum depr');
    END IF;
    -- Cash proceeds
    IF COALESCE(p_sale_amount_cents,0) > 0 THEN
      INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je_id, p_proceeds_account, p_sale_amount_cents, 0, 'Sale proceeds');
    END IF;
    -- Gain or loss
    IF v_gain_loss > 0 THEN
      INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je_id, p_gain_account, 0, v_gain_loss, 'Gain on disposal');
    ELSIF v_gain_loss < 0 THEN
      INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je_id, p_loss_account, ABS(v_gain_loss), 0, 'Loss on disposal');
    END IF;
  END IF;

  UPDATE public.fixed_assets
     SET status='disposed',
         disposed_at = p_disposal_date,
         disposed_amount_cents = p_sale_amount_cents
   WHERE id = p_asset_id;

  RETURN jsonb_build_object(
    'success', true,
    'asset_id', p_asset_id,
    'nbv_cents', v_nbv,
    'sale_cents', p_sale_amount_cents,
    'gain_loss_cents', v_gain_loss,
    'journal_entry_id', v_je_id
  );
END;
$$;

-- ── MCP wrappers ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mcp_register_fixed_asset(args jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.fixed_assets;
BEGIN
  v := public.register_fixed_asset(
    (args->>'name')::TEXT,
    (args->>'cost_cents')::BIGINT,
    (args->>'useful_life_months')::INT,
    COALESCE((args->>'purchase_date')::DATE, CURRENT_DATE),
    NULLIF(args->>'in_service_date','')::DATE,
    COALESCE((args->>'salvage_cents')::BIGINT, 0),
    COALESCE(args->>'depreciation_method','straight_line'),
    NULLIF(args->>'declining_rate','')::NUMERIC,
    COALESCE(args->>'asset_account','1210'),
    COALESCE(args->>'depreciation_account','7832'),
    COALESCE(args->>'accumulated_account','1219'),
    COALESCE(args->>'credit_account','1930'),
    args->>'description',
    COALESCE((args->>'create_journal_entry')::BOOLEAN, true)
  );
  RETURN to_jsonb(v);
END; $$;

CREATE OR REPLACE FUNCTION public.mcp_run_monthly_depreciation(args jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.run_monthly_depreciation(
    COALESCE((args->>'period_date')::DATE, (date_trunc('month', CURRENT_DATE))::DATE)
  );
END; $$;

CREATE OR REPLACE FUNCTION public.mcp_dispose_fixed_asset(args jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.dispose_fixed_asset(
    (args->>'asset_id')::UUID,
    COALESCE((args->>'sale_amount_cents')::BIGINT, 0),
    COALESCE((args->>'disposal_date')::DATE, CURRENT_DATE),
    COALESCE(args->>'proceeds_account','1930'),
    COALESCE(args->>'gain_account','3970'),
    COALESCE(args->>'loss_account','7970')
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.register_fixed_asset(TEXT,BIGINT,INT,DATE,DATE,BIGINT,TEXT,NUMERIC,TEXT,TEXT,TEXT,TEXT,TEXT,BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_monthly_depreciation(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispose_fixed_asset(UUID,BIGINT,DATE,TEXT,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_register_fixed_asset(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_run_monthly_depreciation(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_dispose_fixed_asset(jsonb) TO authenticated;
