-- Drop existing restrictive INSERT policy
DROP POLICY IF EXISTS "Anyone can submit feedback" ON public.chat_feedback;

-- Create permissive INSERT policy that allows both anon and authenticated users
CREATE POLICY "Anyone can submit feedback"
ON public.chat_feedback
FOR INSERT
TO anon, authenticated
WITH CHECK (true);