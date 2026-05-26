UPDATE agent_skills
SET tool_definition = jsonb_set(
  tool_definition,
  '{function,parameters,properties,action,enum}',
  '["list","get","update_status","stats","timeline"]'::jsonb
),
description = COALESCE(description,'') || E'\n\nAction `timeline` returns the full audit-log history for an order (created, status changes, fulfillment events, shipping). Use after `get` when investigating order issues.'
WHERE name = 'manage_orders';