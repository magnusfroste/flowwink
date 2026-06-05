
CREATE OR REPLACE FUNCTION public.seed_demo_pos(p_run_id uuid, p_scenario text DEFAULT 'default')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reg_id uuid;
  v_sess_id uuid;
  v_sale_id uuid;
  v_id uuid;
  v_count_sales int := 0;
  v_lines int := 0;
  v_prod RECORD;
  i int;
  v_methods text[] := ARRAY['cash','card','swish'];
  v_total int;
  v_line_count int;
  v_qty int;
  v_unit int;
  v_line_total int;
BEGIN
  SELECT id INTO v_reg_id FROM pos_registers WHERE active = true LIMIT 1;
  IF v_reg_id IS NULL THEN
    -- create a permanent demo register (NOT registered for demo cleanup —
    -- pos_sales.register_id lacks CASCADE so deleting registers fails)
    INSERT INTO pos_registers (name, location, currency, default_tax_rate, active)
    VALUES ('Demo Register #1', 'Main store', 'SEK', 25.00, true)
    RETURNING id INTO v_reg_id;
  END IF;

  INSERT INTO pos_sessions (register_id, cashier_name, status, opening_cash_cents, opened_at, closed_at, closing_cash_cents, expected_cash_cents, total_sales_cents, sales_count)
  VALUES (v_reg_id, 'Demo Cashier', 'closed', 100000, now() - interval '8 hours', now() - interval '30 minutes', 250000, 247500, 0, 0)
  RETURNING id INTO v_sess_id;
  PERFORM _demo_register_row(p_run_id, 'pos_sessions', v_sess_id);

  FOR i IN 1..8 LOOP
    v_total := 0;
    v_line_count := 1 + floor(random()*3)::int;

    INSERT INTO pos_sales (register_id, session_id, cashier_id, subtotal_cents, tax_cents, discount_cents, total_cents, currency, payment_method, status, created_at)
    VALUES (v_reg_id, v_sess_id, NULL, 0, 0, 0, 0, 'SEK', v_methods[1 + floor(random()*3)::int], 'completed', now() - (i * interval '45 minutes'))
    RETURNING id INTO v_sale_id;
    PERFORM _demo_register_row(p_run_id, 'pos_sales', v_sale_id);
    v_count_sales := v_count_sales + 1;

    FOR v_prod IN SELECT id, name, COALESCE(price_cents, 9900) AS p FROM products ORDER BY random() LIMIT v_line_count LOOP
      v_qty := 1 + floor(random()*3)::int;
      v_unit := v_prod.p;
      v_line_total := v_qty * v_unit;
      v_total := v_total + v_line_total;
      INSERT INTO pos_sale_lines (sale_id, product_id, product_name, quantity, unit_price_cents, tax_rate, line_total_cents)
      VALUES (v_sale_id, v_prod.id, v_prod.name, v_qty, v_unit, 25.00, v_line_total)
      RETURNING id INTO v_id;
      PERFORM _demo_register_row(p_run_id, 'pos_sale_lines', v_id);
      v_lines := v_lines + 1;
    END LOOP;

    IF v_total = 0 THEN
      v_total := 9900;
      INSERT INTO pos_sale_lines (sale_id, product_name, quantity, unit_price_cents, tax_rate, line_total_cents)
      VALUES (v_sale_id, 'Walk-in item', 1, 9900, 25.00, 9900)
      RETURNING id INTO v_id;
      PERFORM _demo_register_row(p_run_id, 'pos_sale_lines', v_id);
      v_lines := v_lines + 1;
    END IF;

    UPDATE pos_sales SET subtotal_cents = round(v_total/1.25)::int, tax_cents = v_total - round(v_total/1.25)::int, total_cents = v_total WHERE id = v_sale_id;

    INSERT INTO pos_payments (sale_id, method, amount_cents)
    VALUES (v_sale_id, v_methods[1 + floor(random()*3)::int], v_total)
    RETURNING id INTO v_id;
    PERFORM _demo_register_row(p_run_id, 'pos_payments', v_id);
  END LOOP;

  UPDATE pos_sessions SET total_sales_cents = (SELECT COALESCE(SUM(total_cents),0) FROM pos_sales WHERE session_id = v_sess_id),
                          sales_count = (SELECT COUNT(*) FROM pos_sales WHERE session_id = v_sess_id)
  WHERE id = v_sess_id;

  RETURN jsonb_build_object('sales', v_count_sales, 'lines', v_lines);
END $$;
