INSERT INTO public.agent_skills (name, description, handler, category, scope, requires_approval, trust_level, mcp_exposed, instructions, tool_definition, enabled, origin)
SELECT
  'send_email_to_lead',
  'Send a one-to-one outreach, follow-up, or nurture email to a single lead via Resend. AI-drafts subject + body if not provided. Use when: reaching out to a specific lead, following up after lead activity, sending personalized nurture. NOT for: bulk newsletters (use manage_newsletters), creating drafts only (use lead_nurture_sequence). Always supports dry_run for safe preview.',
  'module:crm',
  'crm'::agent_skill_category,
  'internal'::agent_scope,
  false,
  'auto'::skill_trust_level,
  true,
  'Use dry_run=true first to preview. Auto-checks lead_activities for unsubscribed/bounced/complained and refuses to send. Logs to lead_activities (email_sent / email_failed).',
  '{"type":"function","function":{"name":"send_email_to_lead","description":"Send a one-to-one outreach, follow-up, or nurture email to a single lead via Resend. AI-drafts subject + body if not provided.","parameters":{"type":"object","required":["lead_id"],"properties":{"lead_id":{"type":"string","description":"Lead UUID"},"subject":{"type":"string","description":"Email subject (auto-generated if omitted)"},"body_html":{"type":"string","description":"Email body HTML (auto-generated if omitted)"},"purpose":{"type":"string","enum":["outreach","follow_up","nurture","reply"],"description":"Email purpose - guides AI tone"},"tone":{"type":"string","description":"Tone (professional, friendly, casual)"},"language":{"type":"string","description":"Language code (en, sv, etc.)"},"custom_instructions":{"type":"string","description":"Extra context for the AI draft"},"dry_run":{"type":"boolean","description":"If true, returns draft without sending. Default false."}}}}}'::jsonb,
  true,
  'bundled'::skill_origin
WHERE NOT EXISTS (SELECT 1 FROM public.agent_skills WHERE name = 'send_email_to_lead');

UPDATE public.agent_skills SET
  description = 'Send a one-to-one outreach, follow-up, or nurture email to a single lead via Resend. AI-drafts subject + body if not provided. Use when: reaching out to a specific lead, following up after lead activity, sending personalized nurture. NOT for: bulk newsletters (use manage_newsletters), creating drafts only (use lead_nurture_sequence). Always supports dry_run for safe preview.',
  handler = 'module:crm',
  mcp_exposed = true,
  enabled = true,
  requires_approval = false,
  trust_level = 'auto'::skill_trust_level,
  updated_at = now()
WHERE name = 'send_email_to_lead';