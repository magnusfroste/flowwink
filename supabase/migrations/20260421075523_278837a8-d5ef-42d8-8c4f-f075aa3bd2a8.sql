UPDATE public.agent_skills
SET tool_definition = jsonb_set(
  tool_definition,
  '{function,parameters,properties,items}',
  '{
    "type": "array",
    "description": "Array of checklist items",
    "items": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "done": { "type": "boolean" }
      },
      "required": ["title"]
    }
  }'::jsonb,
  true
),
updated_at = now()
WHERE name = 'onboarding_checklist';