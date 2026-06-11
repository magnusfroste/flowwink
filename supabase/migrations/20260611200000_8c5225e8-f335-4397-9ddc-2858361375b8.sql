-- EPIC-02 issues 02.1 + 02.2 (docs/parity/epics/EPIC-02-inventory-valuation.md):
-- Inventory valuation layers + COGS posting. Every inbound stock move creates a
-- valuation layer (cost resolved from the PO line, explicit move cost, or
-- products.cost_cents); every outbound move consumes layers per the category's
-- costing method (fifo | average), stamps the move with its cost, and — when tied
-- to a sale (order / pos_sale) — posts Dt COGS / Cr Inventory. Receipts from
-- purchase orders post Dt Inventory / Cr GRNI.
--
-- BAS-2024 defaults (overridable by editing this function set):
--   1460 Lager av handelsvaror (inventory) · 4990 Lagerförändring (COGS)
--   2441 GRNI (ej fakturerade leveranser)
-- Valuation starts at migration time (no retroactive layers). Idempotent.

-- ── Cost configuration ──────────────────────────────────────────────────────
ALTER TABLE "public"."product_categories"
  ADD COLUMN IF NOT EXISTS "costing_method" "text" DEFAULT 'average' NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints
                 WHERE constraint_name='product_categories_costing_method_check') THEN
    ALTER TABLE "public"."product_categories"
      ADD CONSTRAINT "product_categories_costing_method_check"
      CHECK ("costing_method" IN ('fifo','average'));
  END IF;
END $$;

ALTER TABLE "public"."products"
  ADD COLUMN IF NOT EXISTS "cost_cents" bigint;

ALTER TABLE "public"."stock_moves"
  ADD COLUMN IF NOT EXISTS "variant_id" "uuid",
  ADD COLUMN IF NOT EXISTS "unit_cost_cents" bigint,
  ADD COLUMN IF NOT EXISTS "value_cents" bigint;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name='stock_moves_variant_id_fkey' AND table_name='stock_moves') THEN
    ALTER TABLE "public"."stock_moves" ADD CONSTRAINT "stock_moves_variant_id_fkey"
      FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- ── Valuation layers ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."stock_valuation_layers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "variant_id" "uuid",
    "move_id" "uuid",
    "quantity" numeric(14,3) NOT NULL,
    "unit_cost_cents" bigint NOT NULL,
    "value_cents" bigint NOT NULL,
    "remaining_qty" numeric(14,3) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stock_valuation_layers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "svl_remaining_nonneg" CHECK ("remaining_qty" >= 0),
    CONSTRAINT "svl_product_fkey" FOREIGN KEY ("product_id")
      REFERENCES "public"."products"("id") ON DELETE CASCADE,
    CONSTRAINT "svl_move_fkey" FOREIGN KEY ("move_id")
      REFERENCES "public"."stock_moves"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "svl_open_layers_idx"
  ON "public"."stock_valuation_layers" ("product_id", "created_at")
  WHERE "remaining_qty" > 0;

ALTER TABLE "public"."stock_valuation_layers" OWNER TO "postgres";
ALTER TABLE "public"."stock_valuation_layers" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage stock_valuation_layers" ON "public"."stock_valuation_layers";
CREATE POLICY "Admins manage stock_valuation_layers" ON "public"."stock_valuation_layers"
  USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));
DROP POLICY IF EXISTS "Staff view stock_valuation_layers" ON "public"."stock_valuation_layers";
CREATE POLICY "Staff view stock_valuation_layers" ON "public"."stock_valuation_layers"
  FOR SELECT USING (
    "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'approver'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'writer'::"public"."app_role"));
GRANT ALL ON TABLE "public"."stock_valuation_layers" TO "anon";
GRANT ALL ON TABLE "public"."stock_valuation_layers" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_valuation_layers" TO "service_role";

-- ── Cost resolution for inbound moves ───────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."resolve_inbound_unit_cost"(
  "p_product_id" "uuid", "p_reference_type" "text", "p_reference_id" "text"
) RETURNS bigint
LANGUAGE "plpgsql" STABLE SET "search_path" TO 'public' AS $$
DECLARE v_cost bigint;
BEGIN
  -- 1) purchase order line price
  IF p_reference_type IN ('purchase_order','po','goods_receipt') AND p_reference_id IS NOT NULL THEN
    BEGIN
      SELECT pol.unit_price_cents INTO v_cost
      FROM purchase_order_lines pol
      WHERE pol.product_id = p_product_id
        AND pol.purchase_order_id = p_reference_id::uuid
      LIMIT 1;
    EXCEPTION WHEN others THEN v_cost := NULL; END;
    IF v_cost IS NOT NULL THEN RETURN v_cost; END IF;
  END IF;
  -- 2) product standard cost
  SELECT cost_cents INTO v_cost FROM products WHERE id = p_product_id;
  RETURN COALESCE(v_cost, 0);
END $$;
ALTER FUNCTION "public"."resolve_inbound_unit_cost"("uuid","text","text") OWNER TO "postgres";

-- ── Valuation engine: AFTER INSERT on stock_moves ───────────────────────────
CREATE OR REPLACE FUNCTION "public"."process_stock_move_valuation"() RETURNS "trigger"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_qty numeric := abs(COALESCE(NEW.quantity,0));
  v_is_in boolean;
  v_method text;
  v_unit_cost bigint;
  v_total_cost bigint := 0;
  v_layer RECORD;
  v_take numeric;
  v_remaining numeric;
  v_avg numeric;
  v_je uuid;
BEGIN
  IF v_qty = 0 THEN RETURN NEW; END IF;
  -- internal transfers don't change valuation
  IF NEW.move_type NOT IN ('in','out','mo_production','mo_consumption') THEN RETURN NEW; END IF;
  v_is_in := (NEW.move_type IN ('in','mo_production')) AND COALESCE(NEW.quantity,0) > 0;

  IF v_is_in THEN
    v_unit_cost := COALESCE(NEW.unit_cost_cents,
                            resolve_inbound_unit_cost(NEW.product_id, NEW.reference_type, NEW.reference_id));
    INSERT INTO stock_valuation_layers (product_id, variant_id, move_id, quantity, unit_cost_cents, value_cents, remaining_qty)
    VALUES (NEW.product_id, NEW.variant_id, NEW.id, v_qty, v_unit_cost, round(v_qty * v_unit_cost), v_qty);
    UPDATE stock_moves SET unit_cost_cents = v_unit_cost, value_cents = round(v_qty * v_unit_cost)
      WHERE id = NEW.id;
    -- Receipt JE: Dt 1460 inventory / Cr 2441 GRNI (only for purchase receipts with value)
    IF NEW.reference_type IN ('purchase_order','po','goods_receipt') AND v_unit_cost > 0 THEN
      BEGIN
        INSERT INTO journal_entries (entry_date, description, source, status)
        VALUES (CURRENT_DATE, 'Inventory receipt '||COALESCE(NEW.reference_id,''), 'inventory_receipt', 'posted')
        RETURNING id INTO v_je;
        INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
        VALUES (v_je, '1460', round(v_qty*v_unit_cost), 0, 'Lager av handelsvaror'),
               (v_je, '2441', 0, round(v_qty*v_unit_cost), 'GRNI — ej fakturerade leveranser');
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'inventory_receipt JE skipped: %', SQLERRM;
      END;
    END IF;
    RETURN NEW;
  END IF;

  -- OUTBOUND: consume layers per the category costing method
  SELECT COALESCE(pc.costing_method,'average') INTO v_method
  FROM products p LEFT JOIN product_categories pc ON pc.id = p.category_id
  WHERE p.id = NEW.product_id;
  v_method := COALESCE(v_method,'average');

  IF v_method = 'average' THEN
    SELECT CASE WHEN sum(remaining_qty) > 0
                THEN sum(remaining_qty * unit_cost_cents) / sum(remaining_qty) END
    INTO v_avg FROM stock_valuation_layers
    WHERE product_id = NEW.product_id AND remaining_qty > 0;
  END IF;

  v_remaining := v_qty;
  FOR v_layer IN
    SELECT id, remaining_qty, unit_cost_cents FROM stock_valuation_layers
    WHERE product_id = NEW.product_id AND remaining_qty > 0
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_layer.remaining_qty, v_remaining);
    v_total_cost := v_total_cost + round(v_take * CASE WHEN v_method='average' THEN v_avg ELSE v_layer.unit_cost_cents END);
    UPDATE stock_valuation_layers SET remaining_qty = remaining_qty - v_take WHERE id = v_layer.id;
    v_remaining := v_remaining - v_take;
  END LOOP;
  -- shortfall (selling more than valued stock): cost the rest at fallback
  IF v_remaining > 0 THEN
    SELECT COALESCE(v_avg, cost_cents, 0) INTO v_unit_cost FROM products WHERE id = NEW.product_id;
    v_total_cost := v_total_cost + round(v_remaining * COALESCE(v_unit_cost,0));
  END IF;

  UPDATE stock_moves SET
    unit_cost_cents = CASE WHEN v_qty > 0 THEN round(v_total_cost / v_qty) ELSE NULL END,
    value_cents = v_total_cost
  WHERE id = NEW.id;

  -- COGS JE only when the out-move is a sale
  IF NEW.reference_type IN ('order','pos_sale') AND v_total_cost > 0 THEN
    BEGIN
      INSERT INTO journal_entries (entry_date, description, source, status)
      VALUES (CURRENT_DATE, 'COGS '||NEW.reference_type||' '||COALESCE(NEW.reference_id,''), 'inventory_cogs', 'posted')
      RETURNING id INTO v_je;
      INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je, '4990', v_total_cost, 0, 'Kostnad sålda varor'),
             (v_je, '1460', 0, v_total_cost, 'Lager av handelsvaror');
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'inventory_cogs JE skipped: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION "public"."process_stock_move_valuation"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "stock_move_valuation_trg" ON "public"."stock_moves";
CREATE TRIGGER "stock_move_valuation_trg" AFTER INSERT ON "public"."stock_moves"
  FOR EACH ROW EXECUTE FUNCTION "public"."process_stock_move_valuation"();

-- Pass variant_id from order lines into the stock move (EPIC-01 tie-in)
CREATE OR REPLACE FUNCTION "public"."trigger_order_item_stock_decrement"() RETURNS "trigger"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
BEGIN
  IF NEW.product_id IS NOT NULL AND NEW.quantity > 0 THEN
    INSERT INTO public.stock_moves (product_id, variant_id, quantity, move_type, reference_type, reference_id, notes)
    VALUES (NEW.product_id, NEW.variant_id, -(NEW.quantity), 'out', 'order', NEW.order_id::text,
            'Auto-decrement from order item');
    UPDATE public.product_stock SET quantity_on_hand = quantity_on_hand - NEW.quantity
      WHERE product_id = NEW.product_id;
    UPDATE public.products SET stock_quantity = GREATEST(COALESCE(stock_quantity,0) - NEW.quantity, 0)
      WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END $$;

-- ── MCP surface: valuation report ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."inventory_valuation_report"(
  "p_limit" integer DEFAULT 50
) RETURNS "jsonb"
LANGUAGE "plpgsql" STABLE SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_rows jsonb; v_total bigint;
BEGIN
  SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'value_cents')::bigint DESC), '[]'::jsonb),
         COALESCE(sum((r->>'value_cents')::bigint), 0)
  INTO v_rows, v_total
  FROM (
    SELECT to_jsonb(x) AS r FROM (
      SELECT p.id AS product_id, p.name,
             sum(l.remaining_qty) AS on_hand_qty,
             round(sum(l.remaining_qty * l.unit_cost_cents)) AS value_cents,
             CASE WHEN sum(l.remaining_qty) > 0
                  THEN round(sum(l.remaining_qty * l.unit_cost_cents) / sum(l.remaining_qty)) END AS avg_unit_cost_cents
      FROM stock_valuation_layers l JOIN products p ON p.id = l.product_id
      WHERE l.remaining_qty > 0
      GROUP BY p.id, p.name
      ORDER BY 4 DESC
      LIMIT GREATEST(COALESCE(p_limit,50),1)
    ) x
  ) y;
  RETURN jsonb_build_object('success', true, 'total_value_cents', v_total, 'products', v_rows);
END $$;
ALTER FUNCTION "public"."inventory_valuation_report"(integer) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."inventory_valuation_report"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."inventory_valuation_report"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."inventory_valuation_report"(integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."resolve_inbound_unit_cost"("uuid","text","text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_inbound_unit_cost"("uuid","text","text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_inbound_unit_cost"("uuid","text","text") TO "service_role";
