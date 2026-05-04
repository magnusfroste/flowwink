-- Expose copilot-action's site-builder reasoning loop as a first-class
-- MCP skill so external claws (OpenClaw etc) can drive the same builder
-- the admin /admin/copilot UI uses. One implementation, two consumers.

INSERT INTO public.agent_skills (
  name, description, category, handler, scope, mcp_exposed, enabled, tool_definition, instructions
)
VALUES (
  'build_site_step',
  'Run one step of the site-builder reasoning loop. Returns next assistant message + optional tool_call (create_block / migrate_url / update_footer / activate_modules). Use when: an external operator wants to drive the AI site builder programmatically. NOT for: directly creating a page (manage_page) or block (create_page_block).',
  'content',
  'edge:copilot-action',
  'both',
  true,
  true,
  '{
    "type": "function",
    "function": {
      "name": "build_site_step",
      "description": "Run one step of the site-builder reasoning loop. Returns { message, toolCall? } — caller applies the toolCall, then calls again with the result appended. Loop ends when no toolCall is returned.",
      "parameters": {
        "type": "object",
        "properties": {
          "messages": {
            "type": "array",
            "description": "Full conversation history.",
            "items": {
              "type": "object",
              "properties": {
                "role": {"type": "string", "enum": ["user", "assistant"]},
                "content": {"type": "string"}
              },
              "required": ["role", "content"]
            },
            "minItems": 1
          },
          "currentModules": {"type": "object", "additionalProperties": true},
          "migrationState": {
            "type": "object",
            "properties": {
              "sourceUrl": {"type": "string"},
              "platform": {"type": "string"}
            },
            "additionalProperties": false
          }
        },
        "required": ["messages"],
        "additionalProperties": false
      }
    }
  }'::jsonb,
  'Single step of the AI site-builder. Same loop the admin /admin/copilot UI uses, exposed for external claws. Caller owns the conversation history; loop until no toolCall is returned.'
)
ON CONFLICT (name) DO UPDATE SET
  description    = EXCLUDED.description,
  category       = EXCLUDED.category,
  handler        = EXCLUDED.handler,
  scope          = EXCLUDED.scope,
  mcp_exposed    = EXCLUDED.mcp_exposed,
  enabled        = EXCLUDED.enabled,
  tool_definition = EXCLUDED.tool_definition,
  instructions   = EXCLUDED.instructions,
  updated_at     = now();