-- Allow admins to delete chat messages
CREATE POLICY "Admins can delete chat messages"
ON public.chat_messages
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete chat feedback
CREATE POLICY "Admins can delete chat feedback"
ON public.chat_feedback
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));