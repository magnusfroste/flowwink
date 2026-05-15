-- Fix check_order_status skill: handler pointed to a non-existent edge function.
-- Route it to the orders module's lookup handler instead (skill name != 'manage_orders'
-- → falls through to the order_id/email lookup path in agent-execute).
UPDATE agent_skills
SET handler = 'module:orders'
WHERE name = 'check_order_status';