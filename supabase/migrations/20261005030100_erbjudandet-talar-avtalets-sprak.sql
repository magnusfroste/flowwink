-- Erbjudandet talar avtalets språk.
--
-- manage_job_offer(generate) with no p_template_id picks the default active
-- employment_contract_template — the same template generate_employment_contract
-- renders after the hire. The two filled different merge vocabularies: the
-- offer knew {{candidate_name}}/{{job_title}}/{{salary}}, the contract
-- {{employee_name}}/{{title}}/{{monthly_salary}}. As soon as an operator
-- created a default contract template (hire-to-retire does, since 2026-10-05),
-- every later offer letter went out reading "{{employee_name}}" with no salary.
-- Found by the process battery on its second pass over the same database.
-- The offer now fills both vocabularies. Redefining the function also moves its
-- gate from a hand-rolled role list (admin/writer/approver) to the role matrix:
-- can_access_module(…, 'recruitment'), the same knob that opens the module in
-- the admin nav (no-new-hand-rolled-role-policies).

CREATE OR REPLACE FUNCTION public.manage_job_offer(p_action text, p_offer_id uuid DEFAULT NULL::uuid, p_application_id uuid DEFAULT NULL::uuid, p_template_id uuid DEFAULT NULL::uuid, p_salary_cents bigint DEFAULT NULL::bigint, p_currency text DEFAULT NULL::text, p_start_date date DEFAULT NULL::date, p_expires_at date DEFAULT NULL::date, p_body_markdown text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_app record;
  v_tpl public.employment_contract_templates;
  v_body text;
  v_row public.job_offers;
  v_result jsonb;
BEGIN
  IF p_action IN ('list','get') THEN
    IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'recruitment')) THEN
      RAISE EXCEPTION 'Requires the recruitment module — an admin can grant it under Users → Role Permissions';
    END IF;
  ELSE
    IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'recruitment')) THEN
      RAISE EXCEPTION 'Requires the recruitment module — an admin can grant it under Users → Role Permissions';
    END IF;
  END IF;

  IF p_action = 'generate' THEN
    IF p_application_id IS NULL THEN RAISE EXCEPTION 'application_id is required'; END IF;
    SELECT a.*, j.title AS job_title, j.department AS job_department, j.employment_type AS job_employment_type
      INTO v_app
      FROM public.applications a
      LEFT JOIN public.job_postings j ON j.id = a.job_posting_id
     WHERE a.id = p_application_id;
    IF v_app.id IS NULL THEN RAISE EXCEPTION 'Application % not found', p_application_id; END IF;

    IF p_template_id IS NOT NULL THEN
      SELECT * INTO v_tpl FROM public.employment_contract_templates WHERE id = p_template_id;
      IF v_tpl.id IS NULL THEN RAISE EXCEPTION 'Template % not found', p_template_id; END IF;
    ELSE
      SELECT * INTO v_tpl FROM public.employment_contract_templates
       WHERE is_active ORDER BY is_default DESC, created_at LIMIT 1;
    END IF;

    v_body := COALESCE(p_body_markdown, v_tpl.body_markdown,
      E'# Offer of Employment\n\nDear {{candidate_name}},\n\nWe are pleased to offer you the position of **{{job_title}}**.\n\n- Salary: {{salary}} {{currency}}/month\n- Start date: {{start_date}}\n\nThis offer expires on {{expires_at}}.\n');
    v_body := replace(v_body, '{{candidate_name}}', COALESCE(v_app.candidate_name, ''));
    v_body := replace(v_body, '{{candidate_email}}', COALESCE(v_app.candidate_email, ''));
    v_body := replace(v_body, '{{job_title}}', COALESCE(v_app.job_title, ''));
    v_body := replace(v_body, '{{department}}', COALESCE(v_app.job_department, ''));
    v_body := replace(v_body, '{{employment_type}}', COALESCE(v_app.job_employment_type::text, ''));
    v_body := replace(v_body, '{{salary}}', CASE WHEN p_salary_cents IS NOT NULL THEN to_char(p_salary_cents / 100.0, 'FM999G999G999') ELSE '' END);
    v_body := replace(v_body, '{{currency}}', COALESCE(p_currency, 'SEK'));
    v_body := replace(v_body, '{{start_date}}', COALESCE(p_start_date::text, 'TBD'));
    v_body := replace(v_body, '{{expires_at}}', COALESCE(p_expires_at::text, (CURRENT_DATE + 14)::text));
    -- The employment-contract template's own vocabulary (generate_employment_contract
    -- fills these). With no offer template the default CONTRACT template is
    -- picked, and its fields used to reach the candidate unfilled.
    v_body := replace(v_body, '{{employee_name}}', COALESCE(v_app.candidate_name, ''));
    v_body := replace(v_body, '{{title}}', COALESCE(v_app.job_title, ''));
    v_body := replace(v_body, '{{monthly_salary}}', CASE WHEN p_salary_cents IS NOT NULL THEN to_char(p_salary_cents / 100.0, 'FM999G999G999') ELSE 'TBD' END);

    INSERT INTO public.job_offers
      (application_id, template_id, body_markdown, salary_cents, currency, start_date, expires_at, notes, created_by)
    VALUES
      (p_application_id, v_tpl.id, v_body, p_salary_cents, COALESCE(p_currency,'SEK'),
       p_start_date, COALESCE(p_expires_at, CURRENT_DATE + 14), p_notes, auth.uid())
    RETURNING * INTO v_row;
    RETURN jsonb_build_object('success', true, 'offer', to_jsonb(v_row));

  ELSIF p_action = 'send' THEN
    IF p_offer_id IS NULL THEN RAISE EXCEPTION 'offer_id is required'; END IF;
    UPDATE public.job_offers
       SET status = 'sent', sent_at = now(), updated_at = now()
     WHERE id = p_offer_id AND status = 'draft'
    RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Offer % not found or not in draft', p_offer_id; END IF;
    RETURN jsonb_build_object('success', true, 'offer', to_jsonb(v_row),
      'note', 'Status set to sent — deliver the letter via send_email to the candidate.');

  ELSIF p_action = 'record_response' THEN
    IF p_offer_id IS NULL OR p_status IS NULL THEN
      RAISE EXCEPTION 'offer_id and status (accepted|declined) are required';
    END IF;
    IF p_status NOT IN ('accepted','declined','withdrawn','expired') THEN
      RAISE EXCEPTION 'status must be accepted|declined|withdrawn|expired';
    END IF;
    UPDATE public.job_offers
       SET status = p_status, responded_at = now(), notes = COALESCE(p_notes, notes), updated_at = now()
     WHERE id = p_offer_id RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Offer % not found', p_offer_id; END IF;
    RETURN jsonb_build_object('success', true, 'offer', to_jsonb(v_row),
      'next_step', CASE WHEN p_status = 'accepted' THEN 'Run hire_application to convert the candidate to an employee.' END);

  ELSIF p_action = 'get' THEN
    IF p_offer_id IS NULL THEN RAISE EXCEPTION 'offer_id is required'; END IF;
    SELECT * INTO v_row FROM public.job_offers WHERE id = p_offer_id;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Offer % not found', p_offer_id; END IF;
    RETURN jsonb_build_object('success', true, 'offer', to_jsonb(v_row));

  ELSIF p_action = 'list' THEN
    SELECT jsonb_build_object('success', true, 'offers', COALESCE(jsonb_agg(jsonb_build_object(
      'id', o.id, 'application_id', o.application_id, 'candidate_name', a.candidate_name,
      'status', o.status, 'salary_cents', o.salary_cents, 'currency', o.currency,
      'start_date', o.start_date, 'expires_at', o.expires_at, 'sent_at', o.sent_at,
      'responded_at', o.responded_at, 'created_at', o.created_at
    ) ORDER BY o.created_at DESC), '[]'::jsonb)) INTO v_result
    FROM public.job_offers o
    JOIN public.applications a ON a.id = o.application_id
    WHERE (p_application_id IS NULL OR o.application_id = p_application_id)
      AND (p_status IS NULL OR o.status = p_status);
    RETURN v_result;
  END IF;

  RAISE EXCEPTION 'Unknown action: % (use generate|send|record_response|get|list)', p_action;
END; $function$;
