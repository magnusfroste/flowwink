-- Birth date for age-based vacation calculation
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS birth_date DATE;

-- Vacation policies (collective agreement tiers)
CREATE TABLE IF NOT EXISTS public.vacation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  min_age INTEGER NOT NULL DEFAULT 0,
  min_tenure_years INTEGER NOT NULL DEFAULT 0,
  vacation_days INTEGER NOT NULL,
  max_carry_over_days INTEGER NOT NULL DEFAULT 5,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vacation_policies_active ON public.vacation_policies(is_active, priority DESC);

ALTER TABLE public.vacation_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read vacation policies" ON public.vacation_policies;
CREATE POLICY "Authenticated read vacation policies" ON public.vacation_policies
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage vacation policies" ON public.vacation_policies;
CREATE POLICY "Admins manage vacation policies" ON public.vacation_policies
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS update_vacation_policies_updated_at ON public.vacation_policies;
CREATE TRIGGER update_vacation_policies_updated_at
  BEFORE UPDATE ON public.vacation_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Seed default Swedish policies (only if table is empty)
INSERT INTO public.vacation_policies (name, min_age, min_tenure_years, vacation_days, priority, description)
SELECT * FROM (VALUES
  ('Statutory minimum (Semesterlagen)', 0, 0, 25, 0, 'Swedish statutory minimum: 25 days for all employees'),
  ('30+ tier', 30, 0, 27, 10, 'Common collective agreement: +2 days from age 30'),
  ('40+ tier', 40, 0, 30, 20, 'Unionen / academic agreements: 30 days from age 40'),
  ('50+ tier', 50, 0, 32, 30, 'Senior tier: 32 days from age 50')
) AS v(name, min_age, min_tenure_years, vacation_days, priority, description)
WHERE NOT EXISTS (SELECT 1 FROM public.vacation_policies);

-- Calculate the right number of vacation days for an employee in a given year
CREATE OR REPLACE FUNCTION public.calculate_vacation_days(p_employee_id UUID, p_year INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp RECORD;
  v_age INTEGER;
  v_tenure_years INTEGER;
  v_days INTEGER;
BEGIN
  SELECT birth_date, start_date INTO v_emp
  FROM public.employees WHERE id = p_employee_id;

  IF v_emp IS NULL THEN RETURN 25; END IF;

  v_age := CASE
    WHEN v_emp.birth_date IS NULL THEN 0
    ELSE EXTRACT(YEAR FROM age(make_date(p_year, 12, 31), v_emp.birth_date))::INTEGER
  END;

  v_tenure_years := CASE
    WHEN v_emp.start_date IS NULL THEN 0
    ELSE GREATEST(0, p_year - EXTRACT(YEAR FROM v_emp.start_date)::INTEGER)
  END;

  -- Pick best matching policy (highest priority that the employee qualifies for)
  SELECT vacation_days INTO v_days
  FROM public.vacation_policies
  WHERE is_active = true
    AND v_age >= min_age
    AND v_tenure_years >= min_tenure_years
  ORDER BY priority DESC, vacation_days DESC
  LIMIT 1;

  RETURN COALESCE(v_days, 25);
END;
$$;

-- Auto-allocate vacation for all active employees for a given year
-- Includes carry-over from previous year (max per policy)
CREATE OR REPLACE FUNCTION public.auto_allocate_vacation(p_year INTEGER, p_dry_run BOOLEAN DEFAULT false)
RETURNS TABLE (
  employee_id UUID,
  employee_name TEXT,
  allocated_days INTEGER,
  carried_over_days NUMERIC,
  action TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp RECORD;
  v_days INTEGER;
  v_max_carry INTEGER;
  v_prev_remaining NUMERIC;
  v_carry NUMERIC;
  v_existing UUID;
  v_action TEXT;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can auto-allocate vacation';
  END IF;

  FOR v_emp IN
    SELECT id, name FROM public.employees WHERE status = 'active' ORDER BY name
  LOOP
    v_days := public.calculate_vacation_days(v_emp.id, p_year);

    -- Pick max carry-over from highest active policy this employee qualifies for
    SELECT max_carry_over_days INTO v_max_carry
    FROM public.vacation_policies
    WHERE is_active = true
    ORDER BY priority DESC LIMIT 1;
    v_max_carry := COALESCE(v_max_carry, 5);

    -- Carry-over = remaining days from previous year (capped)
    SELECT GREATEST(0, COALESCE(allocated_days,0) + COALESCE(carried_over_days,0)
      - COALESCE((SELECT SUM(days) FROM public.leave_requests
                  WHERE employee_id = v_emp.id AND leave_type = 'vacation'
                    AND status = 'approved'
                    AND EXTRACT(YEAR FROM start_date)::INTEGER = p_year - 1), 0))
    INTO v_prev_remaining
    FROM public.leave_allocations
    WHERE employee_id = v_emp.id AND leave_type = 'vacation' AND year = p_year - 1;

    v_carry := LEAST(COALESCE(v_prev_remaining, 0), v_max_carry);

    SELECT id INTO v_existing FROM public.leave_allocations
    WHERE employee_id = v_emp.id AND leave_type = 'vacation' AND year = p_year;

    IF v_existing IS NOT NULL THEN
      v_action := 'updated';
      IF NOT p_dry_run THEN
        UPDATE public.leave_allocations
        SET allocated_days = v_days, carried_over_days = v_carry, updated_at = now()
        WHERE id = v_existing;
      END IF;
    ELSE
      v_action := 'created';
      IF NOT p_dry_run THEN
        INSERT INTO public.leave_allocations (employee_id, leave_type, year, allocated_days, carried_over_days)
        VALUES (v_emp.id, 'vacation', p_year, v_days, v_carry);
      END IF;
    END IF;

    employee_id := v_emp.id;
    employee_name := v_emp.name;
    allocated_days := v_days;
    carried_over_days := v_carry;
    action := CASE WHEN p_dry_run THEN 'would_' || v_action ELSE v_action END;
    RETURN NEXT;
  END LOOP;
END;
$$;