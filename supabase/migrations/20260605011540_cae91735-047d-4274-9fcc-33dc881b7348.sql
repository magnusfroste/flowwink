
CREATE OR REPLACE FUNCTION public.seed_demo_inventory(p_run_id uuid, p_scenario text DEFAULT 'default')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_main_loc uuid;
  v_vendor_loc uuid;
  v_product RECORD;
  v_quant_id uuid;
  v_move_id uuid;
  v_quants int := 0;
  v_moves int := 0;
  v_qty int;
BEGIN
  SELECT id INTO v_main_loc FROM stock_locations WHERE code='WH/MAIN' LIMIT 1;
  SELECT id INTO v_vendor_loc FROM stock_locations WHERE code='WH/VENDORS' LIMIT 1;

  IF v_main_loc IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no main warehouse');
  END IF;

  FOR v_product IN
    SELECT id, name FROM products WHERE is_active = true ORDER BY created_at LIMIT 10
  LOOP
    v_qty := 20 + floor(random()*80)::int;

    INSERT INTO stock_quants (product_id, location_id, quantity, reserved_quantity)
    VALUES (v_product.id, v_main_loc, v_qty, 0)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_quant_id;

    IF v_quant_id IS NOT NULL THEN
      INSERT INTO demo_run_items (run_id, table_name, row_id) VALUES (p_run_id, 'stock_quants', v_quant_id);
      v_quants := v_quants + 1;
    END IF;

    INSERT INTO stock_moves (product_id, quantity, move_type, from_location_id, to_location_id, state, notes, reference_type)
    VALUES (v_product.id, v_qty, 'in', v_vendor_loc, v_main_loc, 'done', 'Demo: initial stock receipt', 'demo-seed')
    RETURNING id INTO v_move_id;
    INSERT INTO demo_run_items (run_id, table_name, row_id) VALUES (p_run_id, 'stock_moves', v_move_id);
    v_moves := v_moves + 1;

    IF random() < 0.5 THEN
      INSERT INTO stock_moves (product_id, quantity, move_type, from_location_id, to_location_id, state, notes, reference_type)
      VALUES (v_product.id, floor(random()*5+1)::int, 'out', v_main_loc, (SELECT id FROM stock_locations WHERE code='WH/CUSTOMERS'), 'done', 'Demo: customer shipment', 'demo-seed')
      RETURNING id INTO v_move_id;
      INSERT INTO demo_run_items (run_id, table_name, row_id) VALUES (p_run_id, 'stock_moves', v_move_id);
      v_moves := v_moves + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('quants', v_quants, 'moves', v_moves);
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_module_demo(p_module text, p_scenario text DEFAULT 'default')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
  v_result jsonb;
BEGIN
  INSERT INTO demo_runs (module, scenario, status) VALUES (p_module, p_scenario, 'running') RETURNING id INTO v_run_id;

  CASE p_module
    WHEN 'crm', 'leads' THEN v_result := seed_demo_crm(v_run_id, p_scenario);
    WHEN 'quotes' THEN v_result := seed_demo_quotes(v_run_id, p_scenario);
    WHEN 'invoices' THEN v_result := seed_demo_invoices(v_run_id, p_scenario);
    WHEN 'expenses' THEN v_result := seed_demo_expenses(v_run_id, p_scenario);
    WHEN 'tickets' THEN v_result := seed_demo_tickets(v_run_id, p_scenario);
    WHEN 'products' THEN v_result := seed_demo_products(v_run_id, p_scenario);
    WHEN 'orders' THEN v_result := seed_demo_orders(v_run_id, p_scenario);
    WHEN 'subscriptions' THEN v_result := seed_demo_subscriptions(v_run_id, p_scenario);
    WHEN 'kb' THEN v_result := seed_demo_kb(v_run_id, p_scenario);
    WHEN 'blog' THEN v_result := seed_demo_blog(v_run_id, p_scenario);
    WHEN 'bookings' THEN v_result := seed_demo_bookings(v_run_id, p_scenario);
    WHEN 'employees' THEN v_result := seed_demo_employees(v_run_id, p_scenario);
    WHEN 'contracts' THEN v_result := seed_demo_contracts(v_run_id, p_scenario);
    WHEN 'companies' THEN v_result := seed_demo_companies(v_run_id, p_scenario);
    WHEN 'deals' THEN v_result := seed_demo_deals(v_run_id, p_scenario);
    WHEN 'recruitment' THEN v_result := seed_demo_recruitment(v_run_id, p_scenario);
    WHEN 'pricelists' THEN v_result := seed_demo_pricelists(v_run_id, p_scenario);
    WHEN 'surveys' THEN v_result := seed_demo_surveys(v_run_id, p_scenario);
    WHEN 'projects' THEN v_result := seed_demo_projects(v_run_id, p_scenario);
    WHEN 'documents' THEN v_result := seed_demo_documents(v_run_id, p_scenario);
    WHEN 'inventory' THEN v_result := seed_demo_inventory(v_run_id, p_scenario);
    ELSE
      UPDATE demo_runs SET status='failed', error='Unknown module: '||p_module, finished_at=now() WHERE id=v_run_id;
      RETURN jsonb_build_object('error', 'Unknown module: '||p_module);
  END CASE;

  UPDATE demo_runs SET status='completed', finished_at=now(), result=v_result WHERE id=v_run_id;
  RETURN jsonb_build_object('run_id', v_run_id, 'result', v_result);
END;
$$;
