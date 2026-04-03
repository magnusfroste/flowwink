
-- Remove duplicate blog_posts UPDATE policy without WITH CHECK
DROP POLICY IF EXISTS "Writers can update own drafts" ON public.blog_posts;

-- Fix kb_articles INSERT policy: should be authenticated, not public
DROP POLICY IF EXISTS "Writers can create articles" ON public.kb_articles;
CREATE POLICY "Writers can create articles" ON public.kb_articles
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'writer'::app_role)
    OR has_role(auth.uid(), 'approver'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );
