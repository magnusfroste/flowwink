-- Sync 2 drifted skills from code seeds
UPDATE public.agent_skills
SET enabled=true, mcp_exposed=true,
    instructions='Both units must belong to the same uom_categories row — cross-category conversion raises an error. Get unit UUIDs via manage_uom action=list first. Param names are exactly p_qty, p_from_uom, p_to_uom (matching the Postgres signature).',
    tool_definition='{"type": "function", "function": {"name": "convert_uom", "description": "Convert a quantity between two UoMs in the same category via their factor-to-reference.", "parameters": {"type": "object", "properties": {"p_qty": {"type": "number", "description": "Quantity to convert"}, "p_from_uom": {"type": "string", "description": "Source UoM UUID"}, "p_to_uom": {"type": "string", "description": "Target UoM UUID"}}, "required": ["p_qty", "p_from_uom", "p_to_uom"]}}}'::jsonb
WHERE name='convert_uom';

UPDATE public.agent_skills
SET enabled=true, mcp_exposed=true, category='content'
WHERE name='search_kb';