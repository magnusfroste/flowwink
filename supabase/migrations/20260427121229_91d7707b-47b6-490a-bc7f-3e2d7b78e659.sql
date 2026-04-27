UPDATE public.agent_skills
SET tool_definition = jsonb_set(
  tool_definition,
  '{function,parameters,properties,status}',
  '{
    "type": "string",
    "enum": ["lead", "opportunity", "customer", "lost", "all"],
    "description": "Lead pipeline stage. Use exactly one of: lead (new/unqualified), opportunity (qualified, in active sales), customer (won/closed-won), lost (disqualified/closed-lost). Use \"all\" only with action=list to skip status filtering. Common aliases new→lead, qualified→opportunity, won→customer, disqualified→lost are auto-mapped but prefer the canonical values."
  }'::jsonb,
  true
),
updated_at = now()
WHERE name = 'manage_leads';