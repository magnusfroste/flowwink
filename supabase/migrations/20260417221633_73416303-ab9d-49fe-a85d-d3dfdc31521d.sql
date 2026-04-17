DO $$ BEGIN
  ALTER TYPE public.agent_skill_category ADD VALUE IF NOT EXISTS 'subscriptions';
EXCEPTION WHEN duplicate_object THEN null;
END $$;