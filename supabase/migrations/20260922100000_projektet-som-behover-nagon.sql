-- Projektet som behöver någon — och teamets ordning.
--
-- Peter på optic (produktbacklogg, 2026-09-16): "Användaren ska kunna ändra
-- ordningen på projekt i projektvyn och få ordningen bevarad." Och när Magnus
-- tittade på projektvyn: filtret "Needs attention" var tomt, alltid.
--
-- Filtret hade ETT villkor — en öppen uppgift vars förfallodatum passerat — och
-- räknade det själv i webbläsaren. På optic har 1 av 51 öppna uppgifter ett
-- förfallodatum: filtret mätte en vana teamet inte har. Samtidigt stod 7
-- uppgifter blockerade av något ofärdigt, och project_portfolio_brief — det
-- agenter läser först — visste redan det. Ett faktum, två läsare som inte var
-- överens: agenten såg blockeringarna, människan såg ingenting.
--
--   1. project_task_signals — EN definition av en uppgifts signaler: öppen,
--      blockerad (ofärdig förutsättning), försenad och förfaller snart i
--      plattformens EGEN dag (inte serverns UTC), urgent, och senaste RÖRELSE
--      (briefens definition: statusbyte, ikryssad checklista, en människas
--      kommentar eller en tidspost — aldrig en agents egen kommentar).
--      SECURITY INVOKER: den läser med anroparens ögon, så ett privat projekt
--      syns bara för den som får se det.
--   2. project_attention_verdict — EN regel: försenat, blockerat, urgent,
--      stillastående eller passerat slutdatum med öppna uppgifter. Vikten
--      sorterar de mest behövande först; skälen säger varför.
--   3. project_attention — det projektvyn läser: per projekt samma signaler
--      och samma dom, aggregerat i databasen (webbläsaren läste förut alla
--      uppgifter och kapades tyst vid 1 000).
--   4. project_portfolio_brief läser samma signaler och bär samma dom per
--      projekt — agenten och människan ser samma sak.
--   5. projects.sort_order — teamets ordning, DELAD (det är dagordningen).
--      reorder_projects sätter den; nya projekt hamnar överst, som förut.
--
-- Flottan förkontrollerad läsande 2026-09-22: project_portfolio_brief har
-- identisk kropp på alla sju instanser (md5 60b6e9a4…).

-- ─────────────────────────────────────────────────────────────────────────
-- Plattformens dag
-- ─────────────────────────────────────────────────────────────────────────
-- "I dag" är dagen där verksamheten ligger. CURRENT_DATE är serverns UTC-dag:
-- mellan midnatt och 02:00 svensk sommartid är det fortfarande i går.
CREATE OR REPLACE FUNCTION public.platform_today()
RETURNS date
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT (now() AT TIME ZONE public.platform_timezone())::date;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Teamets ordning
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS sort_order integer;

-- Ingen ska se listan hoppa: dagens ordning (nyast först) blir teamets ordning.
UPDATE public.projects p SET sort_order = o.n
  FROM (SELECT id, row_number() OVER (ORDER BY created_at DESC, id) AS n FROM public.projects) o
 WHERE o.id = p.id AND p.sort_order IS NULL;

-- Ett nytt projekt hamnar överst, precis som det alltid gjort.
CREATE OR REPLACE FUNCTION public.project_sort_order_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.sort_order IS NULL THEN
    NEW.sort_order := COALESCE((SELECT min(sort_order) FROM public.projects), 1) - 1;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS project_sort_order_on_insert ON public.projects;
CREATE TRIGGER project_sort_order_on_insert
  BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.project_sort_order_on_insert();

-- Sätt teamets ordning. p_project_ids är den önskade ordningen; projekt som
-- inte står i listan behåller sin inbördes ordning efter dem. Ordningen är en
-- presentation av projekten, inte projekten: den som får se ett projekt och har
-- projektmodulen får flytta det — också ett projekt någon annan skapat.
CREATE OR REPLACE FUNCTION public.reorder_projects(p_project_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_service boolean := auth.role() = 'service_role';
  v_hidden int;
  v_moved int;
BEGIN
  IF NOT (v_service OR can_access_module(v_uid, 'projects')) THEN
    RAISE EXCEPTION 'Requires the projects module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  IF p_project_ids IS NULL OR array_length(p_project_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_project_ids is the desired order — a list of project ids, first on top.');
  END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(p_project_ids) x) <> array_length(p_project_ids, 1) THEN
    RETURN jsonb_build_object('success', false, 'error', 'A project can only stand in one place — the list has duplicates.');
  END IF;

  -- Samma synlighet som läsregeln "Shared or own projects are visible": ingen
  -- flyttar ett projekt den inte ens får se (vakten jämför de två uttrycken).
  SELECT count(*) INTO v_hidden FROM unnest(p_project_ids) x
   WHERE NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = x
                      AND (v_service OR p.visibility = 'shared' OR p.created_by = v_uid OR has_role(v_uid, 'admin'::app_role)));
  IF v_hidden > 0 THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('%s of the projects are not found or not visible to you — nothing was moved.', v_hidden));
  END IF;

  WITH wanted AS (
    SELECT x AS id, ord AS n FROM unnest(p_project_ids) WITH ORDINALITY AS u(x, ord)
  ), rest AS (
    SELECT p.id, array_length(p_project_ids, 1) + row_number() OVER (ORDER BY p.sort_order NULLS LAST, p.created_at DESC, p.id) AS n
      FROM public.projects p WHERE p.id <> ALL (p_project_ids)
  ), target AS (SELECT * FROM wanted UNION ALL SELECT * FROM rest)
  UPDATE public.projects p SET sort_order = t.n
    FROM target t WHERE t.id = p.id AND p.sort_order IS DISTINCT FROM t.n;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'moved', v_moved,
    'order', (SELECT jsonb_agg(jsonb_build_object('project_id', p.id, 'name', p.name, 'sort_order', p.sort_order) ORDER BY p.sort_order)
                FROM public.projects p WHERE p.id = ANY (p_project_ids)));
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. En uppgifts signaler — EN definition
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.project_task_signals(p_project_id uuid DEFAULT NULL, p_include_inactive boolean DEFAULT false)
RETURNS TABLE (
  id uuid, project_id uuid, title text, status text, priority text, due_date date, sort_order integer,
  moved_at timestamptz, is_open boolean, is_blocked boolean, has_deps boolean,
  is_overdue boolean, is_due_soon boolean, is_urgent boolean
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT t.id, t.project_id, t.title, t.status::text, t.priority::text, t.due_date, t.sort_order,
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
         (t.status::text <> 'done') AS is_open,
         EXISTS (SELECT 1 FROM public.project_task_dependencies d JOIN public.project_tasks o ON o.id = d.depends_on_task_id
                  WHERE d.task_id = t.id AND o.status::text <> 'done') AS is_blocked,
         EXISTS (SELECT 1 FROM public.project_task_dependencies d WHERE d.task_id = t.id) AS has_deps,
         (t.status::text <> 'done' AND t.due_date IS NOT NULL AND t.due_date < public.platform_today()) AS is_overdue,
         (t.status::text <> 'done' AND t.due_date IS NOT NULL
            AND t.due_date >= public.platform_today() AND t.due_date <= public.platform_today() + 7) AS is_due_soon,
         (t.status::text <> 'done' AND t.priority::text = 'urgent') AS is_urgent
    FROM public.project_tasks t
    JOIN public.projects p ON p.id = t.project_id
   WHERE (p_include_inactive OR p.is_active = true)
     AND (p_project_id IS NULL OR t.project_id = p_project_id);
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. EN regel
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.project_attention_verdict(
  p_overdue integer, p_blocked integer, p_urgent integer, p_stalled integer, p_deadline_passed boolean)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT jsonb_build_object(
    'needs_attention', (COALESCE(p_overdue, 0) + COALESCE(p_blocked, 0) + COALESCE(p_urgent, 0) + COALESCE(p_stalled, 0)) > 0
                        OR COALESCE(p_deadline_passed, false),
    -- Urgent väger tyngst (teamet har sagt att det blockerar), sedan det som redan
    -- är för sent, sedan det som står still för att något annat inte är klart.
    'weight', COALESCE(p_urgent, 0) * 4 + COALESCE(p_overdue, 0) * 3 + COALESCE(p_blocked, 0) * 2
              + COALESCE(p_stalled, 0) + CASE WHEN COALESCE(p_deadline_passed, false) THEN 3 ELSE 0 END,
    'reasons', (SELECT COALESCE(jsonb_agg(r ORDER BY ord), '[]'::jsonb) FROM (VALUES
                  (1, CASE WHEN COALESCE(p_urgent, 0) > 0 THEN jsonb_build_object('kind', 'urgent', 'count', p_urgent) END),
                  (2, CASE WHEN COALESCE(p_overdue, 0) > 0 THEN jsonb_build_object('kind', 'overdue', 'count', p_overdue) END),
                  (3, CASE WHEN COALESCE(p_blocked, 0) > 0 THEN jsonb_build_object('kind', 'blocked', 'count', p_blocked) END),
                  (4, CASE WHEN COALESCE(p_stalled, 0) > 0 THEN jsonb_build_object('kind', 'stalled', 'count', p_stalled) END),
                  (5, CASE WHEN COALESCE(p_deadline_passed, false) THEN jsonb_build_object('kind', 'deadline_passed', 'count', 1) END)
                ) v(ord, r) WHERE r IS NOT NULL));
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Det projektvyn läser
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.project_attention(p_stale_days integer DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_stale interval := make_interval(days => GREATEST(COALESCE(p_stale_days, 5), 1));
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'projects')) THEN
    RAISE EXCEPTION 'Requires the projects module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('success', true, 'stale_days', GREATEST(COALESCE(p_stale_days, 5), 1), 'today', public.platform_today(),
    'projects', COALESCE((
      SELECT jsonb_agg(x.row ORDER BY (x.row->'attention'->>'weight')::int DESC, (x.row->>'sort_order')::int NULLS LAST)
        FROM (
          SELECT jsonb_build_object(
                   'project_id', p.id, 'name', p.name, 'is_active', p.is_active, 'sort_order', p.sort_order,
                   'total', count(s.id), 'open', count(s.id) FILTER (WHERE s.is_open),
                   'done', count(s.id) FILTER (WHERE NOT s.is_open),
                   'in_progress', count(s.id) FILTER (WHERE s.status = 'in_progress'),
                   'overdue', count(s.id) FILTER (WHERE s.is_overdue),
                   'due_soon', count(s.id) FILTER (WHERE s.is_due_soon),
                   'blocked', count(s.id) FILTER (WHERE s.is_open AND s.is_blocked),
                   'urgent', count(s.id) FILTER (WHERE s.is_urgent),
                   'stalled', count(s.id) FILTER (WHERE s.status = 'in_progress' AND s.moved_at < now() - v_stale),
                   'deadline_passed', (p.deadline IS NOT NULL AND p.deadline < public.platform_today() AND bool_or(s.is_open)),
                   'last_activity_at', GREATEST(max(s.moved_at), p.created_at),
                   -- Ett avslutat projekt behöver ingen: domen fälls bara över aktiva.
                   'attention', CASE WHEN p.is_active IS DISTINCT FROM false THEN public.project_attention_verdict(
                        (count(s.id) FILTER (WHERE s.is_overdue))::int,
                        (count(s.id) FILTER (WHERE s.is_open AND s.is_blocked))::int,
                        (count(s.id) FILTER (WHERE s.is_urgent))::int,
                        (count(s.id) FILTER (WHERE s.status = 'in_progress' AND s.moved_at < now() - v_stale))::int,
                        COALESCE(p.deadline IS NOT NULL AND p.deadline < public.platform_today() AND bool_or(s.is_open), false))
                     ELSE jsonb_build_object('needs_attention', false, 'weight', 0, 'reasons', '[]'::jsonb) END
                 ) AS row
            FROM public.projects p
            LEFT JOIN public.project_task_signals(NULL, true) s ON s.project_id = p.id
           GROUP BY p.id
        ) x), '[]'::jsonb),
    'note', 'needs_attention = an open task that is urgent, overdue (in the platform''s own day), blocked by an unfinished prerequisite, or in progress with no movement for stale_days — or the project''s deadline has passed with work open. Tasks without a due date are never overdue; that is not the same as fine.');
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Briefen läser samma signaler och bär samma dom
-- ─────────────────────────────────────────────────────────────────────────
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
  -- one-signal 20260922100000
  -- Uppgiftens signaler har EN definition: project_task_signals. Projektvyns
  -- "Needs attention" och den här briefen läser samma rader och samma regel.
  CREATE TEMP TABLE IF NOT EXISTS _brief_task ON COMMIT DROP AS
  SELECT * FROM public.project_task_signals(p_project_id, false);

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

  SELECT COALESCE(jsonb_agg(proj ORDER BY (proj->'attention'->>'weight')::int DESC, (proj->>'sort_order')::int NULLS LAST, proj->>'name'), '[]'::jsonb)
  INTO v_projects
  FROM (
    SELECT jsonb_build_object(
      'id', p.id, 'name', p.name, 'status', p.status, 'deadline', p.deadline,
      'sort_order', p.sort_order,
      'attention', public.project_attention_verdict(
         (SELECT count(*) FROM _brief_task b WHERE b.project_id = p.id AND b.is_overdue)::int,
         (SELECT count(*) FROM _brief_task b WHERE b.project_id = p.id AND b.is_open AND b.is_blocked)::int,
         (SELECT count(*) FROM _brief_task b WHERE b.project_id = p.id AND b.is_urgent)::int,
         (SELECT count(*) FROM _brief_task b WHERE b.project_id = p.id AND b.status = 'in_progress' AND b.moved_at < now() - v_stale)::int,
         (p.deadline IS NOT NULL AND p.deadline < public.platform_today()
            AND EXISTS (SELECT 1 FROM _brief_task b WHERE b.project_id = p.id AND b.is_open))),
      'total', (SELECT count(*) FROM _brief_task b WHERE b.project_id = p.id),
      'open', (SELECT count(*) FROM _brief_task b WHERE b.project_id = p.id AND b.is_open),
      'in_progress', (SELECT count(*) FROM _brief_task b WHERE b.project_id = p.id AND b.status = 'in_progress'),
      'done', (SELECT count(*) FROM _brief_task b WHERE b.project_id = p.id AND NOT b.is_open),
      'blocked', (SELECT count(*) FROM _brief_task b WHERE b.project_id = p.id AND b.is_open AND b.is_blocked),
      'undated_open', (SELECT count(*) FROM _brief_task b WHERE b.project_id = p.id AND b.is_open AND b.due_date IS NULL),
      'overdue', (SELECT count(*) FROM _brief_task b WHERE b.project_id = p.id AND b.is_overdue),
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
    'overdue', (SELECT count(*) FROM _brief_task WHERE is_overdue),
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
    'reading_guide', 'attention = the verdict the project view shows (needs_attention, weight, reasons: overdue, blocked, urgent, stalled, deadline passed) — projects are listed most-needing first; blocked = an open task with an unfinished prerequisite; hub_blockers = one unfinished task gating two or more; external_waits = prerequisites in another project; stale_in_progress = running but untouched; ready = could start today. Counts only — no dates, hours or rates are required for this brief to be true.'
  );
END; $function$;

DO $grants$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.platform_today()',
    'public.project_task_signals(uuid, boolean)',
    'public.project_attention_verdict(integer, integer, integer, integer, boolean)',
    'public.project_attention(integer)',
    'public.reorder_projects(uuid[])',
    'public.project_sort_order_on_insert()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END
$grants$;
REVOKE ALL ON FUNCTION public.reorder_projects(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_projects(uuid[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.project_portfolio_brief(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_portfolio_brief(uuid, integer) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Beviset
-- ─────────────────────────────────────────────────────────────────────────
DO $proof$
DECLARE
  v_a uuid; v_b uuid; v_c uuid; t1 uuid; t2 uuid; t3 uuid; v_r jsonb; v_row jsonb; v_brief jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    INSERT INTO public.projects (name, is_active, visibility) VALUES ('Proof 100000 A', true, 'shared') RETURNING id INTO v_a;
    INSERT INTO public.projects (name, is_active, visibility) VALUES ('Proof 100000 B', true, 'shared') RETURNING id INTO v_b;
    INSERT INTO public.projects (name, is_active, visibility) VALUES ('Proof 100000 C', true, 'shared') RETURNING id INTO v_c;
    IF (SELECT sort_order FROM public.projects WHERE id = v_c) >= (SELECT sort_order FROM public.projects WHERE id = v_a) THEN
      RAISE EXCEPTION 'proof failed: a new project should land on top';
    END IF;

    -- A: en uppgift som väntar på en ofärdig — blockerad. Inga datum alls.
    INSERT INTO public.project_tasks (project_id, title, status) VALUES (v_a, 'Prereq', 'todo') RETURNING id INTO t1;
    INSERT INTO public.project_tasks (project_id, title, status) VALUES (v_a, 'Waits', 'todo') RETURNING id INTO t2;
    INSERT INTO public.project_task_dependencies (task_id, depends_on_task_id) VALUES (t2, t1);
    -- B: urgent. C: inget alls.
    INSERT INTO public.project_tasks (project_id, title, status, priority) VALUES (v_b, 'Revision', 'todo', 'urgent') RETURNING id INTO t3;
    INSERT INTO public.project_tasks (project_id, title, status) VALUES (v_c, 'Calm', 'todo');

    v_r := public.project_attention(5);
    SELECT p INTO v_row FROM jsonb_array_elements(v_r->'projects') p WHERE (p->>'project_id')::uuid = v_a;
    IF NOT (v_row->'attention'->>'needs_attention')::boolean OR (v_row->>'blocked')::int <> 1 THEN
      RAISE EXCEPTION 'proof failed: a blocked task with no dates should need attention → %', v_row;
    END IF;
    SELECT p INTO v_row FROM jsonb_array_elements(v_r->'projects') p WHERE (p->>'project_id')::uuid = v_b;
    IF NOT (v_row->'attention'->>'needs_attention')::boolean OR v_row->'attention'->'reasons'->0->>'kind' <> 'urgent' THEN
      RAISE EXCEPTION 'proof failed: an urgent task should need attention, and say so first → %', v_row;
    END IF;
    SELECT p INTO v_row FROM jsonb_array_elements(v_r->'projects') p WHERE (p->>'project_id')::uuid = v_c;
    IF (v_row->'attention'->>'needs_attention')::boolean THEN
      RAISE EXCEPTION 'proof failed: a calm project was flagged → %', v_row;
    END IF;

    -- Briefen fäller samma dom.
    v_brief := public.project_portfolio_brief(v_a, 5);
    IF NOT (v_brief->'projects'->0->'attention'->>'needs_attention')::boolean THEN
      RAISE EXCEPTION 'proof failed: the brief and the view disagree → %', v_brief->'projects'->0->'attention';
    END IF;

    -- Löst beroende: inte längre blockerad.
    UPDATE public.project_tasks SET status = 'done' WHERE id = t1;
    SELECT p INTO v_row FROM jsonb_array_elements(public.project_attention(5)->'projects') p WHERE (p->>'project_id')::uuid = v_a;
    IF (v_row->'attention'->>'needs_attention')::boolean THEN
      RAISE EXCEPTION 'proof failed: a finished prerequisite still blocks → %', v_row;
    END IF;

    -- Teamets ordning: C, A, B överst — och resten efter dem, i sin gamla ordning.
    v_r := public.reorder_projects(ARRAY[v_c, v_a, v_b]);
    IF NOT (v_r->>'success')::boolean THEN RAISE EXCEPTION 'proof failed: reorder → %', v_r; END IF;
    IF NOT ((SELECT sort_order FROM public.projects WHERE id = v_c) < (SELECT sort_order FROM public.projects WHERE id = v_a)
        AND (SELECT sort_order FROM public.projects WHERE id = v_a) < (SELECT sort_order FROM public.projects WHERE id = v_b)) THEN
      RAISE EXCEPTION 'proof failed: the order did not stick';
    END IF;
    IF (SELECT min(sort_order) FROM public.projects WHERE id NOT IN (v_a, v_b, v_c))
       <= (SELECT sort_order FROM public.projects WHERE id = v_b) THEN
      RAISE EXCEPTION 'proof failed: an unlisted project jumped in front of the listed ones';
    END IF;
    v_r := public.reorder_projects(ARRAY[v_a, v_a]);
    IF (v_r->>'success')::boolean THEN RAISE EXCEPTION 'proof failed: duplicates were accepted'; END IF;

    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'proof passed: blocked and urgent work needs attention without any dates, a calm project does not, the brief agrees, and the team order sticks.';
END
$proof$;
