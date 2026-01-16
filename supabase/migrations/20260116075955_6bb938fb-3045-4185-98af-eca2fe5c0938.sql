-- Support agents presence tracking
CREATE TABLE public.support_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'away', 'busy', 'offline')),
  current_conversations INTEGER NOT NULL DEFAULT 0,
  max_conversations INTEGER NOT NULL DEFAULT 5,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS on support_agents
ALTER TABLE public.support_agents ENABLE ROW LEVEL SECURITY;

-- Policies for support_agents
CREATE POLICY "Admins can manage all agents"
ON public.support_agents
FOR ALL
USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Users can view their own agent record"
ON public.support_agents
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can update their own status"
ON public.support_agents
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Add columns to chat_conversations for support routing
ALTER TABLE public.chat_conversations
ADD COLUMN IF NOT EXISTS assigned_agent_id UUID REFERENCES public.support_agents(id),
ADD COLUMN IF NOT EXISTS conversation_status TEXT DEFAULT 'active' CHECK (conversation_status IN ('active', 'waiting_agent', 'with_agent', 'escalated', 'closed')),
ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
ADD COLUMN IF NOT EXISTS sentiment_score REAL,
ADD COLUMN IF NOT EXISTS escalation_reason TEXT,
ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS customer_email TEXT,
ADD COLUMN IF NOT EXISTS customer_name TEXT;

-- Support escalations table (links to form_submissions)
CREATE TABLE public.support_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  form_submission_id UUID REFERENCES public.form_submissions(id),
  reason TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  ai_summary TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on support_escalations
ALTER TABLE public.support_escalations ENABLE ROW LEVEL SECURITY;

-- Policies for support_escalations
CREATE POLICY "Authenticated users can view escalations"
ON public.support_escalations
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "System can create escalations"
ON public.support_escalations
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Agents can update escalations"
ON public.support_escalations
FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM support_agents WHERE user_id = auth.uid())
);

-- Indexes for performance
CREATE INDEX idx_support_agents_status ON public.support_agents(status);
CREATE INDEX idx_support_agents_user_id ON public.support_agents(user_id);
CREATE INDEX idx_chat_conversations_status ON public.chat_conversations(conversation_status);
CREATE INDEX idx_chat_conversations_agent ON public.chat_conversations(assigned_agent_id);
CREATE INDEX idx_support_escalations_conversation ON public.support_escalations(conversation_id);
CREATE INDEX idx_support_escalations_resolved ON public.support_escalations(resolved_at) WHERE resolved_at IS NULL;

-- Trigger for updated_at on support_agents
CREATE TRIGGER update_support_agents_updated_at
BEFORE UPDATE ON public.support_agents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

-- Enable realtime for support tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_agents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_escalations;