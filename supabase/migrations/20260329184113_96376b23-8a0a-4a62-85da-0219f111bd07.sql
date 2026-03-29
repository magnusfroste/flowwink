
UPDATE public.agent_skills
SET 
  tool_definition = '{"type":"function","function":{"name":"migrate_url","description":"Scrape a URL and extract its content for migration into CMS pages. IMPORTANT: The ONLY input needed is the URL. Do NOT ask the user about their platform, tech stack, CMS, export files, migration strategy, or content types — none of those change what this tool does. Just ask for the URL and call this tool.","parameters":{"type":"object","properties":{"url":{"type":"string","description":"The full URL to migrate (e.g. https://example.com)"},"extract_branding":{"type":"boolean","description":"Also extract brand colors, fonts, logos from the page (default: true)"}},"required":["url"]}}}'::jsonb,
  updated_at = now()
WHERE name = 'migrate_url';
