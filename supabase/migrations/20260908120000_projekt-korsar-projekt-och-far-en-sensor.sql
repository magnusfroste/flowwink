-- Projekt korsar projekt, och portföljen får en sensor.
--
-- Peters projekt på optic (2026-09-08, sett genom gatewayn): 8 projekt, 36
-- uppgifter, 7 beroenden — alla inom samma projekt, för RPC:n vägrade annat.
-- Men de verkliga beroendena korsar: bokföringen per 31/8 (Ekonomi) bär
-- H1-rapporten som datarummet (Finansiering) och noteringskraven behöver.
-- En graf som inte får korsa projekt kan inte beskriva verksamheten.
--
-- 1. manage_task_dependency: same-project-kravet bort, cykelkontrollen kvar.
--    list bär projektnamn på båda sidor så en kant över gränsen syns.
-- 2. get_project_schedule: external_prerequisites — uppgifter i ANDRA projekt
--    som detta projekt väntar på.
-- 3. project_portfolio_brief: det en agent läser FÖRST. Räknar på det som
--    finns (status, kanter, tidsstämplar) — kräver inga datum, timmar eller
--    taxor, för dem har Peter inte satt. Blockerat, redo, navblockerare,
--    externa väntan, avstannat pågående, odaterat. FlowPilots briefing och
--    en extern agent (Hermes) läser samma funktion.

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
      'task_project_id', t1.project_id, 'task_project', p1.name,
      'depends_on_task_id', d.depends_on_task_id, 'depends_on_title', t2.title,
      'depends_on_status', t2.status,
      'depends_on_project_id', t2.project_id, 'depends_on_project', p2.name,
      'cross_project', (t1.project_id <> t2.project_id)
    )), '[]'::jsonb)) INTO v_result
    FROM public.project_task_dependencies d
    JOIN public.project_tasks t1 ON t1.id = d.task_id
    JOIN public.project_tasks t2 ON t2.id = d.depends_on_task_id
    LEFT JOIN public.projects p1 ON p1.id = t1.project_id
    LEFT JOIN public.projects p2 ON p2.id = t2.project_id
    WHERE (p_task_id IS NULL OR d.task_id = p_task_id)
      AND (p_project_id IS NULL OR t1.project_id = p_project_id OR t2.project_id = p_project_id);
    RETURN v_result;
  END IF;

  -- Writes follow the module matrix (the ONE dial), not a hand-rolled role list.
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'projects')) THEN
    RAISE EXCEPTION 'Only project staff can manage dependencies';
  END IF;
  IF p_task_id IS NULL OR p_depends_on_task_id IS NULL THEN
    RAISE EXCEPTION 'task_id and depends_on_task_id are required';
  END IF;
  IF p_task_id = p_depends_on_task_id THEN
    RAISE EXCEPTION 'A task cannot depend on itself';
  END IF;

  IF p_action = 'add' THEN
    SELECT * INTO v_a FROM public.project_tasks WHERE id = p_task_id;
    SELECT * INTO v_b FROM public.project_tasks WHERE id = p_depends_on_task_id;
    IF v_a.id IS NULL OR v_b.id IS NULL THEN RAISE EXCEPTION 'Task not found'; END IF;
    -- Cross-project edges are allowed (2026-09-08): the ledger close in one
    -- project really does gate the data room in another. Only cycles are refused.

    WITH RECURSIVE chain AS (
      SELECT depends_on_task_id, 1 AS lvl FROM public.project_task_dependencies WHERE task_id = p_depends_on_task_id
      UNION
      SELECT d.depends_on_task_id, c.lvl + 1
        FROM public.project_task_dependencies d
        JOIN chain c ON d.task_id = c.depends_on_task_id
       WHERE c.lvl < 100
    )
    SELECT EXISTS (SELECT 1 FROM chain WHERE depends_on_task_id = p_task_id) INTO v_cycle;
    IF v_cycle THEN
      RAISE EXCEPTION 'Dependency would create a cycle';
    END IF;

    INSERT INTO public.project_task_dependencies (task_id, depends_on_task_id)
    VALUES (p_task_id, p_depends_on_task_id)
    ON CONFLICT (task_id, depends_on_task_id) DO NOTHING;
    RETURN jsonb_build_object('success', true, 'task_id', p_task_id, 'depends_on_task_id', p_depends_on_task_id,
                              'cross_project', (v_a.project_id <> v_b.project_id));

  ELSIF p_action = 'remove' THEN
    DELETE FROM public.project_task_dependencies
     WHERE task_id = p_task_id AND depends_on_task_id = p_depends_on_task_id;
    RETURN jsonb_build_object('success', true, 'removed', FOUND);
  END IF;

  RAISE EXCEPTION 'Unknown action: % (use add|remove|list)', p_action;
END; $function$;

-- Schedule: unchanged shape, plus what this project waits for elsewhere.
CREATE OR REPLACE FUNCTION public.get_project_schedule(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tasks jsonb;
  v_deps jsonb;
  v_external jsonb;
  v_result jsonb;
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
    SELECT t2.id, depth.lvl + 1
      FROM public.project_task_dependencies d
      JOIN depth ON d.depends_on_task_id = depth.id
      JOIN public.project_tasks t2 ON t2.id = d.task_id AND t2.project_id = p_project_id
     WHERE depth.lvl < 100
  ),
  maxdepth AS (SELECT id, max(lvl) AS lvl FROM depth GROUP BY id)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'title', t.title,
    'status', t.status,
    'priority', t.priority,
    'assigned_to', t.assigned_to,
    'start_date', COALESCE(t.start_date, t.created_at::date),
    'due_date', t.due_date,
    'estimated_hours', t.estimated_hours,
    'milestone_id', t.milestone_id,
    'parent_task_id', t.parent_task_id,
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

  -- Prerequisites that live in OTHER projects: the edge the old schedule could not draw.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'task_id', t.id, 'task_title', t.title,
    'depends_on_task_id', o.id, 'depends_on_title', o.title, 'depends_on_status', o.status,
    'depends_on_project_id', o.project_id, 'depends_on_project', p.name
  )), '[]'::jsonb)
  INTO v_external
  FROM public.project_task_dependencies d
  JOIN public.project_tasks t ON t.id = d.task_id AND t.project_id = p_project_id
  JOIN public.project_tasks o ON o.id = d.depends_on_task_id AND o.project_id <> p_project_id
  LEFT JOIN public.projects p ON p.id = o.project_id;

  v_result := jsonb_build_object(
    'project_id', p_project_id,
    'tasks', v_tasks,
    'dependencies', v_deps,
    'external_prerequisites', v_external,
    'milestones', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'due_date', m.due_date) ORDER BY m.due_date NULLS LAST, m.sort_order)
      FROM public.project_milestones m WHERE m.project_id = p_project_id), '[]'::jsonb)
  );
  RETURN v_result;
END; $function$;

-- The sensor.
CREATE OR REPLACE FUNCTION public.project_portfolio_brief(p_project_id uuid DEFAULT NULL::uuid, p_stale_days integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_projects jsonb;
  v_portfolio jsonb;
  v_hubs jsonb;
  v_stale interval := make_interval(days => GREATEST(COALESCE(p_stale_days, 5), 1));
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'projects')) THEN
    RAISE EXCEPTION 'Only staff can read the project brief';
  END IF;

  -- Per open task: is any prerequisite unfinished? (any project)
  CREATE TEMP TABLE IF NOT EXISTS _brief_task ON COMMIT DROP AS
  SELECT t.id, t.project_id, t.title, t.status, t.due_date, t.updated_at, t.sort_order,
         (t.status <> 'done') AS is_open,
         EXISTS (SELECT 1 FROM public.project_task_dependencies d JOIN public.project_tasks o ON o.id = d.depends_on_task_id
                  WHERE d.task_id = t.id AND o.status <> 'done') AS is_blocked,
         EXISTS (SELECT 1 FROM public.project_task_dependencies d WHERE d.task_id = t.id) AS has_deps
    FROM public.project_tasks t
    JOIN public.projects p ON p.id = t.project_id
   WHERE p.is_active = true AND (p_project_id IS NULL OR t.project_id = p_project_id);

  -- Hub blockers: unfinished tasks that gate ≥2 open tasks anywhere in the portfolio.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'task_id', o.id, 'title', o.title, 'status', o.status,
    'project_id', o.project_id, 'project', p.name, 'blocks', h.n
  ) ORDER BY h.n DESC, o.title), '[]'::jsonb)
  INTO v_hubs
  FROM (
    SELECT d.depends_on_task_id AS id, count(*) AS n
      FROM public.project_task_dependencies d
      JOIN public.project_tasks t ON t.id = d.task_id AND t.status <> 'done'
      JOIN public.project_tasks o ON o.id = d.depends_on_task_id AND o.status <> 'done'
     GROUP BY d.depends_on_task_id HAVING count(*) >= 2
  ) h
  JOIN public.project_tasks o ON o.id = h.id
  LEFT JOIN public.projects p ON p.id = o.project_id;

  SELECT COALESCE(jsonb_agg(proj ORDER BY (proj->>'open')::int DESC, proj->>'name'), '[]'::jsonb)
  INTO v_projects
  FROM (
    SELECT jsonb_build_object(
      'id', p.id, 'name', p.name, 'status', p.status, 'deadline', p.deadline,
      'total', (SELECT count(*) FROM _brief_task b WHERE b.project_id = p.id),
      'open', (SELECT count(*) FROM _brief_task b WHERE b.project_id = p.id AND b.is_open),
      'in_progress', (SELECT count(*) FROM _brief_task b WHERE b.project_id = p.id AND b.status = 'in_progress'),
      'done', (SELECT count(*) FROM _brief_task b WHERE b.project_id = p.id AND NOT b.is_open),
      'blocked', (SELECT count(*) FROM _brief_task b WHERE b.project_id = p.id AND b.is_open AND b.is_blocked),
      'undated_open', (SELECT count(*) FROM _brief_task b WHERE b.project_id = p.id AND b.is_open AND b.due_date IS NULL),
      'overdue', (SELECT count(*) FROM _brief_task b WHERE b.project_id = p.id AND b.is_open AND b.due_date IS NOT NULL AND b.due_date < CURRENT_DATE),
      -- Ready: open, not blocked, not already running — what could start today.
      'ready', (SELECT COALESCE(jsonb_agg(jsonb_build_object('task_id', b.id, 'title', b.title) ORDER BY b.sort_order), '[]'::jsonb)
                  FROM (SELECT * FROM _brief_task b WHERE b.project_id = p.id AND b.status = 'todo' AND NOT b.is_blocked ORDER BY b.sort_order LIMIT 5) b),
      'blocked_tasks', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                          'task_id', b.id, 'title', b.title, 'status', b.status,
                          'waiting_on', (SELECT jsonb_agg(jsonb_build_object('task_id', o.id, 'title', o.title, 'status', o.status, 'project', op.name, 'cross_project', o.project_id <> p.id))
                                           FROM public.project_task_dependencies d JOIN public.project_tasks o ON o.id = d.depends_on_task_id
                                           LEFT JOIN public.projects op ON op.id = o.project_id
                                          WHERE d.task_id = b.id AND o.status <> 'done')
                        ) ORDER BY b.sort_order), '[]'::jsonb)
                          FROM _brief_task b WHERE b.project_id = p.id AND b.is_open AND b.is_blocked),
      -- Stalled: in progress but untouched for p_stale_days.
      'stale_in_progress', (SELECT COALESCE(jsonb_agg(jsonb_build_object('task_id', b.id, 'title', b.title, 'days_idle', (EXTRACT(EPOCH FROM (now() - b.updated_at)) / 86400)::int) ORDER BY b.updated_at), '[]'::jsonb)
                              FROM _brief_task b WHERE b.project_id = p.id AND b.status = 'in_progress' AND b.updated_at < now() - v_stale),
      -- What this project waits for in OTHER projects.
      'external_waits', (SELECT COALESCE(jsonb_agg(jsonb_build_object('task_title', t.title, 'depends_on_title', o.title, 'depends_on_status', o.status, 'depends_on_project', op.name)), '[]'::jsonb)
                           FROM public.project_task_dependencies d
                           JOIN public.project_tasks t ON t.id = d.task_id AND t.project_id = p.id AND t.status <> 'done'
                           JOIN public.project_tasks o ON o.id = d.depends_on_task_id AND o.project_id <> p.id AND o.status <> 'done'
                           LEFT JOIN public.projects op ON op.id = o.project_id),
      -- Longest chain of OPEN tasks ending in this project (finish-to-start).
      'critical_path_length', (
        WITH RECURSIVE chain AS (
          SELECT b.id, 1 AS len FROM _brief_task b WHERE b.project_id = p.id AND b.is_open
          UNION ALL
          SELECT o.id, c.len + 1
            FROM chain c
            JOIN public.project_task_dependencies d ON d.task_id = c.id
            JOIN public.project_tasks o ON o.id = d.depends_on_task_id AND o.status <> 'done'
           WHERE c.len < 50
        )
        SELECT COALESCE(max(len), 0) FROM chain
      )
    ) AS proj
    FROM public.projects p
    WHERE p.is_active = true AND (p_project_id IS NULL OR p.id = p_project_id)
  ) x;

  SELECT jsonb_build_object(
    'projects', (SELECT count(*) FROM public.projects p WHERE p.is_active = true AND (p_project_id IS NULL OR p.id = p_project_id)),
    'open', (SELECT count(*) FROM _brief_task WHERE is_open),
    'in_progress', (SELECT count(*) FROM _brief_task WHERE status = 'in_progress'),
    'blocked', (SELECT count(*) FROM _brief_task WHERE is_open AND is_blocked),
    'undated_open', (SELECT count(*) FROM _brief_task WHERE is_open AND due_date IS NULL),
    'overdue', (SELECT count(*) FROM _brief_task WHERE is_open AND due_date IS NOT NULL AND due_date < CURRENT_DATE),
    'stale_in_progress', (SELECT count(*) FROM _brief_task WHERE status = 'in_progress' AND updated_at < now() - v_stale),
    'cross_project_edges', (SELECT count(*) FROM public.project_task_dependencies d JOIN public.project_tasks a ON a.id = d.task_id JOIN public.project_tasks b ON b.id = d.depends_on_task_id WHERE a.project_id <> b.project_id),
    'hub_blockers', v_hubs
  ) INTO v_portfolio;

  DROP TABLE IF EXISTS _brief_task;

  RETURN jsonb_build_object(
    'success', true,
    'generated_at', now(),
    'stale_days', GREATEST(COALESCE(p_stale_days, 5), 1),
    'portfolio', v_portfolio,
    'projects', v_projects,
    'reading_guide', 'blocked = an open task with an unfinished prerequisite; hub_blockers = one unfinished task gating two or more; external_waits = prerequisites in another project; stale_in_progress = running but untouched; ready = could start today. Counts only — no dates, hours or rates are required for this brief to be true.'
  );
END; $function$;

GRANT EXECUTE ON FUNCTION public.project_portfolio_brief(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.manage_task_dependency(text, uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_project_schedule(uuid) TO authenticated, service_role;
