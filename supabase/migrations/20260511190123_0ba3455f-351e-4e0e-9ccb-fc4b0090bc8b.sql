-- Tighten visitor chat RLS: require x-chat-session header to match session_id
-- so anonymous visitors can only see their own threads.

DROP POLICY IF EXISTS "Users can view own conversations" ON public.chat_conversations;
CREATE POLICY "Users can view own conversations"
  ON public.chat_conversations
  FOR SELECT
  USING (
    (user_id IS NOT NULL AND user_id = auth.uid())
    OR (
      session_id IS NOT NULL
      AND session_id = nullif(current_setting('request.headers', true)::json->>'x-chat-session', '')
    )
  );

DROP POLICY IF EXISTS "Users can update own conversations" ON public.chat_conversations;
CREATE POLICY "Users can update own conversations"
  ON public.chat_conversations
  FOR UPDATE
  USING (
    (user_id IS NOT NULL AND user_id = auth.uid())
    OR (
      session_id IS NOT NULL
      AND session_id = nullif(current_setting('request.headers', true)::json->>'x-chat-session', '')
    )
  );

DROP POLICY IF EXISTS "Users can delete own conversations" ON public.chat_conversations;
CREATE POLICY "Users can delete own conversations"
  ON public.chat_conversations
  FOR DELETE
  USING (
    (user_id IS NOT NULL AND user_id = auth.uid())
    OR (
      session_id IS NOT NULL
      AND session_id = nullif(current_setting('request.headers', true)::json->>'x-chat-session', '')
    )
  );

DROP POLICY IF EXISTS "Users can view messages in own conversations" ON public.chat_messages;
CREATE POLICY "Users can view messages in own conversations"
  ON public.chat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = chat_messages.conversation_id
        AND (
          (c.user_id IS NOT NULL AND c.user_id = auth.uid())
          OR (
            c.session_id IS NOT NULL
            AND c.session_id = nullif(current_setting('request.headers', true)::json->>'x-chat-session', '')
          )
        )
    )
  );