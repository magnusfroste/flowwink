-- ============================================================
-- Module 1: Skills & Certifications register
-- ============================================================

CREATE TABLE IF NOT EXISTS public.skills_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  category TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.employee_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES public.skills_catalog(id) ON DELETE CASCADE,
  proficiency_level INT CHECK (proficiency_level BETWEEN 1 AND 5),
  years_experience NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, skill_id)
);

CREATE TABLE IF NOT EXISTS public.certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  issuer TEXT,
  certificate_number TEXT,
  issued_date DATE,
  expires_at DATE,
  document_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_skills_emp ON public.employee_skills(employee_id);
CREATE INDEX IF NOT EXISTS idx_certifications_emp ON public.certifications(employee_id);
CREATE INDEX IF NOT EXISTS idx_certifications_expires ON public.certifications(expires_at) WHERE expires_at IS NOT NULL;

ALTER TABLE public.skills_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "skills_catalog read" ON public.skills_catalog;
CREATE POLICY "skills_catalog read" ON public.skills_catalog FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "skills_catalog admin write" ON public.skills_catalog;
CREATE POLICY "skills_catalog admin write" ON public.skills_catalog FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "employee_skills read" ON public.employee_skills;
CREATE POLICY "employee_skills read" ON public.employee_skills FOR SELECT TO authenticated USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_skills.employee_id AND e.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_skills.employee_id AND is_manager_of(auth.uid(), e.id))
);
DROP POLICY IF EXISTS "employee_skills admin write" ON public.employee_skills;
CREATE POLICY "employee_skills admin write" ON public.employee_skills FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "certifications read" ON public.certifications;
CREATE POLICY "certifications read" ON public.certifications FOR SELECT TO authenticated USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM employees e WHERE e.id = certifications.employee_id AND e.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM employees e WHERE e.id = certifications.employee_id AND is_manager_of(auth.uid(), e.id))
);
DROP POLICY IF EXISTS "certifications admin write" ON public.certifications;
CREATE POLICY "certifications admin write" ON public.certifications FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_employee_skills_updated_at ON public.employee_skills;
CREATE TRIGGER trg_employee_skills_updated_at BEFORE UPDATE ON public.employee_skills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS trg_certifications_updated_at ON public.certifications;
CREATE TRIGGER trg_certifications_updated_at BEFORE UPDATE ON public.certifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Seed common Swedish work skills
INSERT INTO public.skills_catalog (name, category) VALUES
  ('Truckkort A', 'certifierat'),
  ('Truckkort B', 'certifierat'),
  ('Första hjälpen / HLR', 'säkerhet'),
  ('Brandskydd', 'säkerhet'),
  ('Heta arbeten', 'certifierat'),
  ('Svenska', 'språk'),
  ('Engelska', 'språk'),
  ('Projektledning', 'ledarskap'),
  ('Excel', 'tekniskt'),
  ('SQL', 'tekniskt')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- Module 2: Time & Attendance (clock-in/out / stämpling)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.attendance_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  clock_in TIMESTAMPTZ NOT NULL,
  clock_out TIMESTAMPTZ,
  break_minutes INT NOT NULL DEFAULT 0,
  total_minutes INT GENERATED ALWAYS AS (
    CASE WHEN clock_out IS NULL THEN NULL
    ELSE GREATEST(0, EXTRACT(EPOCH FROM (clock_out - clock_in))::INT / 60 - break_minutes) END
  ) STORED,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON public.attendance_entries(employee_id, clock_in DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_open ON public.attendance_entries(employee_id) WHERE clock_out IS NULL;

ALTER TABLE public.attendance_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attendance read" ON public.attendance_entries;
CREATE POLICY "attendance read" ON public.attendance_entries FOR SELECT TO authenticated USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM employees e WHERE e.id = attendance_entries.employee_id AND e.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM employees e WHERE e.id = attendance_entries.employee_id AND is_manager_of(auth.uid(), e.id))
);

DROP POLICY IF EXISTS "attendance employee write" ON public.attendance_entries;
CREATE POLICY "attendance employee write" ON public.attendance_entries FOR INSERT TO authenticated WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM employees e WHERE e.id = attendance_entries.employee_id AND e.user_id = auth.uid())
);

DROP POLICY IF EXISTS "attendance employee update own" ON public.attendance_entries;
CREATE POLICY "attendance employee update own" ON public.attendance_entries FOR UPDATE TO authenticated USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM employees e WHERE e.id = attendance_entries.employee_id AND e.user_id = auth.uid())
);

DROP POLICY IF EXISTS "attendance admin delete" ON public.attendance_entries;
CREATE POLICY "attendance admin delete" ON public.attendance_entries FOR DELETE TO authenticated USING (
  has_role(auth.uid(), 'admin'::app_role)
);

DROP TRIGGER IF EXISTS trg_attendance_updated_at ON public.attendance_entries;
CREATE TRIGGER trg_attendance_updated_at BEFORE UPDATE ON public.attendance_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RPC: clock in (prevents double-open entries)
CREATE OR REPLACE FUNCTION public.clock_in(p_employee_id UUID DEFAULT NULL)
RETURNS public.attendance_entries
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_emp_id UUID;
  v_row public.attendance_entries;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF p_employee_id IS NOT NULL THEN
    IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Only admins can clock in for others';
    END IF;
    v_emp_id := p_employee_id;
  ELSE
    SELECT id INTO v_emp_id FROM public.employees WHERE user_id = auth.uid() LIMIT 1;
    IF v_emp_id IS NULL THEN RAISE EXCEPTION 'No employee record found for current user'; END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.attendance_entries WHERE employee_id = v_emp_id AND clock_out IS NULL) THEN
    RAISE EXCEPTION 'Already clocked in — please clock out first';
  END IF;

  INSERT INTO public.attendance_entries (employee_id, clock_in, source)
  VALUES (v_emp_id, now(), 'self')
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- RPC: clock out (closes the open entry)
CREATE OR REPLACE FUNCTION public.clock_out(p_break_minutes INT DEFAULT 0, p_notes TEXT DEFAULT NULL, p_employee_id UUID DEFAULT NULL)
RETURNS public.attendance_entries
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_emp_id UUID;
  v_row public.attendance_entries;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF p_employee_id IS NOT NULL THEN
    IF NOT has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Only admins can clock out for others'; END IF;
    v_emp_id := p_employee_id;
  ELSE
    SELECT id INTO v_emp_id FROM public.employees WHERE user_id = auth.uid() LIMIT 1;
    IF v_emp_id IS NULL THEN RAISE EXCEPTION 'No employee record found'; END IF;
  END IF;

  UPDATE public.attendance_entries
  SET clock_out = now(),
      break_minutes = COALESCE(p_break_minutes, 0),
      notes = COALESCE(p_notes, notes)
  WHERE employee_id = v_emp_id AND clock_out IS NULL
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No open clock-in found'; END IF;
  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clock_in(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clock_out(INT, TEXT, UUID) TO authenticated;