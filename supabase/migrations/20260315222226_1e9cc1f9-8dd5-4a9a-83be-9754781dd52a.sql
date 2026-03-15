
-- Atomic Task Checkout: locking on agent_objectives
ALTER TABLE public.agent_objectives ADD COLUMN IF NOT EXISTS locked_by text DEFAULT NULL;
ALTER TABLE public.agent_objectives ADD COLUMN IF NOT EXISTS locked_at timestamptz DEFAULT NULL;

-- Token Tracking: on agent_activity
ALTER TABLE public.agent_activity ADD COLUMN IF NOT EXISTS token_usage jsonb DEFAULT NULL;
