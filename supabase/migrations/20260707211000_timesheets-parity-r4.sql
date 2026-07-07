-- Timesheets: parity round 4 (docs/parity/capabilities/timesheets.json)
-- Adds: manager approval workflow, multi-project day split, indirect time
-- categories (PTO/sick/training/overhead), overtime rules, utilization /
-- labor-cost reporting, and a timesheet→payroll feed (overtime pay applied
-- to draft payroll lines using the apply_sick_pay adjustment pattern).
--
-- Idempotent DDL. Forward-dated for the Lovable-managed migrate runner
-- (backdated files are silently skipped).

-- ── 1. Schema additions ──────────────────────────────────────────────────────
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_notes text,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'work',
  ADD COLUMN IF NOT EXISTS cost_rate_cents integer,
  ADD COLUMN IF NOT EXISTS overtime_hours numeric(6,2) NOT NULL DEFAULT 0;

ALTER TABLE public.time_entries DROP CONSTRAINT IF EXISTS time_entries_approval_status_check;
ALTER TABLE public.time_entries
  ADD CONSTRAINT time_entries_approval_status_check
  CHECK (approval_status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text, 'rejected'::text]));

ALTER TABLE public.time_entries DROP CONSTRAINT IF EXISTS time_entries_category_check;
ALTER TABLE public.time_entries
  ADD CONSTRAINT time_entries_category_check
  CHECK (category = ANY (ARRAY['work'::text, 'pto'::text, 'sick'::text, 'training'::text, 'overhead'::text]));

ALTER TABLE public.payroll_lines
  ADD COLUMN IF NOT EXISTS overtime_hours numeric(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_pay_cents bigint NOT NULL DEFAULT 0;

-- ── 2. manage_timesheet_approval: submit / approve / reject a period ────────
CREATE OR REPLACE FUNCTION public.manage_timesheet_approval(
  p_action text, p_start_date date, p_end_date date,
  p_user_id uuid DEFAULT NULL, p_employee_id uuid DEFAULT NULL, p_notes text DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_manager boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'approver'));
  v_count int;
BEGIN
  IF p_action NOT IN ('submit','approve','reject') THEN
    RAISE EXCEPTION 'Unknown action: %. Use submit|approve|reject', p_action;
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'start_date and end_date are required';
  END IF;
  IF p_action IN ('approve','reject') AND NOT v_is_manager THEN
    RAISE EXCEPTION 'Only admins/approvers can % timesheets', p_action;
  END IF;

  IF p_action = 'submit' THEN
    UPDATE public.time_entries SET approval_status = 'submitted'
    WHERE entry_date BETWEEN p_start_date AND p_end_date
      AND approval_status IN ('draft','rejected')
      AND (p_user_id IS NULL OR user_id = p_user_id)
      AND (p_employee_id IS NULL OR employee_id = p_employee_id)
      AND (v_is_manager OR user_id = auth.uid());
  ELSIF p_action = 'approve' THEN
    UPDATE public.time_entries SET
      approval_status = 'approved', approved_by = auth.uid(), approved_at = now(),
      approval_notes = COALESCE(p_notes, approval_notes)
    WHERE entry_date BETWEEN p_start_date AND p_end_date
      AND approval_status IN ('draft','submitted')
      AND (p_user_id IS NULL OR user_id = p_user_id)
      AND (p_employee_id IS NULL OR employee_id = p_employee_id);
  ELSE
    UPDATE public.time_entries SET
      approval_status = 'rejected', approved_by = auth.uid(), approved_at = now(),
      approval_notes = COALESCE(p_notes, approval_notes)
    WHERE entry_date BETWEEN p_start_date AND p_end_date
      AND approval_status IN ('draft','submitted')
      AND (p_user_id IS NULL OR user_id = p_user_id)
      AND (p_employee_id IS NULL OR employee_id = p_employee_id);
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'action', p_action, 'entries_updated', v_count,
    'range', jsonb_build_object('start', p_start_date, 'end', p_end_date),
    'note', CASE WHEN v_count = 0 THEN 'No entries matched — check the date range and current approval_status' ELSE NULL END);
END; $function$;

-- ── 3. split_time_entry: split one entry across multiple projects ───────────
CREATE OR REPLACE FUNCTION public.split_time_entry(
  p_entry_id uuid, p_allocations jsonb, p_allow_total_change boolean DEFAULT false
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entry public.time_entries; v_alloc jsonb; v_total numeric := 0;
  v_project_id uuid; v_hours numeric; v_first boolean := true;
  v_ids uuid[] := ARRAY[]::uuid[]; v_new_id uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'split_time_entry: admin role required';
  END IF;
  SELECT * INTO v_entry FROM public.time_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Time entry % not found', p_entry_id; END IF;
  IF v_entry.is_invoiced THEN RAISE EXCEPTION 'Entry is already invoiced — cannot split'; END IF;
  IF v_entry.approval_status = 'approved' THEN RAISE EXCEPTION 'Entry is approved — reject it first to split'; END IF;
  IF jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) < 2 THEN
    RAISE EXCEPTION 'allocations must be an array of at least 2 items: [{project_id|project_name, hours, description?}]';
  END IF;

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
    v_hours := (v_alloc->>'hours')::numeric;
    IF v_hours IS NULL OR v_hours <= 0 THEN RAISE EXCEPTION 'Each allocation needs hours > 0'; END IF;
    v_total := v_total + v_hours;
  END LOOP;
  IF NOT p_allow_total_change AND ABS(v_total - v_entry.hours) > 0.01 THEN
    RAISE EXCEPTION 'Allocation hours sum to % but the entry has % — pass allow_total_change=true to override', v_total, v_entry.hours;
  END IF;

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
    v_hours := (v_alloc->>'hours')::numeric;
    v_project_id := NULLIF(v_alloc->>'project_id','')::uuid;
    IF v_project_id IS NULL AND COALESCE(v_alloc->>'project_name','') <> '' THEN
      SELECT id INTO v_project_id FROM public.projects
      WHERE lower(name) = lower(v_alloc->>'project_name') LIMIT 1;
      IF v_project_id IS NULL THEN
        SELECT id INTO v_project_id FROM public.projects
        WHERE name ILIKE '%'||(v_alloc->>'project_name')||'%' LIMIT 1;
      END IF;
      IF v_project_id IS NULL THEN
        RAISE EXCEPTION 'Project "%" not found', v_alloc->>'project_name';
      END IF;
    END IF;
    IF v_project_id IS NULL THEN v_project_id := v_entry.project_id; END IF;

    IF v_first THEN
      UPDATE public.time_entries SET
        project_id = v_project_id, hours = v_hours,
        description = COALESCE(v_alloc->>'description', description),
        is_billable = COALESCE((v_alloc->>'is_billable')::boolean, is_billable),
        updated_at = now()
      WHERE id = p_entry_id;
      v_ids := v_ids || p_entry_id;
      v_first := false;
    ELSE
      INSERT INTO public.time_entries
        (user_id, employee_id, project_id, task_id, entry_date, hours, description, is_billable, category, approval_status, cost_rate_cents)
      VALUES
        (v_entry.user_id, v_entry.employee_id, v_project_id, v_entry.task_id, v_entry.entry_date, v_hours,
         COALESCE(v_alloc->>'description', v_entry.description),
         COALESCE((v_alloc->>'is_billable')::boolean, v_entry.is_billable),
         v_entry.category, v_entry.approval_status, v_entry.cost_rate_cents)
      RETURNING id INTO v_new_id;
      v_ids := v_ids || v_new_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'entry_ids', to_jsonb(v_ids),
    'entries', jsonb_array_length(p_allocations), 'total_hours', v_total,
    'entry_date', v_entry.entry_date);
END; $function$;

-- ── 4. log_indirect_time: PTO / sick / training / overhead entries ──────────
CREATE OR REPLACE FUNCTION public.log_indirect_time(
  p_entry_date date, p_hours numeric, p_category text,
  p_description text DEFAULT NULL, p_user_id uuid DEFAULT NULL, p_employee_id uuid DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid; v_id uuid; v_user uuid; v_employee uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin') OR auth.uid() IS NOT NULL) THEN
    RAISE EXCEPTION 'log_indirect_time: authentication required';
  END IF;
  IF p_category NOT IN ('pto','sick','training','overhead') THEN
    RAISE EXCEPTION 'category must be pto|sick|training|overhead (use log_time for project work)';
  END IF;
  IF p_hours IS NULL OR p_hours <= 0 OR p_hours > 24 THEN RAISE EXCEPTION 'hours must be between 0 and 24'; END IF;

  v_user := COALESCE(p_user_id, auth.uid());
  v_employee := p_employee_id;
  IF v_user IS NULL AND v_employee IS NULL THEN
    RAISE EXCEPTION 'user_id or employee_id is required when called without a session';
  END IF;
  -- Link the employee row when the user has one and none was given.
  IF v_employee IS NULL AND v_user IS NOT NULL THEN
    SELECT id INTO v_employee FROM public.employees WHERE user_id = v_user LIMIT 1;
  END IF;

  -- Indirect time books to a dedicated non-billable internal project.
  SELECT id INTO v_project_id FROM public.projects WHERE lower(name) = 'internal (non-billable)' LIMIT 1;
  IF v_project_id IS NULL THEN
    INSERT INTO public.projects (name, status, is_billable, description)
    VALUES ('Internal (non-billable)', 'active', false, 'Auto-created container for indirect time (PTO, sick, training, overhead).')
    RETURNING id INTO v_project_id;
  END IF;

  INSERT INTO public.time_entries (user_id, employee_id, project_id, entry_date, hours, description, is_billable, category)
  VALUES (v_user, v_employee, v_project_id, COALESCE(p_entry_date, CURRENT_DATE), p_hours, p_description, false, p_category)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'entry_id', v_id, 'category', p_category,
    'hours', p_hours, 'entry_date', COALESCE(p_entry_date, CURRENT_DATE), 'project_id', v_project_id);
END; $function$;

-- ── 5. apply_overtime_rules: flag hours above a daily threshold ──────────────
CREATE OR REPLACE FUNCTION public.apply_overtime_rules(
  p_start_date date, p_end_date date, p_daily_threshold_hours numeric DEFAULT 8
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_day record; v_entry record; v_overtime numeric; v_take numeric;
  v_rows jsonb := '[]'::jsonb; v_total numeric := 0; v_updated int := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'apply_overtime_rules: admin role required';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL THEN RAISE EXCEPTION 'start_date and end_date are required'; END IF;

  -- Reset previous flags in the range, then recompute (idempotent).
  UPDATE public.time_entries SET overtime_hours = 0
  WHERE entry_date BETWEEN p_start_date AND p_end_date AND overtime_hours <> 0;

  FOR v_day IN
    SELECT COALESCE(employee_id::text, user_id::text) AS person_key,
           MAX(employee_id::text) AS employee_id, MAX(user_id::text) AS user_id,
           entry_date, SUM(hours) AS total_hours
    FROM public.time_entries
    WHERE entry_date BETWEEN p_start_date AND p_end_date AND category = 'work'
    GROUP BY 1, entry_date
    HAVING SUM(hours) > p_daily_threshold_hours
  LOOP
    v_overtime := v_day.total_hours - p_daily_threshold_hours;
    v_total := v_total + v_overtime;
    v_rows := v_rows || jsonb_build_object(
      'employee_id', v_day.employee_id, 'user_id', v_day.user_id,
      'entry_date', v_day.entry_date, 'total_hours', v_day.total_hours,
      'overtime_hours', v_overtime);
    -- Allocate the overtime to that day's entries, latest first.
    FOR v_entry IN
      SELECT id, hours FROM public.time_entries
      WHERE entry_date = v_day.entry_date AND category = 'work'
        AND COALESCE(employee_id::text, user_id::text) = v_day.person_key
      ORDER BY created_at DESC
    LOOP
      EXIT WHEN v_overtime <= 0;
      v_take := LEAST(v_entry.hours, v_overtime);
      UPDATE public.time_entries SET overtime_hours = v_take WHERE id = v_entry.id;
      v_overtime := v_overtime - v_take;
      v_updated := v_updated + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('success', true,
    'range', jsonb_build_object('start', p_start_date, 'end', p_end_date),
    'daily_threshold_hours', p_daily_threshold_hours,
    'total_overtime_hours', v_total, 'entries_flagged', v_updated, 'days', v_rows);
END; $function$;

-- ── 6. timesheet_utilization_report: utilization + labor cost + margin ───────
CREATE OR REPLACE FUNCTION public.timesheet_utilization_report(
  p_start_date date, p_end_date date, p_capacity_hours_per_day numeric DEFAULT 8
) RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workdays int; v_capacity numeric; v_rows jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'approver')) THEN
    RAISE EXCEPTION 'timesheet_utilization_report: admin/approver role required';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL THEN RAISE EXCEPTION 'start_date and end_date are required'; END IF;

  SELECT COUNT(*) INTO v_workdays
  FROM generate_series(p_start_date, p_end_date, interval '1 day') d
  WHERE EXTRACT(ISODOW FROM d) < 6;
  v_capacity := v_workdays * p_capacity_hours_per_day;

  SELECT COALESCE(jsonb_agg(row_j ORDER BY row_j->>'person'), '[]'::jsonb) INTO v_rows FROM (
    SELECT jsonb_build_object(
      'person', COALESCE(MAX(x.employee_name), 'user ' || MAX(x.user_id::text)),
      'employee_id', MAX(x.employee_id::text), 'user_id', MAX(x.user_id::text),
      'total_hours', SUM(x.hours),
      'work_hours', COALESCE(SUM(x.hours) FILTER (WHERE x.category = 'work'), 0),
      'billable_hours', COALESCE(SUM(x.hours) FILTER (WHERE x.is_billable AND x.category = 'work'), 0),
      'pto_hours', COALESCE(SUM(x.hours) FILTER (WHERE x.category = 'pto'), 0),
      'sick_hours', COALESCE(SUM(x.hours) FILTER (WHERE x.category = 'sick'), 0),
      'training_hours', COALESCE(SUM(x.hours) FILTER (WHERE x.category = 'training'), 0),
      'overhead_hours', COALESCE(SUM(x.hours) FILTER (WHERE x.category = 'overhead'), 0),
      'overtime_hours', COALESCE(SUM(x.overtime_hours), 0),
      'capacity_hours', v_capacity,
      'utilization_pct', CASE WHEN v_capacity > 0
        THEN ROUND(100.0 * COALESCE(SUM(x.hours) FILTER (WHERE x.category = 'work'), 0) / v_capacity, 1) ELSE NULL END,
      'billable_pct', CASE WHEN COALESCE(SUM(x.hours) FILTER (WHERE x.category = 'work'), 0) > 0
        THEN ROUND(100.0 * COALESCE(SUM(x.hours) FILTER (WHERE x.is_billable AND x.category = 'work'), 0)
             / SUM(x.hours) FILTER (WHERE x.category = 'work'), 1) ELSE NULL END,
      'cost_cents', ROUND(SUM(x.hours * x.effective_cost_rate))::bigint,
      'revenue_cents', ROUND(COALESCE(SUM(x.hours * x.billable_rate) FILTER (WHERE x.is_billable AND x.category = 'work'), 0))::bigint
    ) AS row_j
    FROM (
      SELECT te.*, e.name AS employee_name,
        COALESCE(te.cost_rate_cents::numeric, e.monthly_salary_cents::numeric / (21 * 8), 0) AS effective_cost_rate,
        COALESCE(p.hourly_rate_cents, 0)::numeric AS billable_rate
      FROM public.time_entries te
      LEFT JOIN public.employees e ON e.id = te.employee_id
      LEFT JOIN public.projects p ON p.id = te.project_id
      WHERE te.entry_date BETWEEN p_start_date AND p_end_date
    ) x
    GROUP BY COALESCE(x.employee_id::text, x.user_id::text)
  ) sub;

  RETURN jsonb_build_object('success', true,
    'range', jsonb_build_object('start', p_start_date, 'end', p_end_date),
    'workdays', v_workdays, 'capacity_hours_per_person', v_capacity,
    'people', v_rows, 'generated_at', now());
END; $function$;

-- ── 7. payroll_timesheet_basis: hours summary feeding a payroll month ────────
CREATE OR REPLACE FUNCTION public.payroll_timesheet_basis(p_period_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start date; v_end date; v_rows jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'payroll_timesheet_basis: admin role required';
  END IF;
  v_start := date_trunc('month', p_period_date)::date;
  v_end := (v_start + interval '1 month - 1 day')::date;

  SELECT COALESCE(jsonb_agg(row_j ORDER BY row_j->>'employee_name'), '[]'::jsonb) INTO v_rows FROM (
    SELECT jsonb_build_object(
      'employee_id', te.employee_id,
      'employee_name', MAX(e.name),
      'work_hours', COALESCE(SUM(te.hours) FILTER (WHERE te.category = 'work'), 0),
      'overtime_hours', COALESCE(SUM(te.overtime_hours), 0),
      'pto_hours', COALESCE(SUM(te.hours) FILTER (WHERE te.category = 'pto'), 0),
      'training_hours', COALESCE(SUM(te.hours) FILTER (WHERE te.category = 'training'), 0),
      'sick_days', COUNT(DISTINCT te.entry_date) FILTER (WHERE te.category = 'sick'),
      'unapproved_entries', COUNT(*) FILTER (WHERE te.approval_status NOT IN ('approved'))
    ) AS row_j
    FROM public.time_entries te
    JOIN public.employees e ON e.id = te.employee_id
    WHERE te.entry_date BETWEEN v_start AND v_end
    GROUP BY te.employee_id
  ) sub;

  RETURN jsonb_build_object('success', true, 'period', to_char(v_start, 'YYYY-MM'),
    'employees', v_rows,
    'next_steps', 'Feed sick_days into apply_sick_pay(run_id, employee_id, sick_days) and overtime into apply_timesheet_overtime(run_id).');
END; $function$;

-- ── 8. apply_timesheet_overtime: overtime pay onto draft payroll lines ───────
-- Mirrors the apply_sick_pay adjustment pattern (idempotent base restore).
CREATE OR REPLACE FUNCTION public.apply_timesheet_overtime(
  p_run_id uuid, p_employee_id uuid DEFAULT NULL, p_multiplier numeric DEFAULT 1.5,
  p_work_days_per_month integer DEFAULT 21, p_hours_per_day numeric DEFAULT 8
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; v_period date; v_start date; v_end date;
  v_line public.payroll_lines%ROWTYPE;
  v_monthly bigint; v_tax_pct numeric; v_hourly numeric;
  v_ot_hours numeric; v_ot_pay bigint;
  v_base_gross bigint; v_base_taxable bigint;
  v_gross bigint; v_taxable bigint; v_tax bigint; v_social bigint; v_net bigint;
  v_results jsonb := '[]'::jsonb; v_applied int := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can apply overtime pay';
  END IF;
  IF COALESCE(p_multiplier, 0) <= 0 THEN RAISE EXCEPTION 'multiplier must be > 0'; END IF;

  SELECT status, period_date INTO v_status, v_period FROM payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run % not found', p_run_id; END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Run % is % — overtime can only be applied to a draft', p_run_id, v_status;
  END IF;
  v_start := date_trunc('month', v_period)::date;
  v_end := (v_start + interval '1 month - 1 day')::date;

  FOR v_line IN
    SELECT * FROM payroll_lines
    WHERE run_id = p_run_id AND (p_employee_id IS NULL OR employee_id = p_employee_id)
    FOR UPDATE
  LOOP
    SELECT COALESCE(SUM(overtime_hours), 0) INTO v_ot_hours
    FROM time_entries
    WHERE employee_id = v_line.employee_id
      AND entry_date BETWEEN v_start AND v_end
      AND approval_status <> 'rejected';

    SELECT COALESCE(monthly_salary_cents, 0), COALESCE(tax_rate_pct, 30.00)
      INTO v_monthly, v_tax_pct FROM employees WHERE id = v_line.employee_id;

    v_hourly := v_monthly::numeric / (p_work_days_per_month * p_hours_per_day);
    v_ot_pay := ROUND(v_ot_hours * v_hourly * p_multiplier)::bigint;

    -- Restore the pre-adjustment base so re-running never compounds.
    v_base_gross   := v_line.gross_cents   - v_line.overtime_pay_cents;
    v_base_taxable := v_line.taxable_cents - v_line.overtime_pay_cents;

    v_gross   := v_base_gross   + v_ot_pay;
    v_taxable := v_base_taxable + v_ot_pay;
    v_tax     := ROUND(v_taxable * v_tax_pct / 100.0)::bigint;
    v_social  := ROUND(v_taxable * 31.42 / 100.0)::bigint;
    v_net     := v_taxable - v_tax - v_line.pension_employee_cents;

    UPDATE payroll_lines SET
      gross_cents = v_gross, taxable_cents = v_taxable, tax_cents = v_tax,
      social_fee_cents = v_social, net_cents = v_net,
      overtime_hours = v_ot_hours, overtime_pay_cents = v_ot_pay
    WHERE id = v_line.id;

    IF v_ot_pay > 0 OR v_line.overtime_pay_cents > 0 THEN v_applied := v_applied + 1; END IF;
    v_results := v_results || jsonb_build_object(
      'employee_id', v_line.employee_id, 'overtime_hours', v_ot_hours,
      'overtime_pay_cents', v_ot_pay, 'new_gross_cents', v_gross, 'new_net_cents', v_net);
  END LOOP;

  UPDATE payroll_runs SET
    total_gross_cents      = (SELECT COALESCE(SUM(gross_cents),0)      FROM payroll_lines WHERE run_id = p_run_id),
    total_tax_cents        = (SELECT COALESCE(SUM(tax_cents),0)        FROM payroll_lines WHERE run_id = p_run_id),
    total_social_fee_cents = (SELECT COALESCE(SUM(social_fee_cents),0) FROM payroll_lines WHERE run_id = p_run_id),
    total_net_cents        = (SELECT COALESCE(SUM(net_cents),0)        FROM payroll_lines WHERE run_id = p_run_id)
  WHERE id = p_run_id;

  RETURN jsonb_build_object('success', true, 'run_id', p_run_id, 'period', to_char(v_start, 'YYYY-MM'),
    'multiplier', p_multiplier, 'lines_adjusted', v_applied, 'lines', v_results,
    'note', 'Overtime hours come from time_entries.overtime_hours — run apply_overtime_rules for the month first.');
END; $function$;

-- ── Grants ───────────────────────────────────────────────────────────────────
GRANT ALL ON FUNCTION public.manage_timesheet_approval(text, date, date, uuid, uuid, text) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.split_time_entry(uuid, jsonb, boolean) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.log_indirect_time(date, numeric, text, text, uuid, uuid) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.apply_overtime_rules(date, date, numeric) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.timesheet_utilization_report(date, date, numeric) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.payroll_timesheet_basis(date) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.apply_timesheet_overtime(uuid, uuid, numeric, integer, numeric) TO anon, authenticated, service_role;
