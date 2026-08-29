-- Prospektets proveniens (Magnus 2026-08-29→30).
--
-- "När jag körde en research och fick Lisa som lead — så står hon inte på
-- admin som körde researchen. Är det systemet som kör researchen?"
--
-- Nej. En människa bad om den; agenten utförde den. Det är två fakta, och de
-- har varsin kolumn — samma modell som wikin och som projekten fick:
--   created_by        vem som bad om researchen (proveniens, oföränderlig)
--   created_by_agent  vilken agent som gjorde jobbet
--   assigned_to       ansvar — och det börjar när någon BEFORDRAR prospektet
--
-- Att låta researchen tilldela ägare vore fel: hela poängen med triagen (#330)
-- är att fyndet ännu inte är någons. Men "vem bad om detta" ska aldrig vara
-- okänt, och en tom created_by sa tidigare både "systemet" och "vi vet inte".
--
-- Idempotent + forward-daterad.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS created_by_agent text,
  ADD COLUMN IF NOT EXISTS updated_by_agent text;

COMMENT ON COLUMN public.leads.created_by_agent IS
  'Which agent created this row, when one did. Distinct from created_by (the human who asked) and from assigned_to (who is accountable — set on promotion).';

NOTIFY pgrst, 'reload schema';
