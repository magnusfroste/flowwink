
CREATE TABLE IF NOT EXISTS public.saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  scope text NOT NULL,
  name text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  is_shared boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_views_scope_user ON public.saved_views (scope, user_id);

ALTER TABLE public.saved_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_views read" ON public.saved_views;
CREATE POLICY "saved_views read" ON public.saved_views FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_shared = true);

DROP POLICY IF EXISTS "saved_views insert own" ON public.saved_views;
CREATE POLICY "saved_views insert own" ON public.saved_views FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_views update own" ON public.saved_views;
CREATE POLICY "saved_views update own" ON public.saved_views FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_views delete own" ON public.saved_views;
CREATE POLICY "saved_views delete own" ON public.saved_views FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_saved_views_updated ON public.saved_views;
CREATE TRIGGER trg_saved_views_updated BEFORE UPDATE ON public.saved_views
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
