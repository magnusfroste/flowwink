
-- Fix: Add WITH CHECK to pages UPDATE policy for proper write validation
DROP POLICY IF EXISTS "Writers can update own draft pages" ON public.pages;
CREATE POLICY "Writers can update own draft pages" ON public.pages
  FOR UPDATE TO authenticated
  USING (
    ((created_by = auth.uid()) AND (status = 'draft'::page_status))
    OR has_role(auth.uid(), 'approver'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    ((created_by = auth.uid()) AND (status = 'draft'::page_status))
    OR has_role(auth.uid(), 'approver'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Also fix: global_blocks UPDATE policy missing WITH CHECK
DROP POLICY IF EXISTS "Admins can update global blocks" ON public.global_blocks;
CREATE POLICY "Admins can update global blocks" ON public.global_blocks
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Fix: blog_posts - check UPDATE policy
DROP POLICY IF EXISTS "Writers can update own posts" ON public.blog_posts;
CREATE POLICY "Writers can update own posts" ON public.blog_posts
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
