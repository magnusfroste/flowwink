
-- CRM Tasks table for follow-ups and reminders
CREATE TABLE IF NOT EXISTS public.crm_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  priority TEXT NOT NULL DEFAULT 'medium',
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE,
  assigned_to UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;

-- Authenticated users can manage tasks
CREATE POLICY "Authenticated users can view tasks"
  ON public.crm_tasks FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert tasks"
  ON public.crm_tasks FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update tasks"
  ON public.crm_tasks FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete tasks"
  ON public.crm_tasks FOR DELETE TO authenticated
  USING (true);

-- Updated_at trigger
CREATE TRIGGER update_crm_tasks_updated_at
  BEFORE UPDATE ON public.crm_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_crm_tasks_lead_id ON public.crm_tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_deal_id ON public.crm_tasks(deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_due_date ON public.crm_tasks(due_date) WHERE completed_at IS NULL;
