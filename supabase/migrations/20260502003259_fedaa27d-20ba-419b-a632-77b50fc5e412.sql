-- Repoint a2a_chat skill handler from edge:a2a-chat to edge:a2a/chat (unified router)
UPDATE public.agent_skills
SET handler = 'edge:a2a/chat'
WHERE handler = 'edge:a2a-chat';