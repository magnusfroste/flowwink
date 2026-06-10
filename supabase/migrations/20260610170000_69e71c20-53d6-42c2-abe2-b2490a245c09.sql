-- EPIC-01 issue 01.5 (docs/parity/epics/EPIC-01-product-variants-order-lines.md):
-- Units of Measure foundation — data model + conversion only (purchase UoM is out
-- of scope per the issue). Odoo equivalent: uom.category + uom.uom (factor to a
-- reference unit within the category). Adds products.sales_uom_id and a convert_uom
-- helper. Seeds a default "Units" category so existing products work unchanged.
-- Idempotent: IF NOT EXISTS / ON CONFLICT DO NOTHING / fixed seed UUIDs.

CREATE TABLE IF NOT EXISTS "public"."uom_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "uom_categories_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uom_categories_name_key" UNIQUE ("name")
);

CREATE TABLE IF NOT EXISTS "public"."uoms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "code" "text",
    -- quantity in this unit × factor = quantity in the category's reference unit
    "factor" numeric(18,9) DEFAULT 1 NOT NULL,
    "is_reference" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "uoms_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uoms_category_name_key" UNIQUE ("category_id", "name"),
    CONSTRAINT "uoms_factor_positive" CHECK ("factor" > 0),
    CONSTRAINT "uoms_category_id_fkey"
      FOREIGN KEY ("category_id") REFERENCES "public"."uom_categories"("id") ON DELETE CASCADE
);

-- At most one reference unit per category
CREATE UNIQUE INDEX IF NOT EXISTS "uoms_one_reference_per_category"
  ON "public"."uoms" ("category_id") WHERE "is_reference";

ALTER TABLE "public"."products"
  ADD COLUMN IF NOT EXISTS "sales_uom_id" "uuid";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "information_schema"."table_constraints"
    WHERE "constraint_name" = 'products_sales_uom_id_fkey' AND "table_name" = 'products'
  ) THEN
    ALTER TABLE "public"."products"
      ADD CONSTRAINT "products_sales_uom_id_fkey"
      FOREIGN KEY ("sales_uom_id") REFERENCES "public"."uoms"("id") ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE "public"."uom_categories" OWNER TO "postgres";
ALTER TABLE "public"."uoms" OWNER TO "postgres";

-- RLS: admin-manage, public-read (catalog data, like products)
ALTER TABLE "public"."uom_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."uoms" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage uom categories" ON "public"."uom_categories";
CREATE POLICY "Admins can manage uom categories" ON "public"."uom_categories"
  USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));
DROP POLICY IF EXISTS "Public can view uom categories" ON "public"."uom_categories";
CREATE POLICY "Public can view uom categories" ON "public"."uom_categories"
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage uoms" ON "public"."uoms";
CREATE POLICY "Admins can manage uoms" ON "public"."uoms"
  USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));
DROP POLICY IF EXISTS "Public can view uoms" ON "public"."uoms";
CREATE POLICY "Public can view uoms" ON "public"."uoms"
  FOR SELECT USING (true);

GRANT ALL ON TABLE "public"."uom_categories" TO "anon";
GRANT ALL ON TABLE "public"."uom_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."uom_categories" TO "service_role";
GRANT ALL ON TABLE "public"."uoms" TO "anon";
GRANT ALL ON TABLE "public"."uoms" TO "authenticated";
GRANT ALL ON TABLE "public"."uoms" TO "service_role";

-- Seed the default "Units" category + reference unit (fixed UUIDs → idempotent)
INSERT INTO "public"."uom_categories" ("id", "name")
VALUES ('11111111-1111-4111-8111-111111111111', 'Units')
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "public"."uoms" ("id", "category_id", "name", "code", "factor", "is_reference")
VALUES ('22222222-2222-4222-8222-222222222222',
        '11111111-1111-4111-8111-111111111111', 'Unit', 'unit', 1, true)
ON CONFLICT ("category_id", "name") DO NOTHING;

-- convert_uom: convert a quantity between two UoMs in the SAME category.
-- qty_in_ref = p_qty * from.factor ; result = qty_in_ref / to.factor.
CREATE OR REPLACE FUNCTION "public"."convert_uom"(
  "p_qty" numeric, "p_from_uom" "uuid", "p_to_uom" "uuid"
) RETURNS numeric
LANGUAGE "plpgsql" STABLE
SET "search_path" TO 'public'
AS $$
DECLARE
  v_from RECORD;
  v_to RECORD;
BEGIN
  IF p_from_uom = p_to_uom OR p_from_uom IS NULL OR p_to_uom IS NULL THEN
    RETURN p_qty;
  END IF;
  SELECT category_id, factor INTO v_from FROM uoms WHERE id = p_from_uom;
  IF NOT FOUND THEN RAISE EXCEPTION 'UoM % not found', p_from_uom; END IF;
  SELECT category_id, factor INTO v_to FROM uoms WHERE id = p_to_uom;
  IF NOT FOUND THEN RAISE EXCEPTION 'UoM % not found', p_to_uom; END IF;
  IF v_from.category_id <> v_to.category_id THEN
    RAISE EXCEPTION 'Cannot convert between UoMs in different categories';
  END IF;
  RETURN p_qty * v_from.factor / v_to.factor;
END;
$$;

ALTER FUNCTION "public"."convert_uom"(numeric, "uuid", "uuid") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."convert_uom"(numeric, "uuid", "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."convert_uom"(numeric, "uuid", "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_uom"(numeric, "uuid", "uuid") TO "service_role";
