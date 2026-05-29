CREATE TABLE IF NOT EXISTS public.outbound_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL,
  status text NOT NULL,
  provider text,
  simulated boolean NOT NULL DEFAULT false,
  recipient text NOT NULL,
  subject text,
  body_html text,
  body_text text,
  source text,
  related_entity_type text,
  related_entity_id uuid,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_outbound_comm_created ON public.outbound_communications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbound_comm_channel_status ON public.outbound_communications (channel, status);
CREATE INDEX IF NOT EXISTS idx_outbound_comm_recipient ON public.outbound_communications (recipient);

GRANT SELECT ON public.outbound_communications TO authenticated;
GRANT ALL ON public.outbound_communications TO service_role;

ALTER TABLE public.outbound_communications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read outbound communications" ON public.outbound_communications;
CREATE POLICY "admins read outbound communications"
ON public.outbound_communications
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));