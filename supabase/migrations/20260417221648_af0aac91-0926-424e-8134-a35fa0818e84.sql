UPDATE public.agent_skills
SET category = 'subscriptions'::public.agent_skill_category
WHERE name IN (
  'list_subscriptions',
  'subscription_mrr',
  'list_dunning_sequences',
  'pause_dunning',
  'escalate_dunning'
)
AND category::text <> 'subscriptions';