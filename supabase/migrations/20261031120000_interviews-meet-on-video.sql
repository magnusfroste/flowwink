-- ============================================================
-- Migration: an interview meets on video, and the candidate picks the time
-- Date: 2026-10-31
-- Safe to re-run: Yes (CREATE IF NOT EXISTS / OR REPLACE, seeds only where missing)
-- ============================================================
--
-- schedule_interview put an event on the calendar and an interview row in
-- the pipeline, but the candidate got no place to meet and no say in when;
-- and it admitted admin/writer roles, not the recruitment module the rest of
-- the pipeline answers to. Now, stitched from modules that already exist:
--
--   * _schedule_interview_core — the one way an interview is booked (the
--     admin, an agent and the candidate's own pick all land here): conflict
--     check, a WebMeet room with a waiting room (the same room a video booking
--     makes, /meet/<slug>, the interviewer as host — one candidate at a time),
--     the calendar event, the interview row, and the application moved to
--     interview_scheduled.
--   * schedule_interview gains p_video (default true) and the module gate;
--     cancel ends the room.
--   * interview_invitations — the recruiter proposes up to ten times; the
--     candidate opens /interview/<token> (no account) and books one:
--     invite_to_interview (staff/agent), interview_invitation_view and
--     book_interview_slot (the link's holder).
--   * mail templates interview_invitation and interview_confirmed (en + sv);
--     comms-send sends them (kinds interview_invitation, interview_confirmation,
--     interview_booked).

-- ── 1. The invitation ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.interview_invitations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token                uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  application_id       uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  interviewer_id       uuid,
  kind                 text NOT NULL DEFAULT 'interview',
  duration_minutes     integer NOT NULL DEFAULT 45 CHECK (duration_minutes BETWEEN 10 AND 480),
  slots                timestamptz[] NOT NULL,
  message              text,
  status               text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'booked', 'cancelled', 'expired')),
  interview_id         uuid REFERENCES public.interviews(id) ON DELETE SET NULL,
  expires_at           timestamptz NOT NULL,
  sent_at              timestamptz,
  confirmation_sent_at timestamptz,
  created_by           uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS interview_invitations_application_idx ON public.interview_invitations (application_id);

ALTER TABLE public.interview_invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Recruiters manage interview invitations" ON public.interview_invitations;
CREATE POLICY "Recruiters manage interview invitations" ON public.interview_invitations
  FOR ALL TO authenticated
  USING (public.can_access_module(auth.uid(), 'recruitment'))
  WITH CHECK (public.can_access_module(auth.uid(), 'recruitment'));
REVOKE ALL ON public.interview_invitations FROM anon;

-- A confirmation mail is sent once per interview, however many surfaces ask.
ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS confirmation_sent_at timestamptz;

-- ── 2. The one way an interview is booked ─────────────────────────────────
CREATE OR REPLACE FUNCTION public._schedule_interview_core(
  p_application_id uuid,
  p_kind text,
  p_start timestamptz,
  p_end timestamptz,
  p_interviewer_id uuid,
  p_location text,
  p_meeting_url text,
  p_video boolean,
  p_created_by uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_app record;
  v_row public.interviews;
  v_event_id uuid;
  v_conflicts jsonb;
  v_slug text;
  v_url text := NULLIF(trim(COALESCE(p_meeting_url, '')), '');
BEGIN
  IF p_application_id IS NULL OR p_start IS NULL OR p_end IS NULL THEN
    RAISE EXCEPTION 'application_id, start and end are required';
  END IF;
  IF p_end <= p_start THEN RAISE EXCEPTION 'end must be after start'; END IF;
  SELECT a.*, j.title AS job_title INTO v_app
    FROM public.applications a
    LEFT JOIN public.job_postings j ON j.id = a.job_posting_id
   WHERE a.id = p_application_id;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'Application % not found', p_application_id; END IF;
  IF v_app.stage::text IN ('rejected', 'hired', 'withdrawn') THEN
    RAISE EXCEPTION 'Application is % — cannot schedule an interview', v_app.stage;
  END IF;

  IF p_interviewer_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('interview_id', id, 'scheduled_start', scheduled_start, 'scheduled_end', scheduled_end)), '[]'::jsonb)
      INTO v_conflicts
      FROM public.interviews
     WHERE interviewer_id = p_interviewer_id AND status = 'scheduled'
       AND scheduled_start < p_end AND scheduled_end > p_start;
    IF jsonb_array_length(v_conflicts) > 0 THEN
      RETURN jsonb_build_object('success', false, 'reason', 'interviewer_conflict', 'conflicts', v_conflicts);
    END IF;
  END IF;

  -- A place to meet: unless a location or a link was given, a WebMeet room
  -- with a waiting room — the interviewer lets the candidate in.
  IF v_url IS NULL AND NULLIF(trim(COALESCE(p_location, '')), '') IS NULL AND COALESCE(p_video, true) THEN
    v_slug := public.gen_webmeet_slug();
    INSERT INTO public.webmeet_rooms (slug, name, host_user_id, max_participants, expires_at, waiting_room)
    VALUES (v_slug, left(format('Interview — %s', v_app.candidate_name), 120), p_interviewer_id, 6, p_end + interval '2 hours', true);
    v_url := '/meet/' || v_slug;
  END IF;

  INSERT INTO public.calendar_events
    (title, description, starts_at, ends_at, location, related_entity_type, related_entity_id, created_by, visibility)
  VALUES (
    format('Interview: %s — %s', v_app.candidate_name, COALESCE(v_app.job_title, 'open application')),
    format('%s interview for application %s', COALESCE(p_kind, 'interview'), p_application_id),
    p_start, p_end, COALESCE(NULLIF(trim(COALESCE(p_location, '')), ''), v_url),
    'interview', p_application_id::text, p_created_by, 'team'
  ) RETURNING id INTO v_event_id;

  INSERT INTO public.interviews
    (application_id, kind, scheduled_start, scheduled_end, interviewer_id, location, meeting_url, calendar_event_id, created_by)
  VALUES
    (p_application_id, COALESCE(p_kind, 'interview'), p_start, p_end, p_interviewer_id, NULLIF(trim(COALESCE(p_location, '')), ''), v_url, v_event_id, p_created_by)
  RETURNING * INTO v_row;

  -- The pipeline follows: a candidate with a booked interview is in that stage.
  IF v_app.stage::text IN ('applied', 'screened') THEN
    UPDATE public.applications SET stage = 'interview_scheduled', updated_at = now() WHERE id = p_application_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'interview', to_jsonb(v_row), 'meeting_url', v_url);
END $$;
REVOKE EXECUTE ON FUNCTION public._schedule_interview_core(uuid, text, timestamptz, timestamptz, uuid, text, text, boolean, uuid) FROM PUBLIC, anon, authenticated;
-- Its callers are definer functions that hold their own gate (the module, the token).
GRANT EXECUTE ON FUNCTION public._schedule_interview_core(uuid, text, timestamptz, timestamptz, uuid, text, text, boolean, uuid) TO service_role;

-- ── 3. schedule_interview: the module gate, video by default ──────────────
DROP FUNCTION IF EXISTS public.schedule_interview(text, uuid, uuid, text, timestamptz, timestamptz, uuid, text, text, text, integer);
CREATE OR REPLACE FUNCTION public.schedule_interview(
  p_action text,
  p_interview_id uuid DEFAULT NULL,
  p_application_id uuid DEFAULT NULL,
  p_kind text DEFAULT NULL,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL,
  p_interviewer_id uuid DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_meeting_url text DEFAULT NULL,
  p_feedback text DEFAULT NULL,
  p_rating integer DEFAULT NULL,
  p_video boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.interviews;
  v_result jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'recruitment')) THEN
    RAISE EXCEPTION 'Requires the recruitment module — an admin can grant it under Users → Role Permissions';
  END IF;

  IF p_action = 'list' THEN
    SELECT jsonb_build_object('success', true, 'interviews', COALESCE(jsonb_agg(jsonb_build_object(
      'id', i.id, 'application_id', i.application_id, 'candidate_name', a.candidate_name,
      'job_title', j.title, 'kind', i.kind, 'scheduled_start', i.scheduled_start,
      'scheduled_end', i.scheduled_end, 'interviewer_id', i.interviewer_id,
      'status', i.status, 'rating', i.rating, 'feedback', i.feedback, 'location', i.location, 'meeting_url', i.meeting_url
    ) ORDER BY i.scheduled_start DESC), '[]'::jsonb)) INTO v_result
    FROM public.interviews i
    JOIN public.applications a ON a.id = i.application_id
    LEFT JOIN public.job_postings j ON j.id = a.job_posting_id
    WHERE (p_application_id IS NULL OR i.application_id = p_application_id)
      AND (p_interviewer_id IS NULL OR i.interviewer_id = p_interviewer_id);
    RETURN v_result;
  END IF;

  IF p_action = 'schedule' THEN
    RETURN public._schedule_interview_core(p_application_id, p_kind, p_start, p_end, p_interviewer_id,
                                           p_location, p_meeting_url, p_video, auth.uid());

  ELSIF p_action = 'reschedule' THEN
    IF p_interview_id IS NULL OR p_start IS NULL OR p_end IS NULL THEN
      RAISE EXCEPTION 'interview_id, start and end are required';
    END IF;
    UPDATE public.interviews
       SET scheduled_start = p_start, scheduled_end = p_end,
           interviewer_id = COALESCE(p_interviewer_id, interviewer_id),
           location = COALESCE(p_location, location),
           meeting_url = COALESCE(p_meeting_url, meeting_url),
           status = 'scheduled', confirmation_sent_at = NULL, updated_at = now()
     WHERE id = p_interview_id RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Interview % not found', p_interview_id; END IF;
    UPDATE public.calendar_events SET starts_at = p_start, ends_at = p_end, updated_at = now()
     WHERE id = v_row.calendar_event_id;
    IF v_row.meeting_url LIKE '/meet/%' THEN
      UPDATE public.webmeet_rooms SET expires_at = p_end + interval '2 hours', ended_at = NULL WHERE slug = substr(v_row.meeting_url, 7);
    END IF;
    RETURN jsonb_build_object('success', true, 'interview', to_jsonb(v_row));

  ELSIF p_action IN ('cancel', 'complete', 'no_show') THEN
    IF p_interview_id IS NULL THEN RAISE EXCEPTION 'interview_id is required'; END IF;
    UPDATE public.interviews
       SET status = CASE p_action WHEN 'cancel' THEN 'cancelled' WHEN 'complete' THEN 'completed' ELSE 'no_show' END,
           feedback = COALESCE(p_feedback, feedback),
           rating = COALESCE(p_rating, rating),
           updated_at = now()
     WHERE id = p_interview_id RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Interview % not found', p_interview_id; END IF;
    IF p_action = 'cancel' THEN
      DELETE FROM public.calendar_events WHERE id = v_row.calendar_event_id;
      IF v_row.meeting_url LIKE '/meet/%' THEN
        UPDATE public.webmeet_rooms SET ended_at = COALESCE(ended_at, now()) WHERE slug = substr(v_row.meeting_url, 7);
      END IF;
    END IF;
    -- A completed interview moves the candidate on and leaves its feedback in the notes.
    IF p_action = 'complete' THEN
      UPDATE public.applications SET stage = 'interviewed', updated_at = now()
       WHERE id = v_row.application_id AND stage::text IN ('applied', 'screened', 'interview_scheduled');
      IF p_feedback IS NOT NULL OR p_rating IS NOT NULL THEN
        INSERT INTO public.candidate_notes (application_id, author_id, body, rating)
        VALUES (v_row.application_id, auth.uid(),
                format('[%s interview] %s', v_row.kind, COALESCE(p_feedback, '(no written feedback)')), p_rating);
      END IF;
    END IF;
    RETURN jsonb_build_object('success', true, 'interview', to_jsonb(v_row));
  END IF;

  RAISE EXCEPTION 'Unknown action: % (use schedule|reschedule|complete|cancel|no_show|list)', p_action;
END $$;
GRANT EXECUTE ON FUNCTION public.schedule_interview(text, uuid, uuid, text, timestamptz, timestamptz, uuid, text, text, text, integer, boolean) TO authenticated, service_role;

-- ── 4. The recruiter proposes, the candidate picks ────────────────────────
CREATE OR REPLACE FUNCTION public.invite_to_interview(
  p_application_id uuid,
  p_slots timestamptz[],
  p_duration_minutes integer DEFAULT 45,
  p_kind text DEFAULT 'interview',
  p_interviewer_id uuid DEFAULT NULL,
  p_message text DEFAULT NULL,
  p_expires_in_days integer DEFAULT 7
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_app record;
  v_interviewer uuid := COALESCE(p_interviewer_id, auth.uid());
  v_slots timestamptz[];
  v_row public.interview_invitations;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'recruitment')) THEN
    RAISE EXCEPTION 'Requires the recruitment module — an admin can grant it under Users → Role Permissions';
  END IF;
  SELECT id, stage, candidate_name INTO v_app FROM public.applications WHERE id = p_application_id;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'Application % not found', p_application_id; END IF;
  IF v_app.stage::text IN ('rejected', 'hired', 'withdrawn') THEN
    RAISE EXCEPTION 'Application is % — cannot invite to an interview', v_app.stage;
  END IF;
  IF p_duration_minutes IS NULL OR p_duration_minutes < 10 OR p_duration_minutes > 480 THEN
    RAISE EXCEPTION 'duration_minutes is 10–480';
  END IF;

  -- Future, distinct, ordered, at most ten — and free in the interviewer's calendar.
  SELECT array_agg(s ORDER BY s) INTO v_slots
    FROM (SELECT DISTINCT unnest(COALESCE(p_slots, '{}')) AS s) x
   WHERE s > now()
     AND (v_interviewer IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.interviews i
        WHERE i.interviewer_id = v_interviewer AND i.status = 'scheduled'
          AND i.scheduled_start < s + make_interval(mins => p_duration_minutes) AND i.scheduled_end > s));
  IF v_slots IS NULL OR array_length(v_slots, 1) = 0 THEN
    RAISE EXCEPTION 'no_free_slots: propose at least one future time the interviewer is free';
  END IF;
  IF array_length(v_slots, 1) > 10 THEN v_slots := v_slots[1:10]; END IF;

  -- One open invitation per candidate: a new one replaces the old.
  UPDATE public.interview_invitations SET status = 'cancelled', updated_at = now()
   WHERE application_id = p_application_id AND status = 'open';

  INSERT INTO public.interview_invitations
    (application_id, interviewer_id, kind, duration_minutes, slots, message, expires_at, created_by)
  VALUES (p_application_id, v_interviewer, COALESCE(NULLIF(trim(p_kind), ''), 'interview'), p_duration_minutes, v_slots,
          NULLIF(trim(COALESCE(p_message, '')), ''), now() + make_interval(days => GREATEST(1, LEAST(COALESCE(p_expires_in_days, 7), 60))),
          auth.uid())
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('success', true, 'invitation_id', v_row.id, 'token', v_row.token,
    'path', '/interview/' || v_row.token, 'slots', to_jsonb(v_row.slots), 'expires_at', v_row.expires_at);
END $$;
GRANT EXECUTE ON FUNCTION public.invite_to_interview(uuid, timestamptz[], integer, text, uuid, text, integer) TO authenticated, service_role;

-- What the link's holder sees: the role, the length, the times still free.
CREATE OR REPLACE FUNCTION public.interview_invitation_view(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inv public.interview_invitations;
  v_app record;
  v_iv public.interviews;
  v_free jsonb;
BEGIN
  SELECT * INTO v_inv FROM public.interview_invitations WHERE token = p_token;
  IF v_inv.id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  SELECT a.candidate_name, j.title AS job_title INTO v_app
    FROM public.applications a LEFT JOIN public.job_postings j ON j.id = a.job_posting_id
   WHERE a.id = v_inv.application_id;

  IF v_inv.status = 'booked' THEN
    SELECT * INTO v_iv FROM public.interviews WHERE id = v_inv.interview_id;
    RETURN jsonb_build_object('found', true, 'status', 'booked',
      'candidate_first_name', split_part(COALESCE(v_app.candidate_name, ''), ' ', 1), 'job_title', v_app.job_title,
      'kind', v_inv.kind, 'duration_minutes', v_inv.duration_minutes,
      'booked', jsonb_build_object('start', v_iv.scheduled_start, 'end', v_iv.scheduled_end, 'meeting_url', v_iv.meeting_url, 'status', v_iv.status));
  END IF;

  SELECT COALESCE(jsonb_agg(s ORDER BY s), '[]'::jsonb) INTO v_free
    FROM unnest(v_inv.slots) AS s
   WHERE s > now()
     AND (v_inv.interviewer_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.interviews i
        WHERE i.interviewer_id = v_inv.interviewer_id AND i.status = 'scheduled'
          AND i.scheduled_start < s + make_interval(mins => v_inv.duration_minutes) AND i.scheduled_end > s));

  RETURN jsonb_build_object('found', true,
    'status', CASE WHEN v_inv.status = 'open' AND v_inv.expires_at <= now() THEN 'expired' ELSE v_inv.status END,
    'candidate_first_name', split_part(COALESCE(v_app.candidate_name, ''), ' ', 1), 'job_title', v_app.job_title,
    'kind', v_inv.kind, 'duration_minutes', v_inv.duration_minutes, 'message', v_inv.message,
    'expires_at', v_inv.expires_at, 'slots', v_free);
END $$;
GRANT EXECUTE ON FUNCTION public.interview_invitation_view(uuid) TO anon, authenticated, service_role;

-- The candidate books one of the proposed times. Idempotent for the same time.
CREATE OR REPLACE FUNCTION public.book_interview_slot(p_token uuid, p_start timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inv public.interview_invitations;
  v_iv public.interviews;
  v_res jsonb;
BEGIN
  SELECT * INTO v_inv FROM public.interview_invitations WHERE token = p_token FOR UPDATE;
  IF v_inv.id IS NULL THEN RETURN jsonb_build_object('success', false, 'reason', 'not_found'); END IF;

  IF v_inv.status = 'booked' THEN
    SELECT * INTO v_iv FROM public.interviews WHERE id = v_inv.interview_id;
    IF v_iv.scheduled_start = p_start THEN
      RETURN jsonb_build_object('success', true, 'already_booked', true, 'interview_id', v_iv.id,
        'start', v_iv.scheduled_start, 'end', v_iv.scheduled_end, 'meeting_url', v_iv.meeting_url);
    END IF;
    RETURN jsonb_build_object('success', false, 'reason', 'already_booked');
  END IF;
  IF v_inv.status <> 'open' OR v_inv.expires_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_open');
  END IF;
  IF NOT (p_start = ANY (v_inv.slots)) OR p_start <= now() THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_a_proposed_time');
  END IF;

  v_res := public._schedule_interview_core(v_inv.application_id, v_inv.kind, p_start,
             p_start + make_interval(mins => v_inv.duration_minutes), v_inv.interviewer_id,
             NULL, NULL, true, v_inv.created_by);
  IF NOT COALESCE((v_res->>'success')::boolean, false) THEN
    RETURN jsonb_build_object('success', false, 'reason', COALESCE(v_res->>'reason', 'taken'));
  END IF;

  UPDATE public.interview_invitations
     SET status = 'booked', interview_id = (v_res->'interview'->>'id')::uuid, updated_at = now()
   WHERE id = v_inv.id;

  PERFORM public.emit_platform_event('interview.booked', jsonb_build_object(
    'interview_id', v_res->'interview'->>'id', 'application_id', v_inv.application_id, 'start', p_start), 'recruitment');

  RETURN jsonb_build_object('success', true, 'interview_id', v_res->'interview'->>'id',
    'start', p_start, 'end', p_start + make_interval(mins => v_inv.duration_minutes), 'meeting_url', v_res->>'meeting_url');
END $$;
GRANT EXECUTE ON FUNCTION public.book_interview_slot(uuid, timestamptz) TO anon, authenticated, service_role;

-- ── 5. The words ──────────────────────────────────────────────────────────
DO $$
DECLARE r record;
  v_btn text := 'style="display:inline-block;background:#111;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600"';
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('interview_invitation', 'en', 'transactional',
       'Pick a time for your interview — {{job_title}}',
       '<h2 style="margin:0 0 12px;font-size:20px">Let''s meet</h2>'
       || '<p>Hi{{#candidate_name}} {{candidate_name}}{{/candidate_name}},</p>'
       || '<p>Thank you for applying for <strong>{{job_title}}</strong>. We would like to meet you for a {{duration}}-minute video interview. Pick the time that suits you best — you will get the link to the meeting right away.</p>'
       || '{{#message}}<p style="white-space:pre-wrap">{{message}}</p>{{/message}}'
       || '<p style="margin:24px 0"><a href="{{invite_url}}" ' || v_btn || '>Choose a time</a></p>'
       || '<p>Kind regards,<br>{{site_name}}</p>',
       '["candidate_name","job_title","duration","message","invite_url","site_name"]'),
      ('interview_invitation', 'sv', 'transactional',
       'Välj en tid för din intervju — {{job_title}}',
       '<h2 style="margin:0 0 12px;font-size:20px">Vi vill gärna träffa dig</h2>'
       || '<p>Hej{{#candidate_name}} {{candidate_name}}{{/candidate_name}}!</p>'
       || '<p>Tack för din ansökan till <strong>{{job_title}}</strong>. Vi vill gärna träffa dig för en videointervju på {{duration}} minuter. Välj den tid som passar dig bäst — du får länken till mötet direkt.</p>'
       || '{{#message}}<p style="white-space:pre-wrap">{{message}}</p>{{/message}}'
       || '<p style="margin:24px 0"><a href="{{invite_url}}" ' || v_btn || '>Välj en tid</a></p>'
       || '<p>Vänliga hälsningar<br>{{site_name}}</p>',
       '["candidate_name","job_title","duration","message","invite_url","site_name"]'),
      ('interview_confirmed', 'en', 'transactional',
       'Your interview — {{when}}',
       '<h2 style="margin:0 0 12px;font-size:20px">Your interview is booked</h2>'
       || '<p>Hi{{#candidate_name}} {{candidate_name}}{{/candidate_name}},</p>'
       || '<p>We look forward to meeting you about <strong>{{job_title}}</strong> on <strong>{{when}}</strong>.</p>'
       || '{{#meeting_url}}<p>The interview is a video call in your browser — no account or app needed. Open the link a few minutes early; we will let you in.</p>'
       || '<p style="margin:24px 0"><a href="{{meeting_url}}" ' || v_btn || '>Join the interview</a></p>{{/meeting_url}}'
       || '{{#location}}<p><strong>Where:</strong> {{location}}</p>{{/location}}'
       || '<p>Kind regards,<br>{{site_name}}</p>',
       '["candidate_name","job_title","when","meeting_url","location","site_name"]'),
      ('interview_confirmed', 'sv', 'transactional',
       'Din intervju — {{when}}',
       '<h2 style="margin:0 0 12px;font-size:20px">Din intervju är bokad</h2>'
       || '<p>Hej{{#candidate_name}} {{candidate_name}}{{/candidate_name}}!</p>'
       || '<p>Vi ser fram emot att träffa dig om <strong>{{job_title}}</strong> <strong>{{when}}</strong>.</p>'
       || '{{#meeting_url}}<p>Intervjun är ett videosamtal i webbläsaren — inget konto eller någon app behövs. Öppna länken några minuter innan, så släpper vi in dig.</p>'
       || '<p style="margin:24px 0"><a href="{{meeting_url}}" ' || v_btn || '>Gå till intervjun</a></p>{{/meeting_url}}'
       || '{{#location}}<p><strong>Plats:</strong> {{location}}</p>{{/location}}'
       || '<p>Vänliga hälsningar<br>{{site_name}}</p>',
       '["candidate_name","job_title","when","meeting_url","location","site_name"]')
    ) AS t(name, locale, category, subject, html, variables)
  LOOP
    INSERT INTO public.email_templates (name, locale, subject, html, category, variables, active)
    SELECT r.name, r.locale, r.subject, r.html, r.category, r.variables::jsonb, true
    WHERE NOT EXISTS (SELECT 1 FROM public.email_templates WHERE name = r.name AND locale = r.locale);
  END LOOP;
END $$;
