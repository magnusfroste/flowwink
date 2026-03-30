-- Allow admins to DELETE agent_activity
CREATE POLICY "Admins can delete agent activity"
ON public.agent_activity
FOR DELETE
TO public
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to DELETE chat_messages (policy exists for authenticated but not covering admin bulk delete)
DROP POLICY IF EXISTS "Admins can delete chat messages" ON public.chat_messages;
CREATE POLICY "Admins can delete chat messages"
ON public.chat_messages
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
