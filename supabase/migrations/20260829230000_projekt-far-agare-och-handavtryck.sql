-- Projekt får ägare, och båda tabellerna får handavtryck (Magnus 2026-08-29).
--
-- Mätt före bygget på optic: 12 uppgifter, NOLL med ägare — därför visade
-- "Mine" i aktivitetsvyn ingenting. Filtret fungerade; det fanns bara ingen
-- data att filtrera på. Kontakterna räddades av ownership-on-create sedan
-- 2026-08-08; projekt och uppgifter hade aldrig fått motsvarande.
--
-- Tre frågor, tre fält (wiki_pages är plattformens förebild):
--   created_by  — proveniens. Vem förde in den. Oföränderlig.
--   owner_id    — ansvar. Vems är den NU. Föränderlig; det är den linsen läser.
--   updated_by  — sista handavtrycket. Vem rörde den sist, ihop med updated_at.
--
-- Skaparen blir ägare till PROJEKTET, men uppgifter tilldelas INTE automatiskt.
-- Det följer direkt av vad "Mina" ska betyda (Magnus val): tilldelade mig plus
-- OTILLDELAT i projekt jag äger. Tilldelade sig självt vid skapande fanns ingen
-- backlogg kvar att fånga upp — och en uppgift ingen tagit är ett riktigt och
-- användbart tillstånd.
--
-- Agentmarkörerna (created_by_agent/updated_by_agent) följer wikins konvention
-- och läggs till HÄR därför att de nu har en skrivare: den generiska
-- CRUD-motorn i agent-execute stämplar auditCtx.agent_type på varje db:-skrivning
-- (manage_project, manage_project_task går den vägen). En NULL created_by säger
-- bara "ingen inloggad människa" och blandar ihop "FlowPilot gjorde det" med
-- "vi vet inte" — för en kollega som ska bedöma om raden går att lita på är det
-- två helt olika fakta. Kolumn utan skrivare hade däremot varit samma spöke vi
-- grävde bort ur leads samma kväll.
--
-- Idempotent + forward-daterad.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS owner_id uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS created_by_agent text,
  ADD COLUMN IF NOT EXISTS updated_by_agent text;

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS created_by_agent text,
  ADD COLUMN IF NOT EXISTS updated_by_agent text;

COMMENT ON COLUMN public.projects.owner_id IS
  'Who is accountable for this project now. Defaults to the creator, changeable. The ownership lens reads this.';

-- Backfill: den som skapade projektet ansvarar för det tills någon annan tar
-- över. Rör bara rader utan ägare — en satt ägare är ett beslut.
UPDATE public.projects
   SET owner_id = created_by
 WHERE owner_id IS NULL AND created_by IS NOT NULL;

CREATE OR REPLACE FUNCTION public.project_stamp_hands()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Under service_role är auth.uid() NULL: en agent gör inte anspråk på
    -- vare sig författarskap eller ansvar. En oägd rad är synlig sanning, en
    -- felägd är en lögn med revisionsspår.
    IF v_uid IS NULL THEN RETURN NEW; END IF;
    IF NEW.created_by IS NULL THEN NEW.created_by := v_uid; END IF;
    IF TG_TABLE_NAME = 'projects' AND NEW.owner_id IS NULL THEN
      NEW.owner_id := v_uid;
    END IF;
    RETURN NEW;
  END IF;

  NEW.updated_by := COALESCE(v_uid, OLD.updated_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_stamp_hands ON public.projects;
CREATE TRIGGER projects_stamp_hands
  BEFORE INSERT OR UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.project_stamp_hands();

DROP TRIGGER IF EXISTS project_tasks_stamp_hands ON public.project_tasks;
CREATE TRIGGER project_tasks_stamp_hands
  BEFORE INSERT OR UPDATE ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.project_stamp_hands();

NOTIFY pgrst, 'reload schema';
