-- =============================================================
-- Wiki module: internal TEdit-style wiki / intranet
-- =============================================================

CREATE TABLE IF NOT EXISTS public.wiki_pages (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content_md TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wiki_pages_updated_at
  ON public.wiki_pages (updated_at DESC);

ALTER TABLE public.wiki_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Wiki readable by authenticated" ON public.wiki_pages;
CREATE POLICY "Wiki readable by authenticated"
  ON public.wiki_pages FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Wiki insert by authenticated" ON public.wiki_pages;
CREATE POLICY "Wiki insert by authenticated"
  ON public.wiki_pages FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Wiki update by authenticated" ON public.wiki_pages;
CREATE POLICY "Wiki update by authenticated"
  ON public.wiki_pages FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Wiki delete by admin" ON public.wiki_pages;
CREATE POLICY "Wiki delete by admin"
  ON public.wiki_pages FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Trigger: stamp updated_at + updated_by on UPDATE; created_by on INSERT
CREATE OR REPLACE FUNCTION public.wiki_pages_stamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF;
    IF NEW.updated_by IS NULL THEN NEW.updated_by := auth.uid(); END IF;
    NEW.created_at := COALESCE(NEW.created_at, now());
    NEW.updated_at := now();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wiki_pages_stamp ON public.wiki_pages;
CREATE TRIGGER trg_wiki_pages_stamp
  BEFORE INSERT OR UPDATE ON public.wiki_pages
  FOR EACH ROW EXECUTE FUNCTION public.wiki_pages_stamp();