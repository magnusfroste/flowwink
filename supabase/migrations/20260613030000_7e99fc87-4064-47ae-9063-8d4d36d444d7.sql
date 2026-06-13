-- Shipping: weight-based rates + dimensional weight
-- (docs/parity/capabilities/shipping.json#weight_rate_calc + #dimensional_weight).
-- Adds shipping_rates (per-carrier weight bands) and calc_shipping_rate(), which bills
-- on max(actual weight, dimensional weight). Dimensional weight (grams) =
-- L×W×H(cm) / dim_divisor × 1000  (divisor in cm³/kg; default 5000 — the common courier
-- value). No external carrier APIs — pure deterministic calculation. Idempotent.

CREATE TABLE IF NOT EXISTS "public"."shipping_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "carrier_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "min_weight_grams" integer DEFAULT 0 NOT NULL,
    "max_weight_grams" integer,                       -- NULL = no upper bound
    "price_cents" integer NOT NULL,
    "currency" "text" DEFAULT 'SEK' NOT NULL,
    "dim_divisor" integer,                            -- per-rate override (cm³/kg); NULL → caller/default
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "shipping_rates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shipping_rates_carrier_id_fkey"
      FOREIGN KEY ("carrier_id") REFERENCES "public"."carriers"("id") ON DELETE CASCADE,
    CONSTRAINT "shipping_rates_weight_band" CHECK ("max_weight_grams" IS NULL OR "max_weight_grams" >= "min_weight_grams"),
    CONSTRAINT "shipping_rates_dim_divisor_positive" CHECK ("dim_divisor" IS NULL OR "dim_divisor" > 0)
);

CREATE INDEX IF NOT EXISTS "shipping_rates_carrier_idx" ON "public"."shipping_rates" ("carrier_id");

ALTER TABLE "public"."shipping_rates" OWNER TO "postgres";

DROP TRIGGER IF EXISTS "update_shipping_rates_updated_at" ON "public"."shipping_rates";
CREATE TRIGGER "update_shipping_rates_updated_at"
  BEFORE UPDATE ON "public"."shipping_rates"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

ALTER TABLE "public"."shipping_rates" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage shipping rates" ON "public"."shipping_rates";
CREATE POLICY "Admins manage shipping rates" ON "public"."shipping_rates"
  USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));
DROP POLICY IF EXISTS "Public can view active shipping rates" ON "public"."shipping_rates";
CREATE POLICY "Public can view active shipping rates" ON "public"."shipping_rates"
  FOR SELECT USING ("is_active" = true);

GRANT ALL ON TABLE "public"."shipping_rates" TO "anon", "authenticated", "service_role";

-- calc_shipping_rate: pick the cheapest active band for a carrier that contains the
-- BILLABLE weight = max(actual grams, dimensional grams). Dimensions optional.
CREATE OR REPLACE FUNCTION "public"."calc_shipping_rate"(
  "p_carrier_id" "uuid",
  "p_weight_grams" integer,
  "p_length_cm" numeric DEFAULT NULL,
  "p_width_cm" numeric DEFAULT NULL,
  "p_height_cm" numeric DEFAULT NULL,
  "p_dim_divisor" integer DEFAULT 5000
) RETURNS "jsonb"
LANGUAGE "plpgsql" STABLE
SET "search_path" TO 'public'
AS $$
DECLARE
  v_dim_grams integer := 0;
  v_billable integer;
  v_rate RECORD;
  v_divisor integer := COALESCE(NULLIF(p_dim_divisor, 0), 5000);
BEGIN
  IF p_carrier_id IS NULL OR p_weight_grams IS NULL OR p_weight_grams < 0 THEN
    RAISE EXCEPTION 'carrier_id and a non-negative weight_grams are required';
  END IF;

  -- Dimensional weight only when all three dimensions are given
  IF p_length_cm IS NOT NULL AND p_width_cm IS NOT NULL AND p_height_cm IS NOT NULL THEN
    v_dim_grams := ROUND(p_length_cm * p_width_cm * p_height_cm / v_divisor * 1000)::int;
  END IF;

  v_billable := GREATEST(p_weight_grams, v_dim_grams);

  SELECT id, name, price_cents, currency,
         COALESCE(dim_divisor, v_divisor) AS used_divisor
  INTO v_rate
  FROM shipping_rates
  WHERE carrier_id = p_carrier_id
    AND is_active
    AND v_billable >= min_weight_grams
    AND (max_weight_grams IS NULL OR v_billable <= max_weight_grams)
  ORDER BY price_cents ASC, min_weight_grams DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'no_matching_rate',
      'billable_grams', v_billable,
      'actual_grams', p_weight_grams,
      'dimensional_grams', v_dim_grams
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'rate_id', v_rate.id,
    'rate_name', v_rate.name,
    'price_cents', v_rate.price_cents,
    'currency', v_rate.currency,
    'billable_grams', v_billable,
    'actual_grams', p_weight_grams,
    'dimensional_grams', v_dim_grams,
    'billed_on', CASE WHEN v_dim_grams > p_weight_grams THEN 'dimensional' ELSE 'actual' END
  );
END;
$$;

ALTER FUNCTION "public"."calc_shipping_rate"("uuid",integer,numeric,numeric,numeric,integer) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."calc_shipping_rate"("uuid",integer,numeric,numeric,numeric,integer) TO "anon", "authenticated", "service_role";

-- manage_shipping_rate: CRUD on weight bands. Writer-gated.
CREATE OR REPLACE FUNCTION "public"."manage_shipping_rate"(
  "p_action" "text",
  "p_rate_id" "uuid" DEFAULT NULL,
  "p_carrier_id" "uuid" DEFAULT NULL,
  "p_name" "text" DEFAULT NULL,
  "p_min_weight_grams" integer DEFAULT NULL,
  "p_max_weight_grams" integer DEFAULT NULL,
  "p_price_cents" integer DEFAULT NULL,
  "p_currency" "text" DEFAULT NULL,
  "p_dim_divisor" integer DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
  v_id uuid;
  v_result jsonb;
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
    INSERT INTO shipping_rates (carrier_id, name, min_weight_grams, max_weight_grams, price_cents, currency, dim_divisor)
    VALUES (p_carrier_id, p_name, COALESCE(p_min_weight_grams, 0), p_max_weight_grams, p_price_cents,
            COALESCE(p_currency, 'SEK'), p_dim_divisor)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'rate_id', v_id);

  ELSIF p_action = 'update' THEN
    IF p_rate_id IS NULL THEN RAISE EXCEPTION 'rate_id is required'; END IF;
    UPDATE shipping_rates SET
      name = COALESCE(p_name, name),
      min_weight_grams = COALESCE(p_min_weight_grams, min_weight_grams),
      max_weight_grams = COALESCE(p_max_weight_grams, max_weight_grams),
      price_cents = COALESCE(p_price_cents, price_cents),
      currency = COALESCE(p_currency, currency),
      dim_divisor = COALESCE(p_dim_divisor, dim_divisor)
    WHERE id = p_rate_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rate % not found', p_rate_id; END IF;
    RETURN jsonb_build_object('success', true, 'rate_id', p_rate_id);

  ELSIF p_action = 'delete' THEN
    IF p_rate_id IS NULL THEN RAISE EXCEPTION 'rate_id is required'; END IF;
    DELETE FROM shipping_rates WHERE id = p_rate_id;
    RETURN jsonb_build_object('success', true, 'deleted', p_rate_id);

  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|create|update|delete', p_action;
  END IF;
END;
$$;

ALTER FUNCTION "public"."manage_shipping_rate"("text","uuid","uuid","text",integer,integer,integer,"text",integer) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."manage_shipping_rate"("text","uuid","uuid","text",integer,integer,integer,"text",integer) TO "anon", "authenticated", "service_role";
