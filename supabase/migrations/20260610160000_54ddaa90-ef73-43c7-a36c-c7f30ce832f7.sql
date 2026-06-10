-- EPIC-01 issue 01.4 (docs/parity/epics/EPIC-01-product-variants-order-lines.md):
-- POS sells variants. Adds variant_id to pos_sale_lines and upgrades
-- record_pos_sale_v2 (SAME signature — no skill-schema drift) to:
--   • accept variant_id per line, validate it belongs to the product and is active
--   • resolve unit price when omitted: product.price_cents + variant.price_delta_cents
--   • default the line SKU from the variant
--   • include variant_id in the stock.movement event
-- Behaviour without variant_id is unchanged. Idempotent.

ALTER TABLE "public"."pos_sale_lines"
  ADD COLUMN IF NOT EXISTS "variant_id" "uuid";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "information_schema"."table_constraints"
    WHERE "constraint_name" = 'pos_sale_lines_variant_id_fkey'
      AND "table_name" = 'pos_sale_lines'
  ) THEN
    ALTER TABLE "public"."pos_sale_lines"
      ADD CONSTRAINT "pos_sale_lines_variant_id_fkey"
      FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "pos_sale_lines_variant_id_idx"
  ON "public"."pos_sale_lines" ("variant_id") WHERE "variant_id" IS NOT NULL;

CREATE OR REPLACE FUNCTION "public"."record_pos_sale_v2"("p_register_id" "uuid", "p_session_id" "uuid", "p_lines" "jsonb", "p_payments" "jsonb", "p_customer_id" "uuid" DEFAULT NULL::"uuid", "p_customer_email" "text" DEFAULT NULL::"text", "p_discount_cents" integer DEFAULT 0, "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
  v_tax_rate numeric;
  v_product record;
  v_variant record;
  v_payment_summary text;
  v_unit_price integer;
  v_sku text;
  v_variant_id uuid;
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

  -- Single pass: resolve + validate every line into a temp table (avoids the
  -- old duplicated calc/insert loops drifting apart), accumulate totals.
  DROP TABLE IF EXISTS _pos_lines;
  CREATE TEMP TABLE _pos_lines (
    product_id uuid, variant_id uuid, product_name text, sku text,
    quantity numeric, unit_price_cents integer, discount_cents integer,
    tax_rate numeric, line_total_cents integer
  ) ON COMMIT DROP;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_tax_rate := COALESCE((v_line->>'tax_rate')::numeric, v_default_tax, 0);
    v_unit_price := (v_line->>'unit_price_cents')::integer;
    v_sku := v_line->>'sku';
    v_variant_id := NULLIF(v_line->>'variant_id','')::uuid;
    v_product := NULL;
    v_variant := NULL;

    -- If product_id given, ensure it's POS-enabled
    IF (v_line->>'product_id') IS NOT NULL THEN
      SELECT id, name, available_in_pos, price_cents INTO v_product
        FROM public.products WHERE id = (v_line->>'product_id')::uuid;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % not found', v_line->>'product_id';
      END IF;
      IF NOT v_product.available_in_pos THEN
        RAISE EXCEPTION 'Product % is not available in POS', v_product.name;
      END IF;
    END IF;

    -- If variant_id given, validate it and resolve price/SKU from it
    IF v_variant_id IS NOT NULL THEN
      SELECT id, product_id, sku, price_delta_cents, is_active INTO v_variant
        FROM public.product_variants WHERE id = v_variant_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant % not found', v_variant_id;
      END IF;
      IF NOT v_variant.is_active THEN
        RAISE EXCEPTION 'Variant % is not active', COALESCE(v_variant.sku, v_variant_id::text);
      END IF;
      IF v_product.id IS NOT NULL AND v_variant.product_id <> v_product.id THEN
        RAISE EXCEPTION 'Variant % does not belong to product %', v_variant_id, v_product.id;
      END IF;
      v_sku := COALESCE(v_sku, v_variant.sku);
      IF v_unit_price IS NULL AND v_product.id IS NOT NULL THEN
        v_unit_price := v_product.price_cents + v_variant.price_delta_cents;
      END IF;
    END IF;

    -- Fall back to product base price when price omitted
    IF v_unit_price IS NULL AND v_product.id IS NOT NULL THEN
      v_unit_price := v_product.price_cents;
    END IF;
    IF v_unit_price IS NULL THEN
      RAISE EXCEPTION 'Line "%" needs unit_price_cents or a product/variant to resolve the price from',
        COALESCE(v_line->>'product_name', '?');
    END IF;

    v_line_subtotal := (v_unit_price * (v_line->>'quantity')::numeric)::integer
                       - COALESCE((v_line->>'discount_cents')::integer, 0);
    v_line_tax := round(v_line_subtotal * v_tax_rate / 100.0)::integer;

    v_subtotal := v_subtotal + v_line_subtotal;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_subtotal + v_line_tax;

    INSERT INTO _pos_lines VALUES (
      NULLIF(v_line->>'product_id','')::uuid,
      v_variant_id,
      v_line->>'product_name',
      v_sku,
      (v_line->>'quantity')::numeric,
      v_unit_price,
      COALESCE((v_line->>'discount_cents')::integer, 0),
      v_tax_rate,
      v_line_subtotal + v_line_tax
    );
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

  -- Insert lines from the resolved set
  INSERT INTO public.pos_sale_lines (
    sale_id, product_id, variant_id, product_name, sku, quantity,
    unit_price_cents, discount_cents, tax_rate, line_total_cents
  )
  SELECT v_sale_id, product_id, variant_id, product_name, sku, quantity,
         unit_price_cents, discount_cents, tax_rate, line_total_cents
  FROM _pos_lines;

  -- Stock events (fire-and-forget — stock module listens)
  FOR v_line IN
    SELECT to_jsonb(l) FROM _pos_lines l WHERE l.product_id IS NOT NULL
  LOOP
    PERFORM public.emit_platform_event(
      'stock.movement',
      jsonb_build_object(
        'product_id', v_line->>'product_id',
        'variant_id', v_line->>'variant_id',
        'quantity', -((v_line->>'quantity')::numeric),
        'reason', 'pos_sale',
        'reference_type', 'pos_sale',
        'reference_id', v_sale_id,
        'sku', v_line->>'sku'
      ),
      'pos'
    );
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
