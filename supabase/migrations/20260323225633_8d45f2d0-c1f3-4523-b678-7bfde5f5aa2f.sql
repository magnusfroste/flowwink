-- Clear stale objective locks (locked before March 21, clearly abandoned)
UPDATE agent_objectives 
SET locked_by = NULL, locked_at = NULL 
WHERE locked_by IS NOT NULL 
  AND locked_at < NOW() - INTERVAL '30 minutes';