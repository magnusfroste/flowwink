-- Restrict agent_objectives SELECT policy to authenticated role only (was leaking to anon)
DROP POLICY IF EXISTS "Authenticated can view objectives" ON public.agent_objectives;

CREATE POLICY "Authenticated can view objectives"
ON public.agent_objectives
FOR SELECT
TO authenticated
USING (true);