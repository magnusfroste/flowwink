-- ============================================================================
-- MULTI-CURRENCY MODULE — DB Foundation
-- L1: Display only (currency + exchange_rate columns)
-- L2: Daily FX (currencies, exchange_rates, fetch helper)
-- L3: Revaluation (revalue_open_balances → posts FX gain/loss to BAS 3960/7960)
-- All opt-in: defaults preserve existing SEK-only behavior
-- ============================================================================

-- ── L2: Currencies catalog ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.currencies (
  code TEXT PRIMARY KEY,                         -- ISO 4217 (SEK, EUR, USD)
  name TEXT NOT NULL,
  symbol TEXT NOT NULL DEFAULT '',
  decimals SMALLINT NOT NULL DEFAULT 2,
  is_base BOOLEAN NOT NULL DEFAULT false,        -- only one TRUE per deployment
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "currencies_admin_all" ON public.currencies;
CREATE POLICY "currencies_admin_all" ON public.currencies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "currencies_read_all_authenticated" ON public.currencies;
CREATE POLICY "currencies_read_all_authenticated" ON public.currencies
  FOR SELECT TO authenticated USING (true);

-- Only one base currency
CREATE UNIQUE INDEX IF NOT EXISTS currencies_one_base
  ON public.currencies (is_base) WHERE is_base = true;

-- Seed common currencies (idempotent). SEK is base by default.
INSERT INTO public.currencies (code, name, symbol, decimals, is_base) VALUES
  ('SEK', 'Swedish Krona',   'kr', 2, true),
  ('EUR', 'Euro',             '€', 2, false),
  ('USD', 'US Dollar',        '$', 2, false),
  ('GBP', 'Pound Sterling',   '£', 2, false),
  ('NOK', 'Norwegian Krone', 'kr', 2, false),
  ('DKK', 'Danish Krone',    'kr', 2, false),
  ('CHF', 'Swiss Franc',    'CHF', 2, false),
  ('JPY', 'Japanese Yen',     '¥', 0, false)
ON CONFLICT (code) DO NOTHING;

-- ── L2: Exchange rates (daily) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency TEXT NOT NULL REFERENCES public.currencies(code),
  quote_currency TEXT NOT NULL REFERENCES public.currencies(code),
  rate NUMERIC(18, 8) NOT NULL CHECK (rate > 0),
  rate_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source TEXT NOT NULL DEFAULT 'manual',         -- 'ecb', 'manual', 'riksbank'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (base_currency, quote_currency, rate_date)
);

CREATE INDEX IF NOT EXISTS exchange_rates_lookup
  ON public.exchange_rates (base_currency, quote_currency, rate_date DESC);

ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exchange_rates_admin_all" ON public.exchange_rates;
CREATE POLICY "exchange_rates_admin_all" ON public.exchange_rates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "exchange_rates_read_authenticated" ON public.exchange_rates;
CREATE POLICY "exchange_rates_read_authenticated" ON public.exchange_rates
  FOR SELECT TO authenticated USING (true);

-- ── L1: Currency columns on transactional tables ────────────────────────────
DO $$ BEGIN
  -- invoices
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='invoices') THEN
    ALTER TABLE public.invoices
      ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'SEK',
      ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,8) NOT NULL DEFAULT 1;
  END IF;
  -- quotes
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='quotes') THEN
    ALTER TABLE public.quotes
      ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'SEK',
      ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,8) NOT NULL DEFAULT 1;
  END IF;
  -- orders
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='orders') THEN
    ALTER TABLE public.orders
      ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'SEK',
      ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,8) NOT NULL DEFAULT 1;
  END IF;
  -- purchase_orders
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='purchase_orders') THEN
    ALTER TABLE public.purchase_orders
      ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'SEK',
      ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,8) NOT NULL DEFAULT 1;
  END IF;
  -- expenses
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='expenses') THEN
    ALTER TABLE public.expenses
      ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'SEK',
      ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,8) NOT NULL DEFAULT 1;
  END IF;
END $$;

-- ── L2: Rate lookup helper ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_exchange_rate(
  p_base TEXT,
  p_quote TEXT,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate NUMERIC;
BEGIN
  IF p_base = p_quote THEN
    RETURN 1;
  END IF;

  -- Direct match (most recent on or before p_date)
  SELECT rate INTO v_rate
  FROM public.exchange_rates
  WHERE base_currency = p_base AND quote_currency = p_quote AND rate_date <= p_date
  ORDER BY rate_date DESC LIMIT 1;

  IF v_rate IS NOT NULL THEN
    RETURN v_rate;
  END IF;

  -- Inverse match
  SELECT 1.0 / rate INTO v_rate
  FROM public.exchange_rates
  WHERE base_currency = p_quote AND quote_currency = p_base AND rate_date <= p_date
  ORDER BY rate_date DESC LIMIT 1;

  RETURN COALESCE(v_rate, 1);
END;
$$;

-- ── L2: Set/upsert rate (MCP-callable) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_exchange_rate(
  p_base TEXT,
  p_quote TEXT,
  p_rate NUMERIC,
  p_rate_date DATE DEFAULT CURRENT_DATE,
  p_source TEXT DEFAULT 'manual'
)
RETURNS public.exchange_rates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.exchange_rates;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'set_exchange_rate: admin role required';
  END IF;

  INSERT INTO public.exchange_rates (base_currency, quote_currency, rate, rate_date, source)
  VALUES (p_base, p_quote, p_rate, p_rate_date, p_source)
  ON CONFLICT (base_currency, quote_currency, rate_date)
  DO UPDATE SET rate = EXCLUDED.rate, source = EXCLUDED.source
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- MCP wrapper (platform arg conventions: ignores _caller_api_key_id etc)
CREATE OR REPLACE FUNCTION public.mcp_set_exchange_rate(args jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.exchange_rates;
BEGIN
  v_row := public.set_exchange_rate(
    (args->>'base_currency')::TEXT,
    (args->>'quote_currency')::TEXT,
    (args->>'rate')::NUMERIC,
    COALESCE((args->>'rate_date')::DATE, CURRENT_DATE),
    COALESCE(args->>'source', 'manual')
  );
  RETURN to_jsonb(v_row);
END;
$$;

-- ── L3: Revalue open AR/AP balances ─────────────────────────────────────────
-- Posts unrealized FX gain (3960) / loss (7960) per BAS 2024 for open invoices/POs
-- in non-base currencies, comparing booked rate vs current rate.
CREATE OR REPLACE FUNCTION public.revalue_open_balances(
  p_revaluation_date DATE DEFAULT CURRENT_DATE,
  p_fx_gain_account TEXT DEFAULT '3960',
  p_fx_loss_account TEXT DEFAULT '7960',
  p_ar_account TEXT DEFAULT '1510',
  p_ap_account TEXT DEFAULT '2440'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base TEXT;
  v_total_gain NUMERIC := 0;
  v_total_loss NUMERIC := 0;
  v_ar_lines INT := 0;
  v_ap_lines INT := 0;
  v_ar_delta NUMERIC := 0;
  v_ap_delta NUMERIC := 0;
  v_je_id UUID;
  rec RECORD;
  v_current_rate NUMERIC;
  v_delta NUMERIC;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'revalue_open_balances: admin role required';
  END IF;

  SELECT code INTO v_base FROM public.currencies WHERE is_base = true LIMIT 1;
  IF v_base IS NULL THEN
    RAISE EXCEPTION 'No base currency configured';
  END IF;

  -- Compute AR delta (open invoices in non-base currency)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='invoices') THEN
    FOR rec IN
      SELECT id, currency, exchange_rate, total_cents, status
      FROM public.invoices
      WHERE currency <> v_base
        AND COALESCE(status, 'draft') NOT IN ('paid', 'cancelled', 'void')
    LOOP
      v_current_rate := public.get_exchange_rate(rec.currency, v_base, p_revaluation_date);
      -- delta in base currency = amount * (current_rate - booked_rate)
      v_delta := (rec.total_cents::NUMERIC / 100.0) * (v_current_rate - rec.exchange_rate);
      v_ar_delta := v_ar_delta + v_delta;
      v_ar_lines := v_ar_lines + 1;
    END LOOP;
  END IF;

  -- Compute AP delta (open POs / vendor bills in non-base currency)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='purchase_orders') THEN
    FOR rec IN
      SELECT id, currency, exchange_rate, COALESCE(total_cents, 0) as total_cents, status
      FROM public.purchase_orders
      WHERE currency <> v_base
        AND COALESCE(status, 'draft') NOT IN ('paid', 'cancelled', 'closed')
    LOOP
      v_current_rate := public.get_exchange_rate(rec.currency, v_base, p_revaluation_date);
      v_delta := (rec.total_cents::NUMERIC / 100.0) * (v_current_rate - rec.exchange_rate);
      -- AP delta is opposite sign (liability)
      v_ap_delta := v_ap_delta - v_delta;
      v_ap_lines := v_ap_lines + 1;
    END LOOP;
  END IF;

  IF v_ar_delta > 0 THEN v_total_gain := v_total_gain + v_ar_delta; ELSE v_total_loss := v_total_loss + ABS(v_ar_delta); END IF;
  IF v_ap_delta > 0 THEN v_total_gain := v_total_gain + v_ap_delta; ELSE v_total_loss := v_total_loss + ABS(v_ap_delta); END IF;

  -- Create journal entry only if there's anything to book and accounting tables exist
  IF (v_total_gain > 0.01 OR v_total_loss > 0.01)
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entries')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entry_lines') THEN

    INSERT INTO public.journal_entries (entry_date, description, source, status)
    VALUES (
      p_revaluation_date,
      format('FX revaluation %s — AR %s lines, AP %s lines', p_revaluation_date, v_ar_lines, v_ap_lines),
      'fx_revaluation',
      'posted'
    )
    RETURNING id INTO v_je_id;

    -- AR delta
    IF ABS(v_ar_delta) > 0.01 THEN
      IF v_ar_delta > 0 THEN
        -- AR increased in base value → Dt 1510, Cr 3960 (gain)
        INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description)
        VALUES
          (v_je_id, p_ar_account, ROUND(v_ar_delta * 100), 0, 'FX revaluation AR'),
          (v_je_id, p_fx_gain_account, 0, ROUND(v_ar_delta * 100), 'Unrealized FX gain on AR');
      ELSE
        INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description)
        VALUES
          (v_je_id, p_fx_loss_account, ROUND(ABS(v_ar_delta) * 100), 0, 'Unrealized FX loss on AR'),
          (v_je_id, p_ar_account, 0, ROUND(ABS(v_ar_delta) * 100), 'FX revaluation AR');
      END IF;
    END IF;

    -- AP delta
    IF ABS(v_ap_delta) > 0.01 THEN
      IF v_ap_delta > 0 THEN
        INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description)
        VALUES
          (v_je_id, p_ap_account, ROUND(v_ap_delta * 100), 0, 'FX revaluation AP'),
          (v_je_id, p_fx_gain_account, 0, ROUND(v_ap_delta * 100), 'Unrealized FX gain on AP');
      ELSE
        INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description)
        VALUES
          (v_je_id, p_fx_loss_account, ROUND(ABS(v_ap_delta) * 100), 0, 'Unrealized FX loss on AP'),
          (v_je_id, p_ap_account, 0, ROUND(ABS(v_ap_delta) * 100), 'FX revaluation AP');
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'revaluation_date', p_revaluation_date,
    'base_currency', v_base,
    'ar_lines', v_ar_lines,
    'ap_lines', v_ap_lines,
    'ar_delta', v_ar_delta,
    'ap_delta', v_ap_delta,
    'total_gain', v_total_gain,
    'total_loss', v_total_loss,
    'journal_entry_id', v_je_id
  );
END;
$$;

-- MCP wrapper
CREATE OR REPLACE FUNCTION public.mcp_revalue_open_balances(args jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.revalue_open_balances(
    COALESCE((args->>'revaluation_date')::DATE, CURRENT_DATE),
    COALESCE(args->>'fx_gain_account', '3960'),
    COALESCE(args->>'fx_loss_account', '7960'),
    COALESCE(args->>'ar_account', '1510'),
    COALESCE(args->>'ap_account', '2440')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_exchange_rate(TEXT, TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_exchange_rate(TEXT, TEXT, NUMERIC, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_set_exchange_rate(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revalue_open_balances(DATE, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_revalue_open_balances(jsonb) TO authenticated;

-- updated_at trigger for currencies
DROP TRIGGER IF EXISTS currencies_updated_at ON public.currencies;
CREATE TRIGGER currencies_updated_at
  BEFORE UPDATE ON public.currencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();