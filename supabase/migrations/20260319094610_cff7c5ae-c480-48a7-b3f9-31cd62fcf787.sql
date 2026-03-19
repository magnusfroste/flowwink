DELETE FROM public.agent_skills WHERE name = 'generate_site_from_identity';

INSERT INTO public.agent_skills (
  name, description, category, handler, enabled, requires_approval, scope,
  tool_definition, instructions
) VALUES (
  'generate_site_from_identity',
  'Generate a complete website (header, footer, landing page) from the Business Identity profile. AI reasons about available data and only uses real information.',
  'content',
  'edge:generate-site-from-identity',
  true,
  true,
  'both',
  '{"type":"function","function":{"name":"generate_site_from_identity","description":"Generate a complete website from Business Identity. Reads company_profile, lets AI reason about which blocks fit the available data, creates header, footer, and landing page as draft.","parameters":{"type":"object","properties":{"page_title":{"type":"string","description":"Optional override for page title. Defaults to company name."},"include_header":{"type":"boolean","description":"Generate global header. Default true."},"include_footer":{"type":"boolean","description":"Generate global footer. Default true."},"include_landing_page":{"type":"boolean","description":"Generate landing page. Default true."}},"additionalProperties":false}}}'::jsonb,
  'Use when a client has filled in their Business Identity and wants a website generated. AI analyzes available data fields and composes appropriate blocks. Requires approval. Page created as draft.'
);