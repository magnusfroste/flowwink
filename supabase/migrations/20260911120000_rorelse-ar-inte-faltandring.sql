-- Rörelse är inte fältändring.
--
-- stale_in_progress mätte på project_tasks.updated_at, som stiger av VARJE
-- skrivning. När 57 uppgifter fick en ansvarig (optic 2026-09-10) nollställdes
-- därmed stillaståendet på allihop: SBB-KYC hade stått sedan 4 september, och
-- rapporten svarade plötsligt noll. Sensorn var blind i fem dygn utan att
-- något gått sönder, vilket är exakt den tysta klassen vakterna finns för.
--
-- Rörelse är i stället evidens att någon arbetat med uppgiften:
--   * statusbyte eller en ikryssad checklistpunkt  → moved_at, satt av trigger
--   * en MÄNNISKAS kommentar                        → project_task_comments
--   * en tidspost                                   → time_entries
--
-- En agents egen kommentar räknas ALDRIG. FlowPilot frågar "står den här
-- still?" genom att kommentera, och om kommentaren nollställde måttet skulle
-- den tysta sig själv med sin egen fråga.
--
-- Backfill är golvet, inte en gissning: completed_at när den finns, annars
-- created_at. Vi VET inte när gamla uppgifter senast rörde sig, och att låna
-- updated_at vore att ärva just den lögn migrationen rättar.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, DROP TRIGGER IF EXISTS.

ALTER TABLE public.project_tasks ADD COLUMN IF NOT EXISTS moved_at timestamptz;

COMMENT ON COLUMN public.project_tasks.moved_at IS
  'När uppgiften senast RÖRDE SIG (statusbyte eller ikryssad checklistpunkt). Stiger inte av titel-, ansvarig- eller estimatändringar — det är updated_at till för.';

/* Antal ikryssade punkter, för att se om checklistan rörde sig. */
CREATE OR REPLACE FUNCTION public.checklist_done_count(p_checklist jsonb)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE((SELECT count(*) FROM jsonb_array_elements(COALESCE(p_checklist, '[]'::jsonb)) x
                    WHERE (x->>'done')::boolean IS TRUE), 0)::integer;
$$;

CREATE OR REPLACE FUNCTION public.project_tasks_stamp_movement()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.moved_at := COALESCE(NEW.moved_at, now());
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR public.checklist_done_count(NEW.checklist) IS DISTINCT FROM public.checklist_done_count(OLD.checklist) THEN
    NEW.moved_at := now();
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS project_tasks_stamp_movement ON public.project_tasks;
CREATE TRIGGER project_tasks_stamp_movement
  BEFORE INSERT OR UPDATE ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.project_tasks_stamp_movement();

UPDATE public.project_tasks
   SET moved_at = COALESCE(completed_at, created_at)
 WHERE moved_at IS NULL;

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
  SELECT t.id, t.project_id, t.title, t.status, t.due_date, t.sort_order,
         -- RÖRELSE, inte redigering. updated_at stiger av varje fältändring, så
         -- en omtilldelning nollställde stillaståendet på 57 uppgifter
         -- (optic 2026-09-10) och tystade sensorn i fem dygn. Rörelse är:
         -- statusbyte eller en ikryssad checklistpunkt (moved_at, satt av
         -- trigger), en MÄNNISKAS kommentar, eller en tidspost. En agents egen
         -- kommentar räknas ALDRIG — annars tystar sensorn sig själv genom att
         -- fråga.
         GREATEST(
           COALESCE(t.moved_at, t.created_at),
           COALESCE((SELECT max(c.created_at) FROM public.project_task_comments c
                      WHERE c.task_id = t.id AND c.author_type::text = 'person'), '-infinity'::timestamptz),
           COALESCE((SELECT max(te.created_at) FROM public.time_entries te
                      WHERE te.task_id = t.id), '-infinity'::timestamptz)
         ) AS moved_at,
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
      'stale_in_progress', (SELECT COALESCE(jsonb_agg(jsonb_build_object('task_id', b.id, 'title', b.title, 'days_idle', (EXTRACT(EPOCH FROM (now() - b.moved_at)) / 86400)::int) ORDER BY b.moved_at), '[]'::jsonb)
                              FROM _brief_task b WHERE b.project_id = p.id AND b.status = 'in_progress' AND b.moved_at < now() - v_stale),
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
    'stale_in_progress', (SELECT count(*) FROM _brief_task WHERE status = 'in_progress' AND moved_at < now() - v_stale),
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

-- Bevisar sig själv: en ren fältändring får INTE räknas som rörelse.
DO $$
DECLARE v_id uuid; v_before timestamptz; v_after timestamptz;
BEGIN
  -- En uppgift UTAN beroenden, annars kan arbetsflödesvakten vägra statusbytet
  -- och vakten skulle falla på fel sak.
  SELECT t.id, t.moved_at INTO v_id, v_before
    FROM public.project_tasks t
   WHERE NOT EXISTS (SELECT 1 FROM public.project_task_dependencies d WHERE d.task_id = t.id)
     AND t.status::text IN ('todo', 'in_progress')
   LIMIT 1;
  IF v_id IS NULL THEN RETURN; END IF;

  UPDATE public.project_tasks SET title = title WHERE id = v_id;
  SELECT moved_at INTO v_after FROM public.project_tasks WHERE id = v_id;
  IF v_after IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'en fältändring flyttade moved_at (% → %) — måttet är fortfarande känsligt', v_before, v_after;
  END IF;

  UPDATE public.project_tasks
     SET status = CASE WHEN status::text = 'todo' THEN 'in_progress'::project_task_status ELSE 'todo'::project_task_status END
   WHERE id = v_id;
  SELECT moved_at INTO v_after FROM public.project_tasks WHERE id = v_id;
  IF v_after IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'ett statusbyte flyttade INTE moved_at — rörelse registreras inte';
  END IF;
  RAISE EXCEPTION 'rollback: vakten är klar';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'rollback: vakten är klar' THEN RAISE; END IF;
END $$;
