
DROP POLICY IF EXISTS "Users can create conversations" ON public.chat_conversations;

CREATE POLICY "Anyone can create conversation"
  ON public.chat_conversations
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    session_id IS NOT NULL
    OR (user_id IS NOT NULL AND user_id = auth.uid())
  );
