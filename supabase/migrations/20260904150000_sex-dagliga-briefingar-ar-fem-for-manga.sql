-- ─────────────────────────────────────────────────────────────────────────────
-- Sex dagliga briefingar är fem för många
--
-- Observability-revisionen 2026-08-28 hittade sex ENABLADE 'Daily Briefing'-
-- automationer på autoversio, ackumulerade jun–aug, plus dubbla Weekly
-- Business Digest. Klassen: agent_automations har ingen unik nyckel utöver PK
-- på id, och varje skapande-/seedväg var i praktiken en obevakad INSERT —
-- agent-execute create var en ren insert, och seedvägarnas maybeSingle()-koll
-- ignorerade sitt fel så fort ett namn väl hade två rader (data=null → "finns
-- inte" → insert nummer tre, fyra, fem...).
--
-- Den här migrationen gör två saker, i ordning:
--   1. Städar befintliga dubbletter: per (name, skill_name) behålls den ÄLDSTA
--      raden; alla yngre enablade tvillingar disablas med skälet skrivet i
--      last_error (annonserat, inte tyst — admin-UI:t visar kolumnen).
--   2. Reser ett partiellt unikt index på (name, skill_name) WHERE enabled —
--      NULLS NOT DISTINCT så två (name, NULL)-rader också kolliderar. Partiellt
--      för att de disablade dubbletterna från steg 1 ska få finnas kvar som
--      revisionsspår. Från och med nu är "två aktiva automationer med samma
--      namn + skill" ett databasfel, inte en räkning som växer.
--
-- Applikationsvägarna uppdateras i samma commit till upsert-på-identitet
-- (re-asserterbar-seed-doktrinen); indexet är golvet under dem, inte vakten
-- i sig. Idempotent: omkörning no-op:ar (dubbletterna är redan disablade,
-- indexet finns redan).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Behåll äldsta, disabla resten (endast rader som är enablade — en rad en
--    operatör redan stängt av behåller sin egen last_error-historik).
WITH ranked AS (
  SELECT
    id,
    first_value(id) OVER w AS kept_id,
    row_number()    OVER w AS rn
  FROM public.agent_automations
  WINDOW w AS (
    PARTITION BY name, COALESCE(skill_name, '')
    ORDER BY created_at ASC, id ASC
  )
)
UPDATE public.agent_automations a
SET enabled     = false,
    next_run_at = NULL,
    last_error  = 'Disabled 2026-08-28: duplicate of automation ' || r.kept_id
                  || ' (same name + skill; the create/seed paths were not idempotent). '
                  || 'The oldest row was kept — re-enable this one only if that was wrong.',
    updated_at  = now()
FROM ranked r
WHERE a.id = r.id
  AND r.rn > 1
  AND a.enabled;

-- 2. Golvet: aldrig mer två AKTIVA automationer med samma identitet.
CREATE UNIQUE INDEX IF NOT EXISTS agent_automations_name_skill_enabled_key
  ON public.agent_automations (name, skill_name)
  NULLS NOT DISTINCT
  WHERE enabled;

COMMENT ON INDEX public.agent_automations_name_skill_enabled_key IS
  'Partial unique (name, skill_name) over ENABLED rows. Disabled duplicates from the 2026-08-28 dedupe remain as audit trail; re-enabling one against a living twin fails loudly instead of doubling the schedule.';
