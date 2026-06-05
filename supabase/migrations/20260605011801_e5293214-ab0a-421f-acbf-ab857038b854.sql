
CREATE OR REPLACE FUNCTION public.seed_demo_quotes(p_run_id uuid, p_scenario text DEFAULT 'default')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  v_items_count int := 0;
  v_qid uuid;
  v_qnum text;
  v_lead RECORD;
  v_product RECORD;
  v_unit_price bigint;
  v_qty int;
  v_subtotal bigint;
  v_tax bigint;
  v_status text;
  v_statuses text[] := ARRAY['draft','sent','sent','accepted','rejected'];
  v_titles text[] := ARRAY[
    'Implementation package Q1',
    'Annual subscription & support',
    'Audit retainer 6 months',
    'Onboarding & training',
    'Custom integration project'
  ];
  v_idx int := 1;
BEGIN
  FOR v_lead IN
    SELECT l.id, l.name, l.email, c.name AS company_name
    FROM leads l
    LEFT JOIN companies c ON c.id = l.company_id
    WHERE l.email IS NOT NULL
    ORDER BY l.created_at DESC
    LIMIT 5
  LOOP
    v_status := v_statuses[((v_count) % array_length(v_statuses,1)) + 1];
    v_qnum := 'DEMO-Q-'||to_char(now(),'YYYY')||'-'||lpad((v_count+1)::text,4,'0')||'-'||substring(p_run_id::text,1,4);

    INSERT INTO quotes (
      quote_number, status, lead_id,
      customer_name, customer_email, customer_company,
      title, intro_text, terms_text,
      subtotal_cents, tax_cents, total_cents, currency,
      valid_until, notes,
      sent_at, accepted_at, rejected_at
    ) VALUES (
      v_qnum, v_status::quote_status, v_lead.id,
      v_lead.name, v_lead.email, v_lead.company_name,
      v_titles[((v_count) % array_length(v_titles,1)) + 1],
      'Thank you for the opportunity to quote on this engagement.',
      'Payment terms: 30 days net. Quote valid for 30 days.',
      0, 0, 0, 'SEK',
      (now() + interval '30 days')::date,
      'demo:'||p_scenario,
      CASE WHEN v_status IN ('sent','accepted','rejected') THEN now() - interval '7 days' ELSE NULL END,
      CASE WHEN v_status = 'accepted' THEN now() - interval '2 days' ELSE NULL END,
      CASE WHEN v_status = 'rejected' THEN now() - interval '1 day' ELSE NULL END
    )
    RETURNING id INTO v_qid;
    PERFORM _demo_register_row(p_run_id,'quotes',v_qid);
    v_count := v_count + 1;

    v_idx := 0;
    FOR v_product IN
      SELECT id, name, price_cents FROM products WHERE is_active = true ORDER BY random() LIMIT 3
    LOOP
      v_qty := 1 + floor(random()*4)::int;
      v_unit_price := COALESCE(v_product.price_cents, 150000);
      v_subtotal := v_qty * v_unit_price;
      v_tax := (v_subtotal * 0.25)::bigint;

      INSERT INTO quote_items (
        quote_id, position, description, quantity, unit, unit_price_cents,
        tax_rate_pct, line_subtotal_cents, line_tax_cents, line_total_cents, product_id
      ) VALUES (
        v_qid, v_idx, v_product.name, v_qty, 'st', v_unit_price,
        25.00, v_subtotal, v_tax, v_subtotal + v_tax, v_product.id
      );
      v_idx := v_idx + 1;
      v_items_count := v_items_count + 1;
    END LOOP;

    IF v_idx = 0 THEN
      v_unit_price := 75000 + floor(random()*30)::int * 5000;
      v_qty := 1 + floor(random()*3)::int;
      v_subtotal := v_qty * v_unit_price;
      v_tax := (v_subtotal * 0.25)::bigint;
      INSERT INTO quote_items (
        quote_id, position, description, quantity, unit, unit_price_cents,
        tax_rate_pct, line_subtotal_cents, line_tax_cents, line_total_cents
      ) VALUES (
        v_qid, 0, 'Consulting services', v_qty, 'h', v_unit_price,
        25.00, v_subtotal, v_tax, v_subtotal + v_tax
      );
      v_items_count := v_items_count + 1;
    END IF;

    UPDATE quotes SET
      subtotal_cents = COALESCE((SELECT SUM(line_subtotal_cents) FROM quote_items WHERE quote_id = v_qid), 0),
      tax_cents = COALESCE((SELECT SUM(line_tax_cents) FROM quote_items WHERE quote_id = v_qid), 0),
      total_cents = COALESCE((SELECT SUM(line_total_cents) FROM quote_items WHERE quote_id = v_qid), 0)
    WHERE id = v_qid;
  END LOOP;

  RETURN jsonb_build_object('quotes', v_count, 'line_items', v_items_count, 'skipped_reason',
    CASE WHEN v_count = 0 THEN 'no leads found — seed CRM first' ELSE NULL END);
END;
$$;
