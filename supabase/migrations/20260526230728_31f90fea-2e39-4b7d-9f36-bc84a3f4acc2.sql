
CREATE OR REPLACE FUNCTION public.seed_demo_ecommerce(p_run_id uuid, p_scenario text DEFAULT 'default')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int := 0;
  v_order_id uuid;
  v_item_id uuid;
  v_product record;
  v_products_arr uuid[];
  v_product_ids uuid[];
  v_product_names text[];
  v_product_prices int[];
  rec record;
  v_idx int;
  v_pick_id uuid;
  v_pick_name text;
  v_pick_price int;
  v_total int;
BEGIN
  -- Collect up to 6 active products with a price
  SELECT array_agg(id), array_agg(name), array_agg(price_cents)
    INTO v_product_ids, v_product_names, v_product_prices
  FROM (
    SELECT id, name, price_cents
    FROM public.products
    WHERE is_active = true AND price_cents > 0
    ORDER BY sort_order NULLS LAST, created_at
    LIMIT 6
  ) p;

  IF v_product_ids IS NULL OR array_length(v_product_ids, 1) = 0 THEN
    RETURN jsonb_build_object('table', 'orders', 'inserted', 0, 'skipped', 'no active products');
  END IF;

  FOR rec IN
    SELECT * FROM (VALUES
      ('Anna Lindberg',    'anna.lindberg@example.demo',   'unfulfilled', 0),
      ('Erik Johansson',   'erik.j@example.demo',          'picked',      1),
      ('Sofia Bergström',  'sofia.b@example.demo',         'packed',      2),
      ('Lars Nilsson',     'lars.nilsson@example.demo',    'shipped',     4),
      ('Maria Andersson',  'maria.a@example.demo',         'delivered',   7)
    ) AS t(customer, email, fulfillment, days_ago)
  LOOP
    -- Pick a product (round-robin)
    v_idx := (v_count % array_length(v_product_ids, 1)) + 1;
    v_pick_id := v_product_ids[v_idx];
    v_pick_name := v_product_names[v_idx];
    v_pick_price := v_product_prices[v_idx];
    v_total := v_pick_price * (1 + (v_count % 2)); -- qty 1 or 2

    INSERT INTO public.orders (
      customer_email, customer_name, status, fulfillment_status,
      total_cents, currency, metadata, created_at,
      picked_at, packed_at, shipped_at, delivered_at,
      tracking_number, tracking_url
    ) VALUES (
      rec.email, rec.customer, 'paid', rec.fulfillment,
      v_total, 'SEK',
      jsonb_build_object('demo', true, 'scenario', p_scenario, 'sandbox', true),
      now() - (rec.days_ago || ' days')::interval,
      CASE WHEN rec.fulfillment IN ('picked','packed','shipped','delivered') THEN now() - (rec.days_ago || ' days')::interval + interval '2 hours' ELSE NULL END,
      CASE WHEN rec.fulfillment IN ('packed','shipped','delivered') THEN now() - (rec.days_ago || ' days')::interval + interval '4 hours' ELSE NULL END,
      CASE WHEN rec.fulfillment IN ('shipped','delivered') THEN now() - (rec.days_ago || ' days')::interval + interval '1 day' ELSE NULL END,
      CASE WHEN rec.fulfillment = 'delivered' THEN now() - (rec.days_ago || ' days')::interval + interval '3 days' ELSE NULL END,
      CASE WHEN rec.fulfillment IN ('shipped','delivered') THEN 'DEMO-' || lpad((v_count+1)::text, 6, '0') ELSE NULL END,
      CASE WHEN rec.fulfillment IN ('shipped','delivered') THEN 'https://tracking.demo/DEMO-' || lpad((v_count+1)::text, 6, '0') ELSE NULL END
    ) RETURNING id INTO v_order_id;

    PERFORM public._demo_register_row(p_run_id, 'orders', v_order_id);

    -- Order item (order_items cascade-deletes with order, but track for transparency)
    INSERT INTO public.order_items (order_id, product_id, product_name, quantity, price_cents)
    VALUES (v_order_id, v_pick_id, v_pick_name, 1 + (v_count % 2), v_pick_price)
    RETURNING id INTO v_item_id;

    PERFORM public._demo_register_row(p_run_id, 'order_items', v_item_id);

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('table', 'orders', 'inserted', v_count);
END $$;

GRANT EXECUTE ON FUNCTION public.seed_demo_ecommerce(uuid, text) TO authenticated, service_role;

-- Update dispatcher to support 'ecommerce'
CREATE OR REPLACE FUNCTION public.seed_module_demo(
  p_module text,
  p_scenario text DEFAULT 'default'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run_id uuid;
  v_result jsonb;
  v_module text;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can seed demo data';
  END IF;

  v_module := lower(trim(p_module));

  INSERT INTO public.demo_runs(module, scenario, created_by)
  VALUES (v_module, p_scenario, auth.uid())
  RETURNING id INTO v_run_id;

  CASE v_module
    WHEN 'crm'       THEN v_result := public.seed_demo_crm(v_run_id, p_scenario);
    WHEN 'quotes'    THEN v_result := public.seed_demo_quotes(v_run_id, p_scenario);
    WHEN 'invoices'  THEN v_result := public.seed_demo_invoices(v_run_id, p_scenario);
    WHEN 'expenses'  THEN v_result := public.seed_demo_expenses(v_run_id, p_scenario);
    WHEN 'ecommerce' THEN v_result := public.seed_demo_ecommerce(v_run_id, p_scenario);
    ELSE
      DELETE FROM public.demo_runs WHERE id = v_run_id;
      RAISE EXCEPTION 'Unsupported module: %. Supported: crm, quotes, invoices, expenses, ecommerce', v_module;
  END CASE;

  RETURN jsonb_build_object(
    'success', true,
    'run_id', v_run_id,
    'module', v_module,
    'scenario', p_scenario,
    'detail', v_result
  );
END $$;
