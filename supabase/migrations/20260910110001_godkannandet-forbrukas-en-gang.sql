-- Ett godkännande, en körning — del 2 av 2 (biljettdörren + selektorn).
-- Använder enum-värdet 'executed' som 20260910110000 la till (55P04 — får
-- inte ligga i samma transaktion). Se den filen för incidenten (nordbrygg,
-- PO-00018 + PO-00019 på ett godkännande).
--
-- Mönstret är claim-then-handoff (docs/architecture/work-queue.md, "One claim
-- function"): den som ska köra TAR raden med en atomär
--   UPDATE … WHERE status='approved' RETURNING
-- innan den gör något. Två exekverare som tävlar får disjunkta resultat — den
-- ena raden, den andra 0 rader och ett tydligt "already executed". Ingen
-- distribuerad låsning, inget fönster mellan "läste approved" och "körde".
--
-- Enda anroparen är agent-execute (alla tre exekverarna — admin-UI,
-- MCP-klient, follow-through — går genom den). Service-role eller admin.

-- ── 1. Hjälpare: samma arg-städning som agent-execute gör innan en RPC ─────
-- Understreck-nycklar (_approved, _caller_user_id, _effective_agent, …) och
-- trace_id/objective_context är harness-plumbing, inte avsikt. Två anrop med
-- samma AVSIKT ska matcha varandra oavsett vilken plumbing som råkade hänga med.
CREATE OR REPLACE FUNCTION public.strip_agent_internal_args(p_args jsonb)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT jsonb_object_agg(key, value)
       FROM jsonb_each(COALESCE(p_args, '{}'::jsonb))
      WHERE key NOT LIKE '\_%'
        AND key NOT IN ('trace_id', 'objective_context')),
    '{}'::jsonb);
$$;

-- ── 2. Biljettdörren ──────────────────────────────────────────────────────
-- Returnerar jsonb:
--   { claimed: true,  request_id, activity_id, skill_name, approved_at }
--   { claimed: false, reason: 'already_executed', request_id, executed_at, executed_by }
--   { claimed: false, reason: 'not_approved',     request_id, status }
--   { claimed: false, reason: 'skill_mismatch',   request_id, expected }
--   { claimed: false, reason: 'not_found',        request_id }
--   { claimed: false, reason: 'no_approved_request' }
--   { claimed: false, reason: 'ambiguous',        candidates: [uuid, …] }
--
-- Upplösning av VILKEN rad, i prioritetsordning:
--   a) p_request_id            — explicit (follow-through, admin-UI, en MCP-
--                                 klient som läste approval_request_id ur 202:an)
--   b) p_activity_id           — den väntande agent_activity-raden (Skill Hub)
--   c) skill_name + args        — en klient som bara skickar _approved=true:
--                                 exakt arg-match bland approved; annars den
--                                 enda approved för skillen; annars refusal.
--      Finns ingen approved men en NYSS exekverad med samma args → svaret
--      säger 'already_executed', inte "hittar inget" — det är det som räddar
--      operatören som pollar och kör om.
CREATE OR REPLACE FUNCTION public.claim_skill_approval(
  p_skill_name text,
  p_args        jsonb DEFAULT NULL,
  p_request_id  uuid  DEFAULT NULL,
  p_activity_id uuid  DEFAULT NULL,
  p_executor    text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id        uuid := p_request_id;
  v_clean     jsonb := public.strip_agent_internal_args(p_args);
  v_row       public.approval_requests;
  v_status    public.approval_status;
  v_executed  timestamptz;
  v_executed_by text;
  v_expected  text;
  v_candidates uuid[];
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only service_role or admins may claim a skill approval';
  END IF;
  IF p_skill_name IS NULL OR length(trim(p_skill_name)) = 0 THEN
    RAISE EXCEPTION 'p_skill_name is required';
  END IF;

  -- b) via den väntande aktivitetsraden
  IF v_id IS NULL AND p_activity_id IS NOT NULL THEN
    SELECT a.approval_request_id INTO v_id
      FROM public.agent_activity a WHERE a.id = p_activity_id;
    IF v_id IS NULL THEN
      SELECT ar.id INTO v_id
        FROM public.approval_requests ar
       WHERE ar.entity_type = 'agent_skill' AND ar.entity_id = p_activity_id::text
       ORDER BY ar.created_at DESC LIMIT 1;
    END IF;
    IF v_id IS NULL THEN
      RETURN jsonb_build_object('claimed', false, 'reason', 'no_approved_request',
        'activity_id', p_activity_id,
        'detail', 'No approval request is linked to this activity');
    END IF;
  END IF;

  -- c) via skill + args
  IF v_id IS NULL THEN
    SELECT array_agg(ar.id ORDER BY ar.resolved_at DESC NULLS LAST, ar.created_at DESC)
      INTO v_candidates
      FROM public.approval_requests ar
     WHERE ar.entity_type = 'agent_skill'
       AND ar.status = 'approved'
       AND ar.context->>'skill_name' = p_skill_name;
    v_candidates := COALESCE(v_candidates, ARRAY[]::uuid[]);

    -- exakt avsiktsmatch först
    SELECT ar.id INTO v_id
      FROM public.approval_requests ar
     WHERE ar.id = ANY (v_candidates)
       AND public.strip_agent_internal_args(ar.context->'args') = v_clean
     ORDER BY ar.resolved_at DESC NULLS LAST, ar.created_at DESC
     LIMIT 1;

    IF v_id IS NULL THEN
      IF array_length(v_candidates, 1) = 1 THEN
        v_id := v_candidates[1];
      ELSIF array_length(v_candidates, 1) IS NULL THEN
        -- Ingen approved. Var den nyss förbrukad? Säg DET.
        SELECT ar.id, ar.executed_at, ar.context->>'executed_by'
          INTO v_id, v_executed, v_executed_by
          FROM public.approval_requests ar
         WHERE ar.entity_type = 'agent_skill'
           AND ar.status = 'executed'
           AND ar.context->>'skill_name' = p_skill_name
           AND public.strip_agent_internal_args(ar.context->'args') = v_clean
         ORDER BY ar.executed_at DESC NULLS LAST
         LIMIT 1;
        IF v_id IS NOT NULL THEN
          RETURN jsonb_build_object('claimed', false, 'reason', 'already_executed',
            'request_id', v_id, 'executed_at', v_executed, 'executed_by', v_executed_by);
        END IF;
        RETURN jsonb_build_object('claimed', false, 'reason', 'no_approved_request',
          'skill_name', p_skill_name);
      ELSE
        RETURN jsonb_build_object('claimed', false, 'reason', 'ambiguous',
          'candidates', to_jsonb(v_candidates),
          'detail', 'Several approved requests for this skill and none matches these arguments exactly — pass _approval_request_id');
      END IF;
    END IF;
  END IF;

  -- Skillen måste stämma: en biljett för X får inte lösa in Y.
  SELECT ar.context->>'skill_name' INTO v_expected
    FROM public.approval_requests ar WHERE ar.id = v_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'not_found', 'request_id', v_id);
  END IF;
  IF v_expected IS DISTINCT FROM p_skill_name THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'skill_mismatch',
      'request_id', v_id, 'expected', v_expected);
  END IF;

  -- Den atomära biljettdragningen. Två samtidiga anropare: en får raden.
  UPDATE public.approval_requests
     SET status      = 'executed',
         executed_at = now(),
         updated_at  = now(),
         context     = COALESCE(context, '{}'::jsonb)
                       || jsonb_build_object('executed_by', p_executor, 'executed_at', now())
   WHERE id = v_id
     AND status = 'approved'
  RETURNING * INTO v_row;

  IF FOUND THEN
    RETURN jsonb_build_object('claimed', true,
      'request_id', v_row.id,
      'activity_id', NULLIF(v_row.context->>'activity_id', '')::uuid,
      'skill_name', v_row.context->>'skill_name',
      'approved_at', v_row.resolved_at);
  END IF;

  SELECT ar.status, ar.executed_at, ar.context->>'executed_by'
    INTO v_status, v_executed, v_executed_by
    FROM public.approval_requests ar WHERE ar.id = v_id;
  IF v_status = 'executed' THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'already_executed',
      'request_id', v_id, 'executed_at', v_executed, 'executed_by', v_executed_by);
  END IF;
  RETURN jsonb_build_object('claimed', false, 'reason', 'not_approved',
    'request_id', v_id, 'status', v_status);
END;
$$;

COMMENT ON FUNCTION public.claim_skill_approval(text, jsonb, uuid, uuid, text) IS
  'Consume an agent_skill approval exactly once (claim-then-handoff). Atomic UPDATE … WHERE status=approved RETURNING: the first executor gets {claimed:true}, every later one {claimed:false, reason:already_executed}. Resolves the request by id, by the pending activity id, or by skill_name + argument match. Called by agent-execute only.';

REVOKE ALL ON FUNCTION public.claim_skill_approval(text, jsonb, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_skill_approval(text, jsonb, uuid, uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.strip_agent_internal_args(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.strip_agent_internal_args(jsonb) TO authenticated, service_role;

-- ── 3. Selektorn ser bara OFÖRBRUKADE godkännanden ────────────────────────
-- Tidigare: a.status='approved' räckte — och agent_activity-raden blev aldrig
-- rörd av den klient som körde om med _approved=true, så svepet såg en färsk
-- "approved" och körde igen. Nu krävs att approval_requests-raden fortfarande
-- är 'approved' (inte 'executed'). Aktivitetsrader utan kopplad request
-- (request_skill_approval misslyckades) kan ingen ha godkänt i /admin/approvals
-- — de lämnas åt expiry-svepet i stället för att köras på lösa boliner.
CREATE OR REPLACE FUNCTION public.flowpilot_approved_pending(p_window_hours integer DEFAULT 48)
 RETURNS TABLE(
   activity_id uuid,
   skill_id uuid,
   skill_name text,
   input jsonb,
   approval_request_id uuid,
   pending_operation_id uuid,
   approved_at timestamptz,
   created_at timestamptz
 )
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    a.id,
    a.skill_id,
    a.skill_name,
    a.input,
    a.approval_request_id,
    (SELECT po.id FROM public.pending_operations po
      WHERE po.skill_name = a.skill_name AND po.status = 'approved'
        AND po.created_at >= a.created_at - interval '1 hour'
      ORDER BY po.created_at DESC LIMIT 1) AS pending_operation_id,
    ar.resolved_at,
    a.created_at
  FROM public.agent_activity a
  JOIN public.approval_requests ar ON ar.id = a.approval_request_id
  WHERE a.status = 'approved'
    AND ar.status = 'approved'
    AND a.created_at >= now() - make_interval(hours => GREATEST(1, p_window_hours))
  ORDER BY a.created_at ASC;
$function$;

COMMENT ON FUNCTION public.flowpilot_approved_pending(integer) IS
  'FlowPilot resumption selector: fresh agent_activity rows a human approved whose approval_requests row is still approved (NOT executed). The follow-through re-invokes each via agent-execute with _approved=true + _approval_request_id (+ _approved_operation_id when staged); agent-execute claims the request via claim_skill_approval, so a request another executor already consumed is refused, never re-run.';

-- ── 4. Städa det som redan hänt: en aktivitetsrad vars godkännande redan är
-- förbrukat får inte ligga kvar som 'approved' (svepet skulle inte längre
-- köra den, men den skulle se ostädad ut i Skill Hub). Idempotent.
UPDATE public.agent_activity a
   SET status = 'success'
  FROM public.approval_requests ar
 WHERE ar.id = a.approval_request_id
   AND a.status = 'approved'
   AND ar.status = 'executed';
