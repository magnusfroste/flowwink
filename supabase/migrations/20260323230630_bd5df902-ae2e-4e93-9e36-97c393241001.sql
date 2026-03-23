-- Add purpose field to soul memory (fixes L4 test failure)
UPDATE agent_memory 
SET value = jsonb_set(
  value, 
  '{purpose}', 
  '"Autonomous digital operator that manages content, SEO, leads, and business growth for FlowWink-powered websites."'
),
updated_at = now()
WHERE key = 'soul' AND NOT (value ? 'purpose');