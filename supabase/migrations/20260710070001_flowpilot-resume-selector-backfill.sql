-- Split from 20260710070000 (fresh-install finding #5): the backfill and
-- selector below USE the enum value 'expired' added in the previous
-- migration. PostgreSQL forbids using a new enum value in the transaction
-- that added it (55P04), and the migration runner wraps each file in one
-- transaction — so the ADD VALUE must commit in its own file first.

-- 1) Graveyard backfill: mark pre-fix approved-but-unexecuted activities expired.
--    (Only rows older than the fresh window; anything newer is governed by the sweep.)
UPDATE public.agent_activity
   SET status = 'expired',
       error_message = COALESCE(error_message, '') ||
         ' [flowpilot-2.0: expired by resume backfill — approved before the resumption sweep existed; re-propose if still needed]'
 WHERE status = 'approved'
   AND created_at < now() - interval '48 hours';

-- 2) Selector: the fresh approved-but-unexecuted activities a resume pass should complete.
--    Returns everything the executor needs, incl. whether a staged pending_operation exists
--    (so it knows to also pass _approved_operation_id in the double-gate handshake).
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
  LEFT JOIN public.approval_requests ar ON ar.id = a.approval_request_id
  WHERE a.status = 'approved'
    AND a.created_at >= now() - make_interval(hours => GREATEST(1, p_window_hours))
  ORDER BY a.created_at ASC;
$function$;

COMMENT ON FUNCTION public.flowpilot_approved_pending(integer) IS
  'FlowPilot 2.0 resumption selector: fresh agent_activity rows a human approved but that were never executed. The resume pass re-invokes each via agent-execute with the stored input + _approved=true (and _approved_operation_id when pending_operation_id is set), then marks the activity completed/failed. Money-core idempotency (payment p_reference, status guards) makes a resume that races the UI safe.';
