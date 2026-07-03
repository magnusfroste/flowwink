CREATE OR REPLACE FUNCTION public.generate_monthly_expense_report(
  p_period text DEFAULT to_char((CURRENT_DATE)::timestamp with time zone, 'YYYY-MM'::text),
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_report_id uuid;
  v_status text;
  v_count int := 0;
  v_period_start date;
  v_period_end date;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No user_id available');
  END IF;

  v_period_start := to_date(p_period || '-01', 'YYYY-MM-DD');
  v_period_end := (v_period_start + interval '1 month' - interval '1 day')::date;

  -- Any report already exists for this (user, period)? Reuse it.
  SELECT id, status INTO v_report_id, v_status
  FROM expense_reports
  WHERE user_id = v_user_id AND period = p_period
  LIMIT 1;

  IF v_report_id IS NULL THEN
    INSERT INTO expense_reports (user_id, period, status)
    VALUES (v_user_id, p_period, 'draft')
    RETURNING id, status INTO v_report_id, v_status;
  END IF;

  -- Only attach loose draft expenses when the report is still open (draft).
  IF v_status = 'draft' THEN
    UPDATE expenses
    SET report_id = v_report_id
    WHERE user_id = v_user_id
      AND report_id IS NULL
      AND status = 'draft'
      AND expense_date BETWEEN v_period_start AND v_period_end;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'report_id', v_report_id,
    'period', p_period,
    'status', v_status,
    'expenses_attached', v_count,
    'reused', v_count = 0 AND v_status <> 'draft'
  );
END;
$function$;