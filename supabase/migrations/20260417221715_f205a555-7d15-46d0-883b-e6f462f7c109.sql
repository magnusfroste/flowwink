UPDATE public.agent_skills
SET mcp_exposed = true
WHERE name IN (
  'list_subscriptions',
  'subscription_mrr',
  'list_dunning_sequences',
  'pause_dunning',
  'escalate_dunning'
)
AND (mcp_exposed IS DISTINCT FROM true);