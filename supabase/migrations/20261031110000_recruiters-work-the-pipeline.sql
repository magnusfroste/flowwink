-- ============================================================
-- Migration: recruiters work the pipeline — notes, CVs and stage moves
-- Date: 2026-10-31
-- Safe to re-run: Yes
-- ============================================================
--
-- A person with the recruitment module could READ candidates, notes and stage
-- history but not add a note or open the CV a candidate uploaded (the
-- form-uploads bucket was admin-only), and move_application_stage — the path
-- an agent takes — refused anyone but an admin while the kanban moved cards
-- with a direct UPDATE. Now:
--   * candidate_notes: a recruiter adds their own note (author = themselves).
--   * the CV a candidate uploaded opens through process-job-application
--     (GET ?cv=<application_id>): a short-lived signed link, handed only to a
--     caller whose own session may read that application. No storage policy
--     changes (storage DDL belongs in the finalizer).
--   * move_application_stage admits the recruitment module (the admin UI and
--     the agent move a candidate through the same function).

DROP POLICY IF EXISTS "Recruiters add candidate notes" ON public.candidate_notes;
CREATE POLICY "Recruiters add candidate notes" ON public.candidate_notes
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_module(auth.uid(), 'recruitment') AND author_id = auth.uid());

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
  -- The recruiter who works the pipeline in the admin (can_access_module
  -- 'recruitment') moves candidates the same way an agent does — one path.
  if not (auth.role() = 'service_role' or public.can_access_module(auth.uid(), 'recruitment')) then
    raise exception 'Requires the recruitment module — an admin can grant it under Users → Role Permissions';
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

GRANT EXECUTE ON FUNCTION public.move_application_stage(uuid, text, text, text) TO authenticated, service_role;
