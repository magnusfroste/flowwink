
-- Blog comments table
CREATE TABLE IF NOT EXISTS public.blog_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  author_url TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','spam','rejected')),
  ip_address TEXT,
  user_agent TEXT,
  parent_id UUID REFERENCES public.blog_comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  moderated_at TIMESTAMPTZ,
  moderated_by UUID
);

CREATE INDEX IF NOT EXISTS idx_blog_comments_post_status ON public.blog_comments(post_id, status);
CREATE INDEX IF NOT EXISTS idx_blog_comments_status_created ON public.blog_comments(status, created_at DESC);

GRANT SELECT, INSERT ON public.blog_comments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_comments TO authenticated;
GRANT ALL ON public.blog_comments TO service_role;

ALTER TABLE public.blog_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read approved comments" ON public.blog_comments;
CREATE POLICY "Public can read approved comments"
  ON public.blog_comments FOR SELECT
  USING (status = 'approved');

DROP POLICY IF EXISTS "Anyone can submit comments" ON public.blog_comments;
CREATE POLICY "Anyone can submit comments"
  ON public.blog_comments FOR INSERT
  WITH CHECK (status = 'pending');

DROP POLICY IF EXISTS "Admins manage comments" ON public.blog_comments;
CREATE POLICY "Admins manage comments"
  ON public.blog_comments FOR ALL
  USING (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'));

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_blog_comments_updated_at ON public.blog_comments;
CREATE TRIGGER trg_blog_comments_updated_at
  BEFORE UPDATE ON public.blog_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Author profile slug helper (deterministic slug from full_name/email)
CREATE OR REPLACE FUNCTION public.blog_author_slug(_full_name TEXT, _email TEXT, _id UUID)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _full_name IS NOT NULL AND length(trim(_full_name)) > 0 THEN
      regexp_replace(regexp_replace(lower(trim(_full_name)), '[^a-z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g')
    ELSE _id::text
  END;
$$;

-- Comment moderation RPC (agent-callable)
CREATE OR REPLACE FUNCTION public.moderate_blog_comment(_comment_id UUID, _status TEXT)
RETURNS public.blog_comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.blog_comments;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can moderate comments';
  END IF;
  IF _status NOT IN ('pending','approved','spam','rejected') THEN
    RAISE EXCEPTION 'Invalid status: %', _status;
  END IF;
  UPDATE public.blog_comments
     SET status = _status,
         moderated_at = now(),
         moderated_by = COALESCE(auth.uid(), moderated_by)
   WHERE id = _comment_id
   RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Comment % not found', _comment_id;
  END IF;
  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.moderate_blog_comment(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.blog_author_slug(TEXT, TEXT, UUID) TO anon, authenticated, service_role;
