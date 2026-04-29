UPDATE public.agent_skills
SET tool_definition = jsonb_set(
  tool_definition,
  '{function,parameters}',
  '{
    "type": "object",
    "properties": {
      "product_id": { "type": "string", "description": "Finished-good product UUID" },
      "version": { "type": "string", "description": "BOM version label (e.g. v1, 2026-Q1)" },
      "quantity_produced": { "type": "number", "description": "Units produced per BOM run (default 1)" },
      "routing_notes": { "type": "string" },
      "activate": { "type": "boolean", "description": "Set this version as the active BOM (default true)" },
      "lines": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "component_product_id": { "type": "string" },
            "quantity": { "type": "number" },
            "unit": { "type": "string" },
            "scrap_pct": { "type": "number" },
            "position": { "type": "integer" }
          },
          "required": ["component_product_id", "quantity"]
        }
      }
    },
    "required": ["product_id", "lines"]
  }'::jsonb,
  true
),
description = 'Create a new Bill of Materials (BOM) version for a product. Use when: defining what components make up a finished good, or adding a new versioned recipe. NOT for: planning a production run (use create_manufacturing_order). Reads go via universal CRUD on bom_headers / bom_lines.',
updated_at = now()
WHERE name = 'manage_bom';