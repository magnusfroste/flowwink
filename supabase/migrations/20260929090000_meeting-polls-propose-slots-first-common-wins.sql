-- meeting-polls: propose several times, let people answer without an account,
-- and let a RULE pick the first time everyone can make — not a button.
--
-- Modelled on magnusfroste/timeslot (timeslot.fit), ported as a model rather
-- than as code. Three facts from reading that repo on 2026-09-28 shaped this:
--
--   1. It has no "first common time". confirmSlot writes whatever the organizer
--      tapped. The rule lives in the organizer's head. Here it lives in
--      resolve_meeting_poll, deterministic, and a battery scenario asserts it.
--   2. Identity is a name (UNIQUE(invite_id, participant_name)). Here it is an
--      e-mail, normalised, so a respondent can become a contact.
--   3. Its RLS is open and the policy names lie about it:
--        "Only valid edit token can update invites" … USING (true)
--      with verify_edit_token() sitting unused beside it. Same class as #582.
--      Here the base tables are NEVER readable by anon. Every public access
--      goes through a token RPC — the idiom get_quote_by_token already uses —
--      SECURITY DEFINER, validated, REVOKE ALL FROM PUBLIC, explicit grant.
--
-- "First" means the EARLIEST starts_at, not the organizer's list order:
-- "första bästa gemensamt fungerande tiden" is a statement about time.
--
-- Idempotent. Forward-dated so managed instances apply it. See #590.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_polls (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL,
  description       text,
  organizer_email   text NOT NULL,
  organizer_name    text NOT NULL,
  timezone          text NOT NULL DEFAULT 'UTC',
  policy            text NOT NULL DEFAULT 'first_all'
                    CHECK (policy IN ('first_all', 'first_quorum', 'max_attendance')),
  quorum            integer CHECK (quorum IS NULL OR quorum >= 1),
  status            text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'resolved', 'expired', 'cancelled')),
  customer_facing   boolean NOT NULL DEFAULT false,
  expires_at        timestamptz,
  -- Two tokens, two audiences. share_token is the public link (respond, view
  -- initials + counts). edit_token is the organizer's (step 2 UI). Neither is
  -- readable by anon: the token comes IN, the row goes OUT through an RPC.
  share_token       uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  edit_token        uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  resolved_slot_id  uuid,
  resolved_at       timestamptz,
  calendar_event_id uuid REFERENCES public.calendar_events(id) ON DELETE SET NULL,
  booking_id        uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.meeting_poll_slots (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id      uuid NOT NULL REFERENCES public.meeting_polls(id) ON DELETE CASCADE,
  starts_at    timestamptz NOT NULL,
  duration_min integer NOT NULL CHECK (duration_min > 0),
  position     integer NOT NULL DEFAULT 0,
  UNIQUE (poll_id, starts_at)
);

CREATE TABLE IF NOT EXISTS public.meeting_poll_responses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id        uuid NOT NULL REFERENCES public.meeting_polls(id) ON DELETE CASCADE,
  email          text NOT NULL,
  name           text NOT NULL,
  slot_ids       uuid[] NOT NULL DEFAULT '{}',
  response_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poll_id, email)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meeting_polls_resolved_slot_fk') THEN
    ALTER TABLE public.meeting_polls
      ADD CONSTRAINT meeting_polls_resolved_slot_fk
      FOREIGN KEY (resolved_slot_id) REFERENCES public.meeting_poll_slots(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_meeting_poll_slots_poll     ON public.meeting_poll_slots(poll_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_meeting_poll_responses_poll ON public.meeting_poll_responses(poll_id);
CREATE INDEX IF NOT EXISTS idx_meeting_polls_status        ON public.meeting_polls(status, expires_at);

-- updated_at, same helper the rest of the schema uses.
DROP TRIGGER IF EXISTS trg_meeting_polls_updated_at ON public.meeting_polls;
CREATE TRIGGER trg_meeting_polls_updated_at BEFORE UPDATE ON public.meeting_polls
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS trg_meeting_poll_responses_updated_at ON public.meeting_poll_responses;
CREATE TRIGGER trg_meeting_poll_responses_updated_at BEFORE UPDATE ON public.meeting_poll_responses
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Realtime on responses: seeing initials appear as people answer is the whole
-- feel of the original, and the public page subscribes to exactly this table.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'meeting_poll_responses') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_poll_responses;
  END IF;
END $$;
ALTER TABLE public.meeting_poll_responses REPLICA IDENTITY FULL;

-- ---------------------------------------------------------------------------
-- RLS — staff only. NO policy names anon or public. Anon reaches these rows
-- only through the token RPCs below, which is the point.
-- ---------------------------------------------------------------------------
ALTER TABLE public.meeting_polls          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_poll_slots     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_poll_responses ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.meeting_polls, public.meeting_poll_slots, public.meeting_poll_responses FROM anon;

DROP POLICY IF EXISTS "meeting_polls staff" ON public.meeting_polls;
CREATE POLICY "meeting_polls staff" ON public.meeting_polls FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.can_access_module(auth.uid(), 'bookings'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.can_access_module(auth.uid(), 'bookings'));

DROP POLICY IF EXISTS "meeting_poll_slots staff" ON public.meeting_poll_slots;
CREATE POLICY "meeting_poll_slots staff" ON public.meeting_poll_slots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.can_access_module(auth.uid(), 'bookings'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.can_access_module(auth.uid(), 'bookings'));

DROP POLICY IF EXISTS "meeting_poll_responses staff" ON public.meeting_poll_responses;
CREATE POLICY "meeting_poll_responses staff" ON public.meeting_poll_responses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.can_access_module(auth.uid(), 'bookings'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.can_access_module(auth.uid(), 'bookings'));

-- ---------------------------------------------------------------------------
-- The public projection: what a link-holder may see. No e-mails, ever.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._meeting_poll_public_view(p_poll public.meeting_polls)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', p_poll.id,
    'title', p_poll.title,
    'description', p_poll.description,
    'organizer_name', p_poll.organizer_name,
    'timezone', p_poll.timezone,
    'policy', p_poll.policy,
    'quorum', p_poll.quorum,
    'status', p_poll.status,
    'expires_at', p_poll.expires_at,
    'resolved_slot_id', p_poll.resolved_slot_id,
    'slots', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', s.id, 'starts_at', s.starts_at, 'duration_min', s.duration_min, 'position', s.position,
               'count', (SELECT count(*) FROM public.meeting_poll_responses r
                          WHERE r.poll_id = p_poll.id AND s.id = ANY(r.slot_ids)))
             ORDER BY s.starts_at)
      FROM public.meeting_poll_slots s WHERE s.poll_id = p_poll.id), '[]'::jsonb),
    'respondents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'initials', upper(left(regexp_replace(r.name, '(\w)\w*\s*', '\1', 'g'), 3)),
               'name', r.name,
               'slot_ids', r.slot_ids)
             ORDER BY r.created_at)
      FROM public.meeting_poll_responses r WHERE r.poll_id = p_poll.id), '[]'::jsonb),
    'response_count', (SELECT count(*) FROM public.meeting_poll_responses r WHERE r.poll_id = p_poll.id)
  );
$$;
REVOKE ALL ON FUNCTION public._meeting_poll_public_view(public.meeting_polls) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- create_meeting_poll — staff or service. Returns both tokens once.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_meeting_poll(
  p_title text,
  p_slots jsonb,
  p_organizer_email text,
  p_organizer_name text,
  p_description text DEFAULT NULL,
  p_timezone text DEFAULT 'UTC',
  p_policy text DEFAULT 'first_all',
  p_quorum integer DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_customer_facing boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_poll public.meeting_polls;
  v_slot jsonb;
  v_n int := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::app_role)
          OR public.can_access_module(auth.uid(), 'bookings')) THEN
    RAISE EXCEPTION 'create_meeting_poll requires the booking module';
  END IF;
  IF p_title IS NULL OR length(btrim(p_title)) < 2 THEN RAISE EXCEPTION 'title is required'; END IF;
  IF p_organizer_email IS NULL OR position('@' IN p_organizer_email) = 0 THEN RAISE EXCEPTION 'organizer_email must be an e-mail address'; END IF;
  IF p_organizer_name IS NULL OR length(btrim(p_organizer_name)) = 0 THEN RAISE EXCEPTION 'organizer_name is required'; END IF;
  IF p_policy NOT IN ('first_all', 'first_quorum', 'max_attendance') THEN RAISE EXCEPTION 'policy must be first_all, first_quorum or max_attendance'; END IF;
  IF p_policy = 'first_quorum' AND COALESCE(p_quorum, 0) < 1 THEN RAISE EXCEPTION 'first_quorum needs quorum >= 1'; END IF;
  IF p_slots IS NULL OR jsonb_typeof(p_slots) <> 'array' OR jsonb_array_length(p_slots) < 1 THEN
    RAISE EXCEPTION 'slots must be a non-empty array of {starts_at, duration_min}';
  END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN RAISE EXCEPTION 'expires_at must be in the future'; END IF;

  INSERT INTO public.meeting_polls (title, description, organizer_email, organizer_name, timezone, policy, quorum,
                                    expires_at, customer_facing, created_by)
  VALUES (btrim(p_title), p_description, public.normalize_email(p_organizer_email), btrim(p_organizer_name),
          COALESCE(p_timezone, 'UTC'), p_policy, p_quorum, p_expires_at, COALESCE(p_customer_facing, false), auth.uid())
  RETURNING * INTO v_poll;

  FOR v_slot IN SELECT * FROM jsonb_array_elements(p_slots) LOOP
    IF (v_slot ->> 'starts_at') IS NULL THEN RAISE EXCEPTION 'every slot needs starts_at'; END IF;
    INSERT INTO public.meeting_poll_slots (poll_id, starts_at, duration_min, position)
    VALUES (v_poll.id, (v_slot ->> 'starts_at')::timestamptz, COALESCE((v_slot ->> 'duration_min')::int, 60), v_n)
    ON CONFLICT (poll_id, starts_at) DO NOTHING;
    v_n := v_n + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'poll_id', v_poll.id,
    'share_token', v_poll.share_token,
    'edit_token', v_poll.edit_token,
    'share_path', '/poll/' || v_poll.share_token::text,
    'slots', v_n,
    'policy', v_poll.policy);
END; $fn$;
REVOKE ALL ON FUNCTION public.create_meeting_poll(text, jsonb, text, text, text, text, text, integer, timestamptz, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_meeting_poll(text, jsonb, text, text, text, text, text, integer, timestamptz, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- get_meeting_poll_by_token — the link-holder's view. Anon may call this.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_meeting_poll_by_token(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_poll public.meeting_polls;
BEGIN
  SELECT * INTO v_poll FROM public.meeting_polls WHERE share_token = p_token;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN public._meeting_poll_public_view(v_poll);
END; $fn$;
REVOKE ALL ON FUNCTION public.get_meeting_poll_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_meeting_poll_by_token(uuid) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- respond_to_meeting_poll_by_token — one answer per e-mail, upserted. Anon may call this.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.respond_to_meeting_poll_by_token(
  p_token uuid,
  p_email text,
  p_name text,
  p_slot_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_poll public.meeting_polls;
  v_email text;
  v_bad int;
BEGIN
  SELECT * INTO v_poll FROM public.meeting_polls WHERE share_token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such poll' USING ERRCODE = 'no_data_found'; END IF;
  IF v_poll.status <> 'open' THEN RAISE EXCEPTION 'This poll is %, it no longer takes answers', v_poll.status; END IF;
  IF v_poll.expires_at IS NOT NULL AND v_poll.expires_at <= now() THEN RAISE EXCEPTION 'This poll has expired'; END IF;
  IF p_email IS NULL OR position('@' IN p_email) = 0 THEN RAISE EXCEPTION 'email must be an e-mail address'; END IF;
  IF p_name IS NULL OR length(btrim(p_name)) = 0 THEN RAISE EXCEPTION 'name is required'; END IF;
  IF p_slot_ids IS NULL THEN RAISE EXCEPTION 'slot_ids is required (an empty array means "none of these work")'; END IF;

  -- Every slot must belong to THIS poll. A foreign slot id is not a preference,
  -- it is a probe.
  SELECT count(*) INTO v_bad FROM unnest(p_slot_ids) x
   WHERE NOT EXISTS (SELECT 1 FROM public.meeting_poll_slots s WHERE s.id = x AND s.poll_id = v_poll.id);
  IF v_bad > 0 THEN RAISE EXCEPTION '% slot id(s) do not belong to this poll', v_bad; END IF;

  v_email := public.normalize_email(p_email);

  INSERT INTO public.meeting_poll_responses (poll_id, email, name, slot_ids)
  VALUES (v_poll.id, v_email, btrim(p_name), (SELECT COALESCE(array_agg(DISTINCT x), '{}') FROM unnest(p_slot_ids) x))
  ON CONFLICT (poll_id, email) DO UPDATE
    SET name = EXCLUDED.name, slot_ids = EXCLUDED.slot_ids, updated_at = now();

  RETURN jsonb_build_object('success', true, 'poll', public._meeting_poll_public_view(v_poll));
END; $fn$;
REVOKE ALL ON FUNCTION public.respond_to_meeting_poll_by_token(uuid, text, text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_meeting_poll_by_token(uuid, text, text, uuid[]) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- resolve_meeting_poll — THE RULE. Deterministic. Staff or service.
--
--   first_all       earliest slot every respondent chose
--   first_quorum    earliest slot chosen by at least `quorum` respondents
--   max_attendance  the slot most respondents chose; earliest wins a tie
--
-- No slot qualifies → {resolved:false, reason} and the poll stays open. That
-- is a result, not a success — the caller reads `resolved`, not `success`.
-- Already resolved → the existing result, nothing duplicated.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_meeting_poll(p_poll_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_poll public.meeting_polls;
  v_total int;
  v_slot record;
  v_attendees jsonb;
  v_event_id uuid;
  v_booking_id uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::app_role)
          OR public.can_access_module(auth.uid(), 'bookings')) THEN
    RAISE EXCEPTION 'resolve_meeting_poll requires the booking module';
  END IF;

  SELECT * INTO v_poll FROM public.meeting_polls WHERE id = p_poll_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Poll % not found', p_poll_id; END IF;

  IF v_poll.status = 'resolved' THEN
    RETURN jsonb_build_object('success', true, 'resolved', true, 'already', true,
      'slot_id', v_poll.resolved_slot_id, 'calendar_event_id', v_poll.calendar_event_id, 'booking_id', v_poll.booking_id);
  END IF;
  IF v_poll.status <> 'open' THEN
    RETURN jsonb_build_object('success', true, 'resolved', false, 'reason', 'poll is ' || v_poll.status);
  END IF;

  SELECT count(*) INTO v_total FROM public.meeting_poll_responses WHERE poll_id = v_poll.id;
  IF v_total = 0 THEN
    RETURN jsonb_build_object('success', true, 'resolved', false, 'reason', 'no responses yet');
  END IF;

  -- One query per policy; ORDER BY carries the rule, LIMIT 1 the determinism.
  IF v_poll.policy = 'first_all' THEN
    SELECT s.id, s.starts_at, s.duration_min, c.n INTO v_slot
      FROM public.meeting_poll_slots s
      JOIN LATERAL (SELECT count(*) AS n FROM public.meeting_poll_responses r
                     WHERE r.poll_id = s.poll_id AND s.id = ANY(r.slot_ids)) c ON true
     WHERE s.poll_id = v_poll.id AND c.n = v_total
     ORDER BY s.starts_at LIMIT 1;
  ELSIF v_poll.policy = 'first_quorum' THEN
    SELECT s.id, s.starts_at, s.duration_min, c.n INTO v_slot
      FROM public.meeting_poll_slots s
      JOIN LATERAL (SELECT count(*) AS n FROM public.meeting_poll_responses r
                     WHERE r.poll_id = s.poll_id AND s.id = ANY(r.slot_ids)) c ON true
     WHERE s.poll_id = v_poll.id AND c.n >= COALESCE(v_poll.quorum, 1)
     ORDER BY s.starts_at LIMIT 1;
  ELSE -- max_attendance
    SELECT s.id, s.starts_at, s.duration_min, c.n INTO v_slot
      FROM public.meeting_poll_slots s
      JOIN LATERAL (SELECT count(*) AS n FROM public.meeting_poll_responses r
                     WHERE r.poll_id = s.poll_id AND s.id = ANY(r.slot_ids)) c ON true
     WHERE s.poll_id = v_poll.id AND c.n >= 1
     ORDER BY c.n DESC, s.starts_at LIMIT 1;
  END IF;

  IF v_slot.id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'resolved', false,
      'reason', CASE v_poll.policy
        WHEN 'first_all'     THEN 'no slot works for everyone (' || v_total || ' responded)'
        WHEN 'first_quorum'  THEN 'no slot reaches quorum ' || COALESCE(v_poll.quorum, 1)
        ELSE 'nobody chose any slot' END);
  END IF;

  -- The attendees are the people who can actually make it.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('email', r.email, 'name', r.name) ORDER BY r.created_at), '[]'::jsonb)
    INTO v_attendees
    FROM public.meeting_poll_responses r
   WHERE r.poll_id = v_poll.id AND v_slot.id = ANY(r.slot_ids);

  INSERT INTO public.calendar_events (title, description, starts_at, ends_at, all_day, attendees, created_by, visibility,
                                      related_entity_type, related_entity_id)
  VALUES (v_poll.title, v_poll.description, v_slot.starts_at, v_slot.starts_at + make_interval(mins => v_slot.duration_min),
          false, v_attendees, v_poll.created_by, 'team', 'meeting_poll', v_poll.id::text)
  RETURNING id INTO v_event_id;

  -- A customer-facing poll is also an appointment: the same shelf the booking
  -- module reads. service_id is nullable by design.
  IF v_poll.customer_facing THEN
    INSERT INTO public.bookings (customer_name, customer_email, start_time, end_time, status, notes)
    VALUES (v_poll.organizer_name, v_poll.organizer_email, v_slot.starts_at,
            v_slot.starts_at + make_interval(mins => v_slot.duration_min), 'confirmed',
            'Booked from meeting poll ' || v_poll.id::text)
    RETURNING id INTO v_booking_id;
  END IF;

  UPDATE public.meeting_polls
     SET status = 'resolved', resolved_slot_id = v_slot.id, resolved_at = now(),
         calendar_event_id = v_event_id, booking_id = v_booking_id
   WHERE id = v_poll.id;

  RETURN jsonb_build_object('success', true, 'resolved', true, 'policy', v_poll.policy,
    'slot_id', v_slot.id, 'starts_at', v_slot.starts_at, 'duration_min', v_slot.duration_min,
    'attendees', v_slot.n, 'respondents', v_total,
    'calendar_event_id', v_event_id, 'booking_id', v_booking_id);
END; $fn$;
REVOKE ALL ON FUNCTION public.resolve_meeting_poll(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_meeting_poll(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- list_meeting_polls — staff. expire_meeting_polls — the sweep (cron wires later).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_meeting_polls(p_status text DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::app_role)
          OR public.can_access_module(auth.uid(), 'bookings')) THEN
    RAISE EXCEPTION 'list_meeting_polls requires the booking module';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', p.id, 'title', p.title, 'status', p.status, 'policy', p.policy, 'quorum', p.quorum,
             'organizer_email', p.organizer_email, 'organizer_name', p.organizer_name,
             'share_path', '/poll/' || p.share_token::text, 'expires_at', p.expires_at,
             'resolved_slot_id', p.resolved_slot_id, 'calendar_event_id', p.calendar_event_id,
             'slots', (SELECT count(*) FROM public.meeting_poll_slots s WHERE s.poll_id = p.id),
             'responses', (SELECT count(*) FROM public.meeting_poll_responses r WHERE r.poll_id = p.id),
             'created_at', p.created_at)
           ORDER BY p.created_at DESC)
    FROM (SELECT * FROM public.meeting_polls
           WHERE (p_status IS NULL OR status = p_status)
           ORDER BY created_at DESC LIMIT LEAST(COALESCE(p_limit, 50), 200)) p), '[]'::jsonb);
END; $fn$;
REVOKE ALL ON FUNCTION public.list_meeting_polls(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_meeting_polls(text, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.expire_meeting_polls()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_n int;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'expire_meeting_polls is a service sweep';
  END IF;
  UPDATE public.meeting_polls SET status = 'expired'
   WHERE status = 'open' AND expires_at IS NOT NULL AND expires_at <= now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END; $fn$;
REVOKE ALL ON FUNCTION public.expire_meeting_polls() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_meeting_polls() TO authenticated, service_role;

COMMENT ON TABLE public.meeting_polls IS
  'Group scheduling polls: propose several times, respondents answer by link without an account, resolve_meeting_poll picks by rule (first_all | first_quorum | max_attendance). Base table is never readable by anon — access is via get_/respond_to_meeting_poll_by_token. Modelled on timeslot.fit; see #590.';
