-- Prospect är inte lead (Magnus 2026-08-29, "soptippen"):
--
-- prospect_research skrev in HELA Hunter-batchen som status='lead' — man går
-- vidare med ett par, resten dränker Contacts-vyn. Nya statusvärdet 'prospect'
-- är för-leadet: prospekteringsfynd landar där, syns i en egen triagevy, och
-- blir lead först när någon väljer att gå vidare (promote). Pipeline, All
-- Contacts och statistiken räknar inte prospects som kontakter.
--
-- Enum-värdet läggs FÖRE 'lead' (livscykelordning). ADD VALUE IF NOT EXISTS
-- är idempotent; värdet ANVÄNDS aldrig i denna migration (PG-regeln om nya
-- enum-värden i samma transaktion). sync_lead_stage-triggern är ofarlig:
-- 'prospect' saknar pipeline-stage, uppslaget ger NULL och stage_id förblir
-- tomt — prospects existerar utanför pipelinen, vilket är hela poängen.

ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'prospect' BEFORE 'lead';
