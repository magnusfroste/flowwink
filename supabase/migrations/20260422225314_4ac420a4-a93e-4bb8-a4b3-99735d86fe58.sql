-- Payroll exports table — one record per period (year+month)
CREATE TABLE IF NOT EXISTS public.payroll_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','generated','locked')),
  format TEXT NOT NULL DEFAULT 'both' CHECK (format IN ('csv','paxml','both')),
  csv_content TEXT,
  paxml_content TEXT,
  total_employees INTEGER NOT NULL DEFAULT 0,
  total_leave_days NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_expense_cents BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'SEK',
  generated_by UUID,
  generated_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period_year, period_month)
);

-- Per-employee aggregated lines for the export (audit trail)
CREATE TABLE IF NOT EXISTS public.payroll_export_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  export_id UUID NOT NULL REFERENCES public.payroll_exports(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL,
  employee_email TEXT,
  personal_number TEXT,
  vacation_days NUMERIC(5,2) NOT NULL DEFAULT 0,
  sick_days NUMERIC(5,2) NOT NULL DEFAULT 0,
  parental_days NUMERIC(5,2) NOT NULL DEFAULT 0,
  other_leave_days NUMERIC(5,2) NOT NULL DEFAULT 0,
  expense_reimbursement_cents BIGINT NOT NULL DEFAULT 0,
  representation_cents BIGINT NOT NULL DEFAULT 0,
  expense_count INTEGER NOT NULL DEFAULT 0,
  leave_request_ids UUID[] NOT NULL DEFAULT '{}',
  expense_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_export_lines_export ON public.payroll_export_lines(export_id);
CREATE INDEX IF NOT EXISTS idx_payroll_export_lines_employee ON public.payroll_export_lines(employee_id);

-- Mark source rows as exported (prevents double export)
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS payroll_export_id UUID REFERENCES public.payroll_exports(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS payroll_export_id UUID REFERENCES public.payroll_exports(id) ON DELETE SET NULL;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS personal_number TEXT;

CREATE INDEX IF NOT EXISTS idx_leave_requests_payroll_export ON public.leave_requests(payroll_export_id);
CREATE INDEX IF NOT EXISTS idx_expenses_payroll_export ON public.expenses(payroll_export_id);

-- RLS
ALTER TABLE public.payroll_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_export_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage payroll exports" ON public.payroll_exports;
CREATE POLICY "Admins manage payroll exports" ON public.payroll_exports
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage payroll export lines" ON public.payroll_export_lines;
CREATE POLICY "Admins manage payroll export lines" ON public.payroll_export_lines
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Employees view own payroll lines" ON public.payroll_export_lines;
CREATE POLICY "Employees view own payroll lines" ON public.payroll_export_lines
  FOR SELECT TO authenticated
  USING (employee_id = current_employee_id());

-- Auto-update timestamp
DROP TRIGGER IF EXISTS update_payroll_exports_updated_at ON public.payroll_exports;
CREATE TRIGGER update_payroll_exports_updated_at
  BEFORE UPDATE ON public.payroll_exports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RPC: preview aggregated payroll data for a period (without persisting)
CREATE OR REPLACE FUNCTION public.preview_payroll_period(p_year INTEGER, p_month INTEGER)
RETURNS TABLE (
  employee_id UUID,
  employee_name TEXT,
  employee_email TEXT,
  personal_number TEXT,
  vacation_days NUMERIC,
  sick_days NUMERIC,
  parental_days NUMERIC,
  other_leave_days NUMERIC,
  expense_reimbursement_cents BIGINT,
  representation_cents BIGINT,
  expense_count INTEGER,
  leave_request_ids UUID[],
  expense_ids UUID[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH period AS (
    SELECT
      make_date(p_year, p_month, 1) AS start_date,
      (make_date(p_year, p_month, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date AS end_date
  ),
  leave_agg AS (
    SELECT
      lr.employee_id,
      COALESCE(SUM(CASE WHEN lr.leave_type = 'vacation' THEN lr.days ELSE 0 END), 0)::numeric AS vacation_days,
      COALESCE(SUM(CASE WHEN lr.leave_type = 'sick' THEN lr.days ELSE 0 END), 0)::numeric AS sick_days,
      COALESCE(SUM(CASE WHEN lr.leave_type = 'parental' THEN lr.days ELSE 0 END), 0)::numeric AS parental_days,
      COALESCE(SUM(CASE WHEN lr.leave_type NOT IN ('vacation','sick','parental') THEN lr.days ELSE 0 END), 0)::numeric AS other_leave_days,
      array_agg(lr.id) AS leave_request_ids
    FROM public.leave_requests lr, period
    WHERE lr.status = 'approved'
      AND lr.payroll_export_id IS NULL
      AND lr.start_date <= period.end_date
      AND lr.end_date >= period.start_date
    GROUP BY lr.employee_id
  ),
  expense_agg AS (
    SELECT
      e.user_id,
      COALESCE(SUM(CASE WHEN NOT e.is_representation THEN e.amount_cents ELSE 0 END), 0)::bigint AS expense_reimbursement_cents,
      COALESCE(SUM(CASE WHEN e.is_representation THEN e.amount_cents ELSE 0 END), 0)::bigint AS representation_cents,
      COUNT(*)::int AS expense_count,
      array_agg(e.id) AS expense_ids
    FROM public.expenses e, period
    WHERE e.status = 'approved'
      AND e.payroll_export_id IS NULL
      AND e.expense_date BETWEEN period.start_date AND period.end_date
    GROUP BY e.user_id
  )
  SELECT
    emp.id,
    emp.name,
    emp.email,
    emp.personal_number,
    COALESCE(la.vacation_days, 0),
    COALESCE(la.sick_days, 0),
    COALESCE(la.parental_days, 0),
    COALESCE(la.other_leave_days, 0),
    COALESCE(ea.expense_reimbursement_cents, 0),
    COALESCE(ea.representation_cents, 0),
    COALESCE(ea.expense_count, 0),
    COALESCE(la.leave_request_ids, '{}'::uuid[]),
    COALESCE(ea.expense_ids, '{}'::uuid[])
  FROM public.employees emp
  LEFT JOIN leave_agg la ON la.employee_id = emp.id
  LEFT JOIN expense_agg ea ON ea.user_id = emp.user_id
  WHERE emp.status = 'active'
    AND (la.employee_id IS NOT NULL OR ea.user_id IS NOT NULL)
  ORDER BY emp.name;
$$;

-- RPC: generate (persist) payroll export, mark source rows as exported
CREATE OR REPLACE FUNCTION public.generate_payroll_export(p_year INTEGER, p_month INTEGER)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_export_id UUID;
  v_existing UUID;
  v_total_emp INTEGER := 0;
  v_total_days NUMERIC := 0;
  v_total_cents BIGINT := 0;
  v_row RECORD;
  v_all_leave_ids UUID[] := '{}';
  v_all_expense_ids UUID[] := '{}';
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can generate payroll exports';
  END IF;

  -- Reuse draft export if exists, otherwise reject if locked
  SELECT id INTO v_existing FROM public.payroll_exports
  WHERE period_year = p_year AND period_month = p_month;

  IF v_existing IS NOT NULL THEN
    -- Cannot regenerate locked exports
    IF EXISTS (SELECT 1 FROM public.payroll_exports WHERE id = v_existing AND status = 'locked') THEN
      RAISE EXCEPTION 'Payroll export for %-% is locked and cannot be regenerated', p_year, p_month;
    END IF;
    -- Clear existing lines and unlink source rows so we can rebuild
    DELETE FROM public.payroll_export_lines WHERE export_id = v_existing;
    UPDATE public.leave_requests SET payroll_export_id = NULL WHERE payroll_export_id = v_existing;
    UPDATE public.expenses SET payroll_export_id = NULL WHERE payroll_export_id = v_existing;
    v_export_id := v_existing;
  ELSE
    INSERT INTO public.payroll_exports (period_year, period_month, status, generated_by, generated_at)
    VALUES (p_year, p_month, 'generated', auth.uid(), now())
    RETURNING id INTO v_export_id;
  END IF;

  -- Insert lines from preview
  FOR v_row IN SELECT * FROM public.preview_payroll_period(p_year, p_month) LOOP
    INSERT INTO public.payroll_export_lines (
      export_id, employee_id, employee_name, employee_email, personal_number,
      vacation_days, sick_days, parental_days, other_leave_days,
      expense_reimbursement_cents, representation_cents, expense_count,
      leave_request_ids, expense_ids
    )
    VALUES (
      v_export_id, v_row.employee_id, v_row.employee_name, v_row.employee_email, v_row.personal_number,
      v_row.vacation_days, v_row.sick_days, v_row.parental_days, v_row.other_leave_days,
      v_row.expense_reimbursement_cents, v_row.representation_cents, v_row.expense_count,
      v_row.leave_request_ids, v_row.expense_ids
    );

    v_total_emp := v_total_emp + 1;
    v_total_days := v_total_days + v_row.vacation_days + v_row.sick_days + v_row.parental_days + v_row.other_leave_days;
    v_total_cents := v_total_cents + v_row.expense_reimbursement_cents + v_row.representation_cents;
    v_all_leave_ids := v_all_leave_ids || v_row.leave_request_ids;
    v_all_expense_ids := v_all_expense_ids || v_row.expense_ids;
  END LOOP;

  -- Mark source rows as exported
  IF array_length(v_all_leave_ids, 1) > 0 THEN
    UPDATE public.leave_requests SET payroll_export_id = v_export_id WHERE id = ANY(v_all_leave_ids);
  END IF;
  IF array_length(v_all_expense_ids, 1) > 0 THEN
    UPDATE public.expenses SET payroll_export_id = v_export_id WHERE id = ANY(v_all_expense_ids);
  END IF;

  -- Update totals
  UPDATE public.payroll_exports
  SET total_employees = v_total_emp,
      total_leave_days = v_total_days,
      total_expense_cents = v_total_cents,
      status = 'generated',
      generated_at = now(),
      generated_by = auth.uid()
  WHERE id = v_export_id;

  RETURN v_export_id;
END;
$$;

-- RPC: lock export (prevents regeneration)
CREATE OR REPLACE FUNCTION public.lock_payroll_export(p_export_id UUID)
RETURNS public.payroll_exports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.payroll_exports;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can lock payroll exports';
  END IF;
  UPDATE public.payroll_exports
  SET status = 'locked', locked_at = now()
  WHERE id = p_export_id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;