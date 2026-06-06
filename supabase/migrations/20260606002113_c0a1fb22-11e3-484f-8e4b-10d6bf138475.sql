
CREATE TABLE IF NOT EXISTS public.auth_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  ip_address text,
  user_agent text,
  device_type text,
  browser text,
  country text,
  city text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.auth_events TO authenticated;
GRANT ALL ON public.auth_events TO service_role;

ALTER TABLE public.auth_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view auth events" ON public.auth_events;
CREATE POLICY "Admins can view auth events"
  ON public.auth_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS auth_events_created_at_idx ON public.auth_events (created_at DESC);
CREATE INDEX IF NOT EXISTS auth_events_user_id_idx ON public.auth_events (user_id);
CREATE INDEX IF NOT EXISTS auth_events_event_type_idx ON public.auth_events (event_type);
