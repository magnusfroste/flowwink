-- Line-level discounts for quote line items (docs/parity/capabilities/quotes.json: line_discounts).
--
-- Two "line item" surfaces exist for quotes in this codebase:
--   1. quotes.line_items (jsonb) — read/written by the human quote editor
--      (QuoteDetailSheet.tsx via useQuotes.ts / computeInvoiceTotals).
--   2. quote_items (table) — written by the agent/skill layer
--      (agent-execute's `case 'quotes'` behind the manage_quote skill,
--      handler db:quotes). quote_items.discount_pct already existed
--      (baseline) but had no range guard.
--
-- This migration hardens quote_items.discount_pct with a 0-100 range check
-- and adds an equivalent guard for the jsonb path, keyed on the same field
-- name (discount_pct) for consistency across both surfaces.
-- Idempotent: guarded CHECK constraints, CREATE OR REPLACE function.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "information_schema"."check_constraints"
    WHERE "constraint_name" = 'quote_items_discount_pct_range'
  ) THEN
    ALTER TABLE "public"."quote_items"
      ADD CONSTRAINT "quote_items_discount_pct_range" CHECK ("discount_pct" >= 0 AND "discount_pct" <= 100);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION "public"."quote_line_items_discount_valid"("items" "jsonb")
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE("items", '[]'::jsonb)) elem
    WHERE (elem ->> 'discount_pct') IS NOT NULL
      AND (
        (elem ->> 'discount_pct')::numeric < 0
        OR (elem ->> 'discount_pct')::numeric > 100
      )
  );
$$;

ALTER FUNCTION "public"."quote_line_items_discount_valid"("jsonb") OWNER TO "postgres";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "information_schema"."check_constraints"
    WHERE "constraint_name" = 'quotes_line_items_discount_pct_range'
  ) THEN
    ALTER TABLE "public"."quotes"
      ADD CONSTRAINT "quotes_line_items_discount_pct_range"
      CHECK ("public"."quote_line_items_discount_valid"("line_items"));
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION "public"."quote_line_items_discount_valid"("jsonb") TO "anon", "authenticated", "service_role";

NOTIFY pgrst, 'reload schema';
