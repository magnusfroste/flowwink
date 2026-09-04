-- Ett mål en gång.
--
-- seedFlowPilotSoul() sår startmålen med "hoppa över om goal-texten finns".
-- Två bootstraps som kör samtidigt (mallinstall + FlowPilot-bootstrap på en
-- nyinstallation) läser båda en tom tabell och sår båda: nya liteit
-- (2026-09-05) föddes med varje startmål två gånger, och heartbeaten arbetar
-- då mot två identiska mål. En läs-sedan-skriv-kontroll i klienten kan inte
-- lova unikhet; det kan bara databasen. Insert-felet i seedern är redan
-- bara en varning, så det andra loppet förlorar tyst och rätt.
--
-- Dubbletter som redan finns städas först (den äldsta behålls — det är den
-- som hunnit få progress), annars vägrar indexet.

WITH d AS (
  SELECT id, row_number() OVER (PARTITION BY goal ORDER BY created_at, id) AS rn
    FROM public.agent_objectives
   WHERE status = 'active'
)
DELETE FROM public.agent_objectives o
 USING d
 WHERE o.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS agent_objectives_one_active_goal
  ON public.agent_objectives (goal)
  WHERE status = 'active';
COMMENT ON INDEX public.agent_objectives_one_active_goal IS
  'One active objective per goal text — the seeder''s check-then-insert cannot promise this across two concurrent bootstraps; the index can.';
