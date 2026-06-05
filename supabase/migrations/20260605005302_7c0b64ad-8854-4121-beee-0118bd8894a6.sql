CREATE OR REPLACE FUNCTION public.seed_demo_projects(p_run_id uuid, p_scenario text DEFAULT 'default'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_task_id uuid;
  v_projects_created int := 0;
  v_tasks_created int := 0;
  v_suffix text := substring(p_run_id::text, 1, 6);
  prec record;
  trec record;
BEGIN
  FOR prec IN
    SELECT * FROM (VALUES
      ('Demo: Website Relaunch',        'Acme Retail AB',     '#6366f1', 160000, 40, '2026-09-30'::date),
      ('Demo: ERP Integration',         'Sundsvall Tech',     '#10b981', 200000, 60, '2026-11-15'::date),
      ('Demo: Q3 Reporting Automation', 'Malmö Finans Group', '#f59e0b', 220000, 30, '2026-08-31'::date)
    ) AS t(p_name, p_client, p_color, p_rate, p_budget, p_deadline)
  LOOP
    INSERT INTO public.projects (name, client_name, description, color, hourly_rate_cents, currency, is_billable, is_active, budget_hours, deadline)
    VALUES (prec.p_name, prec.p_client, 'Demo project seeded for the FlowWink showcase.', prec.p_color, prec.p_rate, 'SEK', true, true, prec.p_budget, prec.p_deadline)
    RETURNING id INTO v_project_id;

    PERFORM public._demo_register_row(p_run_id, 'projects', v_project_id);
    v_projects_created := v_projects_created + 1;

    FOR trec IN
      SELECT * FROM (VALUES
        ('Kickoff workshop',            'done',         'medium', 0),
        ('Discovery & requirements',    'done',         'high',   1),
        ('Design system & wireframes',  'in_progress',  'high',   2),
        ('Backend integration',         'todo',         'high',   3),
        ('QA & launch checklist',       'todo',         'medium', 4)
      ) AS t(p_title, p_status, p_priority, p_sort)
    LOOP
      INSERT INTO public.project_tasks (project_id, title, status, priority, sort_order, completed_at, estimated_hours)
      VALUES (
        v_project_id,
        trec.p_title,
        trec.p_status::project_task_status,
        trec.p_priority::project_task_priority,
        trec.p_sort,
        CASE WHEN trec.p_status = 'done' THEN now() - ((5 - trec.p_sort) || ' days')::interval ELSE NULL END,
        4 + trec.p_sort
      )
      RETURNING id INTO v_task_id;

      PERFORM public._demo_register_row(p_run_id, 'project_tasks', v_task_id);
      v_tasks_created := v_tasks_created + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('projects_created', v_projects_created, 'tasks_created', v_tasks_created);
END $function$;

-- Wire 'projects' into the dispatcher (add WHEN branch without touching others).
CREATE OR REPLACE FUNCTION public.seed_module_demo(p_module text, p_scenario text DEFAULT 'default'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    WHEN 'blog'        THEN v_result := public.seed_demo_blog(v_run_id, p_scenario);
    WHEN 'kb'          THEN v_result := public.seed_demo_kb(v_run_id, p_scenario);
    WHEN 'projects'    THEN v_result := public.seed_demo_projects(v_run_id, p_scenario);
    ELSE
      DELETE FROM public.demo_runs WHERE id = v_run_id;
      RAISE EXCEPTION 'Unsupported module: %. Supported: crm, quotes, invoices, expenses, ecommerce, consultants, blog, kb, projects', v_module;
  END CASE;

  RETURN jsonb_build_object(
    'success', true,
    'run_id', v_run_id,
    'module', v_module,
    'scenario', p_scenario,
    'detail', v_result
  );
END $function$;