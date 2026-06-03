CREATE TABLE IF NOT EXISTS public.consultant_checkin_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.consultant_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  fields_updated jsonb not null default '{}'::jsonb,
  last_user_message text,
  source text not null default 'chat'
);

CREATE INDEX IF NOT EXISTS idx_consultant_checkin_log_profile_created
  ON public.consultant_checkin_log (profile_id, created_at DESC);

GRANT SELECT ON public.consultant_checkin_log TO authenticated;
GRANT ALL ON public.consultant_checkin_log TO service_role;

ALTER TABLE public.consultant_checkin_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view checkin log" ON public.consultant_checkin_log;
CREATE POLICY "Admins can view checkin log"
  ON public.consultant_checkin_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));