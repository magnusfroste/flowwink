-- Restore admin visibility on chat data lost in the visitor-privacy hardening.
CREATE POLICY "Admins can view all conversations"
  ON public.chat_conversations FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update any conversation"
  ON public.chat_conversations FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view all messages"
  ON public.chat_messages FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete any message"
  ON public.chat_messages FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));