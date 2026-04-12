-- Update Content Pipeline workflow with full 5-step chain
UPDATE public.agent_workflows 
SET steps = '[
  {"id":"step-1","skill_name":"research_content","skill_args":{"query":"{{topic}}"}},
  {"id":"step-2","skill_name":"generate_content_proposal","skill_args":{"topic":"{{topic}}","research_context":"{{step-1.output}}","target_channels":["blog","linkedin","twitter","newsletter"]}},
  {"id":"step-3","skill_name":"write_blog_post","skill_args":{"title":"{{step-2.output.channel_variants.blog.title}}","topic":"{{topic}}","content":"{{step-2.output.channel_variants.blog.body}}"},"on_failure":"stop"},
  {"id":"step-4","skill_name":"generate_social_post","skill_args":{"blog_slug":"{{step-3.output.slug}}","platforms":["linkedin","twitter"]},"on_failure":"continue"},
  {"id":"step-5","skill_name":"manage_newsletters","skill_args":{"action":"create","subject":"{{step-2.output.channel_variants.newsletter.subject}}","content_blocks":"{{step-2.output.channel_variants.newsletter.blocks}}"},"on_failure":"continue"}
]'::jsonb,
updated_at = now()
WHERE name = 'Content Pipeline';

-- Add signal-based automation: blog.published → social posts
INSERT INTO public.agent_automations (name, description, trigger_type, trigger_config, skill_name, skill_arguments, enabled)
VALUES (
  'Blog Published → Social Posts',
  'Automatically generates LinkedIn and X posts when a blog post is published',
  'signal',
  '{"signal":"blog_published"}'::jsonb,
  'generate_social_post',
  '{"blog_slug":"{{data.slug}}","platforms":["linkedin","twitter"]}'::jsonb,
  true
)
ON CONFLICT DO NOTHING;

-- Add signal-based automation: blog.published → newsletter draft
INSERT INTO public.agent_automations (name, description, trigger_type, trigger_config, skill_name, skill_arguments, enabled)
VALUES (
  'Blog Published → Newsletter Draft',
  'Automatically creates a newsletter draft summarizing the published blog post',
  'signal',
  '{"signal":"blog_published"}'::jsonb,
  'manage_newsletters',
  '{"action":"create","subject":"New: {{data.title}}","blog_post_id":"{{data.id}}"}'::jsonb,
  true
)
ON CONFLICT DO NOTHING;