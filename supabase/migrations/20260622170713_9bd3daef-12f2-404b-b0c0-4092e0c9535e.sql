
-- Voice-modul: samtalshistorik + agent-utökningar
-- Provider-agnostiskt schema (elks46, twilio, telnyx, ...)

-- Enum för samtalsstatus
DO $$ BEGIN
  CREATE TYPE public.voice_call_status AS ENUM (
    'ringing','answered','missed','voicemail','completed','failed','busy','no_answer'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.voice_call_direction AS ENUM ('inbound','outbound');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.voice_callback_status AS ENUM ('none','pending','scheduled','completed','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Huvudtabell
CREATE TABLE IF NOT EXISTS public.voice_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,                       -- 'elks46' | 'twilio' | ...
  provider_call_id TEXT,                        -- providerns eget ID (CallSid / callid)
  direction public.voice_call_direction NOT NULL,
  status public.voice_call_status NOT NULL DEFAULT 'ringing',
  from_number TEXT NOT NULL,                    -- A-nummer (E.164)
  to_number TEXT NOT NULL,                      -- B-nummer (E.164)
  agent_id UUID REFERENCES public.support_agents(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  recording_url TEXT,
  recording_duration_seconds INTEGER,
  transcript TEXT,
  voicemail BOOLEAN NOT NULL DEFAULT false,
  callback_status public.voice_callback_status NOT NULL DEFAULT 'none',
  callback_scheduled_at TIMESTAMPTZ,
  callback_completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_call_id)
);

CREATE INDEX IF NOT EXISTS idx_voice_calls_status ON public.voice_calls(status);
CREATE INDEX IF NOT EXISTS idx_voice_calls_agent ON public.voice_calls(agent_id);
CREATE INDEX IF NOT EXISTS idx_voice_calls_callback ON public.voice_calls(callback_status) WHERE callback_status IN ('pending','scheduled');
CREATE INDEX IF NOT EXISTS idx_voice_calls_started ON public.voice_calls(started_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_calls TO authenticated;
GRANT ALL ON public.voice_calls TO service_role;

ALTER TABLE public.voice_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all voice calls"
  ON public.voice_calls FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Agents read their own calls"
  ON public.voice_calls FOR SELECT
  TO authenticated
  USING (
    agent_id IN (SELECT id FROM public.support_agents WHERE user_id = auth.uid())
  );

CREATE POLICY "Agents update their own calls"
  ON public.voice_calls FOR UPDATE
  TO authenticated
  USING (
    agent_id IN (SELECT id FROM public.support_agents WHERE user_id = auth.uid())
  );

-- updated_at trigger
CREATE TRIGGER set_voice_calls_updated_at
  BEFORE UPDATE ON public.voice_calls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- support_agents utökning för voice
ALTER TABLE public.support_agents
  ADD COLUMN IF NOT EXISTS voice_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voice_sip_username TEXT,
  ADD COLUMN IF NOT EXISTS voice_sip_password TEXT,    -- providerns "secret"-fält (kryptering kan läggas på senare via pgcrypto)
  ADD COLUMN IF NOT EXISTS voice_sip_uri TEXT,         -- ex 4600100100@voip.46elks.com
  ADD COLUMN IF NOT EXISTS voice_mobile_number TEXT,   -- E.164 fallback för forward-to-mobile
  ADD COLUMN IF NOT EXISTS voice_provider TEXT;        -- vilken adapter agenten är registrerad mot

-- Realtime för voice_calls så admin-UI får live missed-call-uppdateringar
ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_calls;
