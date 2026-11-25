-- Ett avslaget utlägg går att rätta (2026-11-25).
--
-- A report could be rejected only from the admin, by a bare UPDATE in the
-- browser: it overwrote the report's notes with "Rejected: …", left every
-- expense on it 'submitted' (locked), and submit_expense_report refused the
-- report afterwards ("Only draft reports can be submitted") although the
-- admin drew a Submit button for it. A rejected report was a dead end, and an
-- agent had no way to reject at all.
--
-- reject_expense_report: from submitted or approved (not yet booked), the
-- report goes to 'rejected' with the reason appended to its notes, and its
-- expenses go back to 'draft' so the employee can correct them.
-- submit_expense_report takes a rejected report as it takes a draft.

CREATE OR REPLACE FUNCTION public.reject_expense_report(p_report_id uuid, p_reason text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_report record;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_line text;
  v_lines integer;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'expenses')) THEN
    RAISE EXCEPTION 'Rejecting an expense report requires the expenses module' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_report FROM expense_reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'found', false, 'error', 'No expense report with id ' || p_report_id);
  END IF;
  IF v_report.status NOT IN ('submitted', 'approved') THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Only a submitted or approved report can be rejected; this one is ' || v_report.status
      || CASE WHEN v_report.status IN ('booked', 'paid') THEN ' — correct a booked report with a mirror entry' ELSE '' END);
  END IF;

  v_line := 'Rejected ' || to_char(now(), 'YYYY-MM-DD') || coalesce(': ' || v_reason, '');

  UPDATE expenses
     SET status = 'draft', updated_at = now()
   WHERE report_id = p_report_id AND status IN ('submitted', 'approved');
  GET DIAGNOSTICS v_lines = ROW_COUNT;

  UPDATE expense_reports
     SET status = 'rejected',
         approved_at = NULL,
         approved_by = NULL,
         notes = CASE WHEN coalesce(btrim(notes), '') = '' THEN v_line ELSE notes || E'\n' || v_line END,
         updated_at = now()
   WHERE id = p_report_id;

  RETURN jsonb_build_object('success', true, 'report_id', p_report_id, 'status', 'rejected',
    'expenses_reopened', v_lines, 'reason', v_reason,
    'next', 'The employee corrects the expenses and submits the report again (submit_expense_report).');
END;
$function$;

REVOKE ALL ON FUNCTION public.reject_expense_report(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_expense_report(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_expense_report(p_report_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_report record;
  v_total bigint;
  v_lines integer;
BEGIN
  SELECT * INTO v_report FROM expense_reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Report not found');
  END IF;

  -- Own report, or admin, or an agent running under the service key.
  IF NOT (
    auth.role() = 'service_role'
    OR v_report.user_id = auth.uid()
    OR can_access_module(auth.uid(),'expenses')
  ) THEN
    RAISE EXCEPTION 'Only the report owner or someone granted the expenses module can submit expense report %', p_report_id;
  END IF;

  -- A rejected report is sent again once it is corrected (2026-11-25).
  IF v_report.status NOT IN ('draft', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft or rejected reports can be submitted');
  END IF;

  UPDATE expenses
     SET status = 'submitted', updated_at = now()
   WHERE report_id = p_report_id AND status IN ('draft', 'rejected');

  SELECT COUNT(*), COALESCE(SUM(COALESCE(base_amount_cents, amount_cents)), 0) INTO v_lines, v_total
    FROM expenses WHERE report_id = p_report_id;

  UPDATE expense_reports
     SET status = 'submitted',
         submitted_at = now(),
         total_cents = v_total,
         updated_at = now()
   WHERE id = p_report_id;

  RETURN jsonb_build_object('success', true, 'report_id', p_report_id, 'status', 'submitted',
    'expense_count', v_lines, 'total_cents', v_total);
END;
$function$;

-- Proof: the function exists and refuses a report that is not there.
DO $proof$
BEGIN
  IF to_regprocedure('public.reject_expense_report(uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'reject_expense_report was not created';
  END IF;
END
$proof$;
