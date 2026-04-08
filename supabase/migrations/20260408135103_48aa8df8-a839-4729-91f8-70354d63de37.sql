-- SLA Policies: define response/resolution time targets per entity type
CREATE TABLE IF NOT EXISTS public.sla_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  entity_type text NOT NULL,
  metric text NOT NULL,
  threshold_minutes integer NOT NULL,
  priority text DEFAULT 'all',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- SLA Violations: logged when a policy is breached
CREATE TABLE IF NOT EXISTS public.sla_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid REFERENCES public.sla_policies(id) ON DELETE CASCADE NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  metric text NOT NULL,
  threshold_minutes integer NOT NULL,
  actual_minutes integer NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  resolved_at timestamptz,
  resolved_by text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sla_violations_policy ON public.sla_violations(policy_id);
CREATE INDEX IF NOT EXISTS idx_sla_violations_entity ON public.sla_violations(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sla_violations_created ON public.sla_violations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sla_policies_entity ON public.sla_policies(entity_type);

-- RLS
ALTER TABLE public.sla_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_violations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read sla_policies"
  ON public.sla_policies FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage sla_policies"
  ON public.sla_policies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can read sla_violations"
  ON public.sla_violations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage sla_violations"
  ON public.sla_violations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access sla_policies"
  ON public.sla_policies FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access sla_violations"
  ON public.sla_violations FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_sla_policies_updated_at
  BEFORE UPDATE ON public.sla_policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();