-- Docs module: public-readable docs synced from GitHub
CREATE TABLE IF NOT EXISTS public.docs_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_owner text NOT NULL,
  repo_name text NOT NULL,
  file_path text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  title text NOT NULL DEFAULT '',
  slug text NOT NULL DEFAULT '',
  sort_order real NOT NULL DEFAULT 0,
  frontmatter jsonb NOT NULL DEFAULT '{}'::jsonb,
  content text NOT NULL DEFAULT '',
  sha text NOT NULL DEFAULT '',
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT docs_pages_repo_path_key UNIQUE (repo_owner, repo_name, file_path)
);

CREATE INDEX IF NOT EXISTS idx_docs_pages_category ON public.docs_pages (category);
CREATE INDEX IF NOT EXISTS idx_docs_pages_slug ON public.docs_pages (category, slug);

ALTER TABLE public.docs_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read docs pages" ON public.docs_pages;
CREATE POLICY "Public can read docs pages" ON public.docs_pages
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage docs pages" ON public.docs_pages;
CREATE POLICY "Admins can manage docs pages" ON public.docs_pages
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS update_docs_pages_updated_at ON public.docs_pages;
CREATE TRIGGER update_docs_pages_updated_at
  BEFORE UPDATE ON public.docs_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();