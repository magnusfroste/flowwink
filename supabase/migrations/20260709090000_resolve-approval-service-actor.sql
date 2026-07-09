-- resolve_approval: allow the service role (MCP gateway / automated approver) to resolve
-- a non-chain approval request, mirroring the advance_approval_step fix.
--
-- Process-QA finding 2026-07-09 (expenses reimbursement): book_expense_report and
-- mark_expense_report_paid raise a trust-level approval_request (chain_id NULL). Resolving
-- it programmatically hit "Not authenticated" — resolve_approval gated on auth.uid() IS
-- NULL (NULL under the service key) AND used auth.uid() for the permission check and the
-- NOT-NULL approval_decisions.decided_by. Same class as advance_approval_step (which was
-- fixed 2026-07-09); the earlier sweep missed this one because resolve_approval is not an
-- mcp_exposed skill (only the admin UI calls it, where auth.uid() is present).
--
-- Fix: service role is authorized and stamps a stable autonomous-agent sentinel for the
-- decision actor (decided_by has no FK; distinct value keeps audit sane). Human callers
-- are unchanged. Idempotent CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION public.resolve_approval(p_request_id uuid, p_decision approval_decision_kind, p_comment text DEFAULT NULL::text)
 RETURNS approval_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_request public.approval_requests;
  v_user_role public.app_role;
  v_is_service boolean := COALESCE(auth.role() = 'service_role', false);
  v_actor uuid := COALESCE(auth.uid(), CASE WHEN auth.role() = 'service_role' THEN '00000000-0000-0000-0000-000000000000'::uuid END);
BEGIN
  IF auth.uid() IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_request FROM public.approval_requests WHERE id = p_request_id FOR UPDATE;
  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Approval request not found';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Request already resolved (status: %)', v_request.status;
  END IF;

  -- Permission check (service role is trusted, like advance_approval_step).
  IF NOT (
    v_is_service
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), v_request.required_role)
  ) THEN
    RAISE EXCEPTION 'Insufficient permissions to resolve this approval (need %)', v_request.required_role;
  END IF;

  v_user_role := CASE
    WHEN v_is_service OR public.has_role(auth.uid(), 'admin') THEN 'admin'::public.app_role
    ELSE v_request.required_role
  END;

  UPDATE public.approval_requests
  SET status = CASE p_decision WHEN 'approve' THEN 'approved'::public.approval_status ELSE 'rejected'::public.approval_status END,
      resolved_by = v_actor,
      resolved_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  INSERT INTO public.approval_decisions (request_id, decision, decided_by, decided_role, comment)
  VALUES (p_request_id, p_decision, v_actor, v_user_role, p_comment);

  RETURN v_request;
END;
$function$;
