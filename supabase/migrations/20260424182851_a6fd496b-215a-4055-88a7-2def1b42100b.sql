CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.clawable_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  peer_id UUID REFERENCES public.a2a_peers(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New session',
  thread_key TEXT NOT NULL DEFAULT 'main',
  agent_id TEXT,
  model TEXT NOT NULL DEFAULT 'openclaw',
  last_response_id TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.clawable_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage clawable sessions" ON public.clawable_sessions;
CREATE POLICY "Admins manage clawable sessions"
  ON public.clawable_sessions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.clawable_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.clawable_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  response_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clawable_messages_session ON public.clawable_messages(session_id, created_at);

ALTER TABLE public.clawable_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage clawable messages" ON public.clawable_messages;
CREATE POLICY "Admins manage clawable messages"
  ON public.clawable_messages FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_clawable_sessions_updated_at ON public.clawable_sessions;
CREATE TRIGGER update_clawable_sessions_updated_at
  BEFORE UPDATE ON public.clawable_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();