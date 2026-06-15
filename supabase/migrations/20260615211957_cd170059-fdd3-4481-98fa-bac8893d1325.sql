-- Fix: revalue_open_balances crashed on an invalid enum value.
--
-- The open-balance filters compared the `status` enum directly against a literal
-- list that includes 'void' (AR) / 'closed' (AP). invoice_status has no 'void'
-- (draft|sent|paid|cancelled|overdue), so Postgres tried to cast 'void' to the enum
-- and threw "invalid input value for enum invoice_status: void" on EVERY call —
-- surfaced live by an external MCP sweep (the local container never hit it).
--
-- Fix: compare status::text (matches the safe pattern already used elsewhere), so a
-- non-existent label is simply a no-match instead of a cast error. Idempotent
-- (CREATE OR REPLACE). Only the two COALESCE(status, …) lines changed.

CREATE OR REPLACE FUNCTION public.revalue_open_balances(p_revaluation_date date DEFAULT CURRENT_DATE, p_fx_gain_account text DEFAULT '3960'::text, p_fx_loss_account text DEFAULT '7960'::text, p_ar_account text DEFAULT '1510'::text, p_ap_account text DEFAULT '2440'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
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
        AND COALESCE(status::text, 'draft') NOT IN ('paid', 'cancelled', 'void')
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
        AND COALESCE(status::text, 'draft') NOT IN ('paid', 'cancelled', 'closed')
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
$function$;
