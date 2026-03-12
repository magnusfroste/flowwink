CREATE TABLE IF NOT EXISTS public.agent_workflows (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL UNIQUE,
  description   text,
  steps         jsonb       NOT NULL DEFAULT '[]',
  trigger_type  text        NOT NULL DEFAULT 'manual',
  trigger_config jsonb      DEFAULT '{}',
  enabled       boolean     NOT NULL DEFAULT true,
  run_count     int         NOT NULL DEFAULT 0,
  last_run_at   timestamptz,
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage workflows" ON public.agent_workflows FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can manage workflows" ON public.agent_workflows FOR ALL TO public
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_agent_workflows_updated_at BEFORE UPDATE ON public.agent_workflows FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS public.agent_skill_packs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL UNIQUE,
  description  text,
  version      text        NOT NULL DEFAULT '1.0.0',
  skills       jsonb       NOT NULL DEFAULT '[]',
  installed    boolean     NOT NULL DEFAULT false,
  installed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_skill_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage skill packs" ON public.agent_skill_packs FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can manage skill packs" ON public.agent_skill_packs FOR ALL TO public
  USING (true) WITH CHECK (true)