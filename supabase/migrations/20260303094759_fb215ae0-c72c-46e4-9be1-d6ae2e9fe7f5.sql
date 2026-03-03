
-- Enum for objective status
CREATE TYPE public.agent_objective_status AS ENUM ('active', 'completed', 'paused', 'failed');

-- Objectives table
CREATE TABLE public.agent_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal text NOT NULL,
  status agent_objective_status NOT NULL DEFAULT 'active',
  constraints jsonb NOT NULL DEFAULT '{}'::jsonb,
  success_criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Join table linking objectives to activity entries
CREATE TABLE public.agent_objective_activities (
  objective_id uuid NOT NULL REFERENCES public.agent_objectives(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.agent_activity(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (objective_id, activity_id)
);

-- Updated_at trigger for objectives
CREATE TRIGGER update_agent_objectives_updated_at
  BEFORE UPDATE ON public.agent_objectives
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS on agent_objectives
ALTER TABLE public.agent_objectives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage objectives"
  ON public.agent_objectives FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert objectives"
  ON public.agent_objectives FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update objectives"
  ON public.agent_objectives FOR UPDATE
  USING (true);

CREATE POLICY "Authenticated can view objectives"
  ON public.agent_objectives FOR SELECT
  USING (true);

-- RLS on agent_objective_activities
ALTER TABLE public.agent_objective_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage objective activities"
  ON public.agent_objective_activities FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert objective activities"
  ON public.agent_objective_activities FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated can view objective activities"
  ON public.agent_objective_activities FOR SELECT
  USING (true);
