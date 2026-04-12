UPDATE public.agent_skills 
SET handler = 'db:pages', 
    updated_at = now() 
WHERE name = 'landing_page_compose' 
  AND handler = 'edge:landing-page-compose';