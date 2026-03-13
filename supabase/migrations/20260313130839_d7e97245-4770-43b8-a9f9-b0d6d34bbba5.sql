
-- A2A Federation enums
CREATE TYPE public.a2a_peer_status AS ENUM ('active', 'paused', 'revoked');
CREATE TYPE public.a2a_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE public.a2a_activity_status AS ENUM ('success', 'error', 'pending');

-- Peer connections table
CREATE TABLE public.a2a_peers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  outbound_token text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  inbound_token_hash text,
  status a2a_peer_status NOT NULL DEFAULT 'active',
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_seen_at timestamptz,
  request_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.a2a_peers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage peers" ON public.a2a_peers
  FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can read peers for token validation" ON public.a2a_peers
  FOR SELECT TO public
  USING (true);

-- Activity log table
CREATE TABLE public.a2a_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  peer_id uuid NOT NULL REFERENCES public.a2a_peers(id) ON DELETE CASCADE,
  direction a2a_direction NOT NULL,
  skill_name text,
  input jsonb DEFAULT '{}'::jsonb,
  output jsonb DEFAULT '{}'::jsonb,
  status a2a_activity_status NOT NULL DEFAULT 'pending',
  duration_ms integer,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.a2a_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view activity" ON public.a2a_activity
  FOR SELECT TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert activity" ON public.a2a_activity
  FOR INSERT TO public
  WITH CHECK (true);

CREATE POLICY "System can update activity" ON public.a2a_activity
  FOR UPDATE TO public
  USING (true);

-- Updated_at trigger
CREATE TRIGGER update_a2a_peers_updated_at
  BEFORE UPDATE ON public.a2a_peers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
