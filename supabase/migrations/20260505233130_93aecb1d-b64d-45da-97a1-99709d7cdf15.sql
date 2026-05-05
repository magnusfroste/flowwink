
CREATE TABLE IF NOT EXISTS public.entity_followers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  user_id uuid NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_followers_entity ON public.entity_followers (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_followers_user ON public.entity_followers (user_id);

ALTER TABLE public.entity_followers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "followers read auth" ON public.entity_followers;
CREATE POLICY "followers read auth" ON public.entity_followers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "followers self insert" ON public.entity_followers;
CREATE POLICY "followers self insert" ON public.entity_followers FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "followers self delete" ON public.entity_followers;
CREATE POLICY "followers self delete" ON public.entity_followers FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
