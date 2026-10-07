-- Checklistan är alltid punkter.
--
-- project_tasks.checklist är [{id, text, done, done_at, done_by}] — det är
-- vad kortet ritar och kryssar. Men kolumnen är jsonb och skrivaren
-- (db:project_tasks) skriver det den får. En extern agent på optic skickade
-- checklistor som ren text, ["Fastställ bladstruktur", …]: 58 punkter på 19
-- uppgifter (2026-10-07), bland dem Produktbladet. Kortet ritade dem som tomma
-- rader utan text, och en tom rad går inte att kryssa — item.id saknas.
-- Ingen fick något fel; punkterna fanns bara inte för den som tittade.
--
-- Rättelsen sitter vid datan, inte hos en skrivare: en BEFORE-trigger formar
-- varje checklista till punkter, vem som än skriver (agent, UI, import, SQL).
--   * en sträng blir en okryssad punkt; "- [x] Text" blir en kryssad
--   * en sträng med radbrytningar blir en punkt per rad
--   * ett objekt behåller sina fält; text/done läses även ur title/label/name
--     och checked/completed, och saknat id får ett
--   * tomma punkter och null faller bort
-- När en agent skickar tillbaka listan som text igen behåller en punkt med
-- samma text sitt id och sitt kryss — annars skulle varje omskrivning
-- avkryssa allt någon gjort.
--
-- Triggern heter project_tasks_normalize_checklist så att den går FÖRE
-- stamp_movement och record_events (samma tidpunkt körs i namnordning):
-- de räknar ikryssade punkter och ska räkna på den formade listan.
--
-- Reparationen formar de rader som redan finns. Antalet ikryssade punkter
-- ändras inte (text → okryssad punkt), så varken moved_at eller
-- händelseliggaren rör sig; updated_at stiger, för raden ändrades.
--
-- Idempotent: CREATE OR REPLACE, DROP TRIGGER IF EXISTS, och formen av en
-- formad lista är samma lista.

CREATE OR REPLACE FUNCTION public.normalize_task_checklist(p_new jsonb, p_old jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path TO 'public'
AS $$
DECLARE
  v_in jsonb;
  v_out jsonb := '[]'::jsonb;
  v_el jsonb;
  v_raw text;
  v_text text;
  v_done boolean;
  v_id text;
  v_prev jsonb;
  v_seen text[] := '{}';
  v_old jsonb := CASE WHEN jsonb_typeof(p_old) = 'array' THEN p_old ELSE '[]'::jsonb END;
BEGIN
  IF p_new IS NULL OR jsonb_typeof(p_new) = 'null' THEN
    RETURN '[]'::jsonb;
  END IF;

  v_in := CASE jsonb_typeof(p_new)
    WHEN 'array' THEN p_new
    WHEN 'string' THEN (SELECT COALESCE(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
                          FROM regexp_split_to_table(p_new #>> '{}', E'\\r?\\n') l)
    ELSE jsonb_build_array(p_new)
  END;

  FOR v_el IN SELECT e FROM jsonb_array_elements(v_in) e LOOP
    v_prev := NULL;

    IF jsonb_typeof(v_el) = 'object' THEN
      v_text := btrim(COALESCE(v_el->>'text', v_el->>'title', v_el->>'label', v_el->>'name', ''));
      CONTINUE WHEN v_text = '';
      v_done := lower(COALESCE(v_el->>'done', v_el->>'checked', v_el->>'completed', 'false'))
                IN ('true', 't', 'yes', '1', 'x', 'done');
      v_id := NULLIF(btrim(COALESCE(v_el->>'id', '')), '');
      IF v_id IS NULL OR v_id = ANY (v_seen) THEN v_id := gen_random_uuid()::text; END IF;
      v_out := v_out || jsonb_build_array(
        (v_el - 'title' - 'label' - 'name' - 'checked' - 'completed')
          || jsonb_build_object('id', v_id, 'text', v_text, 'done', v_done));

    ELSIF jsonb_typeof(v_el) IN ('string', 'number') THEN
      v_raw := v_el #>> '{}';
      v_done := v_raw ~ '^\s*([-*•]\s*)?\[[xX]\]';
      v_text := btrim(regexp_replace(v_raw, '^\s*([-*•]\s*)?(\[[ xX]?\]\s*)?', ''));
      CONTINUE WHEN v_text = '';
      -- Samma text som en befintlig punkt: det är den punkten, med sitt id och kryss.
      SELECT o INTO v_prev
        FROM jsonb_array_elements(v_old) o
       WHERE jsonb_typeof(o) = 'object'
         AND btrim(COALESCE(o->>'text', '')) = v_text
         AND NOT (COALESCE(o->>'id', '') = ANY (v_seen))
       LIMIT 1;
      IF v_prev IS NOT NULL AND NULLIF(v_prev->>'id', '') IS NOT NULL THEN
        v_id := v_prev->>'id';
        v_out := v_out || jsonb_build_array(v_prev || jsonb_build_object(
          'text', v_text,
          'done', v_done OR lower(COALESCE(v_prev->>'done', 'false')) IN ('true', 't')));
      ELSE
        v_id := gen_random_uuid()::text;
        v_out := v_out || jsonb_build_array(jsonb_build_object('id', v_id, 'text', v_text, 'done', v_done));
      END IF;

    ELSE
      CONTINUE; -- null, boolean, nested array: no item to show
    END IF;

    v_seen := v_seen || v_id;
  END LOOP;

  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION public.normalize_task_checklist(jsonb, jsonb) IS
  'Shapes a task checklist into [{id, text, done, …}] items: strings become unticked items ("[x] …" ticked), objects keep their fields and get an id; a re-sent string keeps the id and tick of the old item with the same text.';

CREATE OR REPLACE FUNCTION public.project_tasks_normalize_checklist()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.checklist IS NOT DISTINCT FROM OLD.checklist THEN
    RETURN NEW;
  END IF;
  NEW.checklist := public.normalize_task_checklist(
    NEW.checklist, CASE WHEN TG_OP = 'UPDATE' THEN OLD.checklist END);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS project_tasks_normalize_checklist ON public.project_tasks;
CREATE TRIGGER project_tasks_normalize_checklist
  BEFORE INSERT OR UPDATE ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.project_tasks_normalize_checklist();

-- Reparation: bara rader vars lista inte redan är punkter.
UPDATE public.project_tasks
   SET checklist = public.normalize_task_checklist(checklist)
 WHERE jsonb_typeof(checklist) <> 'array'
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(checklist) = 'array' THEN checklist ELSE '[]'::jsonb END) e
       WHERE jsonb_typeof(e) <> 'object'
          OR NULLIF(e->>'id', '') IS NULL
          OR NULLIF(btrim(COALESCE(e->>'text', '')), '') IS NULL
          OR jsonb_typeof(e->'done') IS DISTINCT FROM 'boolean');

NOTIFY pgrst, 'reload schema';
