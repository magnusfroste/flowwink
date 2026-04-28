-- ============================================================
-- Expense Reports: real SaaS RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_monthly_expense_report(
  _period text DEFAULT to_char(now(), 'YYYY-MM'),
  _user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_report_id uuid;
  v_period_start date;
  v_period_end date;
  v_total_cents bigint;
  v_count int;
  v_currency text;
  v_existing_status text;
BEGIN
  v_user_id := COALESCE(_user_id, auth.uid());
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'user_id required'; END IF;

  IF _user_id IS NOT NULL AND _user_id <> auth.uid() AND NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: cannot generate report for another user';
  END IF;

  IF _period !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'period must be YYYY-MM';
  END IF;

  v_period_start := to_date(_period || '-01', 'YYYY-MM-DD');
  v_period_end   := (v_period_start + interval '1 month')::date;

  SELECT
    COALESCE(SUM(amount_cents + COALESCE(vat_cents, 0)), 0),
    COUNT(*),
    COALESCE(MAX(currency), 'SEK')
  INTO v_total_cents, v_count, v_currency
  FROM expenses
  WHERE user_id = v_user_id
    AND expense_date >= v_period_start
    AND expense_date <  v_period_end
    AND status IN ('draft', 'submitted')
    AND report_id IS NULL;

  INSERT INTO expense_reports (user_id, period, status, total_cents, currency)
  VALUES (v_user_id, _period, 'draft', v_total_cents, v_currency)
  ON CONFLICT (user_id, period) DO UPDATE
    SET total_cents = EXCLUDED.total_cents,
        currency    = EXCLUDED.currency,
        updated_at  = now()
    WHERE expense_reports.status IN ('draft', 'rejected')
  RETURNING id, status INTO v_report_id, v_existing_status;

  IF v_report_id IS NULL THEN
    SELECT id, status INTO v_report_id, v_existing_status
    FROM expense_reports
    WHERE user_id = v_user_id AND period = _period;
  END IF;

  IF v_existing_status IN ('draft', 'rejected') THEN
    UPDATE expenses
       SET report_id = v_report_id, updated_at = now()
     WHERE user_id = v_user_id
       AND expense_date >= v_period_start
       AND expense_date <  v_period_end
       AND status IN ('draft', 'submitted')
       AND report_id IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'report_id', v_report_id,
    'period', _period,
    'status', v_existing_status,
    'total_cents', v_total_cents,
    'expense_count', v_count,
    'currency', v_currency
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_expense_report(_report_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_status text;
BEGIN
  SELECT user_id, status INTO v_owner, v_status
  FROM expense_reports WHERE id = _report_id;

  IF v_owner IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF v_owner <> auth.uid() AND NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF v_status NOT IN ('draft', 'rejected') THEN
    RAISE EXCEPTION 'Only draft/rejected reports can be submitted (current: %)', v_status;
  END IF;

  UPDATE expense_reports
     SET status = 'submitted', submitted_at = now(), updated_at = now()
   WHERE id = _report_id;

  UPDATE expenses
     SET status = 'submitted', updated_at = now()
   WHERE report_id = _report_id AND status = 'draft';

  RETURN jsonb_build_object('ok', true, 'report_id', _report_id, 'status', 'submitted');
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_expense_report(_report_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can approve expense reports';
  END IF;

  SELECT status INTO v_status FROM expense_reports WHERE id = _report_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF v_status <> 'submitted' THEN
    RAISE EXCEPTION 'Only submitted reports can be approved (current: %)', v_status;
  END IF;

  UPDATE expense_reports
     SET status = 'approved', approved_at = now(), approved_by = auth.uid(), updated_at = now()
   WHERE id = _report_id;

  UPDATE expenses
     SET status = 'approved', updated_at = now()
   WHERE report_id = _report_id;

  RETURN jsonb_build_object('ok', true, 'report_id', _report_id, 'status', 'approved');
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_monthly_expense_report(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_expense_report(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_expense_report(uuid) TO authenticated;

-- Register as MCP-exposed agent skills
INSERT INTO agent_skills (name, description, category, handler, tool_definition, mcp_exposed, enabled, scope, trust_level)
VALUES
  ('generate_monthly_expense_report',
   'Creates or refreshes a monthly expense report for the current user, aggregating all draft/submitted expenses in the period (YYYY-MM). Use when: user wants to compile this month''s receipts into a submittable report. NOT for: approving or booking.',
   'commerce',
   'rpc:generate_monthly_expense_report',
   '{"type":"function","function":{"name":"generate_monthly_expense_report","description":"Generate or refresh a monthly expense report","parameters":{"type":"object","properties":{"period":{"type":"string","pattern":"^\\d{4}-\\d{2}$","description":"YYYY-MM, defaults to current month"},"user_id":{"type":"string","format":"uuid","description":"Admin only — defaults to caller"}}}}}'::jsonb,
   true, true, 'internal', 'auto'),
  ('submit_expense_report',
   'Submits a draft expense report for approval. Locks all included expenses to submitted state.',
   'commerce',
   'rpc:submit_expense_report',
   '{"type":"function","function":{"name":"submit_expense_report","description":"Submit an expense report for approval","parameters":{"type":"object","required":["report_id"],"properties":{"report_id":{"type":"string","format":"uuid"}}}}}'::jsonb,
   true, true, 'internal', 'notify'),
  ('approve_expense_report',
   'Admin-only. Approves a submitted expense report and marks all included expenses as approved.',
   'commerce',
   'rpc:approve_expense_report',
   '{"type":"function","function":{"name":"approve_expense_report","description":"Approve a submitted expense report (admin only)","parameters":{"type":"object","required":["report_id"],"properties":{"report_id":{"type":"string","format":"uuid"}}}}}'::jsonb,
   true, true, 'internal', 'approve')
ON CONFLICT (name) DO UPDATE
  SET description = EXCLUDED.description,
      tool_definition = EXCLUDED.tool_definition,
      handler = EXCLUDED.handler,
      mcp_exposed = true,
      enabled = true,
      updated_at = now();