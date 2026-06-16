CREATE POLICY "Admins can insert messages in any conversation"
ON public.chat_messages
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));