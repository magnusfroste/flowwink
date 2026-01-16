-- Allow public read access to support_agents for chat widget to display agent info
CREATE POLICY "Public can view agent user_id for chat display"
ON public.support_agents
FOR SELECT
USING (true);