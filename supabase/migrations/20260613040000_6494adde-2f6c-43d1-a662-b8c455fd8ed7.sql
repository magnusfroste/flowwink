-- Manufacturing: work centers + routing + work orders + labor cost
-- (docs/parity/capabilities/manufacturing.json: work_centers_routing, work_orders, labor_cost).
-- Adds work_centers (resource + hourly cost), routing_operations (ordered steps per BOM,
-- each at a work center for N minutes), and mo_work_orders (per-MO operation instances
-- with planned labor cost). generate_mo_work_orders() materialises a confirmed MO's work
-- orders from its BOM routing, scaling duration by MO quantity and costing labor at the
-- work center's hourly rate. No external deps; deterministic. Idempotent.

CREATE TABLE IF NOT EXISTS "public"."work_centers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "cost_per_hour_cents" integer DEFAULT 0 NOT NULL,
    "capacity_per_hour" numeric(12,3),                 -- units/hour, optional (capacity_scheduling later)
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "work_centers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "work_centers_code_key" UNIQUE ("code")
);

CREATE TABLE IF NOT EXISTS "public"."routing_operations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bom_id" "uuid" NOT NULL,
    "sequence" integer DEFAULT 10 NOT NULL,
    "name" "text" NOT NULL,
    "work_center_id" "uuid" NOT NULL,
    "duration_minutes" numeric(10,2) DEFAULT 0 NOT NULL,  -- minutes per produced unit
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "routing_operations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "routing_operations_bom_seq_key" UNIQUE ("bom_id", "sequence"),
    CONSTRAINT "routing_operations_bom_id_fkey"
      FOREIGN KEY ("bom_id") REFERENCES "public"."bom_headers"("id") ON DELETE CASCADE,
    CONSTRAINT "routing_operations_work_center_id_fkey"
      FOREIGN KEY ("work_center_id") REFERENCES "public"."work_centers"("id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "routing_operations_bom_idx" ON "public"."routing_operations" ("bom_id");

CREATE TABLE IF NOT EXISTS "public"."mo_work_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mo_id" "uuid" NOT NULL,
    "routing_operation_id" "uuid",
    "sequence" integer DEFAULT 10 NOT NULL,
    "name" "text" NOT NULL,
    "work_center_id" "uuid",
    "status" "text" DEFAULT 'pending' NOT NULL,
    "planned_minutes" numeric(12,2) DEFAULT 0 NOT NULL,
    "actual_minutes" numeric(12,2),
    "planned_labor_cost_cents" integer DEFAULT 0 NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mo_work_orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mo_work_orders_status_check" CHECK ("status" IN ('pending','in_progress','done','cancelled')),
    CONSTRAINT "mo_work_orders_mo_id_fkey"
      FOREIGN KEY ("mo_id") REFERENCES "public"."manufacturing_orders"("id") ON DELETE CASCADE,
    CONSTRAINT "mo_work_orders_routing_operation_id_fkey"
      FOREIGN KEY ("routing_operation_id") REFERENCES "public"."routing_operations"("id") ON DELETE SET NULL,
    CONSTRAINT "mo_work_orders_work_center_id_fkey"
      FOREIGN KEY ("work_center_id") REFERENCES "public"."work_centers"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "mo_work_orders_mo_idx" ON "public"."mo_work_orders" ("mo_id");

ALTER TABLE "public"."work_centers" OWNER TO "postgres";
ALTER TABLE "public"."routing_operations" OWNER TO "postgres";
ALTER TABLE "public"."mo_work_orders" OWNER TO "postgres";

DROP TRIGGER IF EXISTS "update_work_centers_updated_at" ON "public"."work_centers";
CREATE TRIGGER "update_work_centers_updated_at" BEFORE UPDATE ON "public"."work_centers"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['work_centers','routing_operations','mo_work_orders']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins manage %1$s" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "Admins manage %1$s" ON public.%1$s USING (public.has_role(auth.uid(), ''admin''::public.app_role))', t);
    EXECUTE format('DROP POLICY IF EXISTS "Staff view %1$s" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "Staff view %1$s" ON public.%1$s FOR SELECT USING (public.has_role(auth.uid(), ''admin''::public.app_role) OR public.has_role(auth.uid(), ''approver''::public.app_role) OR public.has_role(auth.uid(), ''writer''::public.app_role))', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO anon, authenticated, service_role', t);
  END LOOP;
END $$;

-- manage_work_center: CRUD work centers. Writer-gated.
CREATE OR REPLACE FUNCTION "public"."manage_work_center"(
  "p_action" "text", "p_id" "uuid" DEFAULT NULL, "p_code" "text" DEFAULT NULL,
  "p_name" "text" DEFAULT NULL, "p_cost_per_hour_cents" integer DEFAULT NULL,
  "p_capacity_per_hour" numeric DEFAULT NULL
) RETURNS "jsonb" LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_writer boolean := (auth.role()='service_role' OR has_role(auth.uid(),'admin')); v_id uuid; v_res jsonb;
BEGIN
  IF p_action <> 'list' AND NOT v_writer THEN RAISE EXCEPTION 'Only admins can modify work centers'; END IF;
  IF p_action='list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(w) ORDER BY w.code),'[]'::jsonb) INTO v_res FROM work_centers w;
    RETURN jsonb_build_object('success',true,'work_centers',v_res);
  ELSIF p_action='create' THEN
    IF p_code IS NULL OR p_name IS NULL THEN RAISE EXCEPTION 'code and name required'; END IF;
    INSERT INTO work_centers(code,name,cost_per_hour_cents,capacity_per_hour)
      VALUES (p_code,p_name,COALESCE(p_cost_per_hour_cents,0),p_capacity_per_hour) RETURNING id INTO v_id;
    RETURN jsonb_build_object('success',true,'work_center_id',v_id);
  ELSIF p_action='update' THEN
    IF p_id IS NULL THEN RAISE EXCEPTION 'id required'; END IF;
    UPDATE work_centers SET name=COALESCE(p_name,name), cost_per_hour_cents=COALESCE(p_cost_per_hour_cents,cost_per_hour_cents),
      capacity_per_hour=COALESCE(p_capacity_per_hour,capacity_per_hour) WHERE id=p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Work center % not found', p_id; END IF;
    RETURN jsonb_build_object('success',true,'work_center_id',p_id);
  ELSIF p_action='delete' THEN
    DELETE FROM work_centers WHERE id=p_id; RETURN jsonb_build_object('success',true,'deleted',p_id);
  ELSE RAISE EXCEPTION 'Unknown action: %. Use list|create|update|delete', p_action; END IF;
END; $$;
ALTER FUNCTION "public"."manage_work_center"("text","uuid","text","text",integer,numeric) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."manage_work_center"("text","uuid","text","text",integer,numeric) TO "anon","authenticated","service_role";

-- manage_routing_operation: CRUD ordered ops on a BOM. Writer-gated.
CREATE OR REPLACE FUNCTION "public"."manage_routing_operation"(
  "p_action" "text", "p_id" "uuid" DEFAULT NULL, "p_bom_id" "uuid" DEFAULT NULL,
  "p_sequence" integer DEFAULT NULL, "p_name" "text" DEFAULT NULL,
  "p_work_center_id" "uuid" DEFAULT NULL, "p_duration_minutes" numeric DEFAULT NULL
) RETURNS "jsonb" LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_writer boolean := (auth.role()='service_role' OR has_role(auth.uid(),'admin')); v_id uuid; v_res jsonb;
BEGIN
  IF p_action <> 'list' AND NOT v_writer THEN RAISE EXCEPTION 'Only admins can modify routing'; END IF;
  IF p_action='list' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',o.id,'sequence',o.sequence,'name',o.name,
      'work_center_id',o.work_center_id,'duration_minutes',o.duration_minutes) ORDER BY o.sequence),'[]'::jsonb)
    INTO v_res FROM routing_operations o WHERE o.bom_id = p_bom_id;
    RETURN jsonb_build_object('success',true,'operations',v_res);
  ELSIF p_action='create' THEN
    IF p_bom_id IS NULL OR p_name IS NULL OR p_work_center_id IS NULL THEN
      RAISE EXCEPTION 'bom_id, name and work_center_id required'; END IF;
    INSERT INTO routing_operations(bom_id,sequence,name,work_center_id,duration_minutes)
      VALUES (p_bom_id,COALESCE(p_sequence,10),p_name,p_work_center_id,COALESCE(p_duration_minutes,0)) RETURNING id INTO v_id;
    RETURN jsonb_build_object('success',true,'operation_id',v_id);
  ELSIF p_action='update' THEN
    IF p_id IS NULL THEN RAISE EXCEPTION 'id required'; END IF;
    UPDATE routing_operations SET sequence=COALESCE(p_sequence,sequence), name=COALESCE(p_name,name),
      work_center_id=COALESCE(p_work_center_id,work_center_id), duration_minutes=COALESCE(p_duration_minutes,duration_minutes)
      WHERE id=p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Operation % not found', p_id; END IF;
    RETURN jsonb_build_object('success',true,'operation_id',p_id);
  ELSIF p_action='delete' THEN
    DELETE FROM routing_operations WHERE id=p_id; RETURN jsonb_build_object('success',true,'deleted',p_id);
  ELSE RAISE EXCEPTION 'Unknown action: %. Use list|create|update|delete', p_action; END IF;
END; $$;
ALTER FUNCTION "public"."manage_routing_operation"("text","uuid","uuid",integer,"text","uuid",numeric) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."manage_routing_operation"("text","uuid","uuid",integer,"text","uuid",numeric) TO "anon","authenticated","service_role";

-- generate_mo_work_orders: materialise a MO's work orders from its BOM routing.
-- planned_minutes = op.duration_minutes × MO.quantity; labor cost = minutes/60 × wc rate.
CREATE OR REPLACE FUNCTION "public"."generate_mo_work_orders"("p_mo_id" "uuid")
RETURNS "jsonb" LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_writer boolean := (auth.role()='service_role' OR has_role(auth.uid(),'admin'));
  v_mo RECORD; v_created int := 0; v_total_cost int := 0; v_total_min numeric := 0;
BEGIN
  IF NOT v_writer THEN RAISE EXCEPTION 'Only admins can generate work orders'; END IF;
  SELECT id, bom_id, quantity INTO v_mo FROM manufacturing_orders WHERE id = p_mo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'MO % not found', p_mo_id; END IF;
  IF v_mo.bom_id IS NULL THEN RAISE EXCEPTION 'MO % has no BOM to route from', p_mo_id; END IF;
  -- idempotent: clear any existing generated work orders first
  DELETE FROM mo_work_orders WHERE mo_id = p_mo_id;
  INSERT INTO mo_work_orders (mo_id, routing_operation_id, sequence, name, work_center_id, planned_minutes, planned_labor_cost_cents)
  SELECT p_mo_id, o.id, o.sequence, o.name, o.work_center_id,
         o.duration_minutes * v_mo.quantity,
         ROUND(o.duration_minutes * v_mo.quantity / 60.0 * wc.cost_per_hour_cents)::int
  FROM routing_operations o JOIN work_centers wc ON wc.id = o.work_center_id
  WHERE o.bom_id = v_mo.bom_id;
  GET DIAGNOSTICS v_created = ROW_COUNT;
  SELECT COALESCE(SUM(planned_labor_cost_cents),0), COALESCE(SUM(planned_minutes),0)
    INTO v_total_cost, v_total_min FROM mo_work_orders WHERE mo_id = p_mo_id;
  RETURN jsonb_build_object('success',true,'work_orders_created',v_created,
    'total_planned_minutes',v_total_min,'total_planned_labor_cost_cents',v_total_cost);
END; $$;
ALTER FUNCTION "public"."generate_mo_work_orders"("uuid") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."generate_mo_work_orders"("uuid") TO "anon","authenticated","service_role";
