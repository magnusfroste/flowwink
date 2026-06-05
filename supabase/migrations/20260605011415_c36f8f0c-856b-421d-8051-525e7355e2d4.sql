
CREATE OR REPLACE FUNCTION public.seed_demo_documents(p_run_id uuid, p_scenario text DEFAULT 'default')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_count int := 0; v_id uuid; v_suffix text; r record;
BEGIN
  v_suffix := substring(p_run_id::text,1,6);
  FOR r IN SELECT * FROM (VALUES
    ('Employee Handbook ('||v_suffix||')',         'employee-handbook.md',     'hr',         'Policies', 'Working hours, leave, expense rules and code of conduct.',
      E'# Employee Handbook\n\n## Working hours\nStandard week is 40h. Flexible start between 07:00 and 10:00.\n\n## Leave\n25 paid vacation days per year. Parental leave per Swedish law.\n\n## Expenses\nSubmit within 30 days via the Expenses module. Receipts required >100 SEK.\n\n## Code of conduct\nBe respectful, ship quality work, protect customer data.'),
    ('Brand Guidelines ('||v_suffix||')',          'brand-guidelines.md',      'marketing',  'Brand',    'Logo usage, color palette, typography and tone of voice.',
      E'# Brand Guidelines\n\n## Logo\nClear space = 1x logo height. Never recolor.\n\n## Colors\n- Primary: #0F172A\n- Accent: #6366F1\n- Surface: #F8FAFC\n\n## Typography\nHeadings: Inter Bold. Body: Inter Regular.\n\n## Voice\nClear, confident, never condescending.'),
    ('Sales Playbook ('||v_suffix||')',            'sales-playbook.md',        'sales',      'Playbooks','Qualification framework, discovery questions and objection handling.',
      E'# Sales Playbook\n\n## Qualification (MEDDIC)\nMetrics, Economic buyer, Decision criteria, Decision process, Identify pain, Champion.\n\n## Discovery questions\n1. What does success look like in 12 months?\n2. What happens if you do nothing?\n3. Who else is involved in this decision?\n\n## Objections\n- "Too expensive" → reframe around cost of inaction\n- "We have a tool" → ask about gaps and switching cost'),
    ('Incident Response Runbook ('||v_suffix||')', 'incident-runbook.md',      'engineering','Runbooks', 'Severity matrix, on-call rotation and postmortem template.',
      E'# Incident Response\n\n## Severity\n- SEV1: production down\n- SEV2: degraded for >25% of users\n- SEV3: cosmetic / single-tenant\n\n## Process\n1. Declare in #incidents\n2. Assign IC + comms\n3. Mitigate first, root-cause later\n4. Write postmortem within 5 days\n\n## Postmortem template\nTimeline, root cause, impact, action items, lessons learned.'),
    ('Security & Data Policy ('||v_suffix||')',    'security-policy.md',       'compliance', 'Policies', 'Data classification, retention and access control.',
      E'# Security & Data Policy\n\n## Classification\n- Public, Internal, Confidential, Restricted.\n\n## Retention\n- Logs: 90 days\n- Customer data: lifetime of contract + 12 months\n- Financial records: 7 years (Swedish bokföringslag)\n\n## Access\nLeast privilege. MFA required for all admin accounts. Quarterly access review.'),
    ('Customer Onboarding Checklist ('||v_suffix||')','customer-onboarding.md','customer',   'Templates','Step-by-step onboarding from contract signature to go-live.',
      E'# Customer Onboarding\n\n## Day 0\n- Kickoff call\n- Provision accounts\n- Send welcome email\n\n## Week 1\n- Data import\n- Configure modules\n- First training session\n\n## Week 2\n- Workflow review\n- Identify champions\n- Go-live readiness check\n\n## Day 30\n- Health check\n- NPS survey\n- Plan expansion conversation')
  ) AS t(title,fname,cat,folder,descr,md) LOOP
    INSERT INTO public.documents(title,file_name,file_url,file_type,category,folder,description,content_md,extraction_status,content_extracted_at,source,tags)
    VALUES (r.title, r.fname, 'demo://'||r.fname, 'text/markdown', r.cat, r.folder, r.descr, r.md, 'success', now(), 'demo-seed', ARRAY['demo', r.cat])
    RETURNING id INTO v_id;
    PERFORM public._demo_register_row(p_run_id,'documents',v_id);
    v_count := v_count+1;
  END LOOP;
  RETURN jsonb_build_object('documents', v_count);
END $$;

CREATE OR REPLACE FUNCTION public.seed_module_demo(p_module text, p_scenario text DEFAULT 'default')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_run_id uuid; v_result jsonb; v_module text;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can seed demo data';
  END IF;
  v_module := lower(trim(p_module));
  INSERT INTO demo_runs(module, scenario, created_by) VALUES (v_module, p_scenario, auth.uid()) RETURNING id INTO v_run_id;
  CASE v_module
    WHEN 'crm'          THEN v_result := seed_demo_crm(v_run_id, p_scenario);
    WHEN 'quotes'       THEN v_result := seed_demo_quotes(v_run_id, p_scenario);
    WHEN 'invoices'     THEN v_result := seed_demo_invoices(v_run_id, p_scenario);
    WHEN 'expenses'     THEN v_result := seed_demo_expenses(v_run_id, p_scenario);
    WHEN 'ecommerce'    THEN v_result := seed_demo_ecommerce(v_run_id, p_scenario);
    WHEN 'consultants'  THEN v_result := seed_demo_consultants(v_run_id, p_scenario);
    WHEN 'blog'         THEN v_result := seed_demo_blog(v_run_id, p_scenario);
    WHEN 'kb'           THEN v_result := seed_demo_kb(v_run_id, p_scenario);
    WHEN 'projects'     THEN v_result := seed_demo_projects(v_run_id, p_scenario);
    WHEN 'hr'           THEN v_result := seed_demo_hr(v_run_id, p_scenario);
    WHEN 'tickets'      THEN v_result := seed_demo_tickets(v_run_id, p_scenario);
    WHEN 'bookings'     THEN v_result := seed_demo_bookings(v_run_id, p_scenario);
    WHEN 'newsletter'   THEN v_result := seed_demo_newsletter(v_run_id, p_scenario);
    WHEN 'vendors'      THEN v_result := seed_demo_vendors(v_run_id, p_scenario);
    WHEN 'contracts'    THEN v_result := seed_demo_contracts(v_run_id, p_scenario);
    WHEN 'companies'    THEN v_result := seed_demo_companies(v_run_id, p_scenario);
    WHEN 'deals'        THEN v_result := seed_demo_deals(v_run_id, p_scenario);
    WHEN 'recruitment'  THEN v_result := seed_demo_recruitment(v_run_id, p_scenario);
    WHEN 'pricelists'   THEN v_result := seed_demo_pricelists(v_run_id, p_scenario);
    WHEN 'surveys'      THEN v_result := seed_demo_surveys(v_run_id, p_scenario);
    WHEN 'documents'    THEN v_result := seed_demo_documents(v_run_id, p_scenario);
    ELSE
      DELETE FROM demo_runs WHERE id = v_run_id;
      RAISE EXCEPTION 'Unsupported module: %', v_module;
  END CASE;
  RETURN jsonb_build_object('success', true, 'run_id', v_run_id, 'module', v_module, 'scenario', p_scenario, 'detail', v_result);
END $$;
