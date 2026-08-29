-- Uppgiften kunde inte skapas: record "new" has no field "owner_id"
-- (Magnus 2026-08-30, live på optic).
--
-- project_stamp_hands (#338) delas av projects och project_tasks. Bara
-- projects har owner_id, så raden skyddades med
--   IF TG_TABLE_NAME = 'projects' AND NEW.owner_id IS NULL THEN
-- men PL/pgSQL skickar hela villkoret som ETT SQL-uttryck till planeraren.
-- Fältet slås alltså upp oavsett vilken tabell som triggade — och på
-- project_tasks finns det inte. Ingen kortslutning räddar en fältreferens som
-- måste planeras.
--
-- Nästlad IF i stället: PL/pgSQL planerar varje sats först när den NÅS, så den
-- inre satsen kompileras aldrig för uppgifter.
--
-- ── Varför det inte upptäcktes förrän i drift ────────────────────────────────
-- Jag testade insert:en live innan #338 gick ut — men som `postgres`, där
-- auth.uid() är NULL och funktionen returnerar tidigt, FÖRE den trasiga raden.
-- Testet körde alltså den enda gren som inte kan smälla. Reproducerad först med
-- SET LOCAL request.jwt.claims, alltså som en inloggad människa.
--
-- Idempotent + forward-daterad.

CREATE OR REPLACE FUNCTION public.project_stamp_hands()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Under service_role är auth.uid() NULL: en agent gör inte anspråk på
    -- vare sig författarskap eller ansvar.
    IF v_uid IS NULL THEN RETURN NEW; END IF;
    IF NEW.created_by IS NULL THEN NEW.created_by := v_uid; END IF;
    -- Nästlad, inte AND: fältet får bara nämnas i en sats som aldrig nås för
    -- en tabell som saknar det.
    IF TG_TABLE_NAME = 'projects' THEN
      IF NEW.owner_id IS NULL THEN
        NEW.owner_id := v_uid;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  NEW.updated_by := COALESCE(v_uid, OLD.updated_by);
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
