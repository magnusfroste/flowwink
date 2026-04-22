
-- Helper: ensure an auth user exists for an email and return its id.
-- We can't create auth users from SQL directly, but we CAN link if one already exists.
-- For new invites we rely on an edge function; here we just link if the user exists.

CREATE OR REPLACE FUNCTION public.link_employee_to_auth_user(p_employee_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_user_id uuid;
BEGIN
  SELECT email INTO v_email FROM public.employees WHERE id = p_employee_id;
  IF v_email IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_email) LIMIT 1;
  IF v_user_id IS NULL THEN RETURN NULL; END IF;

  UPDATE public.employees SET user_id = v_user_id, updated_at = now()
  WHERE id = p_employee_id AND (user_id IS NULL OR user_id <> v_user_id);

  -- Grant employee role (idempotent)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'employee')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN v_user_id;
END;
$$;

-- Update hire function to attempt auto-link after creating the employee
CREATE OR REPLACE FUNCTION public.hire_candidate_from_application(
  p_application_id uuid,
  p_start_date date DEFAULT NULL::date,
  p_employment_type text DEFAULT 'full_time'::text,
  p_department text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app RECORD;
  v_job RECORD;
  v_employee_id UUID;
  v_checklist_id UUID;
  v_user_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_app FROM public.applications WHERE id = p_application_id;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  IF v_app.employee_id IS NOT NULL THEN
    RAISE EXCEPTION 'Application already hired (employee_id: %)', v_app.employee_id;
  END IF;

  SELECT * INTO v_job FROM public.job_postings WHERE id = v_app.job_posting_id;

  INSERT INTO public.employees (
    name, email, phone, title, department,
    employment_type, start_date, status
  )
  VALUES (
    COALESCE(v_app.candidate_name, 'New Hire'),
    v_app.candidate_email,
    v_app.candidate_phone,
    v_job.title,
    COALESCE(p_department, v_job.department),
    p_employment_type,
    COALESCE(p_start_date, CURRENT_DATE),
    'active'
  )
  RETURNING id INTO v_employee_id;

  UPDATE public.applications
  SET employee_id = v_employee_id,
      stage = 'hired',
      hired_at = now(),
      updated_at = now()
  WHERE id = p_application_id;

  INSERT INTO public.onboarding_checklists (employee_id, items)
  VALUES (
    v_employee_id,
    jsonb_build_array(
      jsonb_build_object('title', 'IT setup (laptop, accounts, email)', 'done', false),
      jsonb_build_object('title', 'Access cards & office tour', 'done', false),
      jsonb_build_object('title', 'Welcome meeting with team', 'done', false),
      jsonb_build_object('title', 'Sign employment contract', 'done', false),
      jsonb_build_object('title', 'Review company policies & handbook', 'done', false),
      jsonb_build_object('title', 'Assign onboarding buddy', 'done', false)
    )
  )
  RETURNING id INTO v_checklist_id;

  -- Try to auto-link to existing auth user (if they already have an account)
  v_user_id := public.link_employee_to_auth_user(v_employee_id);

  RETURN jsonb_build_object(
    'success', true,
    'employee_id', v_employee_id,
    'application_id', p_application_id,
    'checklist_id', v_checklist_id,
    'user_id', v_user_id,
    'needs_invite', v_user_id IS NULL
  );
END;
$$;

-- Backfill: link any existing employees whose email matches an auth user
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT e.id FROM public.employees e
    JOIN auth.users u ON lower(u.email) = lower(e.email)
    WHERE e.user_id IS NULL
  LOOP
    PERFORM public.link_employee_to_auth_user(r.id);
  END LOOP;
END $$;
