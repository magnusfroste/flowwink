-- ===== Reconcile part 2/3 =====
CREATE TABLE IF NOT EXISTS "public"."cowork_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "author_type" "text" DEFAULT 'agent' NOT NULL,
    "author_name" "text" DEFAULT 'FlowPilot' NOT NULL,
    "content" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::jsonb,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cowork_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cowork_messages_author_type_check" CHECK ("author_type" IN ('agent','user','system')),
    CONSTRAINT "cowork_messages_content_not_empty" CHECK (length(trim("content")) > 0)
);
CREATE INDEX IF NOT EXISTS "cowork_messages_created_idx" ON "public"."cowork_messages" ("created_at" DESC);
ALTER TABLE "public"."cowork_messages" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage cowork_messages" ON "public"."cowork_messages";
CREATE POLICY "Admins manage cowork_messages" ON "public"."cowork_messages"
  USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));
DROP POLICY IF EXISTS "Staff view cowork_messages" ON "public"."cowork_messages";
CREATE POLICY "Staff view cowork_messages" ON "public"."cowork_messages"
  FOR SELECT USING (
    "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'approver'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'writer'::"public"."app_role"));
GRANT ALL ON TABLE "public"."cowork_messages" TO "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION "public"."post_to_cowork_chat"(
  "p_content" "text",
  "p_author_name" "text" DEFAULT 'FlowPilot',
  "p_metadata" "jsonb" DEFAULT '{}'::jsonb
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_id uuid; v_type text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')
          OR has_role(auth.uid(), 'approver') OR has_role(auth.uid(), 'writer')) THEN
    RAISE EXCEPTION 'Not authorized to post to cowork chat';
  END IF;
  IF p_content IS NULL OR length(trim(p_content)) = 0 THEN
    RAISE EXCEPTION 'content is required';
  END IF;
  v_type := CASE WHEN auth.role() = 'service_role' THEN 'agent' ELSE 'user' END;
  INSERT INTO cowork_messages (author_type, author_name, content, metadata, created_by)
  VALUES (v_type, COALESCE(NULLIF(trim(p_author_name),''),'FlowPilot'), p_content,
          COALESCE(p_metadata,'{}'::jsonb), auth.uid())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'message_id', v_id);
END $$;
GRANT ALL ON FUNCTION "public"."post_to_cowork_chat"("text","text","jsonb") TO "anon", "authenticated", "service_role";

-- Maintenance module RPCs
CREATE OR REPLACE FUNCTION "public"."manage_equipment"(
  "p_action" "text",
  "p_equipment_id" "uuid" DEFAULT NULL,
  "p_name" "text" DEFAULT NULL,
  "p_serial_number" "text" DEFAULT NULL,
  "p_category" "text" DEFAULT NULL,
  "p_location" "text" DEFAULT NULL,
  "p_status" "text" DEFAULT NULL,
  "p_notes" "text" DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
  v_id uuid; v_rows jsonb;
BEGIN
  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.name), '[]'::jsonb) INTO v_rows
    FROM equipment e WHERE p_status IS NULL OR e.status = p_status;
    RETURN jsonb_build_object('success', true, 'equipment', v_rows);
  END IF;
  IF NOT v_writer THEN RAISE EXCEPTION 'Only admins can modify equipment'; END IF;
  IF p_action = 'create' THEN
    IF p_name IS NULL THEN RAISE EXCEPTION 'name is required'; END IF;
    INSERT INTO equipment (name, serial_number, category, location, status, notes)
    VALUES (p_name, p_serial_number, p_category, p_location, COALESCE(p_status,'operational'), p_notes)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'equipment_id', v_id);
  ELSIF p_action = 'update' THEN
    IF p_equipment_id IS NULL THEN RAISE EXCEPTION 'equipment_id required'; END IF;
    UPDATE equipment SET
      name = COALESCE(p_name, name), serial_number = COALESCE(p_serial_number, serial_number),
      category = COALESCE(p_category, category), location = COALESCE(p_location, location),
      status = COALESCE(p_status, status), notes = COALESCE(p_notes, notes)
    WHERE id = p_equipment_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Equipment % not found', p_equipment_id; END IF;
    RETURN jsonb_build_object('success', true, 'equipment_id', p_equipment_id);
  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|create|update', p_action;
  END IF;
END $$;
GRANT ALL ON FUNCTION "public"."manage_equipment"("text","uuid","text","text","text","text","text","text") TO "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION "public"."manage_maintenance_request"(
  "p_action" "text",
  "p_request_id" "uuid" DEFAULT NULL,
  "p_equipment_id" "uuid" DEFAULT NULL,
  "p_title" "text" DEFAULT NULL,
  "p_description" "text" DEFAULT NULL,
  "p_kind" "text" DEFAULT NULL,
  "p_priority" "text" DEFAULT NULL,
  "p_status" "text" DEFAULT NULL,
  "p_due_date" "date" DEFAULT NULL,
  "p_duration_minutes" integer DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
  v_id uuid; v_rows jsonb;
BEGIN
  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb) INTO v_rows
    FROM maintenance_requests r
    WHERE (p_status IS NULL OR r.status = p_status)
      AND (p_equipment_id IS NULL OR r.equipment_id = p_equipment_id);
    RETURN jsonb_build_object('success', true, 'requests', v_rows);
  END IF;
  IF NOT v_writer THEN RAISE EXCEPTION 'Only admins can modify maintenance requests'; END IF;
  IF p_action = 'create' THEN
    IF p_equipment_id IS NULL OR p_title IS NULL THEN
      RAISE EXCEPTION 'equipment_id and title are required';
    END IF;
    INSERT INTO maintenance_requests (equipment_id, title, description, kind, priority, due_date, created_by)
    VALUES (p_equipment_id, p_title, p_description, COALESCE(p_kind,'corrective'),
            COALESCE(p_priority,'medium'), p_due_date, auth.uid())
    RETURNING id INTO v_id;
    IF COALESCE(p_priority,'medium') = 'critical' THEN
      UPDATE equipment SET status='under_maintenance' WHERE id=p_equipment_id AND status='operational';
    END IF;
    RETURN jsonb_build_object('success', true, 'request_id', v_id);
  ELSIF p_action = 'update' THEN
    IF p_request_id IS NULL THEN RAISE EXCEPTION 'request_id required'; END IF;
    UPDATE maintenance_requests SET
      title = COALESCE(p_title, title), description = COALESCE(p_description, description),
      priority = COALESCE(p_priority, priority), status = COALESCE(p_status, status),
      due_date = COALESCE(p_due_date, due_date),
      duration_minutes = COALESCE(p_duration_minutes, duration_minutes),
      completed_at = CASE WHEN p_status = 'done' THEN now() ELSE completed_at END
    WHERE id = p_request_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Request % not found', p_request_id; END IF;
    IF p_status IN ('done','cancelled') THEN
      UPDATE equipment e SET status='operational'
      WHERE e.id = (SELECT equipment_id FROM maintenance_requests WHERE id=p_request_id)
        AND e.status='under_maintenance'
        AND NOT EXISTS (SELECT 1 FROM maintenance_requests r
                        WHERE r.equipment_id=e.id AND r.status IN ('new','in_progress'));
    END IF;
    RETURN jsonb_build_object('success', true, 'request_id', p_request_id);
  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|create|update', p_action;
  END IF;
END $$;
GRANT ALL ON FUNCTION "public"."manage_maintenance_request"("text","uuid","uuid","text","text","text","text","text","date",integer) TO "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION "public"."run_preventive_maintenance"() RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_s RECORD; v_created int := 0;
BEGIN
  FOR v_s IN
    SELECT * FROM maintenance_schedules
    WHERE is_active AND next_due <= CURRENT_DATE
    FOR UPDATE SKIP LOCKED
  LOOP
    IF NOT EXISTS (SELECT 1 FROM maintenance_requests
                   WHERE equipment_id = v_s.equipment_id AND kind='preventive'
                     AND title = v_s.title AND status IN ('new','in_progress')) THEN
      INSERT INTO maintenance_requests (equipment_id, title, description, kind, priority, due_date)
      VALUES (v_s.equipment_id, v_s.title, v_s.instructions, 'preventive', 'medium', v_s.next_due);
      v_created := v_created + 1;
    END IF;
    UPDATE maintenance_schedules SET next_due = v_s.next_due + (v_s.interval_days || ' days')::interval
    WHERE id = v_s.id;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'created', v_created);
END $$;
GRANT ALL ON FUNCTION "public"."run_preventive_maintenance"() TO "anon", "authenticated", "service_role";

-- Project milestones + sub-tasks
ALTER TABLE "public"."project_tasks"
  ADD COLUMN IF NOT EXISTS "parent_task_id" "uuid",
  ADD COLUMN IF NOT EXISTS "milestone_id" "uuid";
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name='project_tasks_parent_task_id_fkey' AND table_name='project_tasks') THEN
    ALTER TABLE "public"."project_tasks" ADD CONSTRAINT "project_tasks_parent_task_id_fkey"
      FOREIGN KEY ("parent_task_id") REFERENCES "public"."project_tasks"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name='project_tasks_milestone_id_fkey' AND table_name='project_tasks') THEN
    ALTER TABLE "public"."project_tasks" ADD CONSTRAINT "project_tasks_milestone_id_fkey"
      FOREIGN KEY ("milestone_id") REFERENCES "public"."project_milestones"("id") ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "project_tasks_parent_task_id_idx"
  ON "public"."project_tasks" ("parent_task_id") WHERE "parent_task_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "project_tasks_milestone_id_idx"
  ON "public"."project_tasks" ("milestone_id") WHERE "milestone_id" IS NOT NULL;

CREATE OR REPLACE FUNCTION "public"."manage_project_milestone"(
  "p_action" "text",
  "p_milestone_id" "uuid" DEFAULT NULL,
  "p_project_id" "uuid" DEFAULT NULL,
  "p_name" "text" DEFAULT NULL,
  "p_description" "text" DEFAULT NULL,
  "p_due_date" "date" DEFAULT NULL,
  "p_sort_order" integer DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
  v_id uuid;
  v_result jsonb;
BEGIN
  IF p_action IN ('create','update','delete','reach','reopen') AND NOT v_writer THEN
    RAISE EXCEPTION 'Only admins can modify project milestones';
  END IF;
  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', m.id, 'project_id', m.project_id, 'name', m.name, 'due_date', m.due_date,
      'sort_order', m.sort_order, 'is_reached', m.is_reached, 'reached_at', m.reached_at,
      'tasks_total', (SELECT count(*) FROM project_tasks t WHERE t.milestone_id = m.id),
      'tasks_done',  (SELECT count(*) FROM project_tasks t WHERE t.milestone_id = m.id AND t.completed_at IS NOT NULL)
    ) ORDER BY m.sort_order, m.due_date NULLS LAST), '[]'::jsonb) INTO v_result
    FROM project_milestones m
    WHERE p_project_id IS NULL OR m.project_id = p_project_id;
    RETURN jsonb_build_object('success', true, 'milestones', v_result);
  ELSIF p_action = 'create' THEN
    IF p_project_id IS NULL OR p_name IS NULL THEN RAISE EXCEPTION 'project_id and name are required'; END IF;
    INSERT INTO project_milestones (project_id, name, description, due_date, sort_order, created_by)
    VALUES (p_project_id, p_name, p_description, p_due_date, COALESCE(p_sort_order, 0), auth.uid())
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'milestone_id', v_id);
  ELSIF p_action = 'update' THEN
    IF p_milestone_id IS NULL THEN RAISE EXCEPTION 'milestone_id is required'; END IF;
    UPDATE project_milestones SET
      name = COALESCE(p_name, name),
      description = COALESCE(p_description, description),
      due_date = COALESCE(p_due_date, due_date),
      sort_order = COALESCE(p_sort_order, sort_order)
    WHERE id = p_milestone_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Milestone % not found', p_milestone_id; END IF;
    RETURN jsonb_build_object('success', true, 'milestone_id', p_milestone_id);
  ELSIF p_action = 'reach' THEN
    IF p_milestone_id IS NULL THEN RAISE EXCEPTION 'milestone_id is required'; END IF;
    UPDATE project_milestones SET is_reached = true, reached_at = COALESCE(reached_at, now())
    WHERE id = p_milestone_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Milestone % not found', p_milestone_id; END IF;
    RETURN jsonb_build_object('success', true, 'milestone_id', p_milestone_id, 'is_reached', true);
  ELSIF p_action = 'reopen' THEN
    IF p_milestone_id IS NULL THEN RAISE EXCEPTION 'milestone_id is required'; END IF;
    UPDATE project_milestones SET is_reached = false, reached_at = NULL WHERE id = p_milestone_id;
    RETURN jsonb_build_object('success', true, 'milestone_id', p_milestone_id, 'is_reached', false);
  ELSIF p_action = 'delete' THEN
    IF p_milestone_id IS NULL THEN RAISE EXCEPTION 'milestone_id is required'; END IF;
    DELETE FROM project_milestones WHERE id = p_milestone_id;
    RETURN jsonb_build_object('success', true, 'deleted', p_milestone_id);
  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|create|update|reach|reopen|delete', p_action;
  END IF;
END;
$$;
GRANT ALL ON FUNCTION "public"."manage_project_milestone"("text","uuid","uuid","text","text","date",integer) TO "anon", "authenticated", "service_role";

-- Shipping
CREATE OR REPLACE FUNCTION "public"."calc_shipping_rate"(
  "p_carrier_id" "uuid",
  "p_weight_grams" integer,
  "p_length_cm" numeric DEFAULT NULL,
  "p_width_cm" numeric DEFAULT NULL,
  "p_height_cm" numeric DEFAULT NULL,
  "p_dim_divisor" integer DEFAULT 5000
) RETURNS "jsonb"
LANGUAGE "plpgsql" STABLE
SET "search_path" TO 'public'
AS $$
DECLARE
  v_dim_grams integer := 0;
  v_billable integer;
  v_rate RECORD;
  v_divisor integer := COALESCE(NULLIF(p_dim_divisor, 0), 5000);
BEGIN
  IF p_carrier_id IS NULL OR p_weight_grams IS NULL OR p_weight_grams < 0 THEN
    RAISE EXCEPTION 'carrier_id and a non-negative weight_grams are required';
  END IF;
  IF p_length_cm IS NOT NULL AND p_width_cm IS NOT NULL AND p_height_cm IS NOT NULL THEN
    v_dim_grams := ROUND(p_length_cm * p_width_cm * p_height_cm / v_divisor * 1000)::int;
  END IF;
  v_billable := GREATEST(p_weight_grams, v_dim_grams);
  SELECT id, name, price_cents, currency,
         COALESCE(dim_divisor, v_divisor) AS used_divisor
  INTO v_rate
  FROM shipping_rates
  WHERE carrier_id = p_carrier_id
    AND is_active
    AND v_billable >= min_weight_grams
    AND (max_weight_grams IS NULL OR v_billable <= max_weight_grams)
  ORDER BY price_cents ASC, min_weight_grams DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_matching_rate',
      'billable_grams', v_billable, 'actual_grams', p_weight_grams, 'dimensional_grams', v_dim_grams);
  END IF;
  RETURN jsonb_build_object('success', true, 'rate_id', v_rate.id, 'rate_name', v_rate.name,
    'price_cents', v_rate.price_cents, 'currency', v_rate.currency,
    'billable_grams', v_billable, 'actual_grams', p_weight_grams, 'dimensional_grams', v_dim_grams,
    'billed_on', CASE WHEN v_dim_grams > p_weight_grams THEN 'dimensional' ELSE 'actual' END);
END;
$$;
GRANT ALL ON FUNCTION "public"."calc_shipping_rate"("uuid",integer,numeric,numeric,numeric,integer) TO "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION "public"."manage_shipping_rate"(
  "p_action" "text",
  "p_rate_id" "uuid" DEFAULT NULL,
  "p_carrier_id" "uuid" DEFAULT NULL,
  "p_name" "text" DEFAULT NULL,
  "p_min_weight_grams" integer DEFAULT NULL,
  "p_max_weight_grams" integer DEFAULT NULL,
  "p_price_cents" integer DEFAULT NULL,
  "p_currency" "text" DEFAULT NULL,
  "p_dim_divisor" integer DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
  v_id uuid; v_result jsonb;
BEGIN
  IF p_action IN ('create','update','delete') AND NOT v_writer THEN
    RAISE EXCEPTION 'Only admins can modify shipping rates';
  END IF;
  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.min_weight_grams), '[]'::jsonb) INTO v_result
    FROM shipping_rates r
    WHERE p_carrier_id IS NULL OR r.carrier_id = p_carrier_id;
    RETURN jsonb_build_object('success', true, 'rates', v_result);
  ELSIF p_action = 'create' THEN
    IF p_carrier_id IS NULL OR p_name IS NULL OR p_price_cents IS NULL THEN
      RAISE EXCEPTION 'carrier_id, name and price_cents are required';
    END IF;
    INSERT INTO shipping_rates (carrier_id, name, min_weight_grams, max_weight_grams, price_cents, currency, dim_divisor)
    VALUES (p_carrier_id, p_name, COALESCE(p_min_weight_grams, 0), p_max_weight_grams, p_price_cents,
            COALESCE(p_currency, 'SEK'), p_dim_divisor)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'rate_id', v_id);
  ELSIF p_action = 'update' THEN
    IF p_rate_id IS NULL THEN RAISE EXCEPTION 'rate_id is required'; END IF;
    UPDATE shipping_rates SET
      name = COALESCE(p_name, name),
      min_weight_grams = COALESCE(p_min_weight_grams, min_weight_grams),
      max_weight_grams = COALESCE(p_max_weight_grams, max_weight_grams),
      price_cents = COALESCE(p_price_cents, price_cents),
      currency = COALESCE(p_currency, currency),
      dim_divisor = COALESCE(p_dim_divisor, dim_divisor)
    WHERE id = p_rate_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rate % not found', p_rate_id; END IF;
    RETURN jsonb_build_object('success', true, 'rate_id', p_rate_id);
  ELSIF p_action = 'delete' THEN
    IF p_rate_id IS NULL THEN RAISE EXCEPTION 'rate_id is required'; END IF;
    DELETE FROM shipping_rates WHERE id = p_rate_id;
    RETURN jsonb_build_object('success', true, 'deleted', p_rate_id);
  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|create|update|delete', p_action;
  END IF;
END;
$$;
GRANT ALL ON FUNCTION "public"."manage_shipping_rate"("text","uuid","uuid","text",integer,integer,integer,"text",integer) TO "anon", "authenticated", "service_role";

-- Manufacturing
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
GRANT ALL ON FUNCTION "public"."manage_work_center"("text","uuid","text","text",integer,numeric) TO "anon","authenticated","service_role";

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
GRANT ALL ON FUNCTION "public"."manage_routing_operation"("text","uuid","uuid",integer,"text","uuid",numeric) TO "anon","authenticated","service_role";

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
GRANT ALL ON FUNCTION "public"."generate_mo_work_orders"("uuid") TO "anon","authenticated","service_role";

-- POS tipping + gift cards
ALTER TABLE "public"."pos_sales"
  ADD COLUMN IF NOT EXISTS "tip_cents" integer DEFAULT 0 NOT NULL;

CREATE OR REPLACE FUNCTION "public"."add_tip"(
  "p_sale_id" "uuid", "p_tip_cents" integer, "p_method" "text" DEFAULT 'card'
) RETURNS "jsonb" LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_sale RECORD;
BEGIN
  IF NOT (auth.role()='service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer')) THEN
    RAISE EXCEPTION 'Not authorized to add tips';
  END IF;
  IF p_tip_cents IS NULL OR p_tip_cents <= 0 THEN RAISE EXCEPTION 'tip_cents must be positive'; END IF;
  SELECT id, total_cents, tip_cents INTO v_sale FROM pos_sales WHERE id = p_sale_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale % not found', p_sale_id; END IF;
  UPDATE pos_sales SET tip_cents = tip_cents + p_tip_cents WHERE id = p_sale_id;
  INSERT INTO pos_payments (sale_id, method, amount_cents, reference)
    VALUES (p_sale_id, p_method, p_tip_cents, 'tip');
  RETURN jsonb_build_object('success', true, 'sale_id', p_sale_id,
    'tip_cents', v_sale.tip_cents + p_tip_cents,
    'grand_total_cents', v_sale.total_cents + v_sale.tip_cents + p_tip_cents);
END; $$;
GRANT ALL ON FUNCTION "public"."add_tip"("uuid",integer,"text") TO "anon","authenticated","service_role";

CREATE OR REPLACE FUNCTION "public"."manage_gift_card"(
  "p_action" "text", "p_code" "text" DEFAULT NULL, "p_amount_cents" integer DEFAULT NULL,
  "p_currency" "text" DEFAULT NULL
) RETURNS "jsonb" LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_writer boolean := (auth.role()='service_role' OR has_role(auth.uid(),'admin')); v_id uuid; v_res jsonb; v_gc RECORD;
BEGIN
  IF p_action IN ('issue','deactivate') AND NOT v_writer THEN RAISE EXCEPTION 'Only admins can manage gift cards'; END IF;
  IF p_action='issue' THEN
    IF p_code IS NULL OR p_amount_cents IS NULL OR p_amount_cents <= 0 THEN RAISE EXCEPTION 'code and positive amount_cents required'; END IF;
    INSERT INTO gift_cards(code, initial_balance_cents, balance_cents, currency)
      VALUES (p_code, p_amount_cents, p_amount_cents, COALESCE(p_currency,'SEK')) RETURNING id INTO v_id;
    RETURN jsonb_build_object('success',true,'gift_card_id',v_id,'balance_cents',p_amount_cents);
  ELSIF p_action='get' THEN
    SELECT * INTO v_gc FROM gift_cards WHERE code = p_code;
    IF NOT FOUND THEN RAISE EXCEPTION 'Gift card % not found', p_code; END IF;
    RETURN jsonb_build_object('success',true,'gift_card',to_jsonb(v_gc));
  ELSIF p_action='list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(g) ORDER BY g.created_at DESC),'[]'::jsonb) INTO v_res FROM gift_cards g;
    RETURN jsonb_build_object('success',true,'gift_cards',v_res);
  ELSIF p_action='deactivate' THEN
    UPDATE gift_cards SET is_active=false WHERE code=p_code;
    IF NOT FOUND THEN RAISE EXCEPTION 'Gift card % not found', p_code; END IF;
    RETURN jsonb_build_object('success',true,'code',p_code,'is_active',false);
  ELSE RAISE EXCEPTION 'Unknown action: %. Use issue|get|list|deactivate', p_action; END IF;
END; $$;
GRANT ALL ON FUNCTION "public"."manage_gift_card"("text","text",integer,"text") TO "anon","authenticated","service_role";

CREATE OR REPLACE FUNCTION "public"."redeem_gift_card"(
  "p_code" "text", "p_amount_cents" integer
) RETURNS "jsonb" LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_gc RECORD;
BEGIN
  IF NOT (auth.role()='service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer')) THEN
    RAISE EXCEPTION 'Not authorized to redeem gift cards';
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN RAISE EXCEPTION 'amount_cents must be positive'; END IF;
  SELECT * INTO v_gc FROM gift_cards WHERE code = p_code FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gift card % not found', p_code; END IF;
  IF NOT v_gc.is_active THEN RAISE EXCEPTION 'Gift card % is inactive', p_code; END IF;
  IF v_gc.balance_cents < p_amount_cents THEN
    RAISE EXCEPTION 'Insufficient balance: have %, need %', v_gc.balance_cents, p_amount_cents;
  END IF;
  UPDATE gift_cards SET balance_cents = balance_cents - p_amount_cents WHERE id = v_gc.id;
  RETURN jsonb_build_object('success',true,'code',p_code,'redeemed_cents',p_amount_cents,
    'remaining_balance_cents', v_gc.balance_cents - p_amount_cents);
END; $$;
GRANT ALL ON FUNCTION "public"."redeem_gift_card"("text",integer) TO "anon","authenticated","service_role";