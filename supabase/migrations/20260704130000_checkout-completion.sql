-- ── Checkout completion: shipping address, product weights, delivery choice ──
-- (ecommerce.json#checkout_address + #delivery_choice_checkout + #tax_display_checkout)
-- Removes the two R2 blockers: "the cart has no weights and orders has no
-- address columns". Odoo reference: Delivery step captures delivery address +
-- shipping-method selection (reference card §2/§4).
-- Idempotent: safe to run multiple times.

-- ── Orders: shipping address + chosen delivery method ──────────────────────
-- All nullable: digital/service-only orders (and agent-placed orders) have no
-- shipping leg. shipping_cost_cents is included in orders.total_cents so the
-- order total always matches the charged amount.
ALTER TABLE "public"."orders" ADD COLUMN IF NOT EXISTS "shipping_name" "text";
ALTER TABLE "public"."orders" ADD COLUMN IF NOT EXISTS "shipping_address_line1" "text";
ALTER TABLE "public"."orders" ADD COLUMN IF NOT EXISTS "shipping_address_line2" "text";
ALTER TABLE "public"."orders" ADD COLUMN IF NOT EXISTS "shipping_postal_code" "text";
ALTER TABLE "public"."orders" ADD COLUMN IF NOT EXISTS "shipping_city" "text";
ALTER TABLE "public"."orders" ADD COLUMN IF NOT EXISTS "shipping_country" "text" DEFAULT 'SE';
ALTER TABLE "public"."orders" ADD COLUMN IF NOT EXISTS "shipping_phone" "text";
ALTER TABLE "public"."orders" ADD COLUMN IF NOT EXISTS "shipping_method" "text";
ALTER TABLE "public"."orders" ADD COLUMN IF NOT EXISTS "shipping_cost_cents" integer;

-- ── Products: weight ────────────────────────────────────────────────────────
-- NULL = non-shippable (service/digital) and the product does not participate
-- in the shipping calculation. A weighted product makes the cart shippable.
ALTER TABLE "public"."products" ADD COLUMN IF NOT EXISTS "weight_grams" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_weight_grams_nonnegative'
  ) THEN
    ALTER TABLE "public"."products"
      ADD CONSTRAINT "products_weight_grams_nonnegative"
      CHECK ("weight_grams" IS NULL OR "weight_grams" >= 0);
  END IF;
END $$;

-- ── RPC: list_shipping_options ──────────────────────────────────────────────
-- Anonymous-safe carrier listing for the public checkout. carriers has no
-- public SELECT policy (admin/warehouse only), so this is SECURITY DEFINER and
-- read-only: for each active carrier, the cheapest active shipping_rates band
-- containing the given total weight (same band logic as calc_shipping_rate,
-- without dimensional weight — the storefront cart has no parcel dimensions).
-- Returns an empty options array when no carriers/rates are configured, so a
-- fresh instance degrades gracefully (no delivery section at checkout).
CREATE OR REPLACE FUNCTION "public"."list_shipping_options"(
  "p_weight_grams" integer,
  "p_currency" "text" DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "sql" STABLE SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
  SELECT jsonb_build_object(
    'success', true,
    'weight_grams', p_weight_grams,
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
    ORDER BY c.id, r.price_cents ASC, r.min_weight_grams DESC
  ) opts;
$$;

ALTER FUNCTION "public"."list_shipping_options"(integer, "text") OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."list_shipping_options"(integer, "text") TO "anon";
GRANT EXECUTE ON FUNCTION "public"."list_shipping_options"(integer, "text") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."list_shipping_options"(integer, "text") TO "service_role";
