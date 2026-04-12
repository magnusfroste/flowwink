-- Update skill descriptions to reflect AI-stripped versions
UPDATE public.agent_skills SET
  description = 'Score and qualify a lead based on activities and engagement data. Use when: evaluating lead quality; automating lead scoring; prioritizing sales pipeline. NOT for: adding new leads (add_lead); managing lead records (manage_leads).'
WHERE name = 'qualify_lead';

UPDATE public.agent_skills SET
  description = 'Scrape a company website to enrich its record with website, phone, and description. Use when: needing more details about a prospect; automatically populating company data. NOT for: researching individual prospects (prospect_research); basic company CRUD (manage_company).'
WHERE name = 'enrich_company';

UPDATE public.agent_skills SET
  description = 'Research a company — search web, scrape website, find contacts via Hunter.io. Returns raw data for FlowPilot to analyze. Use when: preparing for outreach; gathering intelligence on a prospect; building a company profile from scratch. NOT for: enriching existing company records (enrich_company); managing companies (manage_company).'
WHERE name = 'prospect_research';

UPDATE public.agent_skills SET
  description = 'Collect company data, related leads, and deals to evaluate prospect fit. Returns raw data for FlowPilot to analyze. Use when: evaluating a new prospect; scoring company fit before outreach; comparing prospects against ICP criteria. NOT for: researching a company (prospect_research); enriching company data (enrich_company).'
WHERE name = 'prospect_fit_analysis';

UPDATE public.agent_skills SET
  description = 'Match consultants to a job description using keyword-based skill overlap scoring. Returns ranked matches for FlowPilot to analyze. Use when: finding suitable candidates; identifying best-fit consultants. NOT for: managing consultant profiles (manage_consultant_profile).'
WHERE name = 'match_consultant';