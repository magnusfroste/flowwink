-- Kapacitetsrapporten sa "Unknown" om alla.
--
-- Namnet hämtades ENBART ur employees.user_id — HR-registrets koppling mellan
-- en anställd och ett inloggningskonto. Den kopplingen är tom på varje instans
-- vi driver (optic: 1 anställd, 0 med user_id; resta: 0 anställda), så rapporten
-- svarade "Unknown har 57 öppna uppgifter" i samma stund som fältet den bygger
-- på äntligen gick att fylla i (#518).
--
-- Samma klass som assigned_to självt: en rapport som hänger på ett led ingen
-- fyller i. Profilen är däremot alltid där — den ÄR kontot, och utan konto kan
-- ingen tilldelas något. Så: employees.name när HR har den, annars profilens
-- namn, annars e-posten, och 'Unknown' först när ingenting finns kvar att visa.
--
-- Idempotent: CREATE OR REPLACE, oförändrad signatur och returform.

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
      -- HR:s namn först när kopplingen finns, annars kontots eget.
      COALESCE(NULLIF(btrim(e.name), ''), NULLIF(btrim(pr.full_name), ''), NULLIF(btrim(pr.email), '')) AS person_name,
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
    LEFT JOIN public.profiles pr ON pr.id = p.user_id
  )
  SELECT jsonb_build_object(
    'success', true,
    'project_id', p_project_id,
    'window_weeks', GREATEST(COALESCE(p_weeks,4),1),
    'capacity_hours_per_week', p_capacity_hours_per_week,
    'resources', COALESCE(jsonb_agg(jsonb_build_object(
      'user_id', s.user_id,
      'name', COALESCE(s.person_name, 'Unknown'),
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

-- Bevisar sig själv varje gång den appliceras: en rapport som namnger en person
-- ur profilen även när HR-kopplingen saknas. Kör bara där det finns någon att
-- namnge — en jungfrulig instans har inga tilldelade uppgifter.
DO $$
DECLARE v_name text; v_uid uuid;
BEGIN
  SELECT t.assigned_to INTO v_uid
    FROM public.project_tasks t
    JOIN public.profiles pr ON pr.id = t.assigned_to
   WHERE t.assigned_to IS NOT NULL AND t.status::text <> 'done'
     AND COALESCE(NULLIF(btrim(pr.full_name), ''), NULLIF(btrim(pr.email), '')) IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.user_id = t.assigned_to AND btrim(e.name) <> '')
   LIMIT 1;

  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT r->>'name' INTO v_name
    FROM jsonb_array_elements(public.resource_capacity_report() -> 'resources') r
   WHERE (r->>'user_id')::uuid = v_uid;

  IF v_name IS NULL OR v_name = 'Unknown' THEN
    RAISE EXCEPTION 'resource_capacity_report namnger inte en tilldelad person utan HR-koppling (fick %)', COALESCE(v_name, '<ingen rad>');
  END IF;
END $$;
