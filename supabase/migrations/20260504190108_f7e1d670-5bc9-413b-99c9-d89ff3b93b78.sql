
-- ── Webinar lifecycle RPCs ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.publish_webinar(p_webinar_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row webinars%ROWTYPE;
BEGIN
  IF NOT (has_role(auth.uid(),'writer') OR has_role(auth.uid(),'approver') OR has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE webinars SET status='published', updated_at=now() WHERE id=p_webinar_id AND status='draft' RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'webinar % not found or not in draft', p_webinar_id; END IF;
  PERFORM emit_platform_event('webinar.published', jsonb_build_object('webinar_id',v_row.id,'title',v_row.title,'date',v_row.date), 'webinars');
  RETURN jsonb_build_object('success',true,'id',v_row.id,'status',v_row.status);
END $$;

CREATE OR REPLACE FUNCTION public.start_webinar(p_webinar_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row webinars%ROWTYPE;
BEGIN
  IF NOT (has_role(auth.uid(),'writer') OR has_role(auth.uid(),'approver') OR has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE webinars SET status='live', updated_at=now() WHERE id=p_webinar_id AND status IN ('draft','published') RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'webinar % cannot be started', p_webinar_id; END IF;
  PERFORM emit_platform_event('webinar.live', jsonb_build_object('webinar_id',v_row.id,'title',v_row.title), 'webinars');
  RETURN jsonb_build_object('success',true,'id',v_row.id,'status',v_row.status);
END $$;

CREATE OR REPLACE FUNCTION public.complete_webinar(p_webinar_id uuid, p_recording_url text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row webinars%ROWTYPE;
BEGIN
  IF NOT (has_role(auth.uid(),'writer') OR has_role(auth.uid(),'approver') OR has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE webinars SET status='completed', recording_url=COALESCE(p_recording_url,recording_url), updated_at=now()
   WHERE id=p_webinar_id AND status IN ('live','published') RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'webinar % cannot be completed', p_webinar_id; END IF;
  PERFORM emit_platform_event('webinar.completed', jsonb_build_object('webinar_id',v_row.id,'title',v_row.title,'recording_url',v_row.recording_url), 'webinars');
  RETURN jsonb_build_object('success',true,'id',v_row.id,'status',v_row.status);
END $$;

CREATE OR REPLACE FUNCTION public.cancel_webinar(p_webinar_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row webinars%ROWTYPE;
BEGIN
  IF NOT (has_role(auth.uid(),'writer') OR has_role(auth.uid(),'approver') OR has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE webinars SET status='cancelled', updated_at=now() WHERE id=p_webinar_id AND status NOT IN ('completed','cancelled') RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'webinar % cannot be cancelled', p_webinar_id; END IF;
  PERFORM emit_platform_event('webinar.cancelled', jsonb_build_object('webinar_id',v_row.id,'title',v_row.title,'reason',p_reason), 'webinars');
  RETURN jsonb_build_object('success',true,'id',v_row.id,'status',v_row.status);
END $$;

CREATE OR REPLACE FUNCTION public.mark_webinar_attendance(p_registration_id uuid, p_attended boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_reg webinar_registrations%ROWTYPE;
BEGIN
  IF NOT (has_role(auth.uid(),'writer') OR has_role(auth.uid(),'approver') OR has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE webinar_registrations SET attended=p_attended WHERE id=p_registration_id RETURNING * INTO v_reg;
  IF NOT FOUND THEN RAISE EXCEPTION 'registration % not found', p_registration_id; END IF;
  IF p_attended AND v_reg.lead_id IS NOT NULL THEN
    UPDATE leads SET score = COALESCE(score,0) + 10, updated_at=now() WHERE id = v_reg.lead_id;
  END IF;
  PERFORM emit_platform_event('webinar.attended', jsonb_build_object('webinar_id',v_reg.webinar_id,'registration_id',v_reg.id,'lead_id',v_reg.lead_id,'attended',p_attended), 'webinars');
  RETURN jsonb_build_object('success',true,'id',v_reg.id,'attended',p_attended);
END $$;

-- Public-facing register: callable by anon via RLS-safe path
CREATE OR REPLACE FUNCTION public.register_for_webinar(
  p_webinar_id uuid, p_name text, p_email text, p_phone text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_webinar webinars%ROWTYPE;
  v_lead_id uuid;
  v_reg_id uuid;
BEGIN
  IF p_email IS NULL OR p_email = '' THEN RAISE EXCEPTION 'email required'; END IF;
  SELECT * INTO v_webinar FROM webinars WHERE id=p_webinar_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'webinar % not found', p_webinar_id; END IF;
  IF v_webinar.status NOT IN ('published','live') THEN RAISE EXCEPTION 'webinar not open for registration'; END IF;

  -- Auto-link or create lead
  SELECT id INTO v_lead_id FROM leads WHERE lower(email)=lower(p_email);
  IF v_lead_id IS NULL THEN
    INSERT INTO leads (email, name, phone, source, source_id, score)
    VALUES (lower(p_email), p_name, p_phone, 'webinar', v_webinar.id::text, 15)
    RETURNING id INTO v_lead_id;
  ELSE
    UPDATE leads SET score = COALESCE(score,0) + 15, updated_at=now(),
                     name = COALESCE(name, p_name), phone = COALESCE(phone, p_phone)
    WHERE id = v_lead_id;
  END IF;

  INSERT INTO webinar_registrations (webinar_id, name, email, phone, lead_id)
  VALUES (p_webinar_id, p_name, lower(p_email), p_phone, v_lead_id)
  ON CONFLICT (webinar_id, email) DO UPDATE SET name=EXCLUDED.name, phone=COALESCE(EXCLUDED.phone, webinar_registrations.phone)
  RETURNING id INTO v_reg_id;

  PERFORM emit_platform_event('webinar.registered',
    jsonb_build_object('webinar_id',p_webinar_id,'registration_id',v_reg_id,'lead_id',v_lead_id,'email',lower(p_email)),
    'webinars');

  RETURN jsonb_build_object('success',true,'registration_id',v_reg_id,'lead_id',v_lead_id);
END $$;

GRANT EXECUTE ON FUNCTION public.register_for_webinar(uuid,text,text,text) TO anon, authenticated;

-- Cron tick: auto-flip statuses based on date + duration
CREATE OR REPLACE FUNCTION public.webinar_tick()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_started int := 0; v_completed int := 0; r record;
BEGIN
  FOR r IN SELECT id, title, date FROM webinars
           WHERE status='published' AND date <= now() AND date > now() - interval '1 hour'
  LOOP
    UPDATE webinars SET status='live', updated_at=now() WHERE id=r.id;
    PERFORM emit_platform_event('webinar.live', jsonb_build_object('webinar_id',r.id,'title',r.title,'auto',true), 'webinars');
    v_started := v_started + 1;
  END LOOP;

  FOR r IN SELECT id, title, date, duration_minutes FROM webinars
           WHERE status='live' AND date + (duration_minutes || ' minutes')::interval < now()
  LOOP
    UPDATE webinars SET status='completed', updated_at=now() WHERE id=r.id;
    PERFORM emit_platform_event('webinar.completed', jsonb_build_object('webinar_id',r.id,'title',r.title,'auto',true), 'webinars');
    v_completed := v_completed + 1;
  END LOOP;

  RETURN jsonb_build_object('started',v_started,'completed',v_completed,'at',now());
END $$;
