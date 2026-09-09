-- Takten är plattformens.
--
-- cron_cadence (20260906170000) föddes med REVOKE/GRANT men utan
-- radnivåsäkerhet; Supabases linter flaggade den som exponerad via API:t
-- (Lovables agent, dev, 2026-09-05). Tabellen läses av
-- performance_mode_status() (SECURITY DEFINER) och skrivs av migrationer —
-- ingen klient behöver den direkt. RLS på, en läspolicy för admin, ingen
-- skrivpolicy alls.
ALTER TABLE public.cron_cadence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cron cadence is the platform's — admins may read it" ON public.cron_cadence;
CREATE POLICY "cron cadence is the platform's — admins may read it" ON public.cron_cadence
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
