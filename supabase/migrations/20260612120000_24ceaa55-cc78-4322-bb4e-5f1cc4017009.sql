-- Floor-wave-1 · F4 (docs/parity/sprint-floor-wave1.md): real calendar events.
-- Verify-first finding: the calendar module had NO table — list_events reads
-- bookings. This adds calendar_events (with attendees jsonb) + manage_calendar_event
-- RPC so the module owns standalone events (meetings, deadlines) alongside the
-- bookings it aggregates. Additive-only. Idempotent.

CREATE TABLE IF NOT EXISTS "public"."calendar_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone,
    "all_day" boolean DEFAULT false NOT NULL,
    "location" "text",
    "attendees" "jsonb" DEFAULT '[]'::jsonb,
    "related_entity_type" "text",
    "related_entity_id" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "calendar_events_time_order" CHECK ("ends_at" IS NULL OR "ends_at" >= "starts_at")
);
CREATE INDEX IF NOT EXISTS "calendar_events_starts_idx" ON "public"."calendar_events" ("starts_at");

ALTER TABLE "public"."calendar_events" OWNER TO "postgres";
ALTER TABLE "public"."calendar_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage calendar_events" ON "public"."calendar_events";
CREATE POLICY "Admins manage calendar_events" ON "public"."calendar_events"
  USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));
DROP POLICY IF EXISTS "Staff view calendar_events" ON "public"."calendar_events";
CREATE POLICY "Staff view calendar_events" ON "public"."calendar_events"
  FOR SELECT USING (
    "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'approver'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'writer'::"public"."app_role"));
GRANT ALL ON TABLE "public"."calendar_events" TO "anon";
GRANT ALL ON TABLE "public"."calendar_events" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_events" TO "service_role";

DROP TRIGGER IF EXISTS "update_calendar_events_updated_at" ON "public"."calendar_events";
CREATE TRIGGER "update_calendar_events_updated_at"
  BEFORE UPDATE ON "public"."calendar_events"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

CREATE OR REPLACE FUNCTION "public"."manage_calendar_event"(
  "p_action" "text",
  "p_event_id" "uuid" DEFAULT NULL,
  "p_title" "text" DEFAULT NULL,
  "p_description" "text" DEFAULT NULL,
  "p_starts_at" timestamp with time zone DEFAULT NULL,
  "p_ends_at" timestamp with time zone DEFAULT NULL,
  "p_all_day" boolean DEFAULT NULL,
  "p_location" "text" DEFAULT NULL,
  "p_attendees" "jsonb" DEFAULT NULL,
  "p_from" timestamp with time zone DEFAULT NULL,
  "p_to" timestamp with time zone DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
  v_id uuid; v_rows jsonb;
BEGIN
  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.starts_at), '[]'::jsonb) INTO v_rows
    FROM calendar_events e
    WHERE e.starts_at >= COALESCE(p_from, now() - interval '7 days')
      AND e.starts_at <  COALESCE(p_to, now() + interval '30 days');
    RETURN jsonb_build_object('success', true, 'events', v_rows);
  END IF;
  IF NOT v_writer THEN RAISE EXCEPTION 'Only admins can modify calendar events'; END IF;
  IF p_action = 'create' THEN
    IF p_title IS NULL OR p_starts_at IS NULL THEN
      RAISE EXCEPTION 'title and starts_at are required';
    END IF;
    INSERT INTO calendar_events (title, description, starts_at, ends_at, all_day, location, attendees, created_by)
    VALUES (p_title, p_description, p_starts_at, p_ends_at, COALESCE(p_all_day,false), p_location, COALESCE(p_attendees,'[]'::jsonb), auth.uid())
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'event_id', v_id);
  ELSIF p_action = 'update' THEN
    IF p_event_id IS NULL THEN RAISE EXCEPTION 'event_id is required'; END IF;
    UPDATE calendar_events SET
      title = COALESCE(p_title, title),
      description = COALESCE(p_description, description),
      starts_at = COALESCE(p_starts_at, starts_at),
      ends_at = COALESCE(p_ends_at, ends_at),
      all_day = COALESCE(p_all_day, all_day),
      location = COALESCE(p_location, location),
      attendees = COALESCE(p_attendees, attendees)
    WHERE id = p_event_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Event % not found', p_event_id; END IF;
    RETURN jsonb_build_object('success', true, 'event_id', p_event_id);
  ELSIF p_action = 'delete' THEN
    IF p_event_id IS NULL THEN RAISE EXCEPTION 'event_id is required'; END IF;
    DELETE FROM calendar_events WHERE id = p_event_id;
    RETURN jsonb_build_object('success', true, 'deleted', p_event_id);
  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|create|update|delete', p_action;
  END IF;
END $$;
ALTER FUNCTION "public"."manage_calendar_event"("text","uuid","text","text",timestamptz,timestamptz,boolean,"text","jsonb",timestamptz,timestamptz) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."manage_calendar_event"("text","uuid","text","text",timestamptz,timestamptz,boolean,"text","jsonb",timestamptz,timestamptz) TO "anon", "authenticated", "service_role";
