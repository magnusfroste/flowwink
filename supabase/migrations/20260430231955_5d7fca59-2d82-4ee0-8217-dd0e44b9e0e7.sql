
-- ── POS Module ──

-- Registers
CREATE TABLE IF NOT EXISTS public.pos_registers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text,
  currency text NOT NULL DEFAULT 'SEK',
  default_tax_rate numeric(5,2) DEFAULT 25.00,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pos_registers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins_manage_pos_registers" ON public.pos_registers;
CREATE POLICY "admins_manage_pos_registers" ON public.pos_registers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "auth_read_pos_registers" ON public.pos_registers;
CREATE POLICY "auth_read_pos_registers" ON public.pos_registers
  FOR SELECT TO authenticated USING (true);

-- Sessions (shifts)
CREATE TABLE IF NOT EXISTS public.pos_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  register_id uuid NOT NULL REFERENCES public.pos_registers(id) ON DELETE CASCADE,
  cashier_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cashier_name text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opening_cash_cents integer NOT NULL DEFAULT 0,
  closing_cash_cents integer,
  expected_cash_cents integer,
  cash_variance_cents integer,
  total_sales_cents integer NOT NULL DEFAULT 0,
  sales_count integer NOT NULL DEFAULT 0,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_pos_sessions_register ON public.pos_sessions(register_id);
CREATE INDEX IF NOT EXISTS idx_pos_sessions_status ON public.pos_sessions(status);
CREATE INDEX IF NOT EXISTS idx_pos_sessions_cashier ON public.pos_sessions(cashier_id);

ALTER TABLE public.pos_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_manage_pos_sessions" ON public.pos_sessions;
CREATE POLICY "auth_manage_pos_sessions" ON public.pos_sessions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Sales
CREATE TABLE IF NOT EXISTS public.pos_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text UNIQUE,
  register_id uuid NOT NULL REFERENCES public.pos_registers(id),
  session_id uuid REFERENCES public.pos_sessions(id) ON DELETE SET NULL,
  cashier_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_id uuid,
  customer_email text,
  subtotal_cents integer NOT NULL DEFAULT 0,
  tax_cents integer NOT NULL DEFAULT 0,
  discount_cents integer NOT NULL DEFAULT 0,
  total_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SEK',
  payment_method text NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash','card','swish','klarna','gift_card','split','other')),
  payment_details jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','refunded','voided')),
  refund_of uuid REFERENCES public.pos_sales(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_sales_register ON public.pos_sales(register_id);
CREATE INDEX IF NOT EXISTS idx_pos_sales_session ON public.pos_sales(session_id);
CREATE INDEX IF NOT EXISTS idx_pos_sales_created ON public.pos_sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_sales_status ON public.pos_sales(status);

ALTER TABLE public.pos_sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_manage_pos_sales" ON public.pos_sales;
CREATE POLICY "auth_manage_pos_sales" ON public.pos_sales
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Sale lines
CREATE TABLE IF NOT EXISTS public.pos_sale_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.pos_sales(id) ON DELETE CASCADE,
  product_id uuid,
  product_name text NOT NULL,
  sku text,
  quantity numeric(10,2) NOT NULL DEFAULT 1,
  unit_price_cents integer NOT NULL DEFAULT 0,
  discount_cents integer NOT NULL DEFAULT 0,
  tax_rate numeric(5,2),
  line_total_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_sale_lines_sale ON public.pos_sale_lines(sale_id);

ALTER TABLE public.pos_sale_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_manage_pos_sale_lines" ON public.pos_sale_lines;
CREATE POLICY "auth_manage_pos_sale_lines" ON public.pos_sale_lines
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Receipt number sequence
CREATE SEQUENCE IF NOT EXISTS public.pos_receipt_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_pos_receipt_number()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT 'POS-' || LPAD(nextval('public.pos_receipt_seq')::text, 6, '0');
$$;

-- RPC: open session
CREATE OR REPLACE FUNCTION public.open_pos_session(
  p_register_id uuid,
  p_opening_cash_cents integer DEFAULT 0,
  p_cashier_name text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  -- Block if existing open session for same register
  IF EXISTS (SELECT 1 FROM public.pos_sessions WHERE register_id = p_register_id AND status = 'open') THEN
    RAISE EXCEPTION 'Register already has an open session';
  END IF;

  INSERT INTO public.pos_sessions (register_id, cashier_id, cashier_name, opening_cash_cents)
  VALUES (p_register_id, auth.uid(), p_cashier_name, COALESCE(p_opening_cash_cents, 0))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- RPC: close session
CREATE OR REPLACE FUNCTION public.close_pos_session(
  p_session_id uuid,
  p_closing_cash_cents integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_expected integer;
  v_session record;
BEGIN
  SELECT * INTO v_session FROM public.pos_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF v_session.status = 'closed' THEN RAISE EXCEPTION 'Session already closed'; END IF;

  -- Expected = opening + sum of cash sales in this session
  SELECT COALESCE(v_session.opening_cash_cents, 0) + COALESCE(SUM(total_cents), 0)
    INTO v_expected
  FROM public.pos_sales
  WHERE session_id = p_session_id AND status = 'completed' AND payment_method = 'cash';

  UPDATE public.pos_sessions
    SET status = 'closed',
        closing_cash_cents = p_closing_cash_cents,
        expected_cash_cents = v_expected,
        cash_variance_cents = p_closing_cash_cents - v_expected,
        closed_at = now()
    WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'expected_cash_cents', v_expected,
    'closing_cash_cents', p_closing_cash_cents,
    'variance_cents', p_closing_cash_cents - v_expected
  );
END;
$$;

-- RPC: record sale
CREATE OR REPLACE FUNCTION public.record_pos_sale(
  p_register_id uuid,
  p_session_id uuid,
  p_lines jsonb,
  p_payment_method text DEFAULT 'cash',
  p_customer_email text DEFAULT NULL,
  p_discount_cents integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sale_id uuid;
  v_receipt text;
  v_subtotal integer := 0;
  v_tax integer := 0;
  v_total integer := 0;
  v_currency text;
  v_default_tax numeric;
  v_line jsonb;
  v_line_total integer;
  v_line_tax integer;
BEGIN
  SELECT currency, default_tax_rate INTO v_currency, v_default_tax
  FROM public.pos_registers WHERE id = p_register_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Register not found'; END IF;

  v_receipt := public.generate_pos_receipt_number();

  INSERT INTO public.pos_sales
    (receipt_number, register_id, session_id, cashier_id, customer_email,
     payment_method, currency, discount_cents, status)
  VALUES
    (v_receipt, p_register_id, p_session_id, auth.uid(), p_customer_email,
     p_payment_method, v_currency, COALESCE(p_discount_cents, 0), 'completed')
  RETURNING id INTO v_sale_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_line_total := ((v_line->>'quantity')::numeric * (v_line->>'unit_price_cents')::integer)::integer
                    - COALESCE((v_line->>'discount_cents')::integer, 0);
    v_line_tax := ROUND(v_line_total * COALESCE((v_line->>'tax_rate')::numeric, v_default_tax) / 100.0)::integer;

    INSERT INTO public.pos_sale_lines
      (sale_id, product_id, product_name, sku, quantity, unit_price_cents,
       discount_cents, tax_rate, line_total_cents)
    VALUES
      (v_sale_id,
       NULLIF(v_line->>'product_id','')::uuid,
       v_line->>'product_name',
       v_line->>'sku',
       (v_line->>'quantity')::numeric,
       (v_line->>'unit_price_cents')::integer,
       COALESCE((v_line->>'discount_cents')::integer, 0),
       COALESCE((v_line->>'tax_rate')::numeric, v_default_tax),
       v_line_total);

    v_subtotal := v_subtotal + v_line_total;
    v_tax := v_tax + v_line_tax;
  END LOOP;

  v_total := v_subtotal + v_tax - COALESCE(p_discount_cents, 0);

  UPDATE public.pos_sales
    SET subtotal_cents = v_subtotal,
        tax_cents = v_tax,
        total_cents = v_total
    WHERE id = v_sale_id;

  -- Update session totals
  IF p_session_id IS NOT NULL THEN
    UPDATE public.pos_sessions
      SET total_sales_cents = total_sales_cents + v_total,
          sales_count = sales_count + 1
      WHERE id = p_session_id;
  END IF;

  -- Emit event
  BEGIN
    PERFORM public.emit_platform_event('pos.sale_completed',
      jsonb_build_object('sale_id', v_sale_id, 'total_cents', v_total, 'register_id', p_register_id),
      'pos');
  EXCEPTION WHEN undefined_function THEN NULL; END;

  RETURN jsonb_build_object(
    'sale_id', v_sale_id,
    'receipt_number', v_receipt,
    'subtotal_cents', v_subtotal,
    'tax_cents', v_tax,
    'total_cents', v_total
  );
END;
$$;

-- updated_at trigger
DROP TRIGGER IF EXISTS update_pos_registers_updated_at ON public.pos_registers;
CREATE TRIGGER update_pos_registers_updated_at
  BEFORE UPDATE ON public.pos_registers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT EXECUTE ON FUNCTION public.open_pos_session(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_pos_session(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_pos_sale(uuid, uuid, jsonb, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_pos_receipt_number() TO authenticated;
