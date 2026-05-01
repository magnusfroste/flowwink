-- profiles_public: same logic, security invoker
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public
WITH (security_invoker = true) AS
SELECT
  id,
  full_name,
  avatar_url,
  bio,
  title,
  show_as_author,
  created_at
FROM public.profiles
WHERE show_as_author = true
   OR (id IN (SELECT support_agents.user_id FROM public.support_agents));

-- survey_nps_stats: same logic, security invoker
DROP VIEW IF EXISTS public.survey_nps_stats;
CREATE VIEW public.survey_nps_stats
WITH (security_invoker = true) AS
SELECT
  c.id AS campaign_id,
  c.name AS campaign_name,
  count(r.id) AS total_responses,
  count(*) FILTER (WHERE r.category = 'promoter'::text) AS promoters,
  count(*) FILTER (WHERE r.category = 'passive'::text) AS passives,
  count(*) FILTER (WHERE r.category = 'detractor'::text) AS detractors,
  round(100.0 * (count(*) FILTER (WHERE r.category = 'promoter'::text)::numeric
       - count(*) FILTER (WHERE r.category = 'detractor'::text)::numeric)
       / NULLIF(count(r.id), 0)::numeric, 1) AS nps_score,
  round(avg(r.score), 2) AS avg_score
FROM public.survey_campaigns c
LEFT JOIN public.survey_responses r ON r.campaign_id = c.id
GROUP BY c.id, c.name;