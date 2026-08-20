-- Projects-RPC:erna lyssnar på MATRISEN, inte på för-matris-rollistor.
-- Svante-fynd 2026-08-20: timeline/Gantt (get_project_schedule) osynlig för
-- sales/marketing trots projects-modulen i Role Permissions — vakten var
-- admin|writer|approver hårdkodat. Samma relik i tre RPC:er till.
-- Lackmus: marketing-JWT anropar get_project_schedule = rader; kundkonto = fel.

CREATE OR REPLACE FUNCTION public.get_project_schedule(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tasks jsonb;
  v_deps jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'projects')) THEN
    RAISE EXCEPTION 'Only staff can view the schedule';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id) THEN
    RAISE EXCEPTION 'Project % not found', p_project_id;
  END IF;

  WITH RECURSIVE depth AS (
    SELECT t.id, 0 AS lvl
      FROM public.project_tasks t
     WHERE t.project_id = p_project_id
       AND NOT EXISTS (SELECT 1 FROM public.project_task_dependencies d WHERE d.task_id = t.id)
    UNION ALL
    SELECT d.task_id, depth.lvl + 1
      FROM public.project_task_dependencies d
      JOIN depth ON d.depends_on_task_id = depth.id
      JOIN public.project_tasks t2 ON t2.id = d.task_id AND t2.project_id = p_project_id
  ), maxdepth AS (
    SELECT id, max(lvl) AS lvl FROM depth GROUP BY id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'title', t.title,
    'status', t.status,
    'priority', t.priority,
    'assigned_to', t.assigned_to,
    'parent_task_id', t.parent_task_id,
    'milestone_id', t.milestone_id,
    'start_date', COALESCE(t.start_date, t.created_at::date),
    'due_date', t.due_date,
    'estimated_hours', t.estimated_hours,
    'depth', COALESCE(md.lvl, 0),
    'depends_on', COALESCE((SELECT jsonb_agg(d.depends_on_task_id) FROM public.project_task_dependencies d WHERE d.task_id = t.id), '[]'::jsonb)
  ) ORDER BY COALESCE(md.lvl,0), COALESCE(t.start_date, t.created_at::date), t.sort_order), '[]'::jsonb)
  INTO v_tasks
  FROM public.project_tasks t
  LEFT JOIN maxdepth md ON md.id = t.id
  WHERE t.project_id = p_project_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('task_id', d.task_id, 'depends_on_task_id', d.depends_on_task_id)), '[]'::jsonb)
  INTO v_deps
  FROM public.project_task_dependencies d
  JOIN public.project_tasks t ON t.id = d.task_id
  WHERE t.project_id = p_project_id;

  RETURN jsonb_build_object(
    'success', true,
    'project_id', p_project_id,
    'tasks', v_tasks,
    'dependencies', v_deps,
    'milestones', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'due_date', m.due_date, 'is_reached', m.is_reached) ORDER BY m.due_date NULLS LAST)
      FROM public.project_milestones m WHERE m.project_id = p_project_id), '[]'::jsonb)
  );
END; $function$;

CREATE OR REPLACE FUNCTION public.resource_capacity_report(p_project_id uuid DEFAULT NULL::uuid, p_weeks integer DEFAULT 4, p_capacity_hours_per_week numeric DEFAULT 40)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_since date := CURRENT_DATE - (GREATEST(COALESCE(p_weeks,4),1) * 7);
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'projects')) THEN
    RAISE EXCEPTION 'Only staff can view capacity reports';
  END IF;

  WITH people AS (
    SELECT DISTINCT u AS user_id FROM (
      SELECT assigned_to AS u FROM public.project_tasks
        WHERE assigned_to IS NOT NULL AND status::text <> 'done'
          AND (p_project_id IS NULL OR project_id = p_project_id)
      UNION
      SELECT user_id FROM public.project_members
        WHERE user_id IS NOT NULL AND (p_project_id IS NULL OR project_id = p_project_id)
      UNION
      SELECT user_id FROM public.time_entries
        WHERE user_id IS NOT NULL AND entry_date >= v_since
          AND (p_project_id IS NULL OR project_id = p_project_id)
    ) x WHERE u IS NOT NULL
  ), stats AS (
    SELECT
      p.user_id,
      e.name AS employee_name,
      (SELECT count(*) FROM public.project_tasks t
        WHERE t.assigned_to = p.user_id AND t.status::text <> 'done'
          AND (p_project_id IS NULL OR t.project_id = p_project_id)) AS open_tasks,
      (SELECT COALESCE(sum(t.estimated_hours),0) FROM public.project_tasks t
        WHERE t.assigned_to = p.user_id AND t.status::text <> 'done'
          AND (p_project_id IS NULL OR t.project_id = p_project_id)) AS open_estimated_hours,
      (SELECT COALESCE(sum(te.hours),0) FROM public.time_entries te
        WHERE te.user_id = p.user_id AND te.entry_date >= v_since
          AND (p_project_id IS NULL OR te.project_id = p_project_id)) AS hours_logged
    FROM people p
    LEFT JOIN public.employees e ON e.user_id = p.user_id
  )
  SELECT jsonb_build_object(
    'success', true,
    'project_id', p_project_id,
    'window_weeks', GREATEST(COALESCE(p_weeks,4),1),
    'capacity_hours_per_week', p_capacity_hours_per_week,
    'resources', COALESCE(jsonb_agg(jsonb_build_object(
      'user_id', s.user_id,
      'name', COALESCE(s.employee_name, 'Unknown'),
      'open_tasks', s.open_tasks,
      'open_estimated_hours', s.open_estimated_hours,
      'hours_logged_in_window', s.hours_logged,
      'utilization_pct', round(s.hours_logged / (p_capacity_hours_per_week * GREATEST(COALESCE(p_weeks,4),1)) * 100, 1),
      'weeks_of_backlog', CASE WHEN p_capacity_hours_per_week > 0
        THEN round(s.open_estimated_hours / p_capacity_hours_per_week, 1) END,
      'overloaded', s.open_estimated_hours > p_capacity_hours_per_week * GREATEST(COALESCE(p_weeks,4),1)
    ) ORDER BY s.open_estimated_hours DESC), '[]'::jsonb)
  ) INTO v_result
  FROM stats s;

  RETURN v_result;
END; $function$;

CREATE OR REPLACE FUNCTION public.manage_task_dependency(p_action text, p_task_id uuid DEFAULT NULL::uuid, p_depends_on_task_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_a public.project_tasks;
  v_b public.project_tasks;
  v_cycle boolean;
  v_result jsonb;
BEGIN
  IF p_action = 'list' THEN
    IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'projects')) THEN
      RAISE EXCEPTION 'Only staff can view dependencies';
    END IF;
    SELECT jsonb_build_object('success', true, 'dependencies', COALESCE(jsonb_agg(jsonb_build_object(
      'id', d.id, 'task_id', d.task_id, 'task_title', t1.title,
      'depends_on_task_id', d.depends_on_task_id, 'depends_on_title', t2.title,
      'depends_on_status', t2.status
    )), '[]'::jsonb)) INTO v_result
    FROM public.project_task_dependencies d
    JOIN public.project_tasks t1 ON t1.id = d.task_id
    JOIN public.project_tasks t2 ON t2.id = d.depends_on_task_id
    WHERE (p_task_id IS NULL OR d.task_id = p_task_id)
      AND (p_project_id IS NULL OR t1.project_id = p_project_id);
    RETURN v_result;
  END IF;

  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer')) THEN
    RAISE EXCEPTION 'Only admins/writers can manage dependencies';
  END IF;
  IF p_task_id IS NULL OR p_depends_on_task_id IS NULL THEN
    RAISE EXCEPTION 'task_id and depends_on_task_id are required';
  END IF;

  IF p_action = 'add' THEN
    SELECT * INTO v_a FROM public.project_tasks WHERE id = p_task_id;
    SELECT * INTO v_b FROM public.project_tasks WHERE id = p_depends_on_task_id;
    IF v_a.id IS NULL OR v_b.id IS NULL THEN RAISE EXCEPTION 'Task not found'; END IF;
    IF v_a.project_id <> v_b.project_id THEN
      RAISE EXCEPTION 'Dependencies must stay within one project';
    END IF;

    -- Cycle check: is p_task_id already (transitively) a prerequisite of p_depends_on_task_id?
    WITH RECURSIVE chain AS (
      SELECT depends_on_task_id FROM public.project_task_dependencies WHERE task_id = p_depends_on_task_id
      UNION
      SELECT d.depends_on_task_id
        FROM public.project_task_dependencies d
        JOIN chain c ON d.task_id = c.depends_on_task_id
    )
    SELECT EXISTS (SELECT 1 FROM chain WHERE depends_on_task_id = p_task_id) INTO v_cycle;
    IF v_cycle THEN
      RAISE EXCEPTION 'Dependency would create a cycle';
    END IF;

    INSERT INTO public.project_task_dependencies (task_id, depends_on_task_id)
    VALUES (p_task_id, p_depends_on_task_id)
    ON CONFLICT (task_id, depends_on_task_id) DO NOTHING;
    RETURN jsonb_build_object('success', true, 'task_id', p_task_id, 'depends_on_task_id', p_depends_on_task_id);

  ELSIF p_action = 'remove' THEN
    DELETE FROM public.project_task_dependencies
     WHERE task_id = p_task_id AND depends_on_task_id = p_depends_on_task_id;
    RETURN jsonb_build_object('success', true, 'removed', FOUND);
  END IF;

  RAISE EXCEPTION 'Unknown action: % (use add|remove|list)', p_action;
END; $function$;

CREATE OR REPLACE FUNCTION public.manage_project_milestone(p_action text, p_milestone_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_name text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_due_date date DEFAULT NULL::date, p_sort_order integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'projects'));
  v_id uuid;
  v_result jsonb;
BEGIN
  IF p_action IN ('create','update','delete','reach','reopen') AND NOT v_writer THEN
    RAISE EXCEPTION 'Only admins can modify project milestones';
  END IF;
  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', m.id, 'project_id', m.project_id, 'name', m.name, 'due_date', m.due_date,
      'sort_order', m.sort_order, 'is_reached', m.is_reached, 'reached_at', m.reached_at,
      'tasks_total', (SELECT count(*) FROM project_tasks t WHERE t.milestone_id = m.id),
      'tasks_done',  (SELECT count(*) FROM project_tasks t WHERE t.milestone_id = m.id AND t.completed_at IS NOT NULL)
    ) ORDER BY m.sort_order, m.due_date NULLS LAST), '[]'::jsonb) INTO v_result
    FROM project_milestones m
    WHERE p_project_id IS NULL OR m.project_id = p_project_id;
    RETURN jsonb_build_object('success', true, 'milestones', v_result);
  ELSIF p_action = 'create' THEN
    IF p_project_id IS NULL OR p_name IS NULL THEN RAISE EXCEPTION 'project_id and name are required'; END IF;
    INSERT INTO project_milestones (project_id, name, description, due_date, sort_order, created_by)
    VALUES (p_project_id, p_name, p_description, p_due_date, COALESCE(p_sort_order, 0), auth.uid())
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'milestone_id', v_id);
  ELSIF p_action = 'update' THEN
    IF p_milestone_id IS NULL THEN RAISE EXCEPTION 'milestone_id is required'; END IF;
    UPDATE project_milestones SET
      name = COALESCE(p_name, name),
      description = COALESCE(p_description, description),
      due_date = COALESCE(p_due_date, due_date),
      sort_order = COALESCE(p_sort_order, sort_order)
    WHERE id = p_milestone_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Milestone % not found', p_milestone_id; END IF;
    RETURN jsonb_build_object('success', true, 'milestone_id', p_milestone_id);
  ELSIF p_action = 'reach' THEN
    IF p_milestone_id IS NULL THEN RAISE EXCEPTION 'milestone_id is required'; END IF;
    UPDATE project_milestones SET is_reached = true, reached_at = COALESCE(reached_at, now())
    WHERE id = p_milestone_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Milestone % not found', p_milestone_id; END IF;
    RETURN jsonb_build_object('success', true, 'milestone_id', p_milestone_id, 'is_reached', true);
  ELSIF p_action = 'reopen' THEN
    IF p_milestone_id IS NULL THEN RAISE EXCEPTION 'milestone_id is required'; END IF;
    UPDATE project_milestones SET is_reached = false, reached_at = NULL WHERE id = p_milestone_id;
    RETURN jsonb_build_object('success', true, 'milestone_id', p_milestone_id, 'is_reached', false);
  ELSIF p_action = 'delete' THEN
    IF p_milestone_id IS NULL THEN RAISE EXCEPTION 'milestone_id is required'; END IF;
    DELETE FROM project_milestones WHERE id = p_milestone_id;
    RETURN jsonb_build_object('success', true, 'deleted', p_milestone_id);
  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|create|update|reach|reopen|delete', p_action;
  END IF;
END;
$function$;
