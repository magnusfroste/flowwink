-- Breadth S3 · maintenance module (Odoo Maintenance parity, wave 1).
-- Equipment registry + maintenance requests (corrective) + preventive schedules
-- (interval-based; a sweep materializes due requests). Additive. Idempotent.

CREATE TABLE IF NOT EXISTS "public"."equipment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "serial_number" "text",
    "category" "text",
    "location" "text",
    "assigned_to" "uuid",
    "purchase_date" "date",
    "warranty_until" "date",
    "fixed_asset_id" "uuid",
    "status" "text" DEFAULT 'operational' NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "equipment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "equipment_status_check"
      CHECK ("status" IN ('operational','under_maintenance','broken','retired'))
);

CREATE TABLE IF NOT EXISTS "public"."maintenance_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "equipment_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "kind" "text" DEFAULT 'corrective' NOT NULL,
    "priority" "text" DEFAULT 'medium' NOT NULL,
    "status" "text" DEFAULT 'new' NOT NULL,
    "assigned_to" "uuid",
    "due_date" "date",
    "completed_at" timestamp with time zone,
    "duration_minutes" integer,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "maintenance_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "maintenance_requests_kind_check" CHECK ("kind" IN ('corrective','preventive')),
    CONSTRAINT "maintenance_requests_priority_check" CHECK ("priority" IN ('low','medium','high','critical')),
    CONSTRAINT "maintenance_requests_status_check" CHECK ("status" IN ('new','in_progress','done','cancelled')),
    CONSTRAINT "maintenance_requests_equipment_fkey"
      FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "maintenance_requests_open_idx"
  ON "public"."maintenance_requests" ("equipment_id") WHERE "status" IN ('new','in_progress');

CREATE TABLE IF NOT EXISTS "public"."maintenance_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "equipment_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "interval_days" integer NOT NULL,
    "next_due" "date" NOT NULL,
    "instructions" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "maintenance_schedules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "maintenance_schedules_interval_positive" CHECK ("interval_days" > 0),
    CONSTRAINT "maintenance_schedules_equipment_fkey"
      FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE CASCADE
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['equipment','maintenance_requests','maintenance_schedules'] LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO postgres', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins manage %1$s" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "Admins manage %1$s" ON public.%1$s USING (public.has_role(auth.uid(), ''admin''::public.app_role))', t);
    EXECUTE format('DROP POLICY IF EXISTS "Staff view %1$s" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "Staff view %1$s" ON public.%1$s FOR SELECT USING (public.has_role(auth.uid(), ''admin''::public.app_role) OR public.has_role(auth.uid(), ''approver''::public.app_role) OR public.has_role(auth.uid(), ''writer''::public.app_role))', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO anon, authenticated, service_role', t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS "update_equipment_updated_at" ON "public"."equipment";
CREATE TRIGGER "update_equipment_updated_at" BEFORE UPDATE ON "public"."equipment"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();
DROP TRIGGER IF EXISTS "update_maintenance_requests_updated_at" ON "public"."maintenance_requests";
CREATE TRIGGER "update_maintenance_requests_updated_at" BEFORE UPDATE ON "public"."maintenance_requests"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

-- manage_equipment / manage_maintenance_request via generic db: handlers needs
-- allowlist — use dedicated RPCs instead (consistent with the rest of the program).
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
ALTER FUNCTION "public"."manage_equipment"("text","uuid","text","text","text","text","text","text") OWNER TO "postgres";
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
    -- equipment goes under_maintenance on critical correctives
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
    -- back to operational when the last open request closes
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
ALTER FUNCTION "public"."manage_maintenance_request"("text","uuid","uuid","text","text","text","text","text","date",integer) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."manage_maintenance_request"("text","uuid","uuid","text","text","text","text","text","date",integer) TO "anon", "authenticated", "service_role";

-- Preventive sweep: materialize due schedules into requests, roll next_due forward.
CREATE OR REPLACE FUNCTION "public"."run_preventive_maintenance"() RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_s RECORD; v_created int := 0;
BEGIN
  FOR v_s IN
    SELECT * FROM maintenance_schedules
    WHERE is_active AND next_due <= CURRENT_DATE
    FOR UPDATE SKIP LOCKED
  LOOP
    -- skip if an open preventive request for this schedule's title already exists
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
ALTER FUNCTION "public"."run_preventive_maintenance"() OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."run_preventive_maintenance"() TO "anon", "authenticated", "service_role";
