
-- Project Members table
CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  hourly_rate_override_cents integer,
  tracks_time boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);

-- RLS
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Admins can manage all members
CREATE POLICY "Admins manage project members"
  ON public.project_members FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Users can see their own memberships
CREATE POLICY "Users view own memberships"
  ON public.project_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
