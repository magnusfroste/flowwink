
ALTER TABLE public.support_agents
  ADD COLUMN IF NOT EXISTS voice_routing_mode text NOT NULL DEFAULT 'both';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_agents_voice_routing_mode_check'
  ) THEN
    ALTER TABLE public.support_agents
      ADD CONSTRAINT support_agents_voice_routing_mode_check
      CHECK (voice_routing_mode IN ('softphone','mobile','both'));
  END IF;
END $$;
