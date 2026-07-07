-- Calendar: parity round 4 (docs/parity/capabilities/calendar.json)
-- Adds: shared calendars (visibility private/team/public + RLS), reminders
-- (reminder_minutes + reminder_sent_at, delivery swept by the
-- send-calendar-reminders edge function), and ICS export (export_calendar_ics
-- RPC — subscribe/import into Google/Outlook/Apple Calendar).
--
-- manage_calendar_event is re-created with p_visibility + p_reminder_minutes.
-- The old 11-param signature is dropped first so PostgREST doesn't see an
-- ambiguous overload.
--
-- Idempotent DDL. Forward-dated for the Lovable-managed migrate runner
-- (backdated files are silently skipped).

-- ── 1. Schema additions ──────────────────────────────────────────────────────
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'team',
  ADD COLUMN IF NOT EXISTS reminder_minutes integer,
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

ALTER TABLE public.calendar_events DROP CONSTRAINT IF EXISTS calendar_events_visibility_check;
ALTER TABLE public.calendar_events
  ADD CONSTRAINT calendar_events_visibility_check
  CHECK (visibility = ANY (ARRAY['private'::text, 'team'::text, 'public'::text]));

ALTER TABLE public.calendar_events DROP CONSTRAINT IF EXISTS calendar_events_reminder_minutes_check;
ALTER TABLE public.calendar_events
  ADD CONSTRAINT calendar_events_reminder_minutes_check
  CHECK (reminder_minutes IS NULL OR (reminder_minutes >= 0 AND reminder_minutes <= 20160));

-- ── 2. RLS: private events are creator-only (admins still see everything) ────
DROP POLICY IF EXISTS "Staff view calendar_events" ON public.calendar_events;
CREATE POLICY "Staff view calendar_events" ON public.calendar_events
  FOR SELECT
  USING (
    (has_role(auth.uid(), 'admin'::app_role)
     OR has_role(auth.uid(), 'approver'::app_role)
     OR has_role(auth.uid(), 'writer'::app_role))
    AND (visibility <> 'private' OR created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  );

-- ── 3. manage_calendar_event with visibility + reminder ─────────────────────
DROP FUNCTION IF EXISTS public.manage_calendar_event(text, uuid, text, text, timestamptz, timestamptz, boolean, text, jsonb, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.manage_calendar_event(
  p_action text, p_event_id uuid DEFAULT NULL, p_title text DEFAULT NULL,
  p_description text DEFAULT NULL, p_starts_at timestamptz DEFAULT NULL,
  p_ends_at timestamptz DEFAULT NULL, p_all_day boolean DEFAULT NULL,
  p_location text DEFAULT NULL, p_attendees jsonb DEFAULT NULL,
  p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL,
  p_visibility text DEFAULT NULL, p_reminder_minutes integer DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
  v_id uuid; v_rows jsonb;
BEGIN
  IF p_visibility IS NOT NULL AND p_visibility NOT IN ('private','team','public') THEN
    RAISE EXCEPTION 'visibility must be private|team|public';
  END IF;
  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.starts_at), '[]'::jsonb) INTO v_rows
    FROM calendar_events e
    WHERE e.starts_at >= COALESCE(p_from, now() - interval '7 days')
      AND e.starts_at <  COALESCE(p_to, now() + interval '30 days')
      AND (e.visibility <> 'private' OR e.created_by = auth.uid() OR v_writer);
    RETURN jsonb_build_object('success', true, 'events', v_rows);
  END IF;
  IF NOT v_writer THEN RAISE EXCEPTION 'Only admins can modify calendar events'; END IF;
  IF p_action = 'create' THEN
    IF p_title IS NULL OR p_starts_at IS NULL THEN
      RAISE EXCEPTION 'title and starts_at are required';
    END IF;
    INSERT INTO calendar_events (title, description, starts_at, ends_at, all_day, location, attendees, created_by, visibility, reminder_minutes)
    VALUES (p_title, p_description, p_starts_at, p_ends_at, COALESCE(p_all_day,false), p_location, COALESCE(p_attendees,'[]'::jsonb), auth.uid(),
            COALESCE(p_visibility, 'team'), p_reminder_minutes)
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
      attendees = COALESCE(p_attendees, attendees),
      visibility = COALESCE(p_visibility, visibility),
      reminder_minutes = COALESCE(p_reminder_minutes, reminder_minutes),
      -- Re-arm the reminder when the start time moves.
      reminder_sent_at = CASE WHEN p_starts_at IS NOT NULL AND p_starts_at <> starts_at THEN NULL ELSE reminder_sent_at END
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
END $function$;

-- ── 4. export_calendar_ics: RFC 5545 export for Google/Outlook/Apple ─────────
CREATE OR REPLACE FUNCTION public.export_calendar_ics(
  p_from timestamptz DEFAULT now() - interval '30 days',
  p_to timestamptz DEFAULT now() + interval '365 days',
  p_include_private boolean DEFAULT false
) RETURNS text
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ics text; v_e record; v_esc text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'approver') OR has_role(auth.uid(), 'writer')) THEN
    RAISE EXCEPTION 'export_calendar_ics: staff role required';
  END IF;

  v_ics := 'BEGIN:VCALENDAR' || E'\r\n'
        || 'VERSION:2.0' || E'\r\n'
        || 'PRODID:-//FlowWink//Calendar//EN' || E'\r\n'
        || 'CALSCALE:GREGORIAN' || E'\r\n'
        || 'METHOD:PUBLISH' || E'\r\n';

  FOR v_e IN
    SELECT * FROM calendar_events
    WHERE starts_at >= p_from AND starts_at < p_to
      AND (p_include_private OR visibility <> 'private' OR created_by = auth.uid())
    ORDER BY starts_at
  LOOP
    v_ics := v_ics || 'BEGIN:VEVENT' || E'\r\n'
          || 'UID:' || v_e.id || '@flowwink' || E'\r\n'
          || 'DTSTAMP:' || to_char(COALESCE(v_e.updated_at, v_e.created_at) AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS"Z"') || E'\r\n';
    IF v_e.all_day THEN
      v_ics := v_ics || 'DTSTART;VALUE=DATE:' || to_char(v_e.starts_at AT TIME ZONE 'UTC', 'YYYYMMDD') || E'\r\n';
      IF v_e.ends_at IS NOT NULL THEN
        v_ics := v_ics || 'DTEND;VALUE=DATE:' || to_char((v_e.ends_at AT TIME ZONE 'UTC') + interval '1 day', 'YYYYMMDD') || E'\r\n';
      END IF;
    ELSE
      v_ics := v_ics || 'DTSTART:' || to_char(v_e.starts_at AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS"Z"') || E'\r\n';
      IF v_e.ends_at IS NOT NULL THEN
        v_ics := v_ics || 'DTEND:' || to_char(v_e.ends_at AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS"Z"') || E'\r\n';
      END IF;
    END IF;
    -- Escape per RFC 5545: backslash, semicolon, comma, newline.
    v_esc := replace(replace(replace(replace(COALESCE(v_e.title,''), '\', '\\'), ';', '\;'), ',', '\,'), E'\n', '\n');
    v_ics := v_ics || 'SUMMARY:' || v_esc || E'\r\n';
    IF COALESCE(v_e.description, '') <> '' THEN
      v_esc := replace(replace(replace(replace(v_e.description, '\', '\\'), ';', '\;'), ',', '\,'), E'\n', '\n');
      v_ics := v_ics || 'DESCRIPTION:' || v_esc || E'\r\n';
    END IF;
    IF COALESCE(v_e.location, '') <> '' THEN
      v_esc := replace(replace(replace(replace(v_e.location, '\', '\\'), ';', '\;'), ',', '\,'), E'\n', '\n');
      v_ics := v_ics || 'LOCATION:' || v_esc || E'\r\n';
    END IF;
    IF v_e.reminder_minutes IS NOT NULL THEN
      v_ics := v_ics || 'BEGIN:VALARM' || E'\r\n'
            || 'ACTION:DISPLAY' || E'\r\n'
            || 'DESCRIPTION:Reminder' || E'\r\n'
            || 'TRIGGER:-PT' || v_e.reminder_minutes || 'M' || E'\r\n'
            || 'END:VALARM' || E'\r\n';
    END IF;
    v_ics := v_ics || 'END:VEVENT' || E'\r\n';
  END LOOP;

  v_ics := v_ics || 'END:VCALENDAR' || E'\r\n';
  RETURN v_ics;
END; $function$;

-- ── Grants ───────────────────────────────────────────────────────────────────
GRANT ALL ON FUNCTION public.manage_calendar_event(text, uuid, text, text, timestamptz, timestamptz, boolean, text, jsonb, timestamptz, timestamptz, text, integer) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.export_calendar_ics(timestamptz, timestamptz, boolean) TO anon, authenticated, service_role;
