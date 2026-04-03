
DROP POLICY IF EXISTS "Writers can update own articles, admins all" ON public.kb_articles;
CREATE POLICY "Writers can update own articles, admins all" ON public.kb_articles
  FOR UPDATE TO authenticated
  USING (
    (created_by = auth.uid())
    OR has_role(auth.uid(), 'approver'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    (created_by = auth.uid())
    OR has_role(auth.uid(), 'approver'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Also fix kb_articles "Writers can update own drafts" if it exists
DROP POLICY IF EXISTS "Writers can update own drafts" ON public.kb_articles;
