-- ── Discount codes at checkout (ecommerce.json#discount_codes) ─────────────
-- Plain SMB discount codes: code → percent|fixed reduction, validated
-- server-side in create-checkout, redeemed atomically on successful order.
-- Odoo reference: "Discount Codes" program type (reference card §9);
-- full loyalty stack is a non-goal.
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS "public"."discount_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "type" "text" DEFAULT 'percent' NOT NULL,
    "value" bigint NOT NULL,
    "currency" "text",
    "active" boolean DEFAULT true NOT NULL,
    "valid_from" timestamp with time zone,
    "valid_until" timestamp with time zone,
    "max_uses" integer,
    "use_count" integer DEFAULT 0 NOT NULL,
    "min_order_cents" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "discount_codes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "discount_codes_type_check" CHECK ("type" IN ('percent', 'fixed')),
    CONSTRAINT "discount_codes_value_positive" CHECK ("value" > 0),
    CONSTRAINT "discount_codes_percent_range"
      CHECK ("type" <> 'percent' OR "value" <= 100)
);

-- Case-insensitive uniqueness: "SUMMER10" and "summer10" are the same code.
CREATE UNIQUE INDEX IF NOT EXISTS "discount_codes_code_lower_key"
  ON "public"."discount_codes" (lower("code"));

ALTER TABLE "public"."discount_codes" OWNER TO "postgres";

DROP TRIGGER IF EXISTS "update_discount_codes_updated_at" ON "public"."discount_codes";
CREATE TRIGGER "update_discount_codes_updated_at"
  BEFORE UPDATE ON "public"."discount_codes"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

-- RLS: admin-only. Codes are semi-secret — no public SELECT; visitors
-- validate through the SECURITY DEFINER RPC below instead.
ALTER TABLE "public"."discount_codes" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage discount codes" ON "public"."discount_codes";
CREATE POLICY "Admins can manage discount codes" ON "public"."discount_codes"
  USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

GRANT ALL ON TABLE "public"."discount_codes" TO "anon";
GRANT ALL ON TABLE "public"."discount_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."discount_codes" TO "service_role";

-- ── Orders: record the applied discount so totals stay honest ──────────────
-- total_cents on the order is ALWAYS net of discount; discount_cents records
-- the deduction and discount_code/discount_code_id record its provenance.
ALTER TABLE "public"."orders" ADD COLUMN IF NOT EXISTS "discount_code" "text";
ALTER TABLE "public"."orders" ADD COLUMN IF NOT EXISTS "discount_cents" integer;
ALTER TABLE "public"."orders" ADD COLUMN IF NOT EXISTS "discount_code_id" "uuid";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_discount_code_id_fkey'
  ) THEN
    ALTER TABLE "public"."orders"
      ADD CONSTRAINT "orders_discount_code_id_fkey"
      FOREIGN KEY ("discount_code_id") REFERENCES "public"."discount_codes"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

-- ── RPC: validate_discount_code ─────────────────────────────────────────────
-- Anonymous-safe validation for the public checkout (granted to anon).
-- Never mutates; returns {valid, reason?, code_id?, code?, type?, value?,
-- discount_cents?}. discount_cents is computed against p_order_cents when
-- provided (percent: rounded; fixed: clamped to the order total).

CREATE OR REPLACE FUNCTION "public"."validate_discount_code"(
  "p_code" "text",
  "p_order_cents" bigint DEFAULT NULL,
  "p_currency" "text" DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" STABLE SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  v_dc RECORD;
  v_discount_cents bigint;
BEGIN
  IF p_code IS NULL OR btrim(p_code) = '' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'No code provided');
  END IF;

  SELECT * INTO v_dc FROM discount_codes WHERE lower(code) = lower(btrim(p_code));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Unknown discount code');
  END IF;

  IF NOT v_dc.active THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This code is no longer active');
  END IF;
  IF v_dc.valid_from IS NOT NULL AND now() < v_dc.valid_from THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This code is not valid yet');
  END IF;
  IF v_dc.valid_until IS NOT NULL AND now() > v_dc.valid_until THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This code has expired');
  END IF;
  IF v_dc.max_uses IS NOT NULL AND v_dc.use_count >= v_dc.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This code has reached its usage limit');
  END IF;
  IF v_dc.type = 'fixed' AND v_dc.currency IS NOT NULL AND p_currency IS NOT NULL
     AND upper(v_dc.currency) <> upper(p_currency) THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This code is not valid for this currency');
  END IF;
  IF v_dc.min_order_cents IS NOT NULL AND p_order_cents IS NOT NULL
     AND p_order_cents < v_dc.min_order_cents THEN
    RETURN jsonb_build_object(
      'valid', false,
      'reason', 'Order total is below the minimum for this code',
      'min_order_cents', v_dc.min_order_cents
    );
  END IF;

  IF p_order_cents IS NOT NULL THEN
    IF v_dc.type = 'percent' THEN
      v_discount_cents := round(p_order_cents * v_dc.value / 100.0);
    ELSE
      v_discount_cents := least(v_dc.value, p_order_cents);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'code_id', v_dc.id,
    'code', v_dc.code,
    'type', v_dc.type,
    'value', v_dc.value,
    'currency', v_dc.currency,
    'discount_cents', v_discount_cents
  );
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."validate_discount_code"("text", bigint, "text") TO "anon";
GRANT EXECUTE ON FUNCTION "public"."validate_discount_code"("text", bigint, "text") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."validate_discount_code"("text", bigint, "text") TO "service_role";

-- ── RPC: redeem_discount_code ───────────────────────────────────────────────
-- Atomic use_count increment, guarded against exceeding max_uses. Called by
-- create-checkout (sandbox orders) and stripe-webhook (live orders on paid),
-- both running as service_role. Returns true when a use was consumed.

CREATE OR REPLACE FUNCTION "public"."redeem_discount_code"(
  "p_code_id" "uuid"
) RETURNS boolean
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can redeem discount codes';
  END IF;

  UPDATE discount_codes
  SET use_count = use_count + 1
  WHERE id = p_code_id
    AND (max_uses IS NULL OR use_count < max_uses);
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."redeem_discount_code"("uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."redeem_discount_code"("uuid") TO "service_role";

-- ── RPC: manage_discount_code ───────────────────────────────────────────────
-- Backs the manage_discount_code skill (agent surface). Admin/service_role
-- only — codes are semi-secret, so list/get are gated too (unlike variants).

CREATE OR REPLACE FUNCTION "public"."manage_discount_code"(
  "p_action" "text",
  "p_code_id" "uuid" DEFAULT NULL,
  "p_code" "text" DEFAULT NULL,
  "p_type" "text" DEFAULT NULL,
  "p_value" bigint DEFAULT NULL,
  "p_currency" "text" DEFAULT NULL,
  "p_active" boolean DEFAULT NULL,
  "p_valid_from" timestamp with time zone DEFAULT NULL,
  "p_valid_until" timestamp with time zone DEFAULT NULL,
  "p_max_uses" integer DEFAULT NULL,
  "p_min_order_cents" bigint DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  v_is_writer BOOLEAN := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
  v_dc RECORD;
  v_result JSONB;
  v_new_id UUID;
BEGIN
  IF NOT v_is_writer THEN
    RAISE EXCEPTION 'Only admins can manage discount codes';
  END IF;

  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.created_at DESC), '[]'::jsonb)
    INTO v_result FROM discount_codes d;
    RETURN jsonb_build_object('success', true, 'discount_codes', v_result);

  ELSIF p_action = 'get' THEN
    IF p_code_id IS NULL AND p_code IS NULL THEN
      RAISE EXCEPTION 'code_id or code is required for get';
    END IF;
    SELECT * INTO v_dc FROM discount_codes
    WHERE (p_code_id IS NOT NULL AND id = p_code_id)
       OR (p_code_id IS NULL AND lower(code) = lower(btrim(p_code)));
    IF NOT FOUND THEN RAISE EXCEPTION 'Discount code not found'; END IF;
    RETURN jsonb_build_object('success', true, 'discount_code', to_jsonb(v_dc));

  ELSIF p_action = 'create' THEN
    IF p_code IS NULL OR btrim(p_code) = '' THEN RAISE EXCEPTION 'code is required for create'; END IF;
    IF p_value IS NULL THEN RAISE EXCEPTION 'value is required for create'; END IF;
    IF p_type = 'fixed' AND p_currency IS NULL THEN
      RAISE EXCEPTION 'currency is required for fixed-amount codes';
    END IF;
    INSERT INTO discount_codes
      (code, type, value, currency, active, valid_from, valid_until, max_uses, min_order_cents)
    VALUES
      (btrim(p_code), COALESCE(p_type, 'percent'), p_value,
       CASE WHEN COALESCE(p_type, 'percent') = 'fixed' THEN upper(p_currency) ELSE NULL END,
       COALESCE(p_active, true), p_valid_from, p_valid_until, p_max_uses, p_min_order_cents)
    RETURNING id INTO v_new_id;
    RETURN jsonb_build_object('success', true, 'code_id', v_new_id);

  ELSIF p_action = 'update' THEN
    IF p_code_id IS NULL THEN RAISE EXCEPTION 'code_id is required for update'; END IF;
    UPDATE discount_codes SET
      code = COALESCE(btrim(p_code), code),
      type = COALESCE(p_type, type),
      value = COALESCE(p_value, value),
      currency = CASE WHEN p_currency IS NOT NULL THEN upper(p_currency) ELSE currency END,
      active = COALESCE(p_active, active),
      valid_from = COALESCE(p_valid_from, valid_from),
      valid_until = COALESCE(p_valid_until, valid_until),
      max_uses = COALESCE(p_max_uses, max_uses),
      min_order_cents = COALESCE(p_min_order_cents, min_order_cents)
    WHERE id = p_code_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Discount code not found'; END IF;
    RETURN jsonb_build_object('success', true, 'code_id', p_code_id);

  ELSIF p_action = 'deactivate' THEN
    IF p_code_id IS NULL THEN RAISE EXCEPTION 'code_id is required for deactivate'; END IF;
    UPDATE discount_codes SET active = false WHERE id = p_code_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Discount code not found'; END IF;
    RETURN jsonb_build_object('success', true, 'code_id', p_code_id);

  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list, get, create, update or deactivate', p_action;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."manage_discount_code"(
  "text", "uuid", "text", "text", bigint, "text", boolean,
  timestamp with time zone, timestamp with time zone, integer, bigint
) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."manage_discount_code"(
  "text", "uuid", "text", "text", bigint, "text", boolean,
  timestamp with time zone, timestamp with time zone, integer, bigint
) TO "service_role";
