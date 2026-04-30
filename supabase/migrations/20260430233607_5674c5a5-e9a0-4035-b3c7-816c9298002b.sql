-- =========================================================================
-- POS v2: Odoo-style refactor
-- =========================================================================

-- 1. Products: POS metadata (idempotent)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS available_in_pos boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pos_category_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS barcode text;

CREATE INDEX IF NOT EXISTS idx_products_available_in_pos
  ON public.products(available_in_pos) WHERE available_in_pos = true;
CREATE INDEX IF NOT EXISTS idx_products_barcode
  ON public.products(barcode) WHERE barcode IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_products_barcode
  ON public.products(barcode) WHERE barcode IS NOT NULL;

-- Backfill: products som redan tagged "pos" eller har stock = available
UPDATE public.products
   SET available_in_pos = true
 WHERE available_in_pos = false
   AND is_active = true
   AND track_inventory = true;

-- 2. pos_payments — split tender
CREATE TABLE IF NOT EXISTS public.pos_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.pos_sales(id) ON DELETE CASCADE,
  method text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_payments_method_check
    CHECK (method = ANY (ARRAY['cash','card','swish','klarna','gift_card','invoice','other']))
);

CREATE INDEX IF NOT EXISTS idx_pos_payments_sale ON public.pos_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_pos_payments_method ON public.pos_payments(method);

ALTER TABLE public.pos_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_manage_pos_payments" ON public.pos_payments;
CREATE POLICY "auth_manage_pos_payments"
  ON public.pos_payments
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3. record_pos_sale_v2 — atomic sale with split payments + stock event
CREATE OR REPLACE FUNCTION public.record_pos_sale_v2(
  p_register_id uuid,
  p_session_id uuid,
  p_lines jsonb,            -- [{product_id?, product_name, sku?, quantity, unit_price_cents, discount_cents?, tax_rate?}]
  p_payments jsonb,         -- [{method, amount_cents, reference?}]
  p_customer_id uuid DEFAULT NULL,
  p_customer_email text DEFAULT NULL,
  p_discount_cents integer DEFAULT 0,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id uuid;
  v_receipt text;
  v_subtotal integer := 0;
  v_tax integer := 0;
  v_total integer := 0;
  v_paid integer := 0;
  v_line jsonb;
  v_payment jsonb;
  v_register_currency text;
  v_default_tax numeric;
  v_line_subtotal integer;
  v_line_tax integer;
  v_line_total integer;
  v_tax_rate numeric;
  v_product record;
  v_payment_summary text;
BEGIN
  -- Validate session is open
  IF NOT EXISTS (
    SELECT 1 FROM public.pos_sessions
     WHERE id = p_session_id AND register_id = p_register_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Session % is not open for register %', p_session_id, p_register_id;
  END IF;

  SELECT currency, default_tax_rate
    INTO v_register_currency, v_default_tax
    FROM public.pos_registers WHERE id = p_register_id;

  -- Generate receipt
  v_receipt := 'R-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((EXTRACT(EPOCH FROM now())::bigint % 100000)::text, 5, '0');

  -- Calculate totals + validate products
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_tax_rate := COALESCE((v_line->>'tax_rate')::numeric, v_default_tax, 0);
    v_line_subtotal := ((v_line->>'unit_price_cents')::integer * (v_line->>'quantity')::numeric)::integer
                       - COALESCE((v_line->>'discount_cents')::integer, 0);
    v_line_tax := round(v_line_subtotal * v_tax_rate / 100.0)::integer;
    v_line_total := v_line_subtotal + v_line_tax;

    v_subtotal := v_subtotal + v_line_subtotal;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_total;

    -- If product_id given, ensure it's POS-enabled
    IF (v_line->>'product_id') IS NOT NULL THEN
      SELECT id, name, available_in_pos INTO v_product
        FROM public.products WHERE id = (v_line->>'product_id')::uuid;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % not found', v_line->>'product_id';
      END IF;
      IF NOT v_product.available_in_pos THEN
        RAISE EXCEPTION 'Product % is not available in POS', v_product.name;
      END IF;
    END IF;
  END LOOP;

  v_total := v_total - COALESCE(p_discount_cents, 0);

  -- Validate payments cover the total
  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
  LOOP
    v_paid := v_paid + (v_payment->>'amount_cents')::integer;
  END LOOP;

  IF v_paid < v_total THEN
    RAISE EXCEPTION 'Insufficient payment: paid %, total %', v_paid, v_total;
  END IF;

  -- Determine payment_method label (split if >1)
  IF jsonb_array_length(p_payments) > 1 THEN
    v_payment_summary := 'split';
  ELSE
    v_payment_summary := COALESCE(p_payments->0->>'method', 'cash');
  END IF;

  -- Create sale
  INSERT INTO public.pos_sales (
    receipt_number, register_id, session_id, customer_id, customer_email,
    subtotal_cents, tax_cents, discount_cents, total_cents, currency,
    payment_method, status, metadata
  )
  VALUES (
    v_receipt, p_register_id, p_session_id, p_customer_id, p_customer_email,
    v_subtotal, v_tax, COALESCE(p_discount_cents, 0), v_total, v_register_currency,
    v_payment_summary, 'completed', p_metadata
  )
  RETURNING id INTO v_sale_id;

  -- Insert lines
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_tax_rate := COALESCE((v_line->>'tax_rate')::numeric, v_default_tax, 0);
    v_line_subtotal := ((v_line->>'unit_price_cents')::integer * (v_line->>'quantity')::numeric)::integer
                       - COALESCE((v_line->>'discount_cents')::integer, 0);
    v_line_tax := round(v_line_subtotal * v_tax_rate / 100.0)::integer;

    INSERT INTO public.pos_sale_lines (
      sale_id, product_id, product_name, sku, quantity,
      unit_price_cents, discount_cents, tax_rate, line_total_cents
    )
    VALUES (
      v_sale_id,
      NULLIF(v_line->>'product_id','')::uuid,
      v_line->>'product_name',
      v_line->>'sku',
      (v_line->>'quantity')::numeric,
      (v_line->>'unit_price_cents')::integer,
      COALESCE((v_line->>'discount_cents')::integer, 0),
      v_tax_rate,
      v_line_subtotal + v_line_tax
    );

    -- Stock event (fire-and-forget — stock module listens)
    IF (v_line->>'product_id') IS NOT NULL THEN
      PERFORM public.emit_platform_event(
        'stock.movement',
        jsonb_build_object(
          'product_id', v_line->>'product_id',
          'quantity', -((v_line->>'quantity')::numeric),
          'reason', 'pos_sale',
          'reference_type', 'pos_sale',
          'reference_id', v_sale_id,
          'sku', v_line->>'sku'
        ),
        'pos'
      );
    END IF;
  END LOOP;

  -- Insert payments
  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
  LOOP
    INSERT INTO public.pos_payments (sale_id, method, amount_cents, reference, metadata)
    VALUES (
      v_sale_id,
      v_payment->>'method',
      (v_payment->>'amount_cents')::integer,
      v_payment->>'reference',
      COALESCE(v_payment->'metadata', '{}'::jsonb)
    );
  END LOOP;

  -- Update session totals
  UPDATE public.pos_sessions
     SET total_sales_cents = total_sales_cents + v_total,
         sales_count = sales_count + 1
   WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'sale_id', v_sale_id,
    'receipt_number', v_receipt,
    'total_cents', v_total,
    'tax_cents', v_tax,
    'change_cents', v_paid - v_total
  );
END;
$$;

-- 4. close_pos_session_v2 — batch journal entry per session
CREATE OR REPLACE FUNCTION public.close_pos_session_v2(
  p_session_id uuid,
  p_closing_cash_cents integer,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session record;
  v_register record;
  v_payments_by_method jsonb;
  v_total_sales integer;
  v_total_tax integer;
  v_expected_cash integer;
  v_variance integer;
  v_z_report jsonb;
BEGIN
  SELECT * INTO v_session FROM public.pos_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session % not found', p_session_id;
  END IF;
  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'Session % is not open', p_session_id;
  END IF;

  SELECT * INTO v_register FROM public.pos_registers WHERE id = v_session.register_id;

  -- Aggregate payments by method
  SELECT jsonb_object_agg(method, amt) INTO v_payments_by_method
  FROM (
    SELECT pp.method, COALESCE(SUM(pp.amount_cents), 0) AS amt
      FROM public.pos_payments pp
      JOIN public.pos_sales ps ON ps.id = pp.sale_id
     WHERE ps.session_id = p_session_id AND ps.status = 'completed'
     GROUP BY pp.method
  ) t;

  -- Aggregate totals
  SELECT COALESCE(SUM(total_cents), 0), COALESCE(SUM(tax_cents), 0)
    INTO v_total_sales, v_total_tax
    FROM public.pos_sales
   WHERE session_id = p_session_id AND status = 'completed';

  v_expected_cash := v_session.opening_cash_cents
    + COALESCE((v_payments_by_method->>'cash')::integer, 0);
  v_variance := p_closing_cash_cents - v_expected_cash;

  -- Build Z-report
  v_z_report := jsonb_build_object(
    'session_id', p_session_id,
    'register', v_register.name,
    'cashier', v_session.cashier_name,
    'opened_at', v_session.opened_at,
    'closed_at', now(),
    'opening_cash_cents', v_session.opening_cash_cents,
    'closing_cash_cents', p_closing_cash_cents,
    'expected_cash_cents', v_expected_cash,
    'cash_variance_cents', v_variance,
    'sales_count', v_session.sales_count,
    'total_sales_cents', v_total_sales,
    'total_tax_cents', v_total_tax,
    'payments_by_method', COALESCE(v_payments_by_method, '{}'::jsonb),
    'currency', v_register.currency
  );

  -- Update session
  UPDATE public.pos_sessions
     SET status = 'closed',
         closed_at = now(),
         closing_cash_cents = p_closing_cash_cents,
         expected_cash_cents = v_expected_cash,
         cash_variance_cents = v_variance,
         notes = COALESCE(p_notes, notes),
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('z_report', v_z_report)
   WHERE id = p_session_id;

  -- Emit event for accounting / FlowPilot to pick up and post journal
  PERFORM public.emit_platform_event(
    'pos.session.closed',
    v_z_report,
    'pos'
  );

  RETURN v_z_report;
END;
$$;

-- Allow metadata column on pos_sessions for z-report storage if missing
ALTER TABLE public.pos_sessions
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;