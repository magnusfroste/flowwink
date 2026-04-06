
CREATE TABLE IF NOT EXISTS public.handbook_chapters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL DEFAULT '',
  sort_order REAL NOT NULL DEFAULT 0,
  frontmatter JSONB NOT NULL DEFAULT '{}',
  content TEXT NOT NULL DEFAULT '',
  sha TEXT NOT NULL DEFAULT '',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(repo_owner, repo_name, file_path)
);

ALTER TABLE public.handbook_chapters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read handbook chapters"
  ON public.handbook_chapters FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage handbook chapters"
  ON public.handbook_chapters FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can read handbook chapters"
  ON public.handbook_chapters FOR SELECT
  TO anon
  USING (true);
