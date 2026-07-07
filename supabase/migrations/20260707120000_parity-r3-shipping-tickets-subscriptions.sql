-- ── Parity round 3: shipping findings + tickets/subscriptions gaps ──────────
-- Actioned OpenClaw beta_test_findings (verified live 2026-07-07):
--   e796bf16 SUB-003  invoices lack subscription_id/lead_id links
--   30ca516d          no destination-based shipping rules (country scoping)
--   2c96fe71          overlapping shipping weight bands allowed silently
--   4b85909f          ship_picking accepts free-text carrier (no validation)
-- Plus parity prep: tickets full-text search + tags + canned responses.
-- Forward-dated + idempotent (Lovable migration ledger skips backdated files).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. SUB-003: invoices ← subscriptions/leads linkage
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "public"."invoices"
  ADD COLUMN IF NOT EXISTS "subscription_id" uuid REFERENCES "public"."subscriptions"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_invoices_subscription_id"
  ON "public"."invoices" ("subscription_id") WHERE "subscription_id" IS NOT NULL;

-- Backfill: both generators stamp "... subscription <uuid>" into notes.
UPDATE "public"."invoices" i
SET "subscription_id" = s."id"
FROM "public"."subscriptions" s
WHERE i."subscription_id" IS NULL
  AND i."notes" ~ 'subscription [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
  AND s."id"::text = (regexp_match(i."notes", 'subscription ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'))[1];

-- Backfill lead linkage for subscription invoices by customer email.
UPDATE "public"."invoices" i
SET "lead_id" = l."id"
FROM (
  SELECT DISTINCT ON (lower("email")) "id", lower("email") AS em
  FROM "public"."leads" ORDER BY lower("email"), "created_at" DESC
) l
WHERE i."lead_id" IS NULL
  AND i."subscription_id" IS NOT NULL
  AND l.em = lower(i."customer_email");

-- generate_subscription_invoice: stamp subscription_id + lead_id on insert.
CREATE OR REPLACE FUNCTION "public"."generate_subscription_invoice"("_subscription_id" uuid, "_tax_rate" numeric DEFAULT NULL::numeric, "_due_in_days" integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _sub public.subscriptions%ROWTYPE; _invoice_id uuid; _invoice_number text; _subtotal integer; _tax integer; _total integer; _rate numeric; _due integer; _due_date date; _base date; _next date; _line jsonb; _status invoice_status; _lead_id uuid;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) OR auth.uid() IS NULL) THEN RAISE EXCEPTION 'Only admins or system can generate subscription invoices'; END IF;
  SELECT * INTO _sub FROM public.subscriptions WHERE id = _subscription_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription % not found', _subscription_id; END IF;
  IF _sub.provider <> 'manual' THEN RAISE EXCEPTION 'generate_subscription_invoice only applies to manual subscriptions (got %)', _sub.provider; END IF;
  IF _sub.status <> 'active'::subscription_status THEN RAISE EXCEPTION 'Cannot invoice subscription in status %', _sub.status; END IF;
  IF _sub.next_invoice_date IS NOT NULL AND _sub.next_invoice_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Subscription % is not due: next invoice date is % (already invoiced through the current period)', _subscription_id, _sub.next_invoice_date;
  END IF;
  _subtotal := _sub.unit_amount_cents * COALESCE(_sub.quantity, 1);
  _rate := COALESCE(_tax_rate, 0.25);
  _tax := round(_subtotal * _rate)::integer;
  _total := _subtotal + _tax;
  _due := COALESCE(_due_in_days, CASE _sub.payment_terms WHEN 'invoice_30' THEN 30 WHEN 'invoice_14' THEN 14 WHEN 'invoice_7' THEN 7 ELSE 30 END);
  _due_date := CURRENT_DATE + _due;
  _invoice_number := 'SUB-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(floor(random()*100000)::text, 5, '0');
  _line := jsonb_build_array(jsonb_build_object('description', _sub.product_name || ' (' || to_char(COALESCE(_sub.current_period_start, now()), 'YYYY-MM-DD') || ' → ' || to_char(COALESCE(_sub.current_period_end, now()), 'YYYY-MM-DD') || ')', 'quantity', _sub.quantity, 'unit_price_cents', _sub.unit_amount_cents, 'total_cents', _subtotal));
  _status := CASE WHEN COALESCE(_sub.auto_finalize, false) THEN 'sent'::invoice_status ELSE 'draft'::invoice_status END;
  -- SUB-003: link the invoice to its subscription and (best-effort) CRM lead.
  SELECT id INTO _lead_id FROM public.leads WHERE lower(email) = lower(_sub.customer_email) ORDER BY created_at DESC LIMIT 1;
  INSERT INTO public.invoices (invoice_number, customer_email, customer_name, status, line_items, subtotal_cents, tax_rate, tax_cents, total_cents, currency, due_date, issue_date, payment_terms, notes, sent_at, subscription_id, lead_id)
  VALUES (_invoice_number, _sub.customer_email, _sub.customer_name, _status, _line, _subtotal, _rate, _tax, _total, upper(_sub.currency), _due_date, CURRENT_DATE, 'Net ' || _due || ' days', 'Generated from subscription ' || _sub.id::text || CASE WHEN _sub.po_number IS NOT NULL THEN E'\nPO: ' || _sub.po_number ELSE '' END, CASE WHEN _status = 'sent'::invoice_status THEN now() ELSE NULL END, _subscription_id, _lead_id)
  RETURNING id INTO _invoice_id;
  _base := COALESCE(_sub.next_invoice_date, CURRENT_DATE);
  _next := advance_billing_date(_base, _sub.billing_interval, _sub.billing_interval_count);
  UPDATE public.subscriptions SET last_invoice_id = _invoice_id, current_period_start = COALESCE(current_period_end, now()), current_period_end = _next::timestamptz, next_invoice_date = _next, updated_at = now() WHERE id = _subscription_id;
  PERFORM public.emit_platform_event('subscription.invoiced', jsonb_build_object('subscription_id', _subscription_id, 'invoice_id', _invoice_id, 'invoice_number', _invoice_number, 'total_cents', _total, 'currency', upper(_sub.currency), 'auto_finalized', COALESCE(_sub.auto_finalize, false), 'status', _status), 'generate_subscription_invoice');
  IF _status = 'sent'::invoice_status THEN
    PERFORM public.emit_platform_event('invoice.finalized', jsonb_build_object('invoice_id', _invoice_id, 'invoice_number', _invoice_number, 'subscription_id', _subscription_id, 'total_cents', _total, 'currency', upper(_sub.currency), 'source', 'subscription_auto_finalize'), 'generate_subscription_invoice');
  END IF;
  RETURN jsonb_build_object('ok', true, 'invoice_id', _invoice_id, 'invoice_number', _invoice_number, 'status', _status, 'auto_finalized', COALESCE(_sub.auto_finalize, false), 'total_cents', _total, 'next_invoice_date', _next);
END $function$;

-- change_subscription: stamp subscription_id + lead_id on the adjustment invoice.
CREATE OR REPLACE FUNCTION "public"."change_subscription"("p_subscription_id" uuid, "p_new_quantity" integer DEFAULT NULL::integer, "p_new_unit_amount_cents" integer DEFAULT NULL::integer, "p_generate_adjustment" boolean DEFAULT true, "p_tax_rate" numeric DEFAULT 0.25)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _sub public.subscriptions%ROWTYPE; _old_per_period bigint; _new_per_period bigint; _delta bigint;
  _fraction numeric; _prorated bigint; _invoice_id uuid; _invoice_number text; _tax integer; _total integer;
  _line jsonb; _total_days numeric; _remaining_days numeric; _lead_id uuid;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) OR auth.uid() IS NULL) THEN
    RAISE EXCEPTION 'Only admins or system can change subscriptions';
  END IF;
  IF p_new_quantity IS NULL AND p_new_unit_amount_cents IS NULL THEN RAISE EXCEPTION 'Provide p_new_quantity and/or p_new_unit_amount_cents'; END IF;
  IF p_new_quantity IS NOT NULL AND p_new_quantity < 1 THEN RAISE EXCEPTION 'quantity must be >= 1 (cancel instead of zeroing)'; END IF;
  SELECT * INTO _sub FROM public.subscriptions WHERE id = p_subscription_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription % not found', p_subscription_id; END IF;
  IF _sub.provider <> 'manual' THEN RAISE EXCEPTION 'change_subscription only applies to manual subscriptions (got %); card subscriptions change at the provider', _sub.provider; END IF;
  IF _sub.status <> 'active'::subscription_status THEN RAISE EXCEPTION 'Cannot change subscription in status %', _sub.status; END IF;
  _old_per_period := _sub.unit_amount_cents::bigint * COALESCE(_sub.quantity, 1);
  _new_per_period := COALESCE(p_new_unit_amount_cents, _sub.unit_amount_cents)::bigint * COALESCE(p_new_quantity, _sub.quantity, 1);
  _delta := _new_per_period - _old_per_period;
  IF _sub.current_period_start IS NOT NULL AND _sub.current_period_end IS NOT NULL AND _sub.current_period_end > _sub.current_period_start THEN
    _total_days := EXTRACT(EPOCH FROM (_sub.current_period_end - _sub.current_period_start)) / 86400.0;
    _remaining_days := GREATEST(EXTRACT(EPOCH FROM (_sub.current_period_end - now())) / 86400.0, 0);
    _fraction := LEAST(_remaining_days / _total_days, 1);
  ELSE _fraction := 0; END IF;
  _prorated := round(_delta * _fraction);
  UPDATE public.subscriptions SET quantity = COALESCE(p_new_quantity, quantity), unit_amount_cents = COALESCE(p_new_unit_amount_cents, unit_amount_cents),
     metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('last_change', jsonb_build_object('at', now(), 'old_per_period_cents', _old_per_period, 'new_per_period_cents', _new_per_period, 'prorated_cents', _prorated, 'fraction', round(_fraction::numeric, 4)))
   WHERE id = p_subscription_id;
  IF _prorated > 0 AND p_generate_adjustment THEN
    _tax := round(_prorated * COALESCE(p_tax_rate, 0.25))::integer; _total := _prorated + _tax;
    _invoice_number := 'SUB-ADJ-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(floor(random()*100000)::text, 5, '0');
    _line := jsonb_build_array(jsonb_build_object('description', 'Prorated adjustment: ' || _sub.product_name || ' (' || round(_fraction * 100) || '% of period remaining)', 'quantity', 1, 'unit_price_cents', _prorated, 'total_cents', _prorated));
    SELECT id INTO _lead_id FROM public.leads WHERE lower(email) = lower(_sub.customer_email) ORDER BY created_at DESC LIMIT 1;
    INSERT INTO public.invoices (invoice_number, customer_email, customer_name, status, line_items, subtotal_cents, tax_rate, tax_cents, total_cents, currency, due_date, issue_date, payment_terms, notes, subscription_id, lead_id)
    VALUES (_invoice_number, _sub.customer_email, _sub.customer_name, 'draft'::invoice_status, _line, _prorated::integer, COALESCE(p_tax_rate, 0.25), _tax, _total, upper(_sub.currency), CURRENT_DATE + 30, CURRENT_DATE, 'Net 30 days', 'Prorated adjustment for subscription ' || _sub.id::text, p_subscription_id, _lead_id)
    RETURNING id INTO _invoice_id;
  END IF;
  RETURN jsonb_build_object('success', true, 'subscription_id', p_subscription_id, 'old_per_period_cents', _old_per_period, 'new_per_period_cents', _new_per_period, 'remaining_fraction', round(_fraction::numeric, 4), 'prorated_cents', _prorated, 'adjustment_invoice_id', _invoice_id, 'credit_cents', CASE WHEN _prorated < 0 THEN -_prorated ELSE 0 END, 'note', CASE WHEN _prorated < 0 THEN 'Downgrade credit recorded on subscription metadata — apply on next invoice' ELSE NULL END);
END $function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Shipping: destination scoping (30ca516d) + overlap validation (2c96fe71)
-- ═══════════════════════════════════════════════════════════════════════════

-- NULL countries = rate applies worldwide (backward compatible).
ALTER TABLE "public"."shipping_rates"
  ADD COLUMN IF NOT EXISTS "countries" text[];

COMMENT ON COLUMN "public"."shipping_rates"."countries" IS
  'ISO-3166 alpha-2 codes this rate serves (uppercased). NULL = all destinations.';

-- Replace (added params change the signature — drop old overload to avoid
-- PostgREST PGRST203 ambiguity).
DROP FUNCTION IF EXISTS "public"."manage_shipping_rate"(text, uuid, uuid, text, integer, integer, integer, text, integer);

CREATE OR REPLACE FUNCTION "public"."manage_shipping_rate"(
  "p_action" text,
  "p_rate_id" uuid DEFAULT NULL,
  "p_carrier_id" uuid DEFAULT NULL,
  "p_name" text DEFAULT NULL,
  "p_min_weight_grams" integer DEFAULT NULL,
  "p_max_weight_grams" integer DEFAULT NULL,
  "p_price_cents" integer DEFAULT NULL,
  "p_currency" text DEFAULT NULL,
  "p_dim_divisor" integer DEFAULT NULL,
  "p_countries" text[] DEFAULT NULL,
  "p_allow_overlap" boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
  v_id uuid; v_result jsonb; v_row shipping_rates%ROWTYPE;
  v_min integer; v_max integer; v_currency text; v_carrier uuid; v_countries text[];
BEGIN
  IF p_action IN ('create','update','delete') AND NOT v_writer THEN
    RAISE EXCEPTION 'Only admins can modify shipping rates';
  END IF;
  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.min_weight_grams), '[]'::jsonb) INTO v_result
    FROM shipping_rates r
    WHERE p_carrier_id IS NULL OR r.carrier_id = p_carrier_id;
    RETURN jsonb_build_object('success', true, 'rates', v_result);
  ELSIF p_action = 'create' THEN
    IF p_carrier_id IS NULL OR p_name IS NULL OR p_price_cents IS NULL THEN
      RAISE EXCEPTION 'carrier_id, name and price_cents are required';
    END IF;
    v_carrier := p_carrier_id;
    v_min := COALESCE(p_min_weight_grams, 0);
    v_max := p_max_weight_grams;
    v_currency := COALESCE(p_currency, 'SEK');
    v_countries := (SELECT array_agg(upper(btrim(c))) FROM unnest(p_countries) c WHERE btrim(c) <> '');
    -- 2c96fe71: reject silently-overlapping bands for the same carrier +
    -- currency + intersecting destination scope. p_allow_overlap=true is the
    -- deliberate escape hatch (e.g. an express tier over the same weights).
    IF NOT p_allow_overlap AND EXISTS (
      SELECT 1 FROM shipping_rates r
      WHERE r.carrier_id = v_carrier AND r.is_active
        AND upper(r.currency) = upper(v_currency)
        AND (r.countries IS NULL OR v_countries IS NULL OR r.countries && v_countries)
        AND r.min_weight_grams <= COALESCE(v_max, 2147483647)
        AND COALESCE(r.max_weight_grams, 2147483647) >= v_min
    ) THEN
      RAISE EXCEPTION 'Weight band %–% g overlaps an existing active rate for this carrier/currency/destination. Adjust the range, deactivate the other rate, or pass p_allow_overlap=true for a deliberate secondary tier.', v_min, COALESCE(v_max::text, '∞');
    END IF;
    INSERT INTO shipping_rates (carrier_id, name, min_weight_grams, max_weight_grams, price_cents, currency, dim_divisor, countries)
    VALUES (v_carrier, p_name, v_min, v_max, p_price_cents, v_currency, p_dim_divisor, v_countries)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'rate_id', v_id);
  ELSIF p_action = 'update' THEN
    IF p_rate_id IS NULL THEN RAISE EXCEPTION 'rate_id is required'; END IF;
    SELECT * INTO v_row FROM shipping_rates WHERE id = p_rate_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rate % not found', p_rate_id; END IF;
    v_carrier := v_row.carrier_id;
    v_min := COALESCE(p_min_weight_grams, v_row.min_weight_grams);
    v_max := COALESCE(p_max_weight_grams, v_row.max_weight_grams);
    v_currency := COALESCE(p_currency, v_row.currency);
    v_countries := COALESCE((SELECT array_agg(upper(btrim(c))) FROM unnest(p_countries) c WHERE btrim(c) <> ''), v_row.countries);
    IF NOT p_allow_overlap AND v_row.is_active AND EXISTS (
      SELECT 1 FROM shipping_rates r
      WHERE r.carrier_id = v_carrier AND r.is_active AND r.id <> p_rate_id
        AND upper(r.currency) = upper(v_currency)
        AND (r.countries IS NULL OR v_countries IS NULL OR r.countries && v_countries)
        AND r.min_weight_grams <= COALESCE(v_max, 2147483647)
        AND COALESCE(r.max_weight_grams, 2147483647) >= v_min
    ) THEN
      RAISE EXCEPTION 'Weight band %–% g overlaps an existing active rate for this carrier/currency/destination. Adjust the range, deactivate the other rate, or pass p_allow_overlap=true for a deliberate secondary tier.', v_min, COALESCE(v_max::text, '∞');
    END IF;
    UPDATE shipping_rates SET
      name = COALESCE(p_name, name),
      min_weight_grams = v_min,
      max_weight_grams = v_max,
      price_cents = COALESCE(p_price_cents, price_cents),
      currency = v_currency,
      dim_divisor = COALESCE(p_dim_divisor, dim_divisor),
      countries = v_countries
    WHERE id = p_rate_id;
    RETURN jsonb_build_object('success', true, 'rate_id', p_rate_id);
  ELSIF p_action = 'delete' THEN
    IF p_rate_id IS NULL THEN RAISE EXCEPTION 'rate_id is required'; END IF;
    DELETE FROM shipping_rates WHERE id = p_rate_id;
    RETURN jsonb_build_object('success', true, 'deleted', p_rate_id);
  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|create|update|delete', p_action;
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."manage_shipping_rate"(text, uuid, uuid, text, integer, integer, integer, text, integer, text[], boolean) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."manage_shipping_rate"(text, uuid, uuid, text, integer, integer, integer, text, integer, text[], boolean) TO "service_role";

-- calc_shipping_rate: destination-aware band selection.
DROP FUNCTION IF EXISTS "public"."calc_shipping_rate"(uuid, integer, numeric, numeric, numeric, integer);

CREATE OR REPLACE FUNCTION "public"."calc_shipping_rate"(
  "p_carrier_id" uuid,
  "p_weight_grams" integer,
  "p_length_cm" numeric DEFAULT NULL,
  "p_width_cm" numeric DEFAULT NULL,
  "p_height_cm" numeric DEFAULT NULL,
  "p_dim_divisor" integer DEFAULT 5000,
  "p_country" text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_dim_grams integer := 0;
  v_billable integer;
  v_rate RECORD;
  v_divisor integer := COALESCE(NULLIF(p_dim_divisor, 0), 5000);
BEGIN
  IF p_carrier_id IS NULL OR p_weight_grams IS NULL OR p_weight_grams < 0 THEN
    RAISE EXCEPTION 'carrier_id and a non-negative weight_grams are required';
  END IF;
  IF p_length_cm IS NOT NULL AND p_width_cm IS NOT NULL AND p_height_cm IS NOT NULL THEN
    v_dim_grams := ROUND(p_length_cm * p_width_cm * p_height_cm / v_divisor * 1000)::int;
  END IF;
  v_billable := GREATEST(p_weight_grams, v_dim_grams);
  SELECT id, name, price_cents, currency, countries,
         COALESCE(dim_divisor, v_divisor) AS used_divisor
  INTO v_rate
  FROM shipping_rates
  WHERE carrier_id = p_carrier_id
    AND is_active
    AND v_billable >= min_weight_grams
    AND (max_weight_grams IS NULL OR v_billable <= max_weight_grams)
    AND (countries IS NULL OR p_country IS NULL OR upper(btrim(p_country)) = ANY (countries))
  ORDER BY price_cents ASC, min_weight_grams DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_matching_rate',
      'billable_grams', v_billable, 'actual_grams', p_weight_grams, 'dimensional_grams', v_dim_grams,
      'country', upper(btrim(COALESCE(p_country, ''))));
  END IF;
  RETURN jsonb_build_object('success', true, 'rate_id', v_rate.id, 'rate_name', v_rate.name,
    'price_cents', v_rate.price_cents, 'currency', v_rate.currency,
    'billable_grams', v_billable, 'actual_grams', p_weight_grams, 'dimensional_grams', v_dim_grams,
    'billed_on', CASE WHEN v_dim_grams > p_weight_grams THEN 'dimensional' ELSE 'actual' END,
    'countries', to_jsonb(v_rate.countries));
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."calc_shipping_rate"(uuid, integer, numeric, numeric, numeric, integer, text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."calc_shipping_rate"(uuid, integer, numeric, numeric, numeric, integer, text) TO "service_role";

-- list_shipping_options: destination-aware storefront rate shopping.
DROP FUNCTION IF EXISTS "public"."list_shipping_options"(integer, "text");

CREATE OR REPLACE FUNCTION "public"."list_shipping_options"(
  "p_weight_grams" integer,
  "p_currency" "text" DEFAULT NULL,
  "p_country" "text" DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "sql" STABLE SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
  SELECT jsonb_build_object(
    'success', true,
    'weight_grams', p_weight_grams,
    'country', upper(btrim(COALESCE(p_country, ''))),
    'options', COALESCE(jsonb_agg(o ORDER BY (o->>'price_cents')::int ASC), '[]'::jsonb)
  )
  FROM (
    SELECT DISTINCT ON (c.id) jsonb_build_object(
      'carrier_id', c.id,
      'carrier_code', c.code,
      'carrier_name', c.name,
      'rate_id', r.id,
      'rate_name', r.name,
      'price_cents', r.price_cents,
      'currency', r.currency
    ) AS o
    FROM carriers c
    JOIN shipping_rates r ON r.carrier_id = c.id
    WHERE c.is_active
      AND r.is_active
      AND p_weight_grams >= r.min_weight_grams
      AND (r.max_weight_grams IS NULL OR p_weight_grams <= r.max_weight_grams)
      AND (p_currency IS NULL OR upper(r.currency) = upper(p_currency))
      AND (r.countries IS NULL OR p_country IS NULL OR upper(btrim(p_country)) = ANY (r.countries))
    ORDER BY c.id, r.price_cents ASC, r.min_weight_grams DESC
  ) opts;
$$;

ALTER FUNCTION "public"."list_shipping_options"(integer, "text", "text") OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."list_shipping_options"(integer, "text", "text") TO "anon";
GRANT EXECUTE ON FUNCTION "public"."list_shipping_options"(integer, "text", "text") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."list_shipping_options"(integer, "text", "text") TO "service_role";

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. ship_picking: validate carrier against carriers table (4b85909f)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "public"."picking_orders"
  ADD COLUMN IF NOT EXISTS "carrier_id" uuid REFERENCES "public"."carriers"("id") ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION "public"."ship_picking"("p_picking_order_id" uuid, "p_tracking_number" text DEFAULT NULL::text, "p_carrier" text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_po RECORD; v_line RECORD; v_consumed INT := 0;
  v_carrier_id uuid; v_carrier_code text; v_active_count int;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'employee'))) THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  SELECT * INTO v_po FROM public.picking_orders WHERE id = p_picking_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Picking order % not found', p_picking_order_id; END IF;
  IF v_po.status = 'shipped' THEN RETURN jsonb_build_object('success', true, 'already_shipped', true); END IF;
  IF v_po.status = 'cancelled' THEN RAISE EXCEPTION 'Cannot ship cancelled picking_order'; END IF;
  -- 4b85909f: resolve p_carrier against the carriers table (id, code or name,
  -- case-insensitive). Unknown values are rejected while active carriers
  -- exist; when none are configured yet, free text passes (fail forward).
  IF p_carrier IS NOT NULL AND btrim(p_carrier) <> '' THEN
    SELECT c.id, c.code INTO v_carrier_id, v_carrier_code
    FROM public.carriers c
    WHERE c.is_active
      AND (c.id::text = btrim(p_carrier) OR lower(c.code) = lower(btrim(p_carrier)) OR lower(c.name) = lower(btrim(p_carrier)))
    LIMIT 1;
    IF v_carrier_id IS NULL THEN
      SELECT count(*) INTO v_active_count FROM public.carriers WHERE is_active;
      IF v_active_count > 0 THEN
        RAISE EXCEPTION 'Unknown carrier "%" — pass an active carrier id, code or name. Active carriers: %', p_carrier,
          (SELECT string_agg(code, ', ' ORDER BY code) FROM public.carriers WHERE is_active);
      END IF;
    END IF;
  END IF;
  FOR v_line IN SELECT * FROM public.picking_lines WHERE picking_order_id = p_picking_order_id AND status = 'picked' LOOP
    IF v_line.reservation_id IS NOT NULL THEN
      BEGIN PERFORM public.consume_reservation(v_line.reservation_id, v_line.qty_picked); v_consumed := v_consumed + 1;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata) VALUES ('picking.consume_failed', 'picking_line', v_line.id, auth.uid(), jsonb_build_object('error', SQLERRM));
      END;
    END IF;
  END LOOP;
  UPDATE public.picking_orders SET status = 'shipped', shipped_at = now(),
    tracking_number = COALESCE(p_tracking_number, tracking_number),
    carrier = COALESCE(v_carrier_code, p_carrier, carrier),
    carrier_id = COALESCE(v_carrier_id, carrier_id)
  WHERE id = p_picking_order_id;
  IF v_po.order_id IS NOT NULL THEN UPDATE public.orders SET status = 'shipped', updated_at = now() WHERE id = v_po.order_id; END IF;
  BEGIN PERFORM public.emit_platform_event('picking.shipped', jsonb_build_object('picking_order_id', p_picking_order_id, 'order_id', v_po.order_id, 'tracking_number', p_tracking_number, 'carrier_id', v_carrier_id, 'consumed_lines', v_consumed), 'pick_pack');
  EXCEPTION WHEN OTHERS THEN NULL; END;
  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
  VALUES ('picking.shipped', 'picking_order', p_picking_order_id, auth.uid(), jsonb_build_object('order_id', v_po.order_id, 'tracking_number', p_tracking_number, 'carrier_id', v_carrier_id, 'consumed', v_consumed));
  RETURN jsonb_build_object('success', true, 'picking_order_id', p_picking_order_id, 'consumed_lines', v_consumed, 'carrier_id', v_carrier_id, 'carrier_code', v_carrier_code);
END; $function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Tickets: tags + full-text search + canned responses (parity prep)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "public"."tickets"
  ADD COLUMN IF NOT EXISTS "tags" text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS "idx_tickets_tags" ON "public"."tickets" USING gin ("tags");

CREATE INDEX IF NOT EXISTS "idx_tickets_fts" ON "public"."tickets"
  USING gin (to_tsvector('simple', coalesce("subject", '') || ' ' || coalesce("description", '')));

CREATE OR REPLACE FUNCTION "public"."search_tickets"(
  "p_query" text,
  "p_status" text DEFAULT NULL,
  "p_limit" integer DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_result jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'employee')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  IF p_query IS NULL OR btrim(p_query) = '' THEN
    RAISE EXCEPTION 'p_query is required';
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(t) - 'rank'), '[]'::jsonb) INTO v_result FROM (
    SELECT id, subject, status, priority, category, contact_email, contact_name,
           assigned_to, tags, sla_deadline, created_at,
           ts_rank(
             to_tsvector('simple', coalesce(subject,'') || ' ' || coalesce(description,'')),
             websearch_to_tsquery('simple', p_query)
           ) AS rank
    FROM tickets
    WHERE (p_status IS NULL OR status::text = p_status)
      AND (
        to_tsvector('simple', coalesce(subject,'') || ' ' || coalesce(description,'')) @@ websearch_to_tsquery('simple', p_query)
        OR subject ILIKE '%' || p_query || '%'
        OR coalesce(description, '') ILIKE '%' || p_query || '%'
        OR EXISTS (SELECT 1 FROM unnest(tags) tg WHERE tg ILIKE '%' || p_query || '%')
      )
    ORDER BY rank DESC, created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
  ) t;
  RETURN jsonb_build_object('success', true, 'query', p_query, 'results', v_result);
END; $function$;

GRANT EXECUTE ON FUNCTION "public"."search_tickets"(text, text, integer) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."search_tickets"(text, text, integer) TO "service_role";

-- Canned responses (Odoo: helpdesk canned answers / templates).
CREATE TABLE IF NOT EXISTS "public"."canned_responses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" text NOT NULL,
  "shortcut" text,
  "body_md" text NOT NULL,
  "category" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "usage_count" integer NOT NULL DEFAULT 0,
  "created_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "public"."canned_responses" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage canned responses" ON "public"."canned_responses";
CREATE POLICY "Admins manage canned responses" ON "public"."canned_responses"
  FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Employees read canned responses" ON "public"."canned_responses";
CREATE POLICY "Employees read canned responses" ON "public"."canned_responses"
  FOR SELECT USING (has_role(auth.uid(), 'employee') OR has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS "canned_responses_updated_at" ON "public"."canned_responses";
CREATE TRIGGER "canned_responses_updated_at"
  BEFORE UPDATE ON "public"."canned_responses"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

-- Agent surface for canned responses (rpc: handler — deployable via SQL alone,
-- no edge redeploy needed).
CREATE OR REPLACE FUNCTION "public"."manage_canned_response"(
  "p_action" text,
  "p_id" uuid DEFAULT NULL,
  "p_title" text DEFAULT NULL,
  "p_shortcut" text DEFAULT NULL,
  "p_body_md" text DEFAULT NULL,
  "p_category" text DEFAULT NULL,
  "p_is_active" boolean DEFAULT NULL,
  "p_limit" integer DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
  v_reader boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'employee'));
  v_id uuid; v_result jsonb;
BEGIN
  IF p_action IN ('create','update','delete') AND NOT v_writer THEN
    RAISE EXCEPTION 'Only admins can modify canned responses';
  END IF;
  IF p_action IN ('list','get') AND NOT v_reader THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.title), '[]'::jsonb) INTO v_result
    FROM (SELECT * FROM canned_responses WHERE p_is_active IS NULL OR is_active = p_is_active
          ORDER BY title LIMIT LEAST(GREATEST(COALESCE(p_limit,50),1),200)) c;
    RETURN jsonb_build_object('success', true, 'canned_responses', v_result);
  ELSIF p_action = 'get' THEN
    IF p_id IS NULL THEN RAISE EXCEPTION 'p_id is required'; END IF;
    SELECT to_jsonb(c) INTO v_result FROM canned_responses c WHERE id = p_id;
    IF v_result IS NULL THEN RAISE EXCEPTION 'Canned response % not found', p_id; END IF;
    RETURN jsonb_build_object('success', true, 'canned_response', v_result);
  ELSIF p_action = 'create' THEN
    IF p_title IS NULL OR p_body_md IS NULL THEN RAISE EXCEPTION 'p_title and p_body_md are required'; END IF;
    INSERT INTO canned_responses (title, shortcut, body_md, category, is_active, created_by)
    VALUES (p_title, p_shortcut, p_body_md, p_category, COALESCE(p_is_active, true), auth.uid())
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'id', v_id);
  ELSIF p_action = 'update' THEN
    IF p_id IS NULL THEN RAISE EXCEPTION 'p_id is required'; END IF;
    UPDATE canned_responses SET
      title = COALESCE(p_title, title),
      shortcut = COALESCE(p_shortcut, shortcut),
      body_md = COALESCE(p_body_md, body_md),
      category = COALESCE(p_category, category),
      is_active = COALESCE(p_is_active, is_active)
    WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Canned response % not found', p_id; END IF;
    RETURN jsonb_build_object('success', true, 'id', p_id);
  ELSIF p_action = 'delete' THEN
    IF p_id IS NULL THEN RAISE EXCEPTION 'p_id is required'; END IF;
    DELETE FROM canned_responses WHERE id = p_id;
    RETURN jsonb_build_object('success', true, 'deleted', p_id);
  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|get|create|update|delete', p_action;
  END IF;
END; $function$;

GRANT EXECUTE ON FUNCTION "public"."manage_canned_response"(text, uuid, text, text, text, text, boolean, integer) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."manage_canned_response"(text, uuid, text, text, text, text, boolean, integer) TO "service_role";
