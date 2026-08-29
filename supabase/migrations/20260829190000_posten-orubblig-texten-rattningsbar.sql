-- Aktivitetsloggen blir en redigerbar liggare (Magnus 2026-08-29).
--
-- Ramen: aktiviteterna är säljbearbetningens huvudbok — verifikat, inte
-- uppsatser, med `points` som löpande saldo. Bokföringens disciplin ger
-- oföränderlighet; dataskyddet kräver att en mening om en människa går att
-- rätta och att ta bort. Regeln som förenar dem:
--
--   POSTEN ÄR ORUBBLIG, TEXTEN ÄR RÄTTNINGSBAR.
--
-- Raden försvinner aldrig, dess plats i tiden ändras aldrig, dess typ och
-- poäng ändras aldrig — så kronologin är komplett och saldot kan inte
-- manipuleras i efterhand. Det som får ändras är den text en människa skrivit,
-- synligt (edited_at) och utan att den ersatta lydelsen går förlorad
-- (metadata.note_history). Att tömma texten är tillåtet — då står raden kvar
-- som gravsten, vilket är skillnaden mot att radera en post.
--
-- Före detta saknade tabellen både författare och ändringsstämpel, medan
-- RLS-policyn "Staff can manage lead_activities" tillät ALL: allt gick att
-- ändra av vem som helst utan spår, och ingenting gick att rätta av den som
-- skrev det. Precis bakvänt.
--
-- Idempotent + forward-daterad.

ALTER TABLE public.lead_activities
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS edited_by uuid;

CREATE OR REPLACE FUNCTION public.lead_activity_ledger_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old_note text;
  v_new_note text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Författaren stämplas som i ownership-on-create: den inloggade, aldrig
    -- en gissning. En agent kör som service_role utan auth.uid() och gör
    -- därför inte anspråk på författarskap — raden blir systemets.
    IF NEW.created_by IS NULL THEN NEW.created_by := v_uid; END IF;
    RETURN NEW;
  END IF;

  -- ── UPDATE: posten är orubblig ───────────────────────────────────────────
  -- Ett försök att ändra strukturen SMÄLLER i stället för att tyst backas —
  -- en anropare som tror sig ha flyttat en post ska få veta att den inte kan
  -- flyttas. Fel poäng eller fel typ rättas som i bokföringen: med en ny rad.
  IF NEW.lead_id    IS DISTINCT FROM OLD.lead_id
  OR NEW.type       IS DISTINCT FROM OLD.type
  OR NEW.points     IS DISTINCT FROM OLD.points
  OR NEW.created_at IS DISTINCT FROM OLD.created_at
  OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'lead_activities: the entry is immutable (lead, type, points, created_at, created_by) — correct it with a new entry';
  END IF;

  IF NEW.metadata IS NOT DISTINCT FROM OLD.metadata THEN
    RETURN NEW;
  END IF;

  -- ── Texten är rättningsbar — av den som skrev den ────────────────────────
  -- Rader från tiden före den här migrationen har created_by NULL: vi vet
  -- inte vem som skrev dem, så bara en admin får röra dem.
  IF NOT (
       auth.role() = 'service_role'
    OR (OLD.created_by IS NOT NULL AND OLD.created_by = v_uid)
    OR has_role(v_uid, 'admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'lead_activities: only the author or an admin may correct an entry';
  END IF;

  v_old_note := COALESCE(OLD.metadata->>'note', '');
  v_new_note := COALESCE(NEW.metadata->>'note', '');

  NEW.edited_at := now();
  NEW.edited_by := COALESCE(v_uid, OLD.edited_by);

  -- Den ersatta lydelsen bevaras. Rättelse ska vara spårbar, annars är den
  -- omskrivning av historien med ett annat namn.
  IF v_old_note <> v_new_note THEN
    NEW.metadata := jsonb_set(
      COALESCE(NEW.metadata, '{}'::jsonb),
      '{note_history}',
      COALESCE(OLD.metadata->'note_history', '[]'::jsonb) ||
      jsonb_build_array(jsonb_build_object(
        'note', v_old_note,
        'replaced_at', now(),
        'replaced_by', v_uid
      ))
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_activities_ledger_guard ON public.lead_activities;
CREATE TRIGGER lead_activities_ledger_guard
  BEFORE INSERT OR UPDATE ON public.lead_activities
  FOR EACH ROW EXECUTE FUNCTION public.lead_activity_ledger_guard();

NOTIFY pgrst, 'reload schema';
