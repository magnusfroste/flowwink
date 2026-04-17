DELETE FROM public.agent_skills WHERE name IN ('get_company_profile', 'update_company_profile');

INSERT INTO public.agent_skills (
  name, description, category, scope, handler,
  tool_definition, enabled, mcp_exposed, requires_approval, trust_level, origin
) VALUES
(
  'get_company_profile',
  'Read the FlowWink site''s Business Identity (company name, ICP, value proposition, services, clients, brand tone, contact info). Use when: you need affärs-/företagskontext before writing content, qualifying leads, or generating outreach. NOT for: agent persona/soul (use flowwink://identity for that).',
  'crm', 'both', 'function:company-profile',
  jsonb_build_object('type','function','function',jsonb_build_object(
    'name','get_company_profile',
    'description','Returns the full Business Identity (company_profile) used across Sales Intelligence, Chat AI, SEO, and FlowAgent. Read-only.',
    'parameters',jsonb_build_object('type','object','properties',jsonb_build_object(),'additionalProperties',false)
  )),
  true, true, false, 'auto', 'bundled'
),
(
  'update_company_profile',
  'Update the FlowWink site''s Business Identity. Performs a shallow merge by default. Use when: enriching the profile with newly discovered facts. NOT for: changing agent identity/soul (that lives in agent_memory). Requires approval.',
  'crm', 'both', 'function:company-profile',
  jsonb_build_object('type','function','function',jsonb_build_object(
    'name','update_company_profile',
    'description','Update Business Identity fields. By default merges with existing profile (set merge=false to replace). Returns the updated profile.',
    'parameters',jsonb_build_object(
      'type','object',
      'properties',jsonb_build_object(
        'data',jsonb_build_object('type','object','description','Object of fields to set/merge. Common keys: company_name, about_us, value_proposition, industry, services, target_industries, differentiators, clients, contact_email, contact_phone, address.'),
        'merge',jsonb_build_object('type','boolean','description','If true (default), merge with existing profile. If false, replace entire profile.')
      ),
      'required',jsonb_build_array('data'),
      'additionalProperties',false
    )
  )),
  true, true, true, 'approve', 'bundled'
);

UPDATE public.agent_skills
SET enabled = true, updated_at = now()
WHERE name IN ('enrich_company', 'manage_company', 'weekly_business_digest')
  AND enabled = false;