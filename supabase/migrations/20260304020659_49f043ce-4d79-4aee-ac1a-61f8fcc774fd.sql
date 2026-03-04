INSERT INTO public.agent_skills (name, description, handler, category, scope, requires_approval, enabled, tool_definition) VALUES
(
  'prospect_research',
  'Research a prospect company using Jina web scraping, Hunter domain search, and AI analysis. Creates company and lead records.',
  'edge:prospect-research',
  'crm',
  'internal',
  false,
  true,
  '{"type":"function","function":{"name":"prospect_research","description":"Research a prospect company. Scrapes their website, searches for context, finds contacts via Hunter, and generates qualifying Q&A.","parameters":{"type":"object","properties":{"company_name":{"type":"string","description":"Name of the prospect company to research"},"company_url":{"type":"string","description":"Optional URL of the prospect company website"}},"required":["company_name"]}}}'::jsonb
),
(
  'prospect_fit_analysis',
  'Analyze fit between your company and a researched prospect. Generates fit score, problem mapping, and a personalized introduction letter.',
  'edge:prospect-fit-analysis',
  'crm',
  'internal',
  false,
  true,
  '{"type":"function","function":{"name":"prospect_fit_analysis","description":"Evaluate fit with a prospect company and draft an introduction letter. Requires prior prospect_research.","parameters":{"type":"object","properties":{"company_id":{"type":"string","description":"UUID of the company to analyze"},"company_name":{"type":"string","description":"Company name (alternative to company_id)"},"decision_maker_first_name":{"type":"string","description":"First name of the decision maker"},"decision_maker_last_name":{"type":"string","description":"Last name of the decision maker"}}}}}'::jsonb
);