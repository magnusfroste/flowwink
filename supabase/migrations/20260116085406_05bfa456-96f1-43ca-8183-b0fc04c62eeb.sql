-- Drop the existing role check constraint and add one that includes 'agent'
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_role_check;

ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_role_check 
  CHECK (role IN ('user', 'assistant', 'agent', 'system'));