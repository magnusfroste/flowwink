-- record_pos_sale_v2: resolve product_name from product_id when the line omits it.
--
-- POS QA 2026-07-09: a line carrying product_id but no product_name crashed with
-- "null value in column product_name of pos_sale_lines violates not-null constraint".
-- The RPC already looked up the product (for the available_in_pos check) but never wrote
-- the name back into the line, and the INSERT took the raw v_line->>'product_name' (NULL).
-- An agent passing the natural key (product_id) should not have to also echo the name.
--
-- Fix: in the line-normalisation loop, when product_name is absent, resolve it from the
-- product (falling back to a 'description' field or 'Item' for ad-hoc lines). Idempotent
-- CREATE OR REPLACE; only the normalisation loop gains the name resolution.
CREATE OR REPLACE FUNCTION public.record_pos_sale_v2(p_register_id uuid, p_session_id uuid, p_lines jsonb, p_payments jsonb, p_customer_id uuid DEFAULT NULL::uuid, p_customer_email text DEFAULT NULL::text, p_discount_cents integer DEFAULT 0, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_sale_id uuid; v_receipt text;
  v_subtotal integer := 0; v_tax integer := 0; v_total integer := 0; v_paid integer := 0;
  v_line jsonb; v_payment jsonb; v_register_currency text; v_default_tax numeric;
  v_line_subtotal integer; v_line_tax integer; v_line_total integer; v_tax_rate numeric;
  v_product record; v_payment_summary text; v_lines jsonb := '[]'::jsonb;
  v_unit integer; v_resolved record; v_pname text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pos_sessions WHERE id = p_session_id AND register_id = p_register_id AND status = 'open') THEN
    RAISE EXCEPTION 'Session % is not open for register %', p_session_id, p_register_id;
  END IF;

  SELECT currency, default_tax_rate INTO v_register_currency, v_default_tax FROM public.pos_registers WHERE id = p_register_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_unit := (v_line->>'unit_price_cents')::integer;
    IF v_unit IS NULL THEN
      IF (v_line->>'product_id') IS NULL THEN RAISE EXCEPTION 'Line without product_id must carry unit_price_cents'; END IF;
      SELECT r.price_cents, r.pricelist_id INTO v_resolved
      FROM public.resolve_pricelist_price((v_line->>'product_id')::uuid, p_customer_id, NULL,
        COALESCE((v_line->>'quantity')::numeric, 1), CURRENT_DATE, v_register_currency) r;
      v_unit := v_resolved.price_cents;
      IF v_unit IS NULL THEN RAISE EXCEPTION 'Could not resolve a price for product %', v_line->>'product_id'; END IF;
      v_line := v_line || jsonb_build_object('unit_price_cents', v_unit, 'pricelist_id', v_resolved.pricelist_id);
    END IF;
    -- Resolve product_name (NOT NULL on pos_sale_lines) from the product when omitted.
    IF (v_line->>'product_name') IS NULL THEN
      IF NULLIF(v_line->>'product_id','') IS NOT NULL THEN
        SELECT name INTO v_pname FROM public.products WHERE id = (v_line->>'product_id')::uuid;
      ELSE
        v_pname := NULL;
      END IF;
      v_line := v_line || jsonb_build_object('product_name', COALESCE(v_pname, v_line->>'description', 'Item'));
    END IF;
    v_lines := v_lines || jsonb_build_array(v_line);
  END LOOP;

  v_receipt := 'R-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((EXTRACT(EPOCH FROM now())::bigint % 100000)::text, 5, '0');

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
  LOOP
    v_tax_rate := COALESCE((v_line->>'tax_rate')::numeric, v_default_tax, 0);
    v_line_subtotal := ((v_line->>'unit_price_cents')::integer * (v_line->>'quantity')::numeric)::integer - COALESCE((v_line->>'discount_cents')::integer, 0);
    v_line_tax := round(v_line_subtotal * v_tax_rate / 100.0)::integer;
    v_line_total := v_line_subtotal + v_line_tax;
    v_subtotal := v_subtotal + v_line_subtotal; v_tax := v_tax + v_line_tax; v_total := v_total + v_line_total;
    IF (v_line->>'product_id') IS NOT NULL THEN
      SELECT id, name, available_in_pos INTO v_product FROM public.products WHERE id = (v_line->>'product_id')::uuid;
      IF NOT FOUND THEN RAISE EXCEPTION 'Product % not found', v_line->>'product_id'; END IF;
      IF NOT v_product.available_in_pos THEN RAISE EXCEPTION 'Product % is not available in POS', v_product.name; END IF;
    END IF;
  END LOOP;

  v_total := v_total - COALESCE(p_discount_cents, 0);
  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments) LOOP v_paid := v_paid + (v_payment->>'amount_cents')::integer; END LOOP;
  IF v_paid < v_total THEN RAISE EXCEPTION 'Insufficient payment: paid %, total %', v_paid, v_total; END IF;

  IF jsonb_array_length(p_payments) > 1 THEN v_payment_summary := 'split'; ELSE v_payment_summary := COALESCE(p_payments->0->>'method', 'cash'); END IF;

  INSERT INTO public.pos_sales (receipt_number, register_id, session_id, customer_id, customer_email, subtotal_cents, tax_cents, discount_cents, total_cents, currency, payment_method, status, metadata)
  VALUES (v_receipt, p_register_id, p_session_id, p_customer_id, p_customer_email, v_subtotal, v_tax, COALESCE(p_discount_cents, 0), v_total, v_register_currency, v_payment_summary, 'completed', p_metadata)
  RETURNING id INTO v_sale_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
  LOOP
    v_tax_rate := COALESCE((v_line->>'tax_rate')::numeric, v_default_tax, 0);
    v_line_subtotal := ((v_line->>'unit_price_cents')::integer * (v_line->>'quantity')::numeric)::integer - COALESCE((v_line->>'discount_cents')::integer, 0);
    v_line_tax := round(v_line_subtotal * v_tax_rate / 100.0)::integer;
    INSERT INTO public.pos_sale_lines (sale_id, product_id, product_name, sku, quantity, unit_price_cents, discount_cents, tax_rate, line_total_cents)
    VALUES (v_sale_id, NULLIF(v_line->>'product_id','')::uuid, v_line->>'product_name', v_line->>'sku', (v_line->>'quantity')::numeric, (v_line->>'unit_price_cents')::integer, COALESCE((v_line->>'discount_cents')::integer, 0), v_tax_rate, v_line_subtotal + v_line_tax);
    IF (v_line->>'product_id') IS NOT NULL THEN
      PERFORM public.emit_platform_event('stock.movement',
        jsonb_build_object('product_id', v_line->>'product_id', 'quantity', -((v_line->>'quantity')::numeric), 'reason', 'pos_sale', 'reference_type', 'pos_sale', 'reference_id', v_sale_id, 'sku', v_line->>'sku'), 'pos');
    END IF;
  END LOOP;

  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
  LOOP
    INSERT INTO public.pos_payments (sale_id, method, amount_cents, reference, metadata)
    VALUES (v_sale_id, v_payment->>'method', (v_payment->>'amount_cents')::integer, v_payment->>'reference', COALESCE(v_payment->'metadata', '{}'::jsonb));
  END LOOP;

  UPDATE public.pos_sessions SET total_sales_cents = total_sales_cents + v_total, sales_count = sales_count + 1 WHERE id = p_session_id;

  RETURN jsonb_build_object('sale_id', v_sale_id, 'receipt_number', v_receipt, 'total_cents', v_total, 'tax_cents', v_tax, 'change_cents', v_paid - v_total);
END;
$function$;
