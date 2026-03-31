UPDATE public.agent_skills 
SET handler = 'module:pages', 
    updated_at = now(),
    tool_definition = jsonb_set(
      tool_definition,
      '{function,parameters,properties}',
      '{"action": {"type": "string", "const": "add", "description": "Action to perform"}, "page_id": {"type": "string", "description": "UUID of the page to add the block to"}, "block_type": {"type": "string", "description": "Type of block to create (hero, text, features, etc.)"}, "block_data": {"type": "object", "description": "Content data for the block"}, "position": {"type": "integer", "description": "Position to insert the block at (0-indexed, default: end)"}}'::jsonb
    ),
    description = 'Create a new content block on a page. Wrapper around manage_page_blocks add action.',
    instructions = 'Use this to add a new block to a page. Requires page_id and block_type. block_data contains the content fields. Maps to manage_page_blocks with action=add.'
WHERE name = 'create_page_block';