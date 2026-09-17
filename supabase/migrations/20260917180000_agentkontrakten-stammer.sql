-- Agentkontrakten stämmer med det som körs.
--
-- Processtestet 2026-09-17, fyra små sanningar som inte höll:
--   register_for_webinar gav +15 i lead-poäng vid VARJE registrering, även när
--   samma e-post (annan skiftläge) redan stod på listan, och max_attendees
--   lästes aldrig — ett webbinarium med 1 plats tog 3.
--   mark_webinar_attendance gav +10 varje gång flaggan sattes, inte när den vändes.
--   move_application_stage tog emot p_comment och skrev den aldrig.
--   record_churn_reason la en ny rad per anrop.
--   propose_annual_depreciation kallade bokfört värde FÖRE avskrivningen för
--   remaining_after, kapade inte vid restvärdet och hänvisade till en skill som
--   inte uppdaterar tillgången.
--
-- Idempotent: CREATE OR REPLACE av de levande kropparna, bevis som rullas tillbaka.

CREATE OR REPLACE FUNCTION public.register_for_webinar(p_webinar_id uuid, p_name text, p_email text, p_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_webinar webinars%ROWTYPE;
  v_lead_id uuid;
  v_reg_id uuid;
  v_is_new boolean;
  v_lead_existed boolean;
BEGIN
  IF p_email IS NULL OR p_email = '' THEN RAISE EXCEPTION 'email required'; END IF;
  SELECT * INTO v_webinar FROM webinars WHERE id=p_webinar_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'webinar % not found', p_webinar_id; END IF;
  IF v_webinar.status NOT IN ('published','live') THEN RAISE EXCEPTION 'webinar not open for registration'; END IF;
  -- Capacity: a full webinar refuses a NEW registration; a re-registration of the same e-mail passes.
  IF v_webinar.max_attendees IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM webinar_registrations WHERE webinar_id = p_webinar_id AND email = lower(p_email))
     AND (SELECT count(*) FROM webinar_registrations WHERE webinar_id = p_webinar_id) >= v_webinar.max_attendees THEN
    RAISE EXCEPTION 'webinar is full (% of % seats taken)', v_webinar.max_attendees, v_webinar.max_attendees;
  END IF;

  -- Auto-link or create lead
  SELECT id INTO v_lead_id FROM leads WHERE lower(email)=lower(p_email);
  v_lead_existed := v_lead_id IS NOT NULL;
  IF v_lead_id IS NULL THEN
    INSERT INTO leads (email, name, phone, source, source_id, score)
    VALUES (lower(p_email), p_name, p_phone, 'webinar', v_webinar.id::text, 15)
    RETURNING id INTO v_lead_id;
  ELSE
    UPDATE leads SET updated_at=now(), name = COALESCE(name, p_name), phone = COALESCE(phone, p_phone)
    WHERE id = v_lead_id;
  END IF;

  INSERT INTO webinar_registrations (webinar_id, name, email, phone, lead_id)
  VALUES (p_webinar_id, p_name, lower(p_email), p_phone, v_lead_id)
  ON CONFLICT (webinar_id, email) DO UPDATE SET name=EXCLUDED.name, phone=COALESCE(EXCLUDED.phone, webinar_registrations.phone)
  RETURNING id, (xmax = 0) INTO v_reg_id, v_is_new;

  -- The registration scores the lead ONCE; registering again (any letter case) is the same registration.
  IF v_is_new AND v_lead_id IS NOT NULL AND v_lead_existed THEN
    UPDATE leads SET score = COALESCE(score,0) + 15, updated_at=now() WHERE id = v_lead_id;
  END IF;

  PERFORM emit_platform_event('webinar.registered',
    jsonb_build_object('webinar_id',p_webinar_id,'registration_id',v_reg_id,'lead_id',v_lead_id,'email',lower(p_email)),
    'webinars');

  RETURN jsonb_build_object('success',true,'registration_id',v_reg_id,'lead_id',v_lead_id);
END $function$;
-- The public registration path (webinar page, anon key): the grant IS the declaration.
GRANT EXECUTE ON FUNCTION public.register_for_webinar(uuid, text, text, text) TO anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION public.mark_webinar_attendance(p_registration_id uuid, p_attended boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_reg webinar_registrations%ROWTYPE; v_was boolean;
BEGIN
  -- The matrix is the only dial: whoever has the webinars module marks attendance.
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'webinars')) THEN
    RAISE EXCEPTION 'Marking attendance requires the webinars module' USING ERRCODE = '42501';
  END IF;
  SELECT attended INTO v_was FROM webinar_registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'registration % not found', p_registration_id; END IF;
  UPDATE webinar_registrations SET attended=p_attended WHERE id=p_registration_id RETURNING * INTO v_reg;
  -- Attendance scores the lead once: on the flip to attended, never on a repeat.
  IF p_attended AND NOT COALESCE(v_was, false) AND v_reg.lead_id IS NOT NULL THEN
    UPDATE leads SET score = COALESCE(score,0) + 10, updated_at=now() WHERE id = v_reg.lead_id;
  END IF;
  PERFORM emit_platform_event('webinar.attended', jsonb_build_object('webinar_id',v_reg.webinar_id,'registration_id',v_reg.id,'lead_id',v_reg.lead_id,'attended',p_attended), 'webinars');
  RETURN jsonb_build_object('success',true,'id',v_reg.id,'attended',p_attended);
END $function$;

CREATE OR REPLACE FUNCTION public.move_application_stage(p_application_id uuid, p_to_stage text, p_comment text DEFAULT NULL::text, p_rejected_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_app public.applications%rowtype;
  v_from text;
  v_stage public.application_stage;
begin
  if not (auth.role() = 'service_role' or public.has_role(auth.uid(), 'admin')) then
    raise exception 'Only admins can move applications';
  end if;
  if p_to_stage is null or length(trim(p_to_stage)) = 0 then
    raise exception 'p_to_stage is required';
  end if;
  -- stage is the application_stage enum, not text: validate before casting so a bad
  -- value gives a clear message (with the valid set) instead of a raw cast error.
  if not exists (select 1 from pg_enum
                 where enumtypid = 'public.application_stage'::regtype
                   and enumlabel = p_to_stage) then
    raise exception 'Invalid stage %. Valid: applied, screened, interview_scheduled, interviewed, offer_sent, hired, rejected, withdrawn', p_to_stage;
  end if;
  v_stage := p_to_stage::public.application_stage;

  select * into v_app from public.applications where id = p_application_id;
  if not found then
    raise exception 'Application % not found', p_application_id;
  end if;
  v_from := v_app.stage::text;

  -- Idempotent: already at the target stage → success no-op.
  if v_app.stage = v_stage then
    return jsonb_build_object('application_id', v_app.id, 'stage', v_app.stage,
      'from_stage', v_from, 'unchanged', true);
  end if;

  update public.applications
     set stage = v_stage,
         rejected_reason = case when v_stage = 'rejected'::public.application_stage
                                then coalesce(p_rejected_reason, rejected_reason)
                                else rejected_reason end,
         updated_at = now()
   where id = p_application_id
  returning * into v_app;

  -- The trigger logs the transition; the comment is the recruiter's word on it.
  if p_comment is not null then
    update public.application_stages
       set comment = p_comment
     where id = (select id from public.application_stages
                  where application_id = p_application_id
                  order by created_at desc limit 1);
  end if;

  return jsonb_build_object(
    'application_id', v_app.id,
    'from_stage', v_from,
    'stage', v_app.stage,
    'rejected_reason', v_app.rejected_reason,
    'comment', p_comment,
    'moved', true
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_churn_reason(p_subscription_id uuid, p_reason churn_reason_category, p_feedback text DEFAULT NULL::text, p_nps_score integer DEFAULT NULL::integer, p_would_return boolean DEFAULT NULL::boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_email text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'subscriptions')) THEN
    RAISE EXCEPTION 'Recording a churn reason requires the subscriptions module' USING ERRCODE = '42501';
  END IF;
  SELECT customer_email INTO v_email FROM public.subscriptions WHERE id = p_subscription_id;
  -- One reason per subscription: a second call corrects the first, it does not add a row.
  SELECT id INTO v_id FROM public.subscription_churn_reasons WHERE subscription_id = p_subscription_id ORDER BY created_at DESC LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE public.subscription_churn_reasons
       SET reason = p_reason, feedback = COALESCE(p_feedback, feedback), nps_score = COALESCE(p_nps_score, nps_score),
           would_return = COALESCE(p_would_return, would_return)
     WHERE id = v_id;
  ELSE
    INSERT INTO public.subscription_churn_reasons
      (subscription_id, customer_email, reason, feedback, nps_score, would_return)
    VALUES (p_subscription_id, v_email, p_reason, p_feedback, p_nps_score, p_would_return)
    RETURNING id INTO v_id;
  END IF;

  -- Emit event if helper exists
  BEGIN
    PERFORM public.emit_platform_event('subscription.churn_reason_recorded',
      jsonb_build_object('subscription_id', p_subscription_id, 'reason', p_reason),
      'subscriptions');
  EXCEPTION WHEN undefined_function THEN NULL;
  END;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.propose_annual_depreciation(p_year integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_year_end date := make_date(p_year, 12, 31);
  v_proposals jsonb;
BEGIN
  -- staff-guard 20260917100000
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.can_access_module(auth.uid(), 'fixedAssets')) THEN
    RAISE EXCEPTION 'Depreciation proposals require the fixed assets module' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'asset_id', fa.id, 'asset_name', fa.name,
    'depreciation_account', fa.depreciation_account,
    'accumulated_account', fa.accumulated_account,
    'method', fa.depreciation_method,
    -- Never more than what is left to depreciate.
    'annual_amount_cents', LEAST(CASE
      WHEN fa.depreciation_method = 'straight_line'
        THEN (fa.cost_cents - fa.salvage_cents) / fa.useful_life_months * 12
      WHEN fa.depreciation_method = 'declining' AND fa.declining_rate IS NOT NULL
        THEN ROUND((fa.cost_cents - fa.accumulated_cents) * fa.declining_rate)::bigint
      ELSE 0 END, fa.cost_cents - fa.salvage_cents - fa.accumulated_cents),
    'book_value_before_cents', fa.cost_cents - fa.accumulated_cents,
    'remaining_after_cents', fa.cost_cents - fa.accumulated_cents - LEAST(CASE
      WHEN fa.depreciation_method = 'straight_line'
        THEN (fa.cost_cents - fa.salvage_cents) / fa.useful_life_months * 12
      WHEN fa.depreciation_method = 'declining' AND fa.declining_rate IS NOT NULL
        THEN ROUND((fa.cost_cents - fa.accumulated_cents) * fa.declining_rate)::bigint
      ELSE 0 END, fa.cost_cents - fa.salvage_cents - fa.accumulated_cents)
  )), '[]'::jsonb) INTO v_proposals
  FROM public.fixed_assets fa
  WHERE fa.status = 'active' AND fa.in_service_date <= v_year_end
    AND fa.accumulated_cents < (fa.cost_cents - fa.salvage_cents);

  RETURN jsonb_build_object(
    'year', p_year, 'asset_count', jsonb_array_length(v_proposals),
    'proposals', v_proposals,
    'note', 'Post each with post_manual_depreciation(asset_id, amount) — it books the entry AND updates the asset''s accumulated depreciation; manage_journal_entry alone leaves the asset''s book value untouched.'
  );
END; $function$;

-- ── Bevisar sig själv (rullas alltid tillbaka) ──────────────────────────────
DO $proof$
DECLARE v_web uuid; v_r jsonb; v_lead uuid; v_score int; v_reg uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    INSERT INTO public.webinars (title, date, status, max_attendees) VALUES ('proof-webinar', now() + interval '7 days', 'published', 1) RETURNING id INTO v_web;
    v_r := public.register_for_webinar(v_web, 'Proof One', 'proof-one@example.test', NULL);
    v_lead := (v_r->>'lead_id')::uuid;
    SELECT score INTO v_score FROM public.leads WHERE id = v_lead;
    IF v_score <> 15 THEN RAISE EXCEPTION 'proof: a new lead should score 15, got %', v_score; END IF;
    v_r := public.register_for_webinar(v_web, 'Proof One', 'PROOF-ONE@example.test', NULL);
    SELECT score INTO v_score FROM public.leads WHERE id = v_lead;
    IF v_score <> 15 THEN RAISE EXCEPTION 'proof: re-registering scored again (%)', v_score; END IF;
    BEGIN
      PERFORM public.register_for_webinar(v_web, 'Proof Two', 'proof-two@example.test', NULL);
      RAISE EXCEPTION 'proof: a full webinar took a second registrant';
    EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'webinar is full%' THEN RAISE; END IF; END;
    v_reg := (v_r->>'registration_id')::uuid;
    PERFORM public.mark_webinar_attendance(v_reg, true);
    PERFORM public.mark_webinar_attendance(v_reg, true);
    SELECT score INTO v_score FROM public.leads WHERE id = v_lead;
    IF v_score <> 25 THEN RAISE EXCEPTION 'proof: attendance should score once (25), got %', v_score; END IF;
    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
END $proof$;
