-- Vad ändrades sedan förra tisdagen?
--
-- Peter (optic, 2026-09-21) byggde en DAGLIG handgjord ögonblicksbild av alla
-- uppgifter i en flowtable-tabell — 70 rader om dagen — för att kunna svara på
-- tisdagsmötets enda fråga: vad har hänt sedan sist? Plattformen kunde inte
-- svara, för den mindes bara NULÄGET: project_tasks bär status, prioritet och
-- ansvarig, men inte vad de VAR. updated_at säger att något ändrades, inte vad.
--
-- Så: en liggare. project_task_events är den huvudbok som uppgiften saknade —
-- en rad per faktisk ändring (skapad, status, prioritet, ansvarig, datum,
-- titel, checklista, raderad, beroende till/från, milstolpe nådd), skriven av
-- en trigger så att VARJE skrivare lyder: vyn, agenten, flowtable, en import.
-- Posten är orubblig: UPDATE och DELETE vägras (utom när projektet självt
-- försvinner — då följer dess historia med, som allt annat i det).
--
-- Läsaren project_changes(projekt, sedan, till) svarar strukturerat: vad
-- skapades, blev klart, öppnades igen, flyttades, fick ny prioritet/ansvarig/
-- datum, raderades, vilka beroenden och milstolpar rördes, vad människor och
-- agenter skrev, och hur många timmar som rapporterades. Projekten kommer i
-- teamets ordning — det är mötets dagordning — och de som inte rört sig namnges
-- som lugna, så att tystnad är ett svar och inte en lucka.
--
-- Ärlighet om vad vi INTE vet: liggaren börjar när den här migrationen körs.
-- Bakåt fylls bara det som är känt med säkerhet: att en uppgift skapades
-- (created_at) och att den blev klar (completed_at). Ett svar vars fönster
-- börjar före liggarens start säger det själv (coverage: partial) i stället
-- för att låta "inga ändringar" betyda "inget hände".
--
-- Kommentarer och tidsposter dupliceras INTE in i liggaren: de har redan sina
-- tabeller med tidsstämplar (project_task_comments, time_entries), och ett
-- faktum har en läsare.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE, DROP TRIGGER IF
-- EXISTS; backfill och startmarkör bara när liggaren är tom.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Liggaren
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL bara för startmarkören: när liggaren började föras på den här instansen.
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  -- Ingen FK: en raderad uppgift behåller sin historia. Titeln vid händelsen
  -- bärs med av samma skäl.
  task_id uuid,
  title text,
  kind text NOT NULL CHECK (kind IN (
    'ledger_started', 'created', 'deleted', 'status', 'priority', 'assignee', 'due_date',
    'title', 'checklist', 'milestone', 'dependency_added', 'dependency_removed',
    'milestone_reached', 'milestone_reopened')),
  old_value text,
  new_value text,
  actor_id uuid,
  actor_kind text NOT NULL DEFAULT 'system' CHECK (actor_kind IN ('person', 'agent', 'system')),
  -- Backfyllt = härlett ur nuläget vid liggarens start, inte observerat.
  backfilled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind = 'ledger_started' OR project_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS project_task_events_project_time ON public.project_task_events (project_id, created_at);
CREATE INDEX IF NOT EXISTS project_task_events_task ON public.project_task_events (task_id, created_at);

COMMENT ON TABLE public.project_task_events IS
  'Uppgiftens huvudbok: en rad per faktisk ändring, skriven av triggers så att varje skrivare lyder. Orubblig — läses med project_changes(). Startmarkören (kind = ledger_started) säger när instansen började föra den.';

GRANT SELECT ON public.project_task_events TO authenticated;
GRANT ALL ON public.project_task_events TO service_role;
REVOKE ALL ON public.project_task_events FROM anon;
ALTER TABLE public.project_task_events ENABLE ROW LEVEL SECURITY;

-- Läses med samma ögon som projektet: matrisen + "Shared or own projects are
-- visible". Ingen INSERT-policy för authenticated — bara triggern skriver.
DROP POLICY IF EXISTS "project task events follow the project" ON public.project_task_events;
CREATE POLICY "project task events follow the project" ON public.project_task_events
  FOR SELECT TO authenticated
  USING (public.can_access_module(auth.uid(), 'projects')
         AND (project_id IS NULL OR EXISTS (
           SELECT 1 FROM public.projects p WHERE p.id = project_id
              AND (p.visibility = 'shared' OR p.created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)))));

-- Posten är orubblig. Radering tillåts bara när projektet självt är borta
-- (kaskaden från projects), annars är det en förfalskning av historien.
CREATE OR REPLACE FUNCTION public.project_task_events_are_a_ledger()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'project_task_events is a ledger: an event is never edited' USING ERRCODE = '42501';
  END IF;
  IF OLD.project_id IS NULL OR EXISTS (SELECT 1 FROM public.projects WHERE id = OLD.project_id) THEN
    RAISE EXCEPTION 'project_task_events is a ledger: an event is never deleted while its project exists' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END; $$;
DROP TRIGGER IF EXISTS project_task_events_are_a_ledger ON public.project_task_events;
CREATE TRIGGER project_task_events_are_a_ledger
  BEFORE UPDATE OR DELETE ON public.project_task_events
  FOR EACH ROW EXECUTE FUNCTION public.project_task_events_are_a_ledger();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Skrivarna: triggers på uppgifter, beroenden och milstolpar
-- ─────────────────────────────────────────────────────────────────────────
-- Vem gjorde det: en inloggad människa har auth.uid(); under service_role är
-- den NULL och skrivaren är en agent (samma tolkning som project_stamp_hands).
CREATE OR REPLACE FUNCTION public.project_event_actor_kind()
RETURNS text LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT CASE WHEN auth.uid() IS NOT NULL THEN 'person'
              WHEN auth.role() = 'service_role' THEN 'agent'
              ELSE 'system' END;
$$;

-- SECURITY DEFINER: triggern skriver liggaren åt vem som än ändrade raden;
-- ingen annan får skriva den alls.
CREATE OR REPLACE FUNCTION public.project_tasks_record_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_kind text := public.project_event_actor_kind();
  v_old_done int; v_new_done int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.project_task_events (project_id, task_id, title, kind, new_value, actor_id, actor_kind)
    VALUES (NEW.project_id, NEW.id, NEW.title, 'created', NEW.status::text, v_actor, v_kind);
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- Kaskaden från ett raderat projekt: projektet är redan borta, och dess
    -- historia följer med det. Bara en uppgift raderad UR ett projekt bokförs.
    IF EXISTS (SELECT 1 FROM public.projects WHERE id = OLD.project_id) THEN
      INSERT INTO public.project_task_events (project_id, task_id, title, kind, old_value, actor_id, actor_kind)
      VALUES (OLD.project_id, OLD.id, OLD.title, 'deleted', OLD.status::text, v_actor, v_kind);
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.project_task_events (project_id, task_id, title, kind, old_value, new_value, actor_id, actor_kind)
    VALUES (NEW.project_id, NEW.id, NEW.title, 'status', OLD.status::text, NEW.status::text, v_actor, v_kind);
  END IF;
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    INSERT INTO public.project_task_events (project_id, task_id, title, kind, old_value, new_value, actor_id, actor_kind)
    VALUES (NEW.project_id, NEW.id, NEW.title, 'priority', OLD.priority::text, NEW.priority::text, v_actor, v_kind);
  END IF;
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO public.project_task_events (project_id, task_id, title, kind, old_value, new_value, actor_id, actor_kind)
    VALUES (NEW.project_id, NEW.id, NEW.title, 'assignee', OLD.assigned_to::text, NEW.assigned_to::text, v_actor, v_kind);
  END IF;
  IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    INSERT INTO public.project_task_events (project_id, task_id, title, kind, old_value, new_value, actor_id, actor_kind)
    VALUES (NEW.project_id, NEW.id, NEW.title, 'due_date', OLD.due_date::text, NEW.due_date::text, v_actor, v_kind);
  END IF;
  IF NEW.title IS DISTINCT FROM OLD.title THEN
    INSERT INTO public.project_task_events (project_id, task_id, title, kind, old_value, new_value, actor_id, actor_kind)
    VALUES (NEW.project_id, NEW.id, NEW.title, 'title', OLD.title, NEW.title, v_actor, v_kind);
  END IF;
  IF NEW.milestone_id IS DISTINCT FROM OLD.milestone_id THEN
    INSERT INTO public.project_task_events (project_id, task_id, title, kind, old_value, new_value, actor_id, actor_kind)
    VALUES (NEW.project_id, NEW.id, NEW.title, 'milestone',
            (SELECT name FROM public.project_milestones WHERE id = OLD.milestone_id),
            (SELECT name FROM public.project_milestones WHERE id = NEW.milestone_id), v_actor, v_kind);
  END IF;
  v_old_done := public.checklist_done_count(OLD.checklist);
  v_new_done := public.checklist_done_count(NEW.checklist);
  IF v_old_done IS DISTINCT FROM v_new_done THEN
    INSERT INTO public.project_task_events (project_id, task_id, title, kind, old_value, new_value, actor_id, actor_kind)
    VALUES (NEW.project_id, NEW.id, NEW.title, 'checklist',
            format('%s/%s', v_old_done, jsonb_array_length(COALESCE(OLD.checklist, '[]'::jsonb))),
            format('%s/%s', v_new_done, jsonb_array_length(COALESCE(NEW.checklist, '[]'::jsonb))), v_actor, v_kind);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS project_tasks_record_events ON public.project_tasks;
CREATE TRIGGER project_tasks_record_events
  AFTER INSERT OR UPDATE OR DELETE ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.project_tasks_record_events();

CREATE OR REPLACE FUNCTION public.project_task_dependencies_record_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_task record; v_on record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT id, project_id, title INTO v_task FROM public.project_tasks WHERE id = NEW.task_id;
    SELECT title INTO v_on FROM public.project_tasks WHERE id = NEW.depends_on_task_id;
  ELSE
    SELECT id, project_id, title INTO v_task FROM public.project_tasks WHERE id = OLD.task_id;
    SELECT title INTO v_on FROM public.project_tasks WHERE id = OLD.depends_on_task_id;
  END IF;
  -- Kaskaden från en raderad uppgift: raderingen är händelsen, inte beroendet.
  IF v_task.id IS NULL OR v_on.title IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  INSERT INTO public.project_task_events (project_id, task_id, title, kind, new_value, actor_id, actor_kind)
  VALUES (v_task.project_id, v_task.id, v_task.title,
          CASE WHEN TG_OP = 'INSERT' THEN 'dependency_added' ELSE 'dependency_removed' END,
          v_on.title, auth.uid(), public.project_event_actor_kind());
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS project_task_dependencies_record_events ON public.project_task_dependencies;
CREATE TRIGGER project_task_dependencies_record_events
  AFTER INSERT OR DELETE ON public.project_task_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.project_task_dependencies_record_events();

CREATE OR REPLACE FUNCTION public.project_milestones_record_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.is_reached IS DISTINCT FROM OLD.is_reached THEN
    INSERT INTO public.project_task_events (project_id, title, kind, actor_id, actor_kind)
    VALUES (NEW.project_id, NEW.name,
            CASE WHEN NEW.is_reached THEN 'milestone_reached' ELSE 'milestone_reopened' END,
            auth.uid(), public.project_event_actor_kind());
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS project_milestones_record_events ON public.project_milestones;
CREATE TRIGGER project_milestones_record_events
  AFTER UPDATE ON public.project_milestones
  FOR EACH ROW EXECUTE FUNCTION public.project_milestones_record_events();

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Backfill: bara det som är KÄNT — skapad och klar. Sedan startmarkören.
-- ─────────────────────────────────────────────────────────────────────────
DO $backfill$
BEGIN
  IF EXISTS (SELECT 1 FROM public.project_task_events WHERE kind = 'ledger_started') THEN
    RETURN;
  END IF;
  INSERT INTO public.project_task_events (project_id, task_id, title, kind, new_value, actor_id, actor_kind, backfilled, created_at)
  SELECT t.project_id, t.id, t.title, 'created', NULL, t.created_by,
         CASE WHEN t.created_by IS NULL THEN 'system' ELSE 'person' END, true, t.created_at
    FROM public.project_tasks t;
  INSERT INTO public.project_task_events (project_id, task_id, title, kind, new_value, actor_kind, backfilled, created_at)
  SELECT t.project_id, t.id, t.title, 'status', 'done', 'system', true, t.completed_at
    FROM public.project_tasks t
   WHERE t.status::text = 'done' AND t.completed_at IS NOT NULL;
  INSERT INTO public.project_task_events (project_id, title, kind, actor_kind, backfilled, created_at)
  SELECT m.project_id, m.name, 'milestone_reached', 'system', true, m.reached_at
    FROM public.project_milestones m
   WHERE m.is_reached AND m.reached_at IS NOT NULL;
  INSERT INTO public.project_task_events (kind, actor_kind) VALUES ('ledger_started', 'system');
END
$backfill$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Läsaren
-- ─────────────────────────────────────────────────────────────────────────
-- Ett namn åt en uuid: HR:s namn när kopplingen finns, annars kontots eget
-- (samma stege som kapacitetsrapporten). DEFINER för att ett NAMN inte är
-- HR-data — den som får se projektet får se vem som gjorde vad i det.
CREATE OR REPLACE FUNCTION public.project_person_name(p_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(
    (SELECT NULLIF(btrim(e.name), '') FROM public.employees e WHERE e.user_id = p_user_id LIMIT 1),
    (SELECT COALESCE(NULLIF(btrim(pr.full_name), ''), NULLIF(btrim(pr.email), '')) FROM public.profiles pr WHERE pr.id = p_user_id));
$$;

CREATE OR REPLACE FUNCTION public.project_changes(
  p_project_id uuid DEFAULT NULL,
  p_since timestamptz DEFAULT NULL,
  p_until timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_since timestamptz := COALESCE(p_since, now() - interval '7 days');
  v_until timestamptz := COALESCE(p_until, now());
  v_started timestamptz;
  v_projects jsonb;
  v_quiet jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'projects')) THEN
    RAISE EXCEPTION 'Requires the projects module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  IF v_until <= v_since THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_until must be after p_since');
  END IF;
  SELECT min(created_at) INTO v_started FROM public.project_task_events WHERE kind = 'ledger_started';

  -- Per synligt projekt (RLS: INVOKER) — teamets ordning är dagordningen.
  WITH proj AS (
    SELECT p.id, p.name, p.sort_order, p.created_at, p.is_active
      FROM public.projects p
     WHERE (p_project_id IS NULL OR p.id = p_project_id)
  ), ev AS (
    SELECT e.*, public.project_person_name(e.actor_id) AS actor_name
      FROM public.project_task_events e
      JOIN proj ON proj.id = e.project_id
     WHERE e.created_at > v_since AND e.created_at <= v_until
  ), cm AS (
    SELECT c.*, t.title
      FROM public.project_task_comments c
      JOIN proj ON proj.id = c.project_id
      LEFT JOIN public.project_tasks t ON t.id = c.task_id
     WHERE c.created_at > v_since AND c.created_at <= v_until
  ), hrs AS (
    -- Namnet: kontots, annars HR-postens (en tidspost kan bära bara employee_id).
    SELECT te.project_id,
           COALESCE(public.project_person_name(te.user_id),
                    (SELECT NULLIF(btrim(e.name), '') FROM public.employees e WHERE e.id = te.employee_id),
                    'unknown') AS person_name,
           sum(te.hours) AS hours
      FROM public.time_entries te
      JOIN proj ON proj.id = te.project_id
     WHERE te.entry_date >= v_since::date AND te.entry_date <= v_until::date
     GROUP BY te.project_id, COALESCE(te.user_id::text, te.employee_id::text), 2
  ), per AS (
    SELECT proj.id AS project_id, proj.name, proj.sort_order, proj.is_active, proj.created_at AS project_created_at,
           GREATEST(proj.created_at, COALESCE(v_started, proj.created_at)) AS history_from,
           (SELECT COALESCE(jsonb_agg(jsonb_build_object('task_id', e.task_id, 'title', e.title, 'at', e.created_at, 'by', COALESCE(e.actor_name, e.actor_kind)) ORDER BY e.created_at), '[]'::jsonb)
              FROM ev e WHERE e.project_id = proj.id AND e.kind = 'created') AS created,
           (SELECT COALESCE(jsonb_agg(jsonb_build_object('task_id', e.task_id, 'title', e.title, 'at', e.created_at, 'by', COALESCE(e.actor_name, e.actor_kind)) ORDER BY e.created_at), '[]'::jsonb)
              FROM ev e WHERE e.project_id = proj.id AND e.kind = 'status' AND e.new_value = 'done') AS completed,
           (SELECT COALESCE(jsonb_agg(jsonb_build_object('task_id', e.task_id, 'title', e.title, 'to', e.new_value, 'at', e.created_at, 'by', COALESCE(e.actor_name, e.actor_kind)) ORDER BY e.created_at), '[]'::jsonb)
              FROM ev e WHERE e.project_id = proj.id AND e.kind = 'status' AND e.old_value = 'done' AND e.new_value <> 'done') AS reopened,
           (SELECT COALESCE(jsonb_agg(jsonb_build_object('task_id', e.task_id, 'title', e.title, 'from', e.old_value, 'to', e.new_value, 'at', e.created_at, 'by', COALESCE(e.actor_name, e.actor_kind)) ORDER BY e.created_at), '[]'::jsonb)
              FROM ev e WHERE e.project_id = proj.id AND e.kind = 'status' AND e.new_value <> 'done' AND COALESCE(e.old_value, '') <> 'done') AS moved,
           (SELECT COALESCE(jsonb_agg(jsonb_build_object('task_id', e.task_id, 'title', e.title, 'from', e.old_value, 'to', e.new_value, 'at', e.created_at, 'by', COALESCE(e.actor_name, e.actor_kind)) ORDER BY e.created_at), '[]'::jsonb)
              FROM ev e WHERE e.project_id = proj.id AND e.kind = 'priority') AS reprioritised,
           (SELECT COALESCE(jsonb_agg(jsonb_build_object('task_id', e.task_id, 'title', e.title,
                     'from', public.project_person_name(e.old_value::uuid), 'to', public.project_person_name(e.new_value::uuid),
                     'at', e.created_at, 'by', COALESCE(e.actor_name, e.actor_kind)) ORDER BY e.created_at), '[]'::jsonb)
              FROM ev e WHERE e.project_id = proj.id AND e.kind = 'assignee') AS reassigned,
           (SELECT COALESCE(jsonb_agg(jsonb_build_object('task_id', e.task_id, 'title', e.title, 'from', e.old_value, 'to', e.new_value, 'at', e.created_at, 'by', COALESCE(e.actor_name, e.actor_kind)) ORDER BY e.created_at), '[]'::jsonb)
              FROM ev e WHERE e.project_id = proj.id AND e.kind = 'due_date') AS rescheduled,
           (SELECT COALESCE(jsonb_agg(jsonb_build_object('task_id', e.task_id, 'from', e.old_value, 'to', e.new_value, 'at', e.created_at, 'by', COALESCE(e.actor_name, e.actor_kind)) ORDER BY e.created_at), '[]'::jsonb)
              FROM ev e WHERE e.project_id = proj.id AND e.kind = 'title') AS renamed,
           (SELECT COALESCE(jsonb_agg(jsonb_build_object('task_id', e.task_id, 'title', e.title, 'from', e.old_value, 'to', e.new_value, 'at', e.created_at, 'by', COALESCE(e.actor_name, e.actor_kind)) ORDER BY e.created_at), '[]'::jsonb)
              FROM ev e WHERE e.project_id = proj.id AND e.kind IN ('checklist', 'milestone')) AS progressed,
           (SELECT COALESCE(jsonb_agg(jsonb_build_object('task_id', e.task_id, 'title', e.title, 'was', e.old_value, 'at', e.created_at, 'by', COALESCE(e.actor_name, e.actor_kind)) ORDER BY e.created_at), '[]'::jsonb)
              FROM ev e WHERE e.project_id = proj.id AND e.kind = 'deleted') AS deleted,
           (SELECT COALESCE(jsonb_agg(jsonb_build_object('task_id', e.task_id, 'title', e.title, 'change', CASE WHEN e.kind = 'dependency_added' THEN 'now waits on' ELSE 'no longer waits on' END, 'on', e.new_value, 'at', e.created_at, 'by', COALESCE(e.actor_name, e.actor_kind)) ORDER BY e.created_at), '[]'::jsonb)
              FROM ev e WHERE e.project_id = proj.id AND e.kind IN ('dependency_added', 'dependency_removed')) AS dependencies,
           (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', e.title, 'change', CASE WHEN e.kind = 'milestone_reached' THEN 'reached' ELSE 'reopened' END, 'at', e.created_at, 'by', COALESCE(e.actor_name, e.actor_kind)) ORDER BY e.created_at), '[]'::jsonb)
              FROM ev e WHERE e.project_id = proj.id AND e.kind IN ('milestone_reached', 'milestone_reopened')) AS milestones,
           (SELECT COALESCE(jsonb_agg(jsonb_build_object('task_id', c.task_id, 'title', c.title, 'kind', c.kind, 'author_type', c.author_type,
                     'author', COALESCE(c.author_name, public.project_person_name(c.author_id), c.author_type),
                     'body', left(c.body, 280), 'at', c.created_at) ORDER BY c.created_at), '[]'::jsonb)
              FROM cm c WHERE c.project_id = proj.id) AS comments,
           (SELECT COALESCE(sum(h.hours), 0) FROM hrs h WHERE h.project_id = proj.id) AS hours_total,
           (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', h.person_name, 'hours', h.hours) ORDER BY h.hours DESC), '[]'::jsonb)
              FROM hrs h WHERE h.project_id = proj.id) AS hours_by_person
      FROM proj
  ), digest AS (
    SELECT per.*,
           jsonb_build_object(
             'created', jsonb_array_length(created), 'completed', jsonb_array_length(completed),
             'reopened', jsonb_array_length(reopened), 'moved', jsonb_array_length(moved),
             'reprioritised', jsonb_array_length(reprioritised), 'reassigned', jsonb_array_length(reassigned),
             'rescheduled', jsonb_array_length(rescheduled), 'renamed', jsonb_array_length(renamed),
             'progressed', jsonb_array_length(progressed), 'deleted', jsonb_array_length(deleted),
             'dependencies', jsonb_array_length(dependencies), 'milestones', jsonb_array_length(milestones),
             'comments', jsonb_array_length(comments), 'hours', hours_total) AS counts,
           (jsonb_array_length(created) + jsonb_array_length(completed) + jsonb_array_length(reopened) + jsonb_array_length(moved)
            + jsonb_array_length(reprioritised) + jsonb_array_length(reassigned) + jsonb_array_length(rescheduled) + jsonb_array_length(renamed)
            + jsonb_array_length(progressed) + jsonb_array_length(deleted) + jsonb_array_length(dependencies) + jsonb_array_length(milestones)
            + jsonb_array_length(comments)) > 0 OR hours_total > 0 AS changed
      FROM per
  )
  SELECT
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
               'project_id', r.project_id, 'name', r.name, 'sort_order', r.sort_order, 'is_active', r.is_active,
               'history_from', r.history_from,
               -- Partiell bara när fönstret öppnar före liggaren OCH projektet fanns då:
               -- ett projekt fött efter starten har hela sin historia.
               'coverage', CASE WHEN v_started IS NOT NULL AND v_since < v_started AND r.project_created_at < v_started THEN 'partial' ELSE 'full' END,
               'counts', r.counts,
               'created', r.created, 'completed', r.completed, 'reopened', r.reopened, 'moved', r.moved,
               'reprioritised', r.reprioritised, 'reassigned', r.reassigned, 'rescheduled', r.rescheduled,
               'renamed', r.renamed, 'progressed', r.progressed, 'deleted', r.deleted,
               'dependencies', r.dependencies, 'milestones', r.milestones, 'comments', r.comments,
               'hours', jsonb_build_object('total', r.hours_total, 'by_person', r.hours_by_person))
               ORDER BY r.sort_order NULLS LAST, r.name)
       FROM digest r WHERE r.changed OR p_project_id IS NOT NULL), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('project_id', r.project_id, 'name', r.name) ORDER BY r.sort_order NULLS LAST, r.name)
       FROM digest r WHERE NOT r.changed AND p_project_id IS NULL AND r.is_active IS DISTINCT FROM false), '[]'::jsonb)
    INTO v_projects, v_quiet;

  RETURN jsonb_build_object(
    'success', true,
    'since', v_since, 'until', v_until,
    'ledger_started_at', v_started,
    'projects', v_projects,
    'quiet', v_quiet,
    'note', 'Changes are read from the task ledger (project_task_events), which every writer feeds. '
         || 'coverage = partial means the window opens before this project''s history begins: before history_from only task creation and completion are known, '
         || 'so an empty list there means "not recorded", not "nothing happened". After history_from, what is not listed did not happen. '
         || 'Comments and hours are read from their own tables. Projects come in the team order; quiet lists the active projects with no change at all.');
END;
$function$;

DO $grants$
DECLARE f text;
BEGIN
  FOR f IN SELECT unnest(ARRAY[
    'public.project_task_events_are_a_ledger()',
    'public.project_event_actor_kind()',
    'public.project_tasks_record_events()',
    'public.project_task_dependencies_record_events()',
    'public.project_milestones_record_events()',
    'public.project_person_name(uuid)',
    'public.project_changes(uuid, timestamptz, timestamptz)'
  ]) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END
$grants$;
REVOKE ALL ON FUNCTION public.project_person_name(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_person_name(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.project_tasks_record_events() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_tasks_record_events() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.project_task_dependencies_record_events() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_task_dependencies_record_events() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.project_milestones_record_events() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_milestones_record_events() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.project_changes(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_changes(uuid, timestamptz, timestamptz) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- Beviset
-- ─────────────────────────────────────────────────────────────────────────
DO $proof$
DECLARE
  v_p uuid; v_q uuid; t1 uuid; t2 uuid; m1 uuid; v_t0 timestamptz; v_r jsonb; v_row jsonb; v_n int;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    -- now() står stilla inom transaktionen: allt beviset skriver stämplas med det.
    v_t0 := now() - interval '1 second';
    INSERT INTO public.projects (name, is_active, visibility) VALUES ('Proof 130000 P', true, 'shared') RETURNING id INTO v_p;
    INSERT INTO public.projects (name, is_active, visibility) VALUES ('Proof 130000 Q', true, 'shared') RETURNING id INTO v_q;
    INSERT INTO public.project_tasks (project_id, title, status) VALUES (v_p, 'Write the brief', 'todo') RETURNING id INTO t1;
    INSERT INTO public.project_tasks (project_id, title, status) VALUES (v_p, 'Review the brief', 'todo') RETURNING id INTO t2;
    INSERT INTO public.project_task_dependencies (task_id, depends_on_task_id) VALUES (t2, t1);
    UPDATE public.project_tasks SET status = 'in_progress', priority = 'urgent' WHERE id = t1;
    UPDATE public.project_tasks SET status = 'done' WHERE id = t1;
    UPDATE public.project_tasks SET due_date = current_date + 3 WHERE id = t2;
    INSERT INTO public.project_milestones (project_id, name) VALUES (v_p, 'Brief approved') RETURNING id INTO m1;
    UPDATE public.project_milestones SET is_reached = true, reached_at = now() WHERE id = m1;
    INSERT INTO public.project_task_comments (task_id, project_id, body, kind, author_type, author_name)
      VALUES (t1, v_p, 'Waiting for legal', 'question', 'person', 'Proof');
    DELETE FROM public.project_tasks WHERE id = t2;

    -- Varje skrivning blev en rad — och pekar på rätt uppgift, med namn.
    SELECT count(*) INTO v_n FROM public.project_task_events WHERE project_id = v_p AND NOT backfilled;
    -- created×2, dependency_added, status, priority, status(done), due_date, milestone_reached, deleted = 9
    IF v_n <> 9 THEN RAISE EXCEPTION 'proof failed: expected 9 events, got %', v_n; END IF;

    v_r := public.project_changes(NULL, v_t0, now() + interval '1 second');
    IF NOT (v_r->>'success')::boolean THEN RAISE EXCEPTION 'proof failed: %', v_r; END IF;
    SELECT p INTO v_row FROM jsonb_array_elements(v_r->'projects') p WHERE (p->>'project_id')::uuid = v_p;
    IF v_row IS NULL THEN RAISE EXCEPTION 'proof failed: the changed project is missing → %', v_r; END IF;
    IF (v_row->'counts'->>'created')::int <> 2 OR (v_row->'counts'->>'completed')::int <> 1
       OR (v_row->'counts'->>'moved')::int <> 1 OR (v_row->'counts'->>'reprioritised')::int <> 1
       OR (v_row->'counts'->>'rescheduled')::int <> 1 OR (v_row->'counts'->>'deleted')::int <> 1
       OR (v_row->'counts'->>'dependencies')::int <> 1 OR (v_row->'counts'->>'milestones')::int <> 1
       OR (v_row->'counts'->>'comments')::int <> 1 THEN
      RAISE EXCEPTION 'proof failed: counts → %', v_row->'counts';
    END IF;
    IF v_row->'deleted'->0->>'title' <> 'Review the brief' THEN
      RAISE EXCEPTION 'proof failed: a deleted task should keep its name → %', v_row->'deleted';
    END IF;
    IF v_row->>'coverage' <> 'full' THEN
      RAISE EXCEPTION 'proof failed: a project born after the ledger started has full coverage → %', v_row->>'coverage';
    END IF;
    -- Det lugna projektet namnges som lugnt, inte utelämnas.
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_r->'quiet') q WHERE (q->>'project_id')::uuid = v_q) THEN
      RAISE EXCEPTION 'proof failed: the quiet project is not named → %', v_r->'quiet';
    END IF;
    -- Fönstret håller: ett "sedan nu" ser ingenting.
    v_r := public.project_changes(v_p, now() + interval '1 second', now() + interval '2 seconds');
    IF (v_r->'projects'->0->'counts'->>'created')::int <> 0 THEN
      RAISE EXCEPTION 'proof failed: an empty window should list nothing → %', v_r->'projects'->0->'counts';
    END IF;

    -- Posten är orubblig.
    BEGIN
      UPDATE public.project_task_events SET new_value = 'todo' WHERE project_id = v_p AND kind = 'status' AND new_value = 'done';
      RAISE EXCEPTION 'proof failed: an event was edited';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      DELETE FROM public.project_task_events WHERE project_id = v_p;
      RAISE EXCEPTION 'proof failed: an event was deleted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    -- …men projektets historia följer projektet i graven.
    DELETE FROM public.projects WHERE id = v_p;
    IF EXISTS (SELECT 1 FROM public.project_task_events WHERE project_id = v_p) THEN
      RAISE EXCEPTION 'proof failed: a deleted project left its events behind';
    END IF;

    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'proof passed: every task change is a ledger row, project_changes reads them by window with names kept, quiet projects are named, and the ledger refuses edits.';
END
$proof$;
