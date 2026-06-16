-- Contact Center — Fas 1: request_callback RPC.
-- Callbacks ride the existing bookings table (no new table): a callback is a booking tagged
-- metadata.kind='callback'. The merged CallbacksPanel UI already reads bookings filtered on that
-- tag and calls request_callback({action:'mark_attempted', callback_id}). This RPC backs that.
-- service_id is nullable on bookings, so a callback needs no booking_services row. Idempotent.

CREATE OR REPLACE FUNCTION "public"."request_callback"(
  "p_action" "text",
  "p_callback_id" "uuid" DEFAULT NULL,
  "p_conversation_id" "uuid" DEFAULT NULL,
  "p_customer_name" "text" DEFAULT NULL,
  "p_customer_email" "text" DEFAULT NULL,
  "p_customer_phone" "text" DEFAULT NULL,
  "p_preferred_time" timestamp with time zone DEFAULT NULL,
  "p_notes" "text" DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_id uuid;
  v_start timestamptz;
  v_attempts integer;
  v_rows jsonb;
BEGIN
  IF p_action = 'create' THEN
    v_start := COALESCE(p_preferred_time, now());
    INSERT INTO bookings (service_id, customer_name, customer_email, customer_phone,
                          start_time, end_time, status, notes, metadata)
    VALUES (
      NULL,
      COALESCE(NULLIF(btrim(p_customer_name), ''), 'Callback request'),
      COALESCE(p_customer_email, ''),
      p_customer_phone,
      v_start,
      v_start + interval '15 minutes',
      'pending',
      p_notes,
      jsonb_build_object('kind', 'callback', 'conversation_id', p_conversation_id, 'attempts', 0)
    )
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'callback_id', v_id, 'scheduled_for', v_start);

  ELSIF p_action = 'mark_attempted' THEN
    IF p_callback_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'callback_id is required for mark_attempted');
    END IF;
    UPDATE bookings SET
      metadata = metadata
        || jsonb_build_object(
             'attempts', COALESCE((metadata->>'attempts')::int, 0) + 1,
             'last_attempt_at', now()),
      updated_at = now()
    WHERE id = p_callback_id AND metadata->>'kind' = 'callback'
    RETURNING COALESCE((metadata->>'attempts')::int, 0) INTO v_attempts;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'callback not found');
    END IF;
    RETURN jsonb_build_object('success', true, 'callback_id', p_callback_id, 'attempts', v_attempts);

  ELSIF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.start_time), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT id, customer_name, customer_email, customer_phone, start_time, status,
             notes, metadata, created_at
      FROM bookings WHERE metadata->>'kind' = 'callback'
      ORDER BY start_time DESC LIMIT 100
    ) b;
    RETURN jsonb_build_object('success', true, 'callbacks', v_rows);

  ELSE
    RETURN jsonb_build_object('success', false, 'error',
      format('unknown action %L (use create | mark_attempted | list)', p_action));
  END IF;
END $$;
ALTER FUNCTION "public"."request_callback"("text", "uuid", "uuid", "text", "text", "text", timestamp with time zone, "text") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."request_callback"("text", "uuid", "uuid", "text", "text", "text", timestamp with time zone, "text")
  TO "anon", "authenticated", "service_role";
