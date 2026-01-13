-- Add policy to allow public to view author profiles only
CREATE POLICY "Public can view author profiles"
ON public.profiles
FOR SELECT
USING (show_as_author = true);