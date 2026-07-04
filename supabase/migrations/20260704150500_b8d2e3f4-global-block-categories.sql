-- Global block categories (EPIC-06 / global-blocks#categories).
-- Free-text category label on global_blocks (no taxonomy table by design) +
-- extend the manage_global_blocks skill schema so agents can set/filter it.
-- Idempotent; safe to run multiple times.

ALTER TABLE public.global_blocks
  ADD COLUMN IF NOT EXISTS category text;

-- Extend the manage_global_blocks tool schema (skill was seeded via migration,
-- not module skillSeeds, so patch the agent_skills row directly).
UPDATE public.agent_skills
SET tool_definition = jsonb_set(
  tool_definition,
  '{function,parameters,properties,category}',
  '{"type":"string","description":"Free-text category label for organizing global blocks. With action=update: sets the block category. With action=list: filters results to this category."}'::jsonb
)
WHERE name = 'manage_global_blocks'
  AND tool_definition #> '{function,parameters,properties}' IS NOT NULL;
