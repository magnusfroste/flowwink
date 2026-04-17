CREATE TABLE IF NOT EXISTS public.dunning_sequences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'recovered', 'failed', 'cancelled', 'paused')),
  current_step INTEGER NOT NULL DEFAULT 0,
  next_action_at TIMESTAMPTZ,
  failure_reason TEXT,
  failure_code TEXT,
  provider_invoice_id TEXT,
  mrr_at_risk_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  recovered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  paused_until TIMESTAMPTZ,
  paused_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dunning_sequences_subscription ON public.dunning_sequences(subscription_id);
CREATE INDEX IF NOT EXISTS idx_dunning_sequences_status ON public.dunning_sequences(status);
CREATE INDEX IF NOT EXISTS idx_dunning_sequences_next_action ON public.dunning_sequences(next_action_at) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_dunning_sequences_active_unique
  ON public.dunning_sequences(subscription_id) WHERE status = 'active';

ALTER TABLE public.dunning_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view dunning sequences" ON public.dunning_sequences;
CREATE POLICY "Admins can view dunning sequences" ON public.dunning_sequences
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins can insert dunning sequences" ON public.dunning_sequences;
CREATE POLICY "Admins can insert dunning sequences" ON public.dunning_sequences
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins can update dunning sequences" ON public.dunning_sequences;
CREATE POLICY "Admins can update dunning sequences" ON public.dunning_sequences
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins can delete dunning sequences" ON public.dunning_sequences;
CREATE POLICY "Admins can delete dunning sequences" ON public.dunning_sequences
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.dunning_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_id UUID NOT NULL REFERENCES public.dunning_sequences(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'email_sent', 'email_failed', 'recovered', 'cancelled',
    'paused', 'resumed', 'escalated', 'manual_task_created', 'subscription_cancelled'
  )),
  email_template TEXT,
  email_message_id TEXT,
  recipient_email TEXT,
  error_message TEXT,
  triggered_by TEXT NOT NULL DEFAULT 'system',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dunning_actions_sequence ON public.dunning_actions(sequence_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dunning_actions_type ON public.dunning_actions(action_type);

ALTER TABLE public.dunning_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view dunning actions" ON public.dunning_actions;
CREATE POLICY "Admins can view dunning actions" ON public.dunning_actions
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins can insert dunning actions" ON public.dunning_actions;
CREATE POLICY "Admins can insert dunning actions" ON public.dunning_actions
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_dunning_sequences_updated_at ON public.dunning_sequences;
CREATE TRIGGER update_dunning_sequences_updated_at
  BEFORE UPDATE ON public.dunning_sequences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();