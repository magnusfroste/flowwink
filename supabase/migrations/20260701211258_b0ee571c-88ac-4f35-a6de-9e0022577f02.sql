-- Clean up old Daily Briefing artefacts.
-- Keeps only the "Daily Briefing" cron automation itself.
-- Removes all historical briefings and the FlowChat sessions/messages they created.

DELETE FROM public.chat_messages
WHERE conversation_id IN (
  SELECT id FROM public.chat_conversations WHERE title LIKE 'Daily Briefing — %'
);

DELETE FROM public.chat_conversations
WHERE title LIKE 'Daily Briefing — %';

DELETE FROM public.flowpilot_briefings
WHERE type = 'daily_digest';