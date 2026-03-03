-- Trigger type enum
CREATE TYPE public.automation_trigger_type AS ENUM ('cron', 'event', 'signal');

-- Automations table
CREATE TABLE public.agent_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  trigger_type public.automation_trigger_type NOT NULL DEFAULT 'cron',
  trigger_config jsonb NOT NULL DEFAULT '{}',
  skill_id uuid REFERENCES public.agent_skills(id) ON DELETE SET NULL,
  skill_name text,
  skill_arguments jsonb NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  last_triggered_at timestamptz,
  next_run_at timestamptz,
  run_count integer NOT NULL DEFAULT 0,
  last_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Updated_at trigger
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.agent_automations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- RLS
ALTER TABLE public.agent_automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage automations"
  ON public.agent_automations FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can update automations"
  ON public.agent_automations FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can view automations"
  ON public.agent_automations FOR SELECT
  TO authenticated
  USING (true);