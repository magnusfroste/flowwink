-- EPIC-01 issue 01.3 (docs/parity/epics/EPIC-01-product-variants-order-lines.md):
-- order lines are ALREADY normalized — public.order_items exists and is populated
-- by create-checkout (sandbox + Stripe paths). The real remaining gap is that an
-- order line cannot reference which product VARIANT was bought. This adds that link
-- (and a per-line tax rate, used by invoicing/POS), so EPIC-01 variants flow all
-- the way to the order line. Idempotent: ADD COLUMN IF NOT EXISTS.

ALTER TABLE "public"."order_items"
  ADD COLUMN IF NOT EXISTS "variant_id" "uuid",
  ADD COLUMN IF NOT EXISTS "tax_rate_pct" numeric(6,3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "information_schema"."table_constraints"
    WHERE "constraint_name" = 'order_items_variant_id_fkey'
      AND "table_name" = 'order_items'
  ) THEN
    ALTER TABLE "public"."order_items"
      ADD CONSTRAINT "order_items_variant_id_fkey"
      FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "order_items_variant_id_idx"
  ON "public"."order_items" ("variant_id") WHERE "variant_id" IS NOT NULL;
