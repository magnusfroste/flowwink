-- EPIC-01 issue 01.1/01.2 (docs/parity/epics/EPIC-01-product-variants-order-lines.md):
-- product attributes + variants data model, and the manage_product_variant RPC
-- backing the manage_variant skill. Odoo equivalent: product.attribute,
-- product.attribute.value, product.product (variant of product.template).
-- Idempotent: IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS.

-- ── Tables ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "public"."product_attributes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "display_type" "text" DEFAULT 'select' NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "product_attributes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_attributes_name_key" UNIQUE ("name"),
    CONSTRAINT "product_attributes_display_type_check"
      CHECK ("display_type" IN ('select', 'color', 'radio', 'pills'))
);

CREATE TABLE IF NOT EXISTS "public"."product_attribute_values" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "attribute_id" "uuid" NOT NULL,
    "value" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "product_attribute_values_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_attribute_values_attr_value_key" UNIQUE ("attribute_id", "value"),
    CONSTRAINT "product_attribute_values_attribute_id_fkey"
      FOREIGN KEY ("attribute_id") REFERENCES "public"."product_attributes"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."product_variants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "sku" "text",
    "barcode" "text",
    "price_delta_cents" bigint DEFAULT 0 NOT NULL,
    "stock_quantity" integer,
    "image_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_variants_product_id_fkey"
      FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_sku_key"
  ON "public"."product_variants" ("sku") WHERE "sku" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "product_variants_product_id_idx"
  ON "public"."product_variants" ("product_id");

CREATE TABLE IF NOT EXISTS "public"."product_variant_values" (
    "variant_id" "uuid" NOT NULL,
    "attribute_value_id" "uuid" NOT NULL,
    CONSTRAINT "product_variant_values_pkey" PRIMARY KEY ("variant_id", "attribute_value_id"),
    CONSTRAINT "product_variant_values_variant_id_fkey"
      FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE CASCADE,
    CONSTRAINT "product_variant_values_attribute_value_id_fkey"
      FOREIGN KEY ("attribute_value_id") REFERENCES "public"."product_attribute_values"("id") ON DELETE CASCADE
);

ALTER TABLE "public"."product_attributes" OWNER TO "postgres";
ALTER TABLE "public"."product_attribute_values" OWNER TO "postgres";
ALTER TABLE "public"."product_variants" OWNER TO "postgres";
ALTER TABLE "public"."product_variant_values" OWNER TO "postgres";

DROP TRIGGER IF EXISTS "update_product_attributes_updated_at" ON "public"."product_attributes";
CREATE TRIGGER "update_product_attributes_updated_at"
  BEFORE UPDATE ON "public"."product_attributes"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

DROP TRIGGER IF EXISTS "update_product_variants_updated_at" ON "public"."product_variants";
CREATE TRIGGER "update_product_variants_updated_at"
  BEFORE UPDATE ON "public"."product_variants"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

-- ── RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE "public"."product_attributes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."product_attribute_values" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."product_variants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."product_variant_values" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage product attributes" ON "public"."product_attributes";
CREATE POLICY "Admins can manage product attributes" ON "public"."product_attributes"
  USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));
DROP POLICY IF EXISTS "Public can view product attributes" ON "public"."product_attributes";
CREATE POLICY "Public can view product attributes" ON "public"."product_attributes"
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage product attribute values" ON "public"."product_attribute_values";
CREATE POLICY "Admins can manage product attribute values" ON "public"."product_attribute_values"
  USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));
DROP POLICY IF EXISTS "Public can view product attribute values" ON "public"."product_attribute_values";
CREATE POLICY "Public can view product attribute values" ON "public"."product_attribute_values"
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage product variants" ON "public"."product_variants";
CREATE POLICY "Admins can manage product variants" ON "public"."product_variants"
  USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));
DROP POLICY IF EXISTS "Public can view active product variants" ON "public"."product_variants";
CREATE POLICY "Public can view active product variants" ON "public"."product_variants"
  FOR SELECT USING ("is_active" = true);

DROP POLICY IF EXISTS "Admins can manage product variant values" ON "public"."product_variant_values";
CREATE POLICY "Admins can manage product variant values" ON "public"."product_variant_values"
  USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));
DROP POLICY IF EXISTS "Public can view product variant values" ON "public"."product_variant_values";
CREATE POLICY "Public can view product variant values" ON "public"."product_variant_values"
  FOR SELECT USING (true);

GRANT ALL ON TABLE "public"."product_attributes" TO "anon";
GRANT ALL ON TABLE "public"."product_attributes" TO "authenticated";
GRANT ALL ON TABLE "public"."product_attributes" TO "service_role";
GRANT ALL ON TABLE "public"."product_attribute_values" TO "anon";
GRANT ALL ON TABLE "public"."product_attribute_values" TO "authenticated";
GRANT ALL ON TABLE "public"."product_attribute_values" TO "service_role";
GRANT ALL ON TABLE "public"."product_variants" TO "anon";
GRANT ALL ON TABLE "public"."product_variants" TO "authenticated";
GRANT ALL ON TABLE "public"."product_variants" TO "service_role";
GRANT ALL ON TABLE "public"."product_variant_values" TO "anon";
GRANT ALL ON TABLE "public"."product_variant_values" TO "authenticated";
GRANT ALL ON TABLE "public"."product_variant_values" TO "service_role";

-- ── RPC: manage_product_variant ───────────────────────────────────────────
-- Backs the manage_variant skill. Writes require service_role or admin
-- (same gate as the rest of the agent surface); reads are open.

CREATE OR REPLACE FUNCTION "public"."manage_product_variant"(
  "p_action" "text",
  "p_product_id" "uuid" DEFAULT NULL,
  "p_variant_id" "uuid" DEFAULT NULL,
  "p_sku" "text" DEFAULT NULL,
  "p_barcode" "text" DEFAULT NULL,
  "p_price_delta_cents" bigint DEFAULT NULL,
  "p_stock_quantity" integer DEFAULT NULL,
  "p_is_active" boolean DEFAULT NULL,
  "p_attribute_value_ids" "uuid"[] DEFAULT NULL,
  "p_attributes" "jsonb" DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  v_is_writer BOOLEAN := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
  v_variant RECORD;
  v_result JSONB;
  v_attr JSONB;
  v_attr_id UUID;
  v_val TEXT;
  v_combo UUID[];
  v_created INT := 0;
  v_sku_base TEXT;
  v_suffix TEXT;
  v_new_id UUID;
BEGIN
  IF p_action IN ('create','update','deactivate','generate') AND NOT v_is_writer THEN
    RAISE EXCEPTION 'Only admins can modify product variants';
  END IF;

  IF p_action = 'list' THEN
    IF p_product_id IS NULL THEN RAISE EXCEPTION 'product_id is required for list'; END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', v.id, 'sku', v.sku, 'barcode', v.barcode,
      'price_delta_cents', v.price_delta_cents,
      'stock_quantity', v.stock_quantity, 'is_active', v.is_active,
      'values', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('attribute', a.name, 'value', av.value)), '[]'::jsonb)
        FROM product_variant_values vv
        JOIN product_attribute_values av ON av.id = vv.attribute_value_id
        JOIN product_attributes a ON a.id = av.attribute_id
        WHERE vv.variant_id = v.id
      )
    ) ORDER BY v.created_at), '[]'::jsonb)
    INTO v_result
    FROM product_variants v WHERE v.product_id = p_product_id;
    RETURN jsonb_build_object('success', true, 'variants', v_result);

  ELSIF p_action = 'get' THEN
    IF p_variant_id IS NULL THEN RAISE EXCEPTION 'variant_id is required for get'; END IF;
    SELECT * INTO v_variant FROM product_variants WHERE id = p_variant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Variant % not found', p_variant_id; END IF;
    RETURN jsonb_build_object('success', true, 'variant', to_jsonb(v_variant));

  ELSIF p_action = 'create' THEN
    IF p_product_id IS NULL THEN RAISE EXCEPTION 'product_id is required for create'; END IF;
    INSERT INTO product_variants (product_id, sku, barcode, price_delta_cents, stock_quantity, is_active)
    VALUES (p_product_id, p_sku, p_barcode, COALESCE(p_price_delta_cents, 0), p_stock_quantity, COALESCE(p_is_active, true))
    RETURNING id INTO v_new_id;
    IF p_attribute_value_ids IS NOT NULL THEN
      INSERT INTO product_variant_values (variant_id, attribute_value_id)
      SELECT v_new_id, unnest(p_attribute_value_ids)
      ON CONFLICT DO NOTHING;
    END IF;
    RETURN jsonb_build_object('success', true, 'variant_id', v_new_id);

  ELSIF p_action = 'update' THEN
    IF p_variant_id IS NULL THEN RAISE EXCEPTION 'variant_id is required for update'; END IF;
    UPDATE product_variants SET
      sku = COALESCE(p_sku, sku),
      barcode = COALESCE(p_barcode, barcode),
      price_delta_cents = COALESCE(p_price_delta_cents, price_delta_cents),
      stock_quantity = COALESCE(p_stock_quantity, stock_quantity),
      is_active = COALESCE(p_is_active, is_active)
    WHERE id = p_variant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Variant % not found', p_variant_id; END IF;
    RETURN jsonb_build_object('success', true, 'variant_id', p_variant_id);

  ELSIF p_action = 'deactivate' THEN
    IF p_variant_id IS NULL THEN RAISE EXCEPTION 'variant_id is required for deactivate'; END IF;
    UPDATE product_variants SET is_active = false WHERE id = p_variant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Variant % not found', p_variant_id; END IF;
    RETURN jsonb_build_object('success', true, 'variant_id', p_variant_id);

  ELSIF p_action = 'generate' THEN
    -- p_attributes: [{"name":"Color","values":["Red","Blue"]}, ...]
    -- Upserts attributes/values, then creates the cartesian variant set.
    IF p_product_id IS NULL OR p_attributes IS NULL OR jsonb_typeof(p_attributes) <> 'array' THEN
      RAISE EXCEPTION 'product_id and attributes (array) are required for generate';
    END IF;

    SELECT COALESCE(NULLIF(regexp_replace(upper(name), '[^A-Z0-9]+', '-', 'g'), ''), 'VAR')
    INTO v_sku_base FROM products WHERE id = p_product_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product % not found', p_product_id; END IF;

    -- Upsert attributes and their values
    FOR v_attr IN SELECT * FROM jsonb_array_elements(p_attributes) LOOP
      IF v_attr->>'name' IS NULL OR jsonb_typeof(v_attr->'values') <> 'array'
         OR jsonb_array_length(v_attr->'values') = 0 THEN
        RAISE EXCEPTION 'Each attribute needs a name and a non-empty values array';
      END IF;
      INSERT INTO product_attributes (name)
      VALUES (v_attr->>'name')
      ON CONFLICT (name) DO UPDATE SET updated_at = now()
      RETURNING id INTO v_attr_id;

      FOR v_val IN SELECT jsonb_array_elements_text(v_attr->'values') LOOP
        INSERT INTO product_attribute_values (attribute_id, value)
        VALUES (v_attr_id, v_val)
        ON CONFLICT (attribute_id, value) DO NOTHING;
      END LOOP;
    END LOOP;

    -- Cartesian expansion of the requested value sets
    DROP TABLE IF EXISTS _variant_combos;
    CREATE TEMP TABLE _variant_combos ON COMMIT DROP AS
    WITH RECURSIVE attrs AS (
      SELECT a.id AS attr_id,
             row_number() OVER (ORDER BY a.sort_order, a.name) AS rn
      FROM product_attributes a
      WHERE a.name IN (SELECT jsonb_array_elements(p_attributes)->>'name')
    ),
    combos(rn, value_ids, label) AS (
      SELECT a.rn, ARRAY[av.id], av.value
      FROM attrs a
      JOIN product_attribute_values av ON av.attribute_id = a.attr_id
      WHERE a.rn = 1
        AND av.value IN (
          SELECT jsonb_array_elements_text(e->'values')
          FROM jsonb_array_elements(p_attributes) e
          WHERE e->>'name' = (SELECT pa.name FROM product_attributes pa WHERE pa.id = a.attr_id)
        )
      UNION ALL
      SELECT a.rn, c.value_ids || av.id, c.label || '-' || av.value
      FROM combos c
      JOIN attrs a ON a.rn = c.rn + 1
      JOIN product_attribute_values av ON av.attribute_id = a.attr_id
      WHERE av.value IN (
        SELECT jsonb_array_elements_text(e->'values')
        FROM jsonb_array_elements(p_attributes) e
        WHERE e->>'name' = (SELECT pa.name FROM product_attributes pa WHERE pa.id = a.attr_id)
      )
    )
    SELECT value_ids, label FROM combos
    WHERE rn = (SELECT max(rn) FROM attrs);

    FOR v_combo, v_suffix IN SELECT value_ids, label FROM _variant_combos LOOP
      -- Skip if an identical variant (same value set) already exists for the product
      IF EXISTS (
        SELECT 1 FROM product_variants pv
        WHERE pv.product_id = p_product_id
          AND (SELECT array_agg(vv.attribute_value_id ORDER BY vv.attribute_value_id)
               FROM product_variant_values vv WHERE vv.variant_id = pv.id)
            = (SELECT array_agg(x ORDER BY x) FROM unnest(v_combo) x)
      ) THEN CONTINUE; END IF;

      INSERT INTO product_variants (product_id, sku, price_delta_cents)
      VALUES (p_product_id,
              v_sku_base || '-' || regexp_replace(upper(v_suffix), '[^A-Z0-9-]+', '', 'g'),
              0)
      RETURNING id INTO v_new_id;
      INSERT INTO product_variant_values (variant_id, attribute_value_id)
      SELECT v_new_id, unnest(v_combo);
      v_created := v_created + 1;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'created', v_created);

  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|get|create|update|deactivate|generate', p_action;
  END IF;
END;
$$;

ALTER FUNCTION "public"."manage_product_variant" OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."manage_product_variant"("text","uuid","uuid","text","text",bigint,integer,boolean,"uuid"[],"jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."manage_product_variant"("text","uuid","uuid","text","text",bigint,integer,boolean,"uuid"[],"jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."manage_product_variant"("text","uuid","uuid","text","text",bigint,integer,boolean,"uuid"[],"jsonb") TO "service_role";
