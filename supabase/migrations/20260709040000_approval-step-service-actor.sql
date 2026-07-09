-- advance_approval_step: let an autonomous agent (service role) record a decision.
--
-- Process-QA finding 2026-07-09 (procure-to-pay chain): under the MCP gateway the
-- function runs as service_role, so auth.uid() is NULL. p_decided_by defaults NULL
-- too, making v_actor NULL — and approval_decisions.decided_by is NOT NULL, so the
-- INSERT threw "null value in column decided_by ... violates not-null constraint".
-- Result: an agent could REQUEST an approval but never APPROVE it, dead-locking every
-- amount-gated PO/invoice/expense send for autonomous operators.
--
-- Fix: when running as service role with no explicit decider, stamp a stable
-- "autonomous agent" sentinel uuid. decided_by has no FK (only request_id does), so a
-- sentinel is safe; a stable value keeps count(DISTINCT decided_by) correct — one agent
-- counts as one approver, so it still cannot single-handedly satisfy a multi-human step.
-- Sibling agent-approval RPCs (approve_pending_operation/approve_return) already work
-- because their actor columns are nullable; this brings the chained path to parity.
--
-- Idempotent: CREATE OR REPLACE, only the v_actor NULL-guard is added.
create or replace function public.advance_approval_step(
  p_request_id uuid,
  p_decision approval_decision_kind,
  p_decided_by uuid default null::uuid,
  p_decided_role app_role default null::app_role,
  p_comment text default null::text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_req RECORD;
  v_step RECORD;
  v_is_service boolean := (auth.role() = 'service_role');
  v_actor uuid := COALESCE(p_decided_by, auth.uid());
  v_role app_role := p_decided_role;
  v_satisfied boolean;
  v_approvals int;
  v_is_last boolean;
  v_authorized boolean;
BEGIN
  -- Agent path: service role with no human identity → stable sentinel decider so the
  -- NOT-NULL decided_by insert succeeds without a fake user row (no FK to auth.users).
  IF v_actor IS NULL AND v_is_service THEN
    v_actor := '00000000-0000-0000-0000-000000000000'::uuid;
  END IF;

  SELECT * INTO v_req FROM approval_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Approval request % not found', p_request_id; END IF;
  IF v_req.chain_id IS NULL THEN
    RAISE EXCEPTION 'Request % has no chain — use resolve_approval', p_request_id;
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Request % is already %', p_request_id, v_req.status;
  END IF;
  SELECT * INTO v_step FROM approval_steps
   WHERE chain_id = v_req.chain_id AND sort_order = v_req.current_step;
  IF NOT FOUND THEN RAISE EXCEPTION 'No step % on chain %', v_req.current_step, v_req.chain_id; END IF;
  IF v_is_service THEN
    v_authorized := true;
  ELSIF v_step.required_role IS NOT NULL THEN
    v_authorized := has_role(v_actor, v_step.required_role)
      OR EXISTS (SELECT 1 FROM approval_delegations d
                 WHERE d.to_user = v_actor
                   AND now() >= d.starts_at AND (d.ends_at IS NULL OR now() < d.ends_at)
                   AND has_role(d.from_user, v_step.required_role));
  ELSE
    v_authorized := EXISTS (SELECT 1 FROM approval_group_members m
                            WHERE m.group_id = v_step.group_id AND m.user_id = v_actor)
      OR EXISTS (SELECT 1 FROM approval_delegations d
                 JOIN approval_group_members m ON m.user_id = d.from_user AND m.group_id = v_step.group_id
                 WHERE d.to_user = v_actor
                   AND now() >= d.starts_at AND (d.ends_at IS NULL OR now() < d.ends_at));
  END IF;
  IF NOT v_authorized THEN
    RAISE EXCEPTION 'User % is not authorized to act on step %', v_actor, v_req.current_step;
  END IF;
  INSERT INTO approval_decisions (request_id, decision, decided_by, decided_role, comment, step_sort_order)
  VALUES (p_request_id, p_decision, v_actor,
          COALESCE(v_role, v_step.required_role, 'approver'::app_role), p_comment, v_req.current_step);
  IF p_decision = 'reject' THEN
    UPDATE approval_requests
       SET status = 'rejected', resolved_by = v_actor, resolved_at = now()
     WHERE id = p_request_id;
    RETURN jsonb_build_object('success', true, 'status', 'rejected', 'step', v_req.current_step);
  END IF;
  SELECT count(DISTINCT decided_by) INTO v_approvals
  FROM approval_decisions
  WHERE request_id = p_request_id AND step_sort_order = v_req.current_step AND decision = 'approve';
  v_satisfied := (v_approvals >= v_step.min_approvals);
  IF NOT v_satisfied THEN
    RETURN jsonb_build_object('success', true, 'status', 'pending',
      'step', v_req.current_step, 'approvals', v_approvals, 'needed', v_step.min_approvals);
  END IF;
  v_is_last := NOT EXISTS (
    SELECT 1 FROM approval_steps
     WHERE chain_id = v_req.chain_id AND sort_order > v_req.current_step
  );
  IF v_is_last THEN
    UPDATE approval_requests
       SET status = 'approved', resolved_by = v_actor, resolved_at = now()
     WHERE id = p_request_id;
    RETURN jsonb_build_object('success', true, 'status', 'approved', 'step', v_req.current_step);
  ELSE
    UPDATE approval_requests
       SET current_step = (SELECT min(sort_order) FROM approval_steps
                           WHERE chain_id = v_req.chain_id AND sort_order > v_req.current_step),
           step_entered_at = now()
     WHERE id = p_request_id;
    RETURN jsonb_build_object('success', true, 'status', 'pending',
      'advanced_to', (SELECT current_step FROM approval_requests WHERE id = p_request_id));
  END IF;
END $function$;
