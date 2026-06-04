
CREATE OR REPLACE FUNCTION public.seed_demo_consultants(p_run_id uuid, p_scenario text DEFAULT 'default')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int := 0;
  v_id uuid;
  rec record;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('Anna Lindberg',     'Senior Frontend Engineer',  'Frontend specialist with 8 years building design-system-driven React apps. Loves accessibility, performance and DX.',  ARRAY['React','TypeScript','Tailwind','Next.js','Design Systems','Accessibility'],                       8,  1450, 'available',           ARRAY['Swedish','English']),
      ('Erik Johansson',    'Cloud Architect',           'AWS-certified architect helping mid-market companies move from monolith to event-driven serverless.',                 ARRAY['AWS','Terraform','Kubernetes','Event-driven','DDD','Node.js'],                                   12, 1850, 'available',           ARRAY['Swedish','English']),
      ('Sofia Bergström',   'Product Designer',          'End-to-end product designer. Discovery, prototyping, design systems and design ops for SaaS teams.',                  ARRAY['Figma','Prototyping','User Research','Design Systems','Workshops'],                              10, 1350, 'partially_available', ARRAY['Swedish','English','Norwegian']),
      ('Lars Nilsson',      'Backend Engineer',          'Builds reliable Go and PostgreSQL services. Strong on observability, performance tuning and migrations.',             ARRAY['Go','PostgreSQL','gRPC','Observability','Microservices'],                                        9,  1500, 'available',           ARRAY['Swedish','English']),
      ('Maria Andersson',   'Data Engineer',             'Builds modern data stacks (dbt + Snowflake/BigQuery) and ML-ready pipelines for analytics teams.',                    ARRAY['dbt','SQL','Snowflake','BigQuery','Airflow','Python'],                                           7,  1400, 'available',           ARRAY['Swedish','English']),
      ('Johan Karlsson',    'DevOps Engineer',           'Platform engineer focused on developer productivity, CI/CD pipelines and infrastructure as code.',                    ARRAY['Kubernetes','GitHub Actions','Terraform','ArgoCD','Prometheus','Grafana'],                       11, 1600, 'partially_available', ARRAY['Swedish','English']),
      ('Emma Svensson',     'AI/ML Engineer',            'Productionising LLM applications with RAG, agentic workflows and structured output. Strong eval mindset.',           ARRAY['Python','LangChain','OpenAI','RAG','Evals','PyTorch'],                                           6,  1750, 'available',           ARRAY['Swedish','English']),
      ('Niklas Persson',    'Mobile Developer',          'Cross-platform mobile lead. React Native and native modules when the JS bridge isn''t enough.',                       ARRAY['React Native','Swift','Kotlin','iOS','Android','Expo'],                                          9,  1450, 'unavailable',         ARRAY['Swedish','English']),
      ('Linnea Holm',       'Engineering Manager',       'Interim engineering manager for scale-ups. Hiring, processes, OKRs and 1:1 coaching.',                                ARRAY['Leadership','Hiring','OKRs','Agile','Coaching'],                                                 14, 1900, 'partially_available', ARRAY['Swedish','English']),
      ('Oskar Lundgren',    'Security Engineer',         'Application security and threat modelling. SOC2 / ISO 27001 readiness for SaaS companies.',                           ARRAY['AppSec','Threat Modelling','SOC2','ISO 27001','OWASP','Pentest'],                                10, 1700, 'available',           ARRAY['Swedish','English'])
    ) AS t(full_name, role_title, summary_text, skill_arr, exp_years, rate_per_hour, avail_status, lang_arr)
  LOOP
    INSERT INTO public.consultant_profiles (
      name, title, email, summary, bio, skills, experience_years,
      hourly_rate_cents, currency, availability, languages, is_active
    ) VALUES (
      rec.full_name,
      rec.role_title,
      lower(replace(rec.full_name, ' ', '.')) || '@example.demo',
      rec.summary_text,
      rec.summary_text,
      rec.skill_arr,
      rec.exp_years,
      rec.rate_per_hour * 100,
      'SEK',
      rec.avail_status,
      rec.lang_arr,
      true
    ) RETURNING id INTO v_id;

    PERFORM public._demo_register_row(p_run_id, 'consultant_profiles', v_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('table', 'consultant_profiles', 'inserted', v_count);
END $$;

GRANT EXECUTE ON FUNCTION public.seed_demo_consultants(uuid, text) TO authenticated, service_role;

-- Update dispatcher to add 'consultants'
CREATE OR REPLACE FUNCTION public.seed_module_demo(
  p_module text,
  p_scenario text DEFAULT 'default'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run_id uuid;
  v_result jsonb;
  v_module text;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can seed demo data';
  END IF;

  v_module := lower(trim(p_module));

  INSERT INTO public.demo_runs(module, scenario, created_by)
  VALUES (v_module, p_scenario, auth.uid())
  RETURNING id INTO v_run_id;

  CASE v_module
    WHEN 'crm'         THEN v_result := public.seed_demo_crm(v_run_id, p_scenario);
    WHEN 'quotes'      THEN v_result := public.seed_demo_quotes(v_run_id, p_scenario);
    WHEN 'invoices'    THEN v_result := public.seed_demo_invoices(v_run_id, p_scenario);
    WHEN 'expenses'    THEN v_result := public.seed_demo_expenses(v_run_id, p_scenario);
    WHEN 'ecommerce'   THEN v_result := public.seed_demo_ecommerce(v_run_id, p_scenario);
    WHEN 'consultants' THEN v_result := public.seed_demo_consultants(v_run_id, p_scenario);
    ELSE
      DELETE FROM public.demo_runs WHERE id = v_run_id;
      RAISE EXCEPTION 'Unsupported module: %. Supported: crm, quotes, invoices, expenses, ecommerce, consultants', v_module;
  END CASE;

  RETURN jsonb_build_object(
    'success', true,
    'run_id', v_run_id,
    'module', v_module,
    'scenario', p_scenario,
    'detail', v_result
  );
END $$;
