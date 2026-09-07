-- Seeden äger exponeringen.
--
-- Tre skrivare (browserns bootstrap, scripts/sync-skills.ts och
-- sync_skills_from_code) tvingade mcp_exposed=true på varje skill vid varje
-- sync. FlowPilots egna peer-comms-primitiv (a2a_*, openclaw_*,
-- dispatch_claw_mission, queue_beta_test) är inte verktyg för externa
-- operatörer, och vakten som skulle hålla dem oexponerade hade bara någonsin
-- läst en handredigerad rad på dev. Från och med denna deploy säger seeden
-- `mcp_exposed: false` och alla tre skrivare lyder. Denna migration rättar
-- fleeten en gång; sync håller den sedan.
--
-- Samma sak för bokföringens en-ratts-invariant: book_expense_report och
-- mark_expense_report_paid såddes med trust 'approve' utan staging — ett
-- faktum på två axlar, buggklassen från 2026-07. Seeden bär nu båda; raderna
-- rättas här. Endast ledger-perimetern kopplas — send_email m.fl. är
-- approve-utan-staging med flit.

UPDATE public.agent_skills
   SET mcp_exposed = false
 WHERE name IN ('a2a_chat','a2a_request','dispatch_claw_mission',
                'openclaw_exchange','openclaw_get_status','queue_beta_test')
   AND mcp_exposed = true;

UPDATE public.agent_skills
   SET requires_staging = true
 WHERE name IN ('book_expense_report','mark_expense_report_paid')
   AND trust_level = 'approve'
   AND requires_staging = false;
