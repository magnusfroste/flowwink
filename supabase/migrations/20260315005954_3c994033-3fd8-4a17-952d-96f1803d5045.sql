
CREATE TABLE IF NOT EXISTS public.installed_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id text NOT NULL,
  template_name text NOT NULL,
  installed_at timestamptz NOT NULL DEFAULT now(),
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.installed_template ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage installed_template"
  ON public.installed_template FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert installed_template"
  ON public.installed_template FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Public can read installed_template"
  ON public.installed_template FOR SELECT
  TO public
  USING (true);
