CREATE OR REPLACE FUNCTION public.hire_application(
  p_application_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_monthly_salary_cents BIGINT DEFAULT NULL,
  p_contract_template_id UUID DEFAULT NULL,
  p_onboarding_template_id UUID DEFAULT NULL,
  p_department TEXT DEFAULT NULL,
  p_manager_id UUID DEFAULT NULL
)
RETURNS TABLE(
  application_id UUID,
  employee_id UUID,
  employment_contract_id UUID,
  onboarding_checklist_id UUID,
  contract_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.applications;
  v_job public.job_postings;
  v_emp_id UUID;
  v_contract_id UUID;
  v_onboard_id UUID;
  v_template public.employment_contract_templates;
  v_onb_template UUID;
  v_start_date DATE;
  v_salary BIGINT;
  v_dept TEXT;
  v_emp_type TEXT;
  v_body TEXT;
  v_probation_end DATE;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'approver'::public.app_role)) THEN
    RAISE EXCEPTION 'Only admins/approvers can hire candidates';
  END IF;

  SELECT * INTO v_app FROM public.applications WHERE id = p_application_id FOR UPDATE;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF v_app.employee_id IS NOT NULL THEN
    RAISE EXCEPTION 'Application already hired (employee_id=%)', v_app.employee_id;
  END IF;

  SELECT * INTO v_job FROM public.job_postings WHERE id = v_app.job_posting_id;

  v_start_date := COALESCE(p_start_date, CURRENT_DATE + INTERVAL '14 days');
  v_dept := COALESCE(p_department, v_job.department, 'General');
  v_emp_type := COALESCE(v_job.employment_type::TEXT, 'full_time');
  v_salary := COALESCE(p_monthly_salary_cents,
    NULLIF((COALESCE(v_job.salary_min_cents,0) + COALESCE(v_job.salary_max_cents,0)) / 2, 0),
    v_job.salary_min_cents);

  INSERT INTO public.employees (
    name, email, phone, title, department, employment_type,
    start_date, status, manager_id, created_by
  ) VALUES (
    v_app.candidate_name, v_app.candidate_email, v_app.candidate_phone,
    COALESCE(v_job.title, 'Employee'), v_dept, v_emp_type,
    v_start_date, 'active', p_manager_id, auth.uid()
  ) RETURNING id INTO v_emp_id;

  IF p_contract_template_id IS NOT NULL THEN
    SELECT * INTO v_template FROM public.employment_contract_templates WHERE id = p_contract_template_id;
  ELSE
    SELECT * INTO v_template FROM public.employment_contract_templates
    WHERE is_active = true AND is_default = true LIMIT 1;
    IF v_template.id IS NULL THEN
      SELECT * INTO v_template FROM public.employment_contract_templates
      WHERE is_active = true ORDER BY created_at LIMIT 1;
    END IF;
  END IF;

  v_body := COALESCE(v_template.body_markdown, '# Employment Agreement' || E'\n\nEmployee: ' || v_app.candidate_name);
  v_body := REPLACE(v_body, '{{employee_name}}', v_app.candidate_name);
  v_body := REPLACE(v_body, '{{title}}', COALESCE(v_job.title, ''));
  v_body := REPLACE(v_body, '{{department}}', v_dept);
  v_body := REPLACE(v_body, '{{start_date}}', to_char(v_start_date, 'YYYY-MM-DD'));
  v_body := REPLACE(v_body, '{{monthly_salary}}', COALESCE((v_salary / 100)::TEXT, 'TBD'));

  v_probation_end := v_start_date + (COALESCE(v_template.default_probation_months, 6) || ' months')::INTERVAL;

  INSERT INTO public.employment_contracts (
    employee_id, template_id, title, employment_type,
    start_date, probation_end_date, notice_period_days,
    monthly_salary_cents, currency, body_markdown, status, created_by, metadata
  ) VALUES (
    v_emp_id, v_template.id,
    'Employment Agreement — ' || v_app.candidate_name,
    COALESCE(v_template.employment_type, 'permanent'),
    v_start_date, v_probation_end,
    COALESCE(v_template.default_notice_period_days, 30),
    v_salary, COALESCE(v_job.currency, 'SEK'), v_body, 'draft', auth.uid(),
    jsonb_build_object('source','auto_hire','application_id',p_application_id,'job_posting_id',v_app.job_posting_id)
  ) RETURNING id INTO v_contract_id;

  v_onb_template := p_onboarding_template_id;
  IF v_onb_template IS NULL THEN
    SELECT id INTO v_onb_template FROM public.onboarding_templates
    WHERE is_active = true
      AND (department IS NULL OR department = v_dept)
      AND (employment_type IS NULL OR employment_type = v_emp_type)
    ORDER BY (department = v_dept) DESC NULLS LAST,
             (employment_type = v_emp_type) DESC NULLS LAST,
             is_default DESC, created_at LIMIT 1;
  END IF;

  IF v_onb_template IS NOT NULL THEN
    INSERT INTO public.onboarding_checklists (employee_id, title, items, created_by)
    SELECT v_emp_id, name, items, auth.uid()
    FROM public.onboarding_templates WHERE id = v_onb_template
    RETURNING id INTO v_onboard_id;
  END IF;

  UPDATE public.applications
  SET employee_id = v_emp_id, hired_at = now(), stage = 'hired', updated_at = now()
  WHERE id = p_application_id;

  application_id := p_application_id;
  employee_id := v_emp_id;
  employment_contract_id := v_contract_id;
  onboarding_checklist_id := v_onboard_id;
  contract_status := 'draft';
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hire_application(UUID, DATE, BIGINT, UUID, UUID, TEXT, UUID) TO authenticated;

INSERT INTO public.agent_skills (name, description, category, scope, handler, enabled, mcp_exposed, tool_definition)
VALUES (
  'hire_application',
  'Hire a candidate from an application: creates employee record, draft employment contract from template, and onboarding checklist. Use when: an application has been approved and HR wants to convert it to a permanent employee with all paperwork ready. NOT for: rejecting applications, changing application stage, or modifying existing employees.',
  'crm'::public.agent_skill_category,
  'external'::public.agent_scope,
  'rpc:hire_application',
  true,
  true,
  jsonb_build_object(
    'type','function',
    'function', jsonb_build_object(
      'name','hire_application',
      'description','Convert an approved application into hired employee + draft contract + onboarding checklist',
      'parameters', jsonb_build_object(
        'type','object',
        'required', jsonb_build_array('application_id'),
        'properties', jsonb_build_object(
          'application_id', jsonb_build_object('type','string','format','uuid'),
          'start_date', jsonb_build_object('type','string','format','date'),
          'monthly_salary_cents', jsonb_build_object('type','integer'),
          'contract_template_id', jsonb_build_object('type','string','format','uuid'),
          'onboarding_template_id', jsonb_build_object('type','string','format','uuid'),
          'department', jsonb_build_object('type','string'),
          'manager_id', jsonb_build_object('type','string','format','uuid')
        )
      )
    )
  )
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  tool_definition = EXCLUDED.tool_definition,
  enabled = true,
  mcp_exposed = true,
  updated_at = now();