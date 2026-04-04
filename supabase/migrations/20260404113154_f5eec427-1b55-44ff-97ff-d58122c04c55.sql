UPDATE agent_skills 
SET description = tool_definition->'function'->>'description'
WHERE name IN ('create_page_block', 'browser_fetch')
AND description IS DISTINCT FROM tool_definition->'function'->>'description';