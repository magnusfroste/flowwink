UPDATE public.agent_skills SET 
  tool_definition = jsonb_set(
    tool_definition, 
    '{function,parameters,properties,content}',
    '{"type": "string", "description": "Full blog post content in markdown format. Use ## for headings, paragraphs, and bullet points. Do NOT include the title as H1."}'::jsonb
  ),
  description = 'Create a draft blog post with title, topic, tone, and optional pre-written content. If content is provided it will be used directly; otherwise AI generates it.'
WHERE name = 'write_blog_post';