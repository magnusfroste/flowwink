UPDATE public.agent_skills
SET handler = 'module:pages'
WHERE name IN ('landing_page_compose', 'generate_site_from_identity')
  AND handler = 'db:pages';