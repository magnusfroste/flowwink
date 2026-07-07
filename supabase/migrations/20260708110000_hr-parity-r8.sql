-- HR parity round 8: salary grades, benefits management, training catalog,
-- disciplinary actions, shift scheduling. Idempotent, forward-dated.

-- ============================================================
-- 1. SALARY GRADES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.salary_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  level integer NOT NULL DEFAULT 1,
  min_cents bigint NOT NULL,
  mid_cents bigint,
  max_cents bigint NOT NULL,
  currency text NOT NULL DEFAULT 'SEK',
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (max_cents >= min_cents)
);

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS salary_grade_id uuid
  REFERENCES public.salary_grades(id) ON DELETE SET NULL;

ALTER TABLE public.salary_grades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "salary_grades_admin_all" ON public.salary_grades;
CREATE POLICY "salary_grades_admin_all" ON public.salary_grades
  FOR ALL USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.manage_salary_grade(
  p_action text,
  p_grade_id uuid DEFAULT NULL,
  p_code text DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_level integer DEFAULT NULL,
  p_min_cents bigint DEFAULT NULL,
  p_mid_cents bigint DEFAULT NULL,
  p_max_cents bigint DEFAULT NULL,
  p_currency text DEFAULT NULL,
  p_employee_id uuid DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_grade public.salary_grades;
  v_emp public.employees;
  v_rows jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can manage salary grades';
  END IF;

  IF p_action = 'create' THEN
    IF p_code IS NULL OR p_name IS NULL OR p_min_cents IS NULL OR p_max_cents IS NULL THEN
      RAISE EXCEPTION 'create requires p_code, p_name, p_min_cents, p_max_cents';
    END IF;
    INSERT INTO public.salary_grades (code, name, level, min_cents, mid_cents, max_cents, currency, notes)
    VALUES (upper(p_code), p_name, COALESCE(p_level, 1), p_min_cents,
            COALESCE(p_mid_cents, (p_min_cents + p_max_cents) / 2), p_max_cents,
            COALESCE(p_currency, 'SEK'), p_notes)
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name, level = EXCLUDED.level, min_cents = EXCLUDED.min_cents,
      mid_cents = EXCLUDED.mid_cents, max_cents = EXCLUDED.max_cents,
      currency = EXCLUDED.currency, notes = COALESCE(EXCLUDED.notes, salary_grades.notes),
      updated_at = now()
    RETURNING * INTO v_grade;
    RETURN jsonb_build_object('success', true, 'grade', to_jsonb(v_grade));

  ELSIF p_action = 'update' THEN
    IF p_grade_id IS NULL AND p_code IS NULL THEN
      RAISE EXCEPTION 'update requires p_grade_id or p_code';
    END IF;
    UPDATE public.salary_grades SET
      name = COALESCE(p_name, name),
      level = COALESCE(p_level, level),
      min_cents = COALESCE(p_min_cents, min_cents),
      mid_cents = COALESCE(p_mid_cents, mid_cents),
      max_cents = COALESCE(p_max_cents, max_cents),
      currency = COALESCE(p_currency, currency),
      is_active = COALESCE(p_is_active, is_active),
      notes = COALESCE(p_notes, notes),
      updated_at = now()
    WHERE (p_grade_id IS NOT NULL AND id = p_grade_id)
       OR (p_grade_id IS NULL AND code = upper(p_code))
    RETURNING * INTO v_grade;
    IF v_grade.id IS NULL THEN RAISE EXCEPTION 'Salary grade not found'; END IF;
    RETURN jsonb_build_object('success', true, 'grade', to_jsonb(v_grade));

  ELSIF p_action = 'delete' THEN
    DELETE FROM public.salary_grades
    WHERE (p_grade_id IS NOT NULL AND id = p_grade_id)
       OR (p_grade_id IS NULL AND code = upper(p_code))
    RETURNING * INTO v_grade;
    IF v_grade.id IS NULL THEN RAISE EXCEPTION 'Salary grade not found'; END IF;
    RETURN jsonb_build_object('success', true, 'deleted', to_jsonb(v_grade));

  ELSIF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', g.id, 'code', g.code, 'name', g.name, 'level', g.level,
      'min_cents', g.min_cents, 'mid_cents', g.mid_cents, 'max_cents', g.max_cents,
      'currency', g.currency, 'is_active', g.is_active,
      'employee_count', (SELECT count(*) FROM public.employees e WHERE e.salary_grade_id = g.id)
    ) ORDER BY g.level, g.code), '[]'::jsonb) INTO v_rows
    FROM public.salary_grades g;
    RETURN jsonb_build_object('success', true, 'grades', v_rows);

  ELSIF p_action = 'assign' THEN
    IF p_employee_id IS NULL THEN RAISE EXCEPTION 'assign requires p_employee_id'; END IF;
    SELECT * INTO v_grade FROM public.salary_grades
    WHERE (p_grade_id IS NOT NULL AND id = p_grade_id)
       OR (p_grade_id IS NULL AND p_code IS NOT NULL AND code = upper(p_code));
    IF v_grade.id IS NULL AND (p_grade_id IS NOT NULL OR p_code IS NOT NULL) THEN
      RAISE EXCEPTION 'Salary grade not found';
    END IF;
    UPDATE public.employees SET salary_grade_id = v_grade.id, updated_at = now()
      WHERE id = p_employee_id RETURNING * INTO v_emp;
    IF v_emp.id IS NULL THEN RAISE EXCEPTION 'Employee % not found', p_employee_id; END IF;
    RETURN jsonb_build_object('success', true, 'employee_id', v_emp.id,
      'grade', CASE WHEN v_grade.id IS NULL THEN NULL ELSE v_grade.code END,
      'in_band', CASE WHEN v_grade.id IS NULL OR v_emp.monthly_salary_cents IS NULL THEN NULL
                      ELSE v_emp.monthly_salary_cents BETWEEN v_grade.min_cents AND v_grade.max_cents END,
      'monthly_salary_cents', v_emp.monthly_salary_cents);

  ELSIF p_action = 'compliance' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'employee_id', e.id, 'name', e.name, 'grade', g.code,
      'monthly_salary_cents', e.monthly_salary_cents,
      'band_min_cents', g.min_cents, 'band_max_cents', g.max_cents,
      'compa_ratio', CASE WHEN g.mid_cents > 0 AND e.monthly_salary_cents IS NOT NULL
                          THEN round(e.monthly_salary_cents::numeric / g.mid_cents, 2) END,
      'issue', CASE
        WHEN e.monthly_salary_cents IS NULL THEN 'no_salary_set'
        WHEN e.monthly_salary_cents < g.min_cents THEN 'below_band'
        WHEN e.monthly_salary_cents > g.max_cents THEN 'above_band'
        ELSE NULL END
    ) ORDER BY e.name), '[]'::jsonb) INTO v_rows
    FROM public.employees e
    JOIN public.salary_grades g ON g.id = e.salary_grade_id
    WHERE e.status = 'active'
      AND (e.monthly_salary_cents IS NULL
           OR e.monthly_salary_cents NOT BETWEEN g.min_cents AND g.max_cents);
    RETURN jsonb_build_object('success', true, 'out_of_band', v_rows,
      'ungraded_active_employees', (SELECT count(*) FROM public.employees
                                    WHERE status = 'active' AND salary_grade_id IS NULL));
  ELSE
    RAISE EXCEPTION 'Unknown action %. Use create|update|delete|list|assign|compliance', p_action;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.manage_salary_grade(text, uuid, text, text, integer, bigint, bigint, bigint, text, uuid, boolean, text) TO authenticated, service_role;

-- ============================================================
-- 2. BENEFITS MANAGEMENT
-- ============================================================
CREATE TABLE IF NOT EXISTS public.benefit_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  benefit_type text NOT NULL DEFAULT 'other'
    CHECK (benefit_type IN ('health', 'pension', 'insurance', 'wellness', 'meal', 'commute', 'equipment', 'other')),
  description text,
  provider text,
  employer_cost_cents bigint NOT NULL DEFAULT 0,
  employee_cost_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SEK',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.employee_benefits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.benefit_plans(id) ON DELETE CASCADE,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS employee_benefits_active_uq
  ON public.employee_benefits (employee_id, plan_id) WHERE status = 'active';

ALTER TABLE public.benefit_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_benefits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "benefit_plans_admin_all" ON public.benefit_plans;
CREATE POLICY "benefit_plans_admin_all" ON public.benefit_plans
  FOR ALL USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "employee_benefits_admin_all" ON public.employee_benefits;
CREATE POLICY "employee_benefits_admin_all" ON public.employee_benefits
  FOR ALL USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "employee_benefits_self_read" ON public.employee_benefits;
CREATE POLICY "employee_benefits_self_read" ON public.employee_benefits
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.employees e
                            WHERE e.id = employee_benefits.employee_id AND e.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.manage_benefits(
  p_action text,
  p_plan_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_benefit_type text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_provider text DEFAULT NULL,
  p_employer_cost_cents bigint DEFAULT NULL,
  p_employee_cost_cents bigint DEFAULT NULL,
  p_employee_id uuid DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_plan public.benefit_plans;
  v_enr public.employee_benefits;
  v_rows jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can manage benefits';
  END IF;

  IF p_action = 'create_plan' THEN
    IF p_name IS NULL THEN RAISE EXCEPTION 'create_plan requires p_name'; END IF;
    INSERT INTO public.benefit_plans (name, benefit_type, description, provider,
                                      employer_cost_cents, employee_cost_cents)
    VALUES (p_name, COALESCE(p_benefit_type, 'other'), p_description, p_provider,
            COALESCE(p_employer_cost_cents, 0), COALESCE(p_employee_cost_cents, 0))
    RETURNING * INTO v_plan;
    RETURN jsonb_build_object('success', true, 'plan', to_jsonb(v_plan));

  ELSIF p_action = 'update_plan' THEN
    IF p_plan_id IS NULL THEN RAISE EXCEPTION 'update_plan requires p_plan_id'; END IF;
    UPDATE public.benefit_plans SET
      name = COALESCE(p_name, name),
      benefit_type = COALESCE(p_benefit_type, benefit_type),
      description = COALESCE(p_description, description),
      provider = COALESCE(p_provider, provider),
      employer_cost_cents = COALESCE(p_employer_cost_cents, employer_cost_cents),
      employee_cost_cents = COALESCE(p_employee_cost_cents, employee_cost_cents),
      is_active = COALESCE(p_is_active, is_active),
      updated_at = now()
    WHERE id = p_plan_id RETURNING * INTO v_plan;
    IF v_plan.id IS NULL THEN RAISE EXCEPTION 'Benefit plan % not found', p_plan_id; END IF;
    RETURN jsonb_build_object('success', true, 'plan', to_jsonb(v_plan));

  ELSIF p_action = 'list_plans' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'benefit_type', p.benefit_type, 'provider', p.provider,
      'employer_cost_cents', p.employer_cost_cents, 'employee_cost_cents', p.employee_cost_cents,
      'is_active', p.is_active,
      'enrolled_count', (SELECT count(*) FROM public.employee_benefits eb
                         WHERE eb.plan_id = p.id AND eb.status = 'active')
    ) ORDER BY p.name), '[]'::jsonb) INTO v_rows
    FROM public.benefit_plans p;
    RETURN jsonb_build_object('success', true, 'plans', v_rows);

  ELSIF p_action = 'enroll' THEN
    IF p_plan_id IS NULL OR p_employee_id IS NULL THEN
      RAISE EXCEPTION 'enroll requires p_plan_id and p_employee_id';
    END IF;
    INSERT INTO public.employee_benefits (employee_id, plan_id, start_date, notes)
    VALUES (p_employee_id, p_plan_id, COALESCE(p_start_date, CURRENT_DATE), p_notes)
    RETURNING * INTO v_enr;
    RETURN jsonb_build_object('success', true, 'enrollment', to_jsonb(v_enr));

  ELSIF p_action = 'end_enrollment' THEN
    IF p_plan_id IS NULL OR p_employee_id IS NULL THEN
      RAISE EXCEPTION 'end_enrollment requires p_plan_id and p_employee_id';
    END IF;
    UPDATE public.employee_benefits
      SET status = 'ended', end_date = COALESCE(p_end_date, CURRENT_DATE)
      WHERE employee_id = p_employee_id AND plan_id = p_plan_id AND status = 'active'
      RETURNING * INTO v_enr;
    IF v_enr.id IS NULL THEN RAISE EXCEPTION 'No active enrollment found'; END IF;
    RETURN jsonb_build_object('success', true, 'enrollment', to_jsonb(v_enr));

  ELSIF p_action = 'list_enrollments' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', eb.id, 'employee_id', eb.employee_id, 'employee', e.name,
      'plan_id', eb.plan_id, 'plan', bp.name, 'benefit_type', bp.benefit_type,
      'start_date', eb.start_date, 'end_date', eb.end_date, 'status', eb.status
    ) ORDER BY e.name, bp.name), '[]'::jsonb) INTO v_rows
    FROM public.employee_benefits eb
    JOIN public.employees e ON e.id = eb.employee_id
    JOIN public.benefit_plans bp ON bp.id = eb.plan_id
    WHERE (p_employee_id IS NULL OR eb.employee_id = p_employee_id)
      AND (p_plan_id IS NULL OR eb.plan_id = p_plan_id);
    RETURN jsonb_build_object('success', true, 'enrollments', v_rows);

  ELSIF p_action = 'summary' THEN
    SELECT COALESCE(jsonb_agg(x ORDER BY x->>'plan'), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT jsonb_build_object(
        'plan', bp.name, 'benefit_type', bp.benefit_type,
        'active_enrollments', count(*),
        'monthly_employer_cost_cents', count(*) * bp.employer_cost_cents,
        'monthly_employee_cost_cents', count(*) * bp.employee_cost_cents) AS x
      FROM public.employee_benefits eb
      JOIN public.benefit_plans bp ON bp.id = eb.plan_id
      WHERE eb.status = 'active'
      GROUP BY bp.id, bp.name, bp.benefit_type, bp.employer_cost_cents, bp.employee_cost_cents
    ) t;
    RETURN jsonb_build_object('success', true, 'summary', v_rows,
      'total_monthly_employer_cost_cents', COALESCE((
        SELECT sum(bp.employer_cost_cents) FROM public.employee_benefits eb
        JOIN public.benefit_plans bp ON bp.id = eb.plan_id WHERE eb.status = 'active'), 0));
  ELSE
    RAISE EXCEPTION 'Unknown action %. Use create_plan|update_plan|list_plans|enroll|end_enrollment|list_enrollments|summary', p_action;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.manage_benefits(text, uuid, text, text, text, text, bigint, bigint, uuid, date, date, boolean, text) TO authenticated, service_role;

-- ============================================================
-- 3. TRAINING CATALOG
-- ============================================================
CREATE TABLE IF NOT EXISTS public.training_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category text,
  provider text,
  duration_hours numeric,
  cost_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SEK',
  url text,
  mandatory boolean NOT NULL DEFAULT false,
  valid_months integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.training_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.training_courses(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'enrolled'
    CHECK (status IN ('enrolled', 'in_progress', 'completed', 'cancelled')),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  due_date date,
  completed_at timestamptz,
  score text,
  notes text,
  UNIQUE (course_id, employee_id)
);

ALTER TABLE public.training_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_enrollments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "training_courses_admin_all" ON public.training_courses;
CREATE POLICY "training_courses_admin_all" ON public.training_courses
  FOR ALL USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "training_courses_staff_read" ON public.training_courses;
CREATE POLICY "training_courses_staff_read" ON public.training_courses
  FOR SELECT USING (auth.uid() IS NOT NULL AND is_active);
DROP POLICY IF EXISTS "training_enrollments_admin_all" ON public.training_enrollments;
CREATE POLICY "training_enrollments_admin_all" ON public.training_enrollments
  FOR ALL USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "training_enrollments_self_read" ON public.training_enrollments;
CREATE POLICY "training_enrollments_self_read" ON public.training_enrollments
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.employees e
                            WHERE e.id = training_enrollments.employee_id AND e.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.manage_training(
  p_action text,
  p_course_id uuid DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_provider text DEFAULT NULL,
  p_duration_hours numeric DEFAULT NULL,
  p_cost_cents bigint DEFAULT NULL,
  p_url text DEFAULT NULL,
  p_mandatory boolean DEFAULT NULL,
  p_valid_months integer DEFAULT NULL,
  p_employee_id uuid DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_score text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_award_certification boolean DEFAULT false,
  p_is_active boolean DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_course public.training_courses;
  v_enr public.training_enrollments;
  v_rows jsonb;
  v_cert_id uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can manage training';
  END IF;

  IF p_action = 'create_course' THEN
    IF p_title IS NULL THEN RAISE EXCEPTION 'create_course requires p_title'; END IF;
    INSERT INTO public.training_courses (title, description, category, provider, duration_hours,
                                         cost_cents, url, mandatory, valid_months)
    VALUES (p_title, p_description, p_category, p_provider, p_duration_hours,
            COALESCE(p_cost_cents, 0), p_url, COALESCE(p_mandatory, false), p_valid_months)
    RETURNING * INTO v_course;
    RETURN jsonb_build_object('success', true, 'course', to_jsonb(v_course));

  ELSIF p_action = 'update_course' THEN
    IF p_course_id IS NULL THEN RAISE EXCEPTION 'update_course requires p_course_id'; END IF;
    UPDATE public.training_courses SET
      title = COALESCE(p_title, title),
      description = COALESCE(p_description, description),
      category = COALESCE(p_category, category),
      provider = COALESCE(p_provider, provider),
      duration_hours = COALESCE(p_duration_hours, duration_hours),
      cost_cents = COALESCE(p_cost_cents, cost_cents),
      url = COALESCE(p_url, url),
      mandatory = COALESCE(p_mandatory, mandatory),
      valid_months = COALESCE(p_valid_months, valid_months),
      is_active = COALESCE(p_is_active, is_active),
      updated_at = now()
    WHERE id = p_course_id RETURNING * INTO v_course;
    IF v_course.id IS NULL THEN RAISE EXCEPTION 'Course % not found', p_course_id; END IF;
    RETURN jsonb_build_object('success', true, 'course', to_jsonb(v_course));

  ELSIF p_action = 'list_courses' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.id, 'title', c.title, 'category', c.category, 'provider', c.provider,
      'duration_hours', c.duration_hours, 'cost_cents', c.cost_cents, 'mandatory', c.mandatory,
      'valid_months', c.valid_months, 'is_active', c.is_active,
      'enrolled', (SELECT count(*) FROM public.training_enrollments te
                   WHERE te.course_id = c.id AND te.status IN ('enrolled', 'in_progress')),
      'completed', (SELECT count(*) FROM public.training_enrollments te
                    WHERE te.course_id = c.id AND te.status = 'completed')
    ) ORDER BY c.title), '[]'::jsonb) INTO v_rows
    FROM public.training_courses c;
    RETURN jsonb_build_object('success', true, 'courses', v_rows);

  ELSIF p_action = 'enroll' THEN
    IF p_course_id IS NULL OR p_employee_id IS NULL THEN
      RAISE EXCEPTION 'enroll requires p_course_id and p_employee_id';
    END IF;
    INSERT INTO public.training_enrollments (course_id, employee_id, due_date, notes)
    VALUES (p_course_id, p_employee_id, p_due_date, p_notes)
    ON CONFLICT (course_id, employee_id) DO UPDATE
      SET status = 'enrolled', due_date = COALESCE(EXCLUDED.due_date, training_enrollments.due_date)
    RETURNING * INTO v_enr;
    RETURN jsonb_build_object('success', true, 'enrollment', to_jsonb(v_enr));

  ELSIF p_action = 'complete' THEN
    IF p_course_id IS NULL OR p_employee_id IS NULL THEN
      RAISE EXCEPTION 'complete requires p_course_id and p_employee_id';
    END IF;
    SELECT * INTO v_course FROM public.training_courses WHERE id = p_course_id;
    IF v_course.id IS NULL THEN RAISE EXCEPTION 'Course % not found', p_course_id; END IF;
    UPDATE public.training_enrollments
      SET status = 'completed', completed_at = now(),
          score = COALESCE(p_score, score), notes = COALESCE(p_notes, notes)
      WHERE course_id = p_course_id AND employee_id = p_employee_id
      RETURNING * INTO v_enr;
    IF v_enr.id IS NULL THEN RAISE EXCEPTION 'No enrollment found — enroll first'; END IF;
    IF p_award_certification THEN
      INSERT INTO public.certifications (employee_id, name, issuer, issued_date, expires_at, notes)
      VALUES (p_employee_id, v_course.title, COALESCE(v_course.provider, 'Internal training'),
              CURRENT_DATE,
              CASE WHEN v_course.valid_months IS NOT NULL
                   THEN (CURRENT_DATE + (v_course.valid_months || ' months')::interval)::date ELSE NULL END,
              'Awarded on training completion (' || v_enr.id || ')')
      RETURNING id INTO v_cert_id;
    END IF;
    RETURN jsonb_build_object('success', true, 'enrollment', to_jsonb(v_enr),
                              'certification_id', v_cert_id);

  ELSIF p_action = 'cancel' THEN
    UPDATE public.training_enrollments SET status = 'cancelled'
      WHERE course_id = p_course_id AND employee_id = p_employee_id
      RETURNING * INTO v_enr;
    IF v_enr.id IS NULL THEN RAISE EXCEPTION 'No enrollment found'; END IF;
    RETURN jsonb_build_object('success', true, 'enrollment', to_jsonb(v_enr));

  ELSIF p_action = 'list_enrollments' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', te.id, 'course_id', te.course_id, 'course', c.title,
      'employee_id', te.employee_id, 'employee', e.name, 'status', te.status,
      'enrolled_at', te.enrolled_at, 'due_date', te.due_date, 'completed_at', te.completed_at,
      'score', te.score
    ) ORDER BY te.enrolled_at DESC), '[]'::jsonb) INTO v_rows
    FROM public.training_enrollments te
    JOIN public.training_courses c ON c.id = te.course_id
    JOIN public.employees e ON e.id = te.employee_id
    WHERE (p_employee_id IS NULL OR te.employee_id = p_employee_id)
      AND (p_course_id IS NULL OR te.course_id = p_course_id);
    RETURN jsonb_build_object('success', true, 'enrollments', v_rows);

  ELSE
    RAISE EXCEPTION 'Unknown action %. Use create_course|update_course|list_courses|enroll|complete|cancel|list_enrollments', p_action;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.manage_training(text, uuid, text, text, text, text, numeric, bigint, text, boolean, integer, uuid, date, text, text, boolean, boolean) TO authenticated, service_role;

-- ============================================================
-- 4. DISCIPLINARY ACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.disciplinary_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  action_type text NOT NULL
    CHECK (action_type IN ('verbal_warning', 'written_warning', 'final_warning',
                           'suspension', 'termination_notice', 'note')),
  severity integer NOT NULL DEFAULT 1 CHECK (severity BETWEEN 1 AND 3),
  reason text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'resolved', 'withdrawn')),
  issued_by uuid,
  issued_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  resolution text,
  resolved_at timestamptz,
  follow_up_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS disciplinary_actions_employee_idx
  ON public.disciplinary_actions (employee_id, issued_at DESC);

ALTER TABLE public.disciplinary_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "disciplinary_actions_admin_all" ON public.disciplinary_actions;
CREATE POLICY "disciplinary_actions_admin_all" ON public.disciplinary_actions
  FOR ALL USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.manage_disciplinary(
  p_action text,
  p_record_id uuid DEFAULT NULL,
  p_employee_id uuid DEFAULT NULL,
  p_action_type text DEFAULT NULL,
  p_severity integer DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_resolution text DEFAULT NULL,
  p_follow_up_date date DEFAULT NULL,
  p_limit integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_row public.disciplinary_actions;
  v_rows jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can manage disciplinary records';
  END IF;

  IF p_action = 'create' THEN
    IF p_employee_id IS NULL OR p_action_type IS NULL OR p_reason IS NULL THEN
      RAISE EXCEPTION 'create requires p_employee_id, p_action_type, p_reason';
    END IF;
    INSERT INTO public.disciplinary_actions (employee_id, action_type, severity, reason,
                                             description, issued_by, follow_up_date)
    VALUES (p_employee_id, p_action_type, COALESCE(p_severity, 1), p_reason,
            p_description, auth.uid(), p_follow_up_date)
    RETURNING * INTO v_row;
    RETURN jsonb_build_object('success', true, 'record', to_jsonb(v_row));

  ELSIF p_action = 'update' THEN
    IF p_record_id IS NULL THEN RAISE EXCEPTION 'update requires p_record_id'; END IF;
    UPDATE public.disciplinary_actions SET
      action_type = COALESCE(p_action_type, action_type),
      severity = COALESCE(p_severity, severity),
      reason = COALESCE(p_reason, reason),
      description = COALESCE(p_description, description),
      follow_up_date = COALESCE(p_follow_up_date, follow_up_date),
      updated_at = now()
    WHERE id = p_record_id RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Record % not found', p_record_id; END IF;
    RETURN jsonb_build_object('success', true, 'record', to_jsonb(v_row));

  ELSIF p_action = 'acknowledge' THEN
    UPDATE public.disciplinary_actions
      SET status = 'acknowledged', acknowledged_at = now(), updated_at = now()
      WHERE id = p_record_id AND status = 'open' RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Open record % not found', p_record_id; END IF;
    RETURN jsonb_build_object('success', true, 'record', to_jsonb(v_row));

  ELSIF p_action = 'resolve' THEN
    IF p_record_id IS NULL THEN RAISE EXCEPTION 'resolve requires p_record_id'; END IF;
    UPDATE public.disciplinary_actions
      SET status = 'resolved', resolution = COALESCE(p_resolution, resolution),
          resolved_at = now(), updated_at = now()
      WHERE id = p_record_id RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Record % not found', p_record_id; END IF;
    RETURN jsonb_build_object('success', true, 'record', to_jsonb(v_row));

  ELSIF p_action = 'withdraw' THEN
    UPDATE public.disciplinary_actions
      SET status = 'withdrawn', resolution = COALESCE(p_resolution, resolution), updated_at = now()
      WHERE id = p_record_id RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Record % not found', p_record_id; END IF;
    RETURN jsonb_build_object('success', true, 'record', to_jsonb(v_row));

  ELSIF p_action = 'get' THEN
    SELECT * INTO v_row FROM public.disciplinary_actions WHERE id = p_record_id;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Record % not found', p_record_id; END IF;
    RETURN jsonb_build_object('success', true, 'record', to_jsonb(v_row));

  ELSIF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', d.id, 'employee_id', d.employee_id, 'employee', e.name,
      'action_type', d.action_type, 'severity', d.severity, 'reason', d.reason,
      'status', d.status, 'issued_at', d.issued_at, 'follow_up_date', d.follow_up_date
    ) ORDER BY d.issued_at DESC), '[]'::jsonb) INTO v_rows
    FROM (SELECT * FROM public.disciplinary_actions
          WHERE (p_employee_id IS NULL OR employee_id = p_employee_id)
          ORDER BY issued_at DESC
          LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)) d
    JOIN public.employees e ON e.id = d.employee_id;
    RETURN jsonb_build_object('success', true, 'records', v_rows);

  ELSE
    RAISE EXCEPTION 'Unknown action %. Use create|update|acknowledge|resolve|withdraw|get|list', p_action;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.manage_disciplinary(text, uuid, uuid, text, integer, text, text, text, date, integer) TO authenticated, service_role;

-- ============================================================
-- 5. SHIFT SCHEDULING
-- ============================================================
CREATE TABLE IF NOT EXISTS public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  shift_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  role text,
  location text,
  break_minutes integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS shifts_employee_date_idx ON public.shifts (employee_id, shift_date);
CREATE INDEX IF NOT EXISTS shifts_date_idx ON public.shifts (shift_date);

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shifts_admin_all" ON public.shifts;
CREATE POLICY "shifts_admin_all" ON public.shifts
  FOR ALL USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "shifts_self_read" ON public.shifts;
CREATE POLICY "shifts_self_read" ON public.shifts
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.employees e
                            WHERE e.id = shifts.employee_id AND e.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.manage_shift(
  p_action text,
  p_shift_id uuid DEFAULT NULL,
  p_employee_id uuid DEFAULT NULL,
  p_shift_date date DEFAULT NULL,
  p_start_time time DEFAULT NULL,
  p_end_time time DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_break_minutes integer DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_week_start date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_row public.shifts;
  v_rows jsonb;
  v_conflict public.shifts;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can manage shifts';
  END IF;

  IF p_action = 'create' THEN
    IF p_shift_date IS NULL OR p_start_time IS NULL OR p_end_time IS NULL THEN
      RAISE EXCEPTION 'create requires p_shift_date, p_start_time, p_end_time';
    END IF;
    IF p_employee_id IS NOT NULL THEN
      SELECT * INTO v_conflict FROM public.shifts
      WHERE employee_id = p_employee_id AND shift_date = p_shift_date
        AND status NOT IN ('cancelled')
        AND (p_start_time, p_end_time) OVERLAPS (start_time, end_time)
      LIMIT 1;
      IF v_conflict.id IS NOT NULL THEN
        RAISE EXCEPTION 'Shift overlaps an existing shift (% %-%) for this employee',
          v_conflict.shift_date, v_conflict.start_time, v_conflict.end_time;
      END IF;
    END IF;
    INSERT INTO public.shifts (employee_id, shift_date, start_time, end_time, role, location,
                               break_minutes, notes, created_by)
    VALUES (p_employee_id, p_shift_date, p_start_time, p_end_time, p_role, p_location,
            COALESCE(p_break_minutes, 0), p_notes, auth.uid())
    RETURNING * INTO v_row;
    RETURN jsonb_build_object('success', true, 'shift', to_jsonb(v_row));

  ELSIF p_action = 'update' THEN
    IF p_shift_id IS NULL THEN RAISE EXCEPTION 'update requires p_shift_id'; END IF;
    UPDATE public.shifts SET
      employee_id = COALESCE(p_employee_id, employee_id),
      shift_date = COALESCE(p_shift_date, shift_date),
      start_time = COALESCE(p_start_time, start_time),
      end_time = COALESCE(p_end_time, end_time),
      role = COALESCE(p_role, role),
      location = COALESCE(p_location, location),
      status = COALESCE(p_status, status),
      break_minutes = COALESCE(p_break_minutes, break_minutes),
      notes = COALESCE(p_notes, notes),
      updated_at = now()
    WHERE id = p_shift_id RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Shift % not found', p_shift_id; END IF;
    RETURN jsonb_build_object('success', true, 'shift', to_jsonb(v_row));

  ELSIF p_action = 'assign' THEN
    IF p_shift_id IS NULL OR p_employee_id IS NULL THEN
      RAISE EXCEPTION 'assign requires p_shift_id and p_employee_id';
    END IF;
    SELECT * INTO v_row FROM public.shifts WHERE id = p_shift_id;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Shift % not found', p_shift_id; END IF;
    SELECT * INTO v_conflict FROM public.shifts
    WHERE employee_id = p_employee_id AND shift_date = v_row.shift_date
      AND id <> p_shift_id AND status NOT IN ('cancelled')
      AND (v_row.start_time, v_row.end_time) OVERLAPS (start_time, end_time)
    LIMIT 1;
    IF v_conflict.id IS NOT NULL THEN
      RAISE EXCEPTION 'Employee already has an overlapping shift (% %-%)',
        v_conflict.shift_date, v_conflict.start_time, v_conflict.end_time;
    END IF;
    UPDATE public.shifts SET employee_id = p_employee_id, updated_at = now()
      WHERE id = p_shift_id RETURNING * INTO v_row;
    RETURN jsonb_build_object('success', true, 'shift', to_jsonb(v_row));

  ELSIF p_action = 'delete' THEN
    DELETE FROM public.shifts WHERE id = p_shift_id RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Shift % not found', p_shift_id; END IF;
    RETURN jsonb_build_object('success', true, 'deleted', to_jsonb(v_row));

  ELSIF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', s.id, 'employee_id', s.employee_id, 'employee', e.name,
      'shift_date', s.shift_date, 'start_time', s.start_time, 'end_time', s.end_time,
      'role', s.role, 'location', s.location, 'status', s.status,
      'break_minutes', s.break_minutes
    ) ORDER BY s.shift_date, s.start_time), '[]'::jsonb) INTO v_rows
    FROM public.shifts s
    LEFT JOIN public.employees e ON e.id = s.employee_id
    WHERE (p_employee_id IS NULL OR s.employee_id = p_employee_id)
      AND (p_shift_date IS NULL OR s.shift_date = p_shift_date)
      AND (p_week_start IS NULL OR s.shift_date BETWEEN p_week_start AND p_week_start + 6);
    RETURN jsonb_build_object('success', true, 'shifts', v_rows);

  ELSIF p_action = 'roster' THEN
    IF p_week_start IS NULL THEN RAISE EXCEPTION 'roster requires p_week_start (a date; the 7-day window starts there)'; END IF;
    SELECT COALESCE(jsonb_agg(x ORDER BY x->>'employee'), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT jsonb_build_object(
        'employee_id', e.id, 'employee', e.name,
        'total_hours', round(sum(
          EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 3600.0
          - s.break_minutes / 60.0)::numeric, 2),
        'shifts', jsonb_agg(jsonb_build_object(
          'id', s.id, 'date', s.shift_date, 'start', s.start_time, 'end', s.end_time,
          'role', s.role, 'location', s.location, 'status', s.status)
          ORDER BY s.shift_date, s.start_time)) AS x
      FROM public.shifts s
      JOIN public.employees e ON e.id = s.employee_id
      WHERE s.shift_date BETWEEN p_week_start AND p_week_start + 6
        AND s.status NOT IN ('cancelled')
      GROUP BY e.id, e.name
    ) t;
    RETURN jsonb_build_object('success', true, 'week_start', p_week_start, 'roster', v_rows,
      'open_shifts', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', id, 'date', shift_date, 'start', start_time, 'end', end_time,
          'role', role, 'location', location) ORDER BY shift_date, start_time), '[]'::jsonb)
        FROM public.shifts
        WHERE employee_id IS NULL AND status NOT IN ('cancelled')
          AND shift_date BETWEEN p_week_start AND p_week_start + 6));

  ELSE
    RAISE EXCEPTION 'Unknown action %. Use create|update|assign|delete|list|roster', p_action;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.manage_shift(text, uuid, uuid, date, time, time, text, text, text, integer, text, date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
