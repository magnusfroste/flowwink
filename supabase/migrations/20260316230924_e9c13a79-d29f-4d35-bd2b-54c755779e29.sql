-- FlowPilot Briefings table for in-app notifications + email digest
CREATE TABLE IF NOT EXISTS public.flowpilot_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'daily_digest',
  title text NOT NULL,
  summary text NOT NULL,
  sections jsonb NOT NULL DEFAULT '[]',
  metrics jsonb NOT NULL DEFAULT '{}',
  action_items jsonb NOT NULL DEFAULT '[]',
  read_at timestamp with time zone,
  emailed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.flowpilot_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage briefings" ON public.flowpilot_briefings
  FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert briefings" ON public.flowpilot_briefings
  FOR INSERT TO public WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_briefings_created ON public.flowpilot_briefings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_briefings_unread ON public.flowpilot_briefings(read_at) WHERE read_at IS NULL;