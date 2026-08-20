-- ============================================================================
-- The expense report that moved alone
-- ============================================================================
-- submit_expense_report and approve_expense_report each touched exactly one
-- row: the expense_reports header. The expenses attached to the report kept
-- status 'draft' through submission and approval, and expense_reports.total_cents
-- stayed 0 forever — so every reimbursement queue, every "what do we owe this
-- employee" question, and every booking decision downstream read a report that
-- claimed to be approved and worth nothing, over lines that claimed to be drafts.
--
-- submit had no permission check at all: any authenticated caller could submit
-- anyone's report. It now requires the report's owner or an admin, with the
-- house service_role escape so the MCP gateway and FlowPilot keep working
-- (auth.uid() is NULL under the service key — see CLAUDE.md).
--
-- The header and the lines now move together, and the total is recomputed from
-- the lines at both transitions rather than trusted from a column nobody wrote.
-- ============================================================================

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
    OR has_role(auth.uid(), 'admin')
  ) THEN
    RAISE EXCEPTION 'Only the report owner or an admin can submit expense report %', p_report_id;
  END IF;

  IF v_report.status <> 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft reports can be submitted');
  END IF;

  UPDATE expenses
     SET status = 'submitted', updated_at = now()
   WHERE report_id = p_report_id AND status = 'draft';

  SELECT COUNT(*), COALESCE(SUM(amount_cents), 0) INTO v_lines, v_total
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

CREATE OR REPLACE FUNCTION public.approve_expense_report(p_report_id uuid)
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
  IF v_report.status <> 'submitted' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only submitted reports can be approved');
  END IF;

  UPDATE expenses
     SET status = 'approved', updated_at = now()
   WHERE report_id = p_report_id AND status = 'submitted';

  SELECT COUNT(*), COALESCE(SUM(amount_cents), 0) INTO v_lines, v_total
    FROM expenses WHERE report_id = p_report_id;

  UPDATE expense_reports
     SET status = 'approved',
         approved_at = now(),
         approved_by = auth.uid(),
         total_cents = v_total,
         updated_at = now()
   WHERE id = p_report_id;

  RETURN jsonb_build_object('success', true, 'report_id', p_report_id, 'status', 'approved',
    'expense_count', v_lines, 'total_cents', v_total);
END;
$function$;
