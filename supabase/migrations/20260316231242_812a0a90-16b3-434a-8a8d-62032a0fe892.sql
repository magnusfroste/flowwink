INSERT INTO agent_skills (name, description, handler, category, scope, enabled, tool_definition, instructions) VALUES
(
  'competitor_watch',
  'Monitor competitor websites for changes in offerings, pricing, and content.',
  'edge:firecrawl-scrape',
  'analytics',
  'internal',
  true,
  '{"type":"function","function":{"name":"competitor_watch","description":"Research and monitor competitor websites.","parameters":{"type":"object","properties":{"competitors":{"type":"array","items":{"type":"string"},"description":"Competitor domains"},"focus_areas":{"type":"array","items":{"type":"string"},"description":"What to look for"}},"required":["competitors"]}}}',
  'Monitor 3-5 competitors weekly. Use search_web + browser_fetch. Save to memory key competitor_watch_{domain}. Flag pricing/feature changes.'
),
(
  'lead_nurture_sequence',
  'Create automated email nurture sequences for new leads.',
  'module:newsletter',
  'crm',
  'internal',
  true,
  '{"type":"function","function":{"name":"lead_nurture_sequence","description":"Create multi-email nurture sequence for leads.","parameters":{"type":"object","properties":{"lead_id":{"type":"string","description":"Lead UUID"},"sequence_type":{"type":"string","enum":["welcome","re-engage","upsell"],"description":"Sequence type"},"email_count":{"type":"integer","description":"Number of emails"}},"required":["lead_id","sequence_type"]}}}',
  'Welcome: 3 emails over 7 days (intro, value prop, CTA). Re-engage: 2 emails. Upsell: 2 emails. Use company context from sales intelligence. Personalize with lead name.'
);