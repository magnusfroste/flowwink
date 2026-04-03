
-- Update create_page_block: add blocks[] parameter to tool_definition and update description
UPDATE public.agent_skills 
SET tool_definition = jsonb_set(
  jsonb_set(
    tool_definition,
    '{function,description}',
    '"Create content blocks on a page. Supports BATCH: pass blocks[] array with multiple {type,data} objects to add 5-20 blocks in ONE call. Also supports single block via block_type + block_data. Use batch mode when building full pages — much more efficient than one block at a time. Available block types: hero, text, cta, features, stats, testimonials, pricing, accordion, form, newsletter, quote, two-column, info-box, logos, comparison, social-proof, countdown, chat-launcher, separator, tabs, marquee, embed, table, progress, badge, floating-cta, notification-toast, parallax-section, bento-grid, section-divider, gallery, image, youtube, map, team, timeline, products, announcement-bar, lottie, webinar, featured-carousel, quick-links, trust-bar, category-nav, shipping-info, ai-assistant."'::jsonb
  ),
  '{function,parameters,properties,blocks}',
  '{"type":"array","items":{"type":"object","required":["type","data"],"properties":{"type":{"type":"string","description":"Block type"},"data":{"type":"object","description":"Block-specific data"}}},"description":"BATCH MODE: Array of blocks to add in one call. Each: {type, data}. Use this to add 5-20 blocks at once instead of calling one at a time."}'::jsonb
),
updated_at = now()
WHERE name = 'create_page_block' AND enabled = true;

-- Update manage_page description to clarify blocks support on create
UPDATE public.agent_skills
SET tool_definition = jsonb_set(
  tool_definition,
  '{function,description}',
  '"Manage CMS pages. Actions: list, get, create, update, publish, archive, delete, rollback. The create action accepts an optional blocks[] array to create a page WITH content in one call. For migration flows: call migrate_url first, then manage_page action=create with blocks. Available block types: hero, text, cta, features, stats, testimonials, pricing, accordion, form, newsletter, quote, two-column, info-box, logos, comparison, social-proof, countdown, chat-launcher, separator, tabs, marquee, embed, table, progress, badge, floating-cta, gallery, image, youtube, map, team, timeline, products."'::jsonb
),
updated_at = now()
WHERE name = 'manage_page' AND enabled = true;
