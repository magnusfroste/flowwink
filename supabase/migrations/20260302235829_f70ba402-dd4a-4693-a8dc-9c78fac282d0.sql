
-- =============================================================================
-- Agent Skill Engine: Phase 1 Tables
-- =============================================================================

-- Scope enum for skills
CREATE TYPE public.agent_scope AS ENUM ('internal', 'external', 'both');

-- Category enum for skills
CREATE TYPE public.agent_skill_category AS ENUM ('content', 'crm', 'communication', 'automation', 'search', 'analytics');

-- Status enum for agent activity
CREATE TYPE public.agent_activity_status AS ENUM ('success', 'failed', 'pending_approval', 'approved', 'rejected');

-- Agent type enum
CREATE TYPE public.agent_type AS ENUM ('flowpilot', 'chat');

-- Memory category enum
CREATE TYPE public.agent_memory_category AS ENUM ('preference', 'context', 'fact');

-- =============================================================================
-- Table: agent_skills
-- =============================================================================
CREATE TABLE public.agent_skills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category agent_skill_category NOT NULL DEFAULT 'content',
  scope agent_scope NOT NULL DEFAULT 'internal',
  tool_definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  handler TEXT NOT NULL,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_skills ENABLE ROW LEVEL SECURITY;

-- Admins can manage skills
CREATE POLICY "Admins can manage skills"
  ON public.agent_skills FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Authenticated users can view enabled skills (needed for the agent to read tool definitions)
CREATE POLICY "Authenticated can view enabled skills"
  ON public.agent_skills FOR SELECT
  TO authenticated
  USING (enabled = true);

-- =============================================================================
-- Table: agent_memory
-- =============================================================================
CREATE TABLE public.agent_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  category agent_memory_category NOT NULL DEFAULT 'context',
  created_by agent_type NOT NULL DEFAULT 'flowpilot',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;

-- Admins can manage memory
CREATE POLICY "Admins can manage agent memory"
  ON public.agent_memory FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Authenticated can view memory (agent needs to read context)
CREATE POLICY "Authenticated can view agent memory"
  ON public.agent_memory FOR SELECT
  TO authenticated
  USING (true);

-- Edge functions can insert/update memory
CREATE POLICY "System can insert agent memory"
  ON public.agent_memory FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update agent memory"
  ON public.agent_memory FOR UPDATE
  USING (true);

-- =============================================================================
-- Table: agent_activity
-- =============================================================================
CREATE TABLE public.agent_activity (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent agent_type NOT NULL DEFAULT 'flowpilot',
  skill_id UUID REFERENCES public.agent_skills(id) ON DELETE SET NULL,
  skill_name TEXT,
  input JSONB DEFAULT '{}'::jsonb,
  output JSONB DEFAULT '{}'::jsonb,
  status agent_activity_status NOT NULL DEFAULT 'success',
  conversation_id UUID,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_activity ENABLE ROW LEVEL SECURITY;

-- Admins can view all activity
CREATE POLICY "Admins can view agent activity"
  ON public.agent_activity FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- System can insert activity (edge functions log actions)
CREATE POLICY "System can insert agent activity"
  ON public.agent_activity FOR INSERT
  WITH CHECK (true);

-- Admins can update activity (approve/reject pending actions)
CREATE POLICY "Admins can update agent activity"
  ON public.agent_activity FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create indexes for common queries
CREATE INDEX idx_agent_skills_scope ON public.agent_skills(scope) WHERE enabled = true;
CREATE INDEX idx_agent_skills_category ON public.agent_skills(category) WHERE enabled = true;
CREATE INDEX idx_agent_activity_agent ON public.agent_activity(agent, created_at DESC);
CREATE INDEX idx_agent_activity_status ON public.agent_activity(status) WHERE status = 'pending_approval';
CREATE INDEX idx_agent_memory_key ON public.agent_memory(key);
CREATE INDEX idx_agent_memory_category ON public.agent_memory(category);

-- Updated_at triggers
CREATE TRIGGER update_agent_skills_updated_at
  BEFORE UPDATE ON public.agent_skills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_agent_memory_updated_at
  BEFORE UPDATE ON public.agent_memory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
