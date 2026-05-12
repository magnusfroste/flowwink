UPDATE public.agent_skills
SET tool_definition = jsonb_set(
  jsonb_set(
    tool_definition,
    '{function,parameters,properties,status}',
    '{"type":"string","enum":["draft","published"],"description":"draft (default) or published. Use \"published\" when the user asks to publish immediately."}'::jsonb
  ),
  '{function,description}',
  '"Create a blog post with title, topic, tone, and pre-written content. Pass status=\"published\" to publish immediately in one call (recommended when the user asks to \"draft and publish\"). Use when: writing a new article; publishing a blog post in one step. NOT for: managing existing posts (manage_blog_posts); generating multi-channel content (generate_content_proposal)."'::jsonb
),
description = 'Create a blog post with title, topic, tone, and pre-written content. Pass status="published" to publish immediately in one call (recommended when the user asks to "draft and publish"). Use when: writing a new article; publishing a blog post in one step. NOT for: managing existing posts (manage_blog_posts); generating multi-channel content (generate_content_proposal).'
WHERE name = 'write_blog_post';