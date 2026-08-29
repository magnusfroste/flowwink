-- Lägesbilden: saldot till liggaren (Magnus 2026-08-29).
--
-- Aktiviteterna är huvudboken; ingen läser huvudboken, man läser saldot. En
-- säljare med tjugo leads ska skumma tjugo stycken prosa, inte sextio
-- anteckningar. `leads.ai_summary` fanns redan — renderad på tre ytor, skriven
-- av ingenting (0 av 4 rader på optic) — så fältet får äntligen sin skrivare.
--
-- Provenienskolumnerna är inte pynt. En säljhuvudbok är per definition
-- ofullständig: samtal sker i korridorer och telefoner. Ett saldo som ser
-- auktoritativt ut men saknar poster är farligare än inget saldo, så
-- lägesbilden bär alltid VAD den vilar på — antal poster och till och med
-- vilken tidpunkt — och ytan visar det bredvid texten.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ai_summary_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_summary_basis jsonb;

COMMENT ON COLUMN public.leads.ai_summary_basis IS
  'What the standing summary rests on: {entries, through, model}. A summary without its basis is an assertion, not a report.';

NOTIFY pgrst, 'reload schema';
