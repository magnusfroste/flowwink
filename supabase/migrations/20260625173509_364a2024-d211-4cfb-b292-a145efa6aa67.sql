
GRANT SELECT, INSERT, UPDATE ON public.chat_conversations TO anon, authenticated;
GRANT ALL ON public.chat_conversations TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.chat_messages TO anon, authenticated;
GRANT ALL ON public.chat_messages TO service_role;

GRANT SELECT, INSERT ON public.chat_feedback TO anon, authenticated;
GRANT ALL ON public.chat_feedback TO service_role;
