ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS channel_thread_id TEXT;

CREATE INDEX IF NOT EXISTS idx_chat_conversations_channel_thread
  ON public.chat_conversations (channel, channel_thread_id)
  WHERE channel_thread_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';