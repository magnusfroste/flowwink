INSERT INTO public.agent_skills (
  name, description, category, scope, tool_definition, handler,
  enabled, mcp_exposed, trust_level, origin, instructions
) VALUES (
  'list_events',
  'List unified calendar events across enabled domain modules (bookings, project tasks, leave requests, contract renewals, recurring billing, SLA deadlines) within a date range. Use when: a user asks "what is on my calendar this week?", planning capacity, surfacing upcoming work, or feeding a digest. NOT for: creating events (use book_appointment for bookings, manage_project_task for tasks, manage_leave for leave). Read-only aggregator.',
  'system',
  'internal',
  '{
    "type": "function",
    "function": {
      "name": "list_events",
      "description": "List aggregated calendar events from all enabled modules within a range.",
      "parameters": {
        "type": "object",
        "properties": {
          "action": { "type": "string", "enum": ["list_events"] },
          "start": { "type": "string", "description": "ISO date for range start (e.g. 2026-05-01)" },
          "end":   { "type": "string", "description": "ISO date for range end (e.g. 2026-05-31)" },
          "sources": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Optional subset of source IDs (e.g. [\"bookings\",\"tasks\"]). Omit for all enabled."
          }
        },
        "required": ["action", "start", "end"]
      }
    }
  }'::jsonb,
  'module:calendar',
  true,
  true,
  'auto',
  'bundled',
  'Default to a 7-day window if user is vague. Returned events are normalized: { id, sourceId, title, start, end, url }. Source IDs map to module domains.'
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  tool_definition = EXCLUDED.tool_definition,
  handler = EXCLUDED.handler,
  enabled = true,
  mcp_exposed = true,
  updated_at = now();