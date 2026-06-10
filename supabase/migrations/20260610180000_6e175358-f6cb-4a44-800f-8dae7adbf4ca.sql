-- EPIC-01 issue 01.6 (docs/parity/epics/EPIC-01-product-variants-order-lines.md):
-- Partial shipments — track fulfillment per ORDER LINE instead of only the binary
-- order-level fulfillment_status. Adds order_items.qty_fulfilled and a
-- fulfill_order_line RPC that accumulates fulfilled quantity (clamped to the line
-- quantity) and flips the order to 'shipped' only once EVERY line is complete.
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE.

ALTER TABLE "public"."order_items"
  ADD COLUMN IF NOT EXISTS "qty_fulfilled" numeric(12,2) DEFAULT 0 NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "information_schema"."check_constraints"
    WHERE "constraint_name" = 'order_items_qty_fulfilled_nonneg'
  ) THEN
    ALTER TABLE "public"."order_items"
      ADD CONSTRAINT "order_items_qty_fulfilled_nonneg" CHECK ("qty_fulfilled" >= 0);
  END IF;
END $$;

-- fulfill_order_line: add p_qty to a line's fulfilled quantity (clamped to the
-- ordered quantity). Recomputes order-level fulfillment: when no line has a
-- remaining quantity, mark the order shipped (sets shipped_at if unset). Writer-gated.
CREATE OR REPLACE FUNCTION "public"."fulfill_order_line"(
  "p_line_id" "uuid", "p_qty" numeric DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  v_line RECORD;
  v_new_fulfilled numeric;
  v_order_id uuid;
  v_remaining numeric;
  v_order_complete boolean;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can fulfill order lines';
  END IF;

  SELECT id, order_id, quantity, qty_fulfilled INTO v_line
  FROM order_items WHERE id = p_line_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order line % not found', p_line_id; END IF;
  v_order_id := v_line.order_id;

  -- Default: fulfill the whole remaining quantity
  v_new_fulfilled := LEAST(
    v_line.quantity,
    v_line.qty_fulfilled + COALESCE(p_qty, v_line.quantity - v_line.qty_fulfilled)
  );
  IF v_new_fulfilled < 0 THEN v_new_fulfilled := 0; END IF;

  UPDATE order_items SET qty_fulfilled = v_new_fulfilled WHERE id = p_line_id;

  -- Remaining across the whole order
  SELECT COALESCE(SUM(quantity - qty_fulfilled), 0) INTO v_remaining
  FROM order_items WHERE order_id = v_order_id;
  v_order_complete := (v_remaining <= 0);

  IF v_order_complete THEN
    UPDATE orders
       SET fulfillment_status = 'shipped',
           shipped_at = COALESCE(shipped_at, now())
     WHERE id = v_order_id AND fulfillment_status <> 'delivered';
  END IF;

  RETURN jsonb_build_object(
    'line_id', p_line_id,
    'qty_fulfilled', v_new_fulfilled,
    'line_quantity', v_line.quantity,
    'line_complete', v_new_fulfilled >= v_line.quantity,
    'order_remaining', v_remaining,
    'order_fully_fulfilled', v_order_complete
  );
END;
$$;

ALTER FUNCTION "public"."fulfill_order_line"("uuid", numeric) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."fulfill_order_line"("uuid", numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."fulfill_order_line"("uuid", numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fulfill_order_line"("uuid", numeric) TO "service_role";
