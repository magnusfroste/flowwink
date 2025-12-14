-- Allow anonymous users to view published pages
CREATE POLICY "Public can view published pages"
  ON public.pages
  FOR SELECT
  TO anon
  USING (status = 'published');