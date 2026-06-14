-- Inventory cycle counts (docs/parity/capabilities/inventory.json#cycle_count).
-- A physical-count session per location: snapshot system qty, record counted qty,
-- and on post apply the variance to stock via the existing adjust_quant() (which
-- moves stock + creates valuation layers). Idempotent throughout.

CREATE TABLE IF NOT EXISTS "public"."inventory_counts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "location_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'draft' NOT NULL,
    "notes" "text",
    "posted_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inventory_counts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inventory_counts_status_check" CHECK ("status" IN ('draft','posted','cancelled'))
);

CREATE TABLE IF NOT EXISTS "public"."inventory_count_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "count_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "lot_id" "uuid",
    "system_qty" numeric DEFAULT 0 NOT NULL,
    "counted_qty" numeric DEFAULT 0 NOT NULL,
    "variance" numeric GENERATED ALWAYS AS ("counted_qty" - "system_qty") STORED,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inventory_count_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inventory_count_lines_count_id_fkey"
      FOREIGN KEY ("count_id") REFERENCES "public"."inventory_counts"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "inventory_count_lines_count_id_idx"
  ON "public"."inventory_count_lines" ("count_id");

ALTER TABLE "public"."inventory_counts" OWNER TO "postgres";
ALTER TABLE "public"."inventory_count_lines" OWNER TO "postgres";

DROP TRIGGER IF EXISTS "update_inventory_counts_updated_at" ON "public"."inventory_counts";
CREATE TRIGGER "update_inventory_counts_updated_at"
  BEFORE UPDATE ON "public"."inventory_counts"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['inventory_counts','inventory_count_lines'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins manage %1$s" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "Admins manage %1$s" ON public.%1$s USING (public.has_role(auth.uid(), ''admin''::public.app_role))', t);
    EXECUTE format('DROP POLICY IF EXISTS "Staff view %1$s" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "Staff view %1$s" ON public.%1$s FOR SELECT USING (public.has_role(auth.uid(), ''admin''::public.app_role) OR public.has_role(auth.uid(), ''approver''::public.app_role) OR public.has_role(auth.uid(), ''writer''::public.app_role))', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO anon, authenticated, service_role', t);
  END LOOP;
END $$;

-- manage_inventory_count: create / add_line / set_count / post / list / get.
-- post applies each non-zero variance via adjust_quant (reason 'cycle_count').
CREATE OR REPLACE FUNCTION "public"."manage_inventory_count"(
  "p_action" "text",
  "p_count_id" "uuid" DEFAULT NULL,
  "p_location_id" "uuid" DEFAULT NULL,
  "p_product_id" "uuid" DEFAULT NULL,
  "p_lot_id" "uuid" DEFAULT NULL,
  "p_counted_qty" numeric DEFAULT NULL,
  "p_line_id" "uuid" DEFAULT NULL,
  "p_notes" "text" DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
  v_id uuid;
  v_sys numeric;
  v_status text;
  v_line RECORD;
  v_applied int := 0;
BEGIN
  IF p_action <> 'list' AND p_action <> 'get' AND NOT v_writer THEN
    RAISE EXCEPTION 'Only admins can modify inventory counts';
  END IF;

  IF p_action = 'create' THEN
    IF p_location_id IS NULL THEN RAISE EXCEPTION 'location_id required'; END IF;
    INSERT INTO inventory_counts (location_id, notes, created_by)
    VALUES (p_location_id, p_notes, auth.uid()) RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'count_id', v_id);

  ELSIF p_action = 'add_line' THEN
    IF p_count_id IS NULL OR p_product_id IS NULL THEN RAISE EXCEPTION 'count_id and product_id required'; END IF;
    SELECT location_id, status INTO p_location_id, v_status FROM inventory_counts WHERE id = p_count_id;
    IF v_status <> 'draft' THEN RAISE EXCEPTION 'Count % is not draft', p_count_id; END IF;
    SELECT COALESCE(SUM(quantity), 0) INTO v_sys FROM stock_quants
      WHERE product_id = p_product_id AND location_id = p_location_id
        AND (p_lot_id IS NULL OR lot_id = p_lot_id);
    INSERT INTO inventory_count_lines (count_id, product_id, lot_id, system_qty, counted_qty)
    VALUES (p_count_id, p_product_id, p_lot_id, v_sys, COALESCE(p_counted_qty, v_sys))
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'line_id', v_id, 'system_qty', v_sys);

  ELSIF p_action = 'set_count' THEN
    IF p_line_id IS NULL OR p_counted_qty IS NULL THEN RAISE EXCEPTION 'line_id and counted_qty required'; END IF;
    UPDATE inventory_count_lines SET counted_qty = p_counted_qty WHERE id = p_line_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Line % not found', p_line_id; END IF;
    RETURN jsonb_build_object('success', true, 'line_id', p_line_id);

  ELSIF p_action = 'post' THEN
    IF p_count_id IS NULL THEN RAISE EXCEPTION 'count_id required'; END IF;
    SELECT location_id, status INTO p_location_id, v_status FROM inventory_counts WHERE id = p_count_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Count % not found', p_count_id; END IF;
    IF v_status <> 'draft' THEN RAISE EXCEPTION 'Count % already %', p_count_id, v_status; END IF;
    FOR v_line IN SELECT product_id, lot_id, variance FROM inventory_count_lines WHERE count_id = p_count_id AND variance <> 0 LOOP
      PERFORM adjust_quant(v_line.product_id, p_location_id, v_line.variance, v_line.lot_id, 'cycle_count');
      v_applied := v_applied + 1;
    END LOOP;
    UPDATE inventory_counts SET status = 'posted', posted_at = now() WHERE id = p_count_id;
    RETURN jsonb_build_object('success', true, 'count_id', p_count_id, 'adjustments_applied', v_applied);

  ELSIF p_action = 'get' THEN
    RETURN jsonb_build_object('success', true,
      'count', (SELECT to_jsonb(c) FROM inventory_counts c WHERE c.id = p_count_id),
      'lines', (SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.created_at), '[]'::jsonb)
                FROM inventory_count_lines l WHERE l.count_id = p_count_id));

  ELSIF p_action = 'list' THEN
    RETURN jsonb_build_object('success', true, 'counts', (
      SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC), '[]'::jsonb)
      FROM inventory_counts c WHERE p_location_id IS NULL OR c.location_id = p_location_id));

  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use create|add_line|set_count|post|get|list', p_action;
  END IF;
END;
$$;

ALTER FUNCTION "public"."manage_inventory_count"("text","uuid","uuid","uuid","uuid",numeric,"uuid","text") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."manage_inventory_count"("text","uuid","uuid","uuid","uuid",numeric,"uuid","text") TO "anon", "authenticated", "service_role";
