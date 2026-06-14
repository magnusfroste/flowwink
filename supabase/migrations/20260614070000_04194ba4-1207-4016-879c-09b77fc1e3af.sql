-- Manufacturing MRP reorder (docs/parity/capabilities/manufacturing.json#mrp_reorder).
-- Scans products at/below their reorder point that have an active BOM (i.e. are
-- manufactured, not bought) and have no open MO, and creates draft manufacturing
-- orders to replenish. dry_run returns candidates without creating. Idempotent
-- (skips products that already have an open MO). CREATE OR REPLACE only.

CREATE OR REPLACE FUNCTION "public"."mrp_reorder_run"(
  "p_dry_run" boolean DEFAULT true
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  v_row RECORD;
  v_candidates jsonb := '[]'::jsonb;
  v_created int := 0;
  v_mo uuid;
BEGIN
  IF NOT p_dry_run AND NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can create reorder MOs';
  END IF;

  FOR v_row IN
    SELECT ps.product_id, p.name AS product_name,
           ps.quantity_on_hand, ps.reorder_point,
           GREATEST(ps.reorder_point - ps.quantity_on_hand, 1) AS suggested_qty,
           b.id AS bom_id
    FROM product_stock ps
    JOIN products p ON p.id = ps.product_id
    JOIN bom_headers b ON b.product_id = ps.product_id AND b.is_active
    WHERE ps.quantity_on_hand <= ps.reorder_point
      AND ps.reorder_point > 0
      AND NOT EXISTS (
        SELECT 1 FROM manufacturing_orders mo
        WHERE mo.product_id = ps.product_id AND mo.status NOT IN ('done','cancelled')
      )
  LOOP
    v_candidates := v_candidates || jsonb_build_object(
      'product_id', v_row.product_id, 'product_name', v_row.product_name,
      'quantity_on_hand', v_row.quantity_on_hand, 'reorder_point', v_row.reorder_point,
      'suggested_qty', v_row.suggested_qty, 'bom_id', v_row.bom_id);

    IF NOT p_dry_run THEN
      INSERT INTO manufacturing_orders (mo_number, product_id, bom_id, quantity, status, source_type, created_by)
      VALUES (next_mo_number(), v_row.product_id, v_row.bom_id, v_row.suggested_qty, 'draft', 'reorder', auth.uid())
      RETURNING id INTO v_mo;
      v_created := v_created + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'dry_run', p_dry_run,
    'candidate_count', jsonb_array_length(v_candidates),
    'created', v_created,
    'candidates', v_candidates
  );
END;
$$;

ALTER FUNCTION "public"."mrp_reorder_run"(boolean) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."mrp_reorder_run"(boolean) TO "anon", "authenticated", "service_role";
