import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { Json } from '@/integrations/supabase/types';
import { createDocumentFromMarkdown } from '@/lib/tiptap-utils';
import { triggerWebhook } from '@/lib/webhook-utils';
import { generateSlug, isTiptapDocument } from './helpers';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { defineModule } from '@/lib/module-def';
import {
  BlogModuleInput,
  BlogModuleOutput,
  blogModuleInputSchema,
  blogModuleOutputSchema,
} from '@/types/module-contracts';

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const BLOG_SKILLS: SkillSeed[] = [
  {
    name: 'write_blog_post',
    description: 'Create a blog post with title, topic, tone, and pre-written content. Pass status="published" to publish immediately in one call (recommended when the user asks to "draft and publish"). Use when: writing a new article; publishing a blog post in one step. NOT for: managing existing posts (manage_blog_posts); generating multi-channel content (generate_content_proposal).',
    category: 'content',
    handler: 'module:blog',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'write_blog_post',
        description: 'Create a blog post with title, topic, tone, and pre-written content. Pass status="published" to publish immediately in one call (recommended when the user asks to "draft and publish"). Use when: writing a new article; publishing a blog post in one step. NOT for: managing existing posts (manage_blog_posts); generating multi-channel content (generate_content_proposal).',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Blog post title',
            },
            topic: {
              type: 'string',
              description: 'Topic or brief for the post',
            },
            content: {
              type: 'string',
              description: 'REQUIRED. The full, finished blog post body in markdown — YOU must generate it in your reasoning before calling; this skill does not generate from a topic. Use ## for headings, paragraphs, and bullet points. Do NOT include the title as H1.',
            },
            tone: {
              type: 'string',
              enum: [
                'professional',
                'casual',
                'technical',
                'storytelling',
              ],
              description: 'Writing tone',
            },
            language: {
              type: 'string',
              description: 'Language code (en, sv, etc.)',
            },
            status: {
              type: 'string',
              enum: ['draft', 'published'],
              description: 'draft (default) or published. Use "published" when the user asks to publish immediately.',
            },
          },
          required: [
            'title',
            'content',
          ],
        },
      },
    },
    instructions: `## write_blog_post
### What
Creates a draft blog post in the CMS with title, topic, tone, and content.
### When to use
- User asks to write/create/draft a blog post
- Content pipeline workflow step (after research_content + generate_content_proposal)
- NOT for updating existing posts (use manage_blog_posts with action='update')
### Grounding — research before you write
If the brief references an external website, company, person, URL, or current
events: fetch real sources FIRST (search_web, scrape_url, research_content) and
base the content on what they actually return — never write about a specific
external subject from memory alone. Link the sources in the post. If fetching
fails, say so and ask, rather than silently writing from memory.
### Parameters
- **title**: Required. The blog post title.
- **content**: Required. The full, finished markdown body — generate it in your own reasoning FIRST, then pass it here. This skill is a pure sink: it does NOT generate content from a topic. Use ## for headings, paragraphs, bullets. Do NOT include the title as H1.
- **topic**: Optional. A short brief stored alongside the post; it is NOT used to generate content.
- **tone**: Defaults to 'professional'. Options: professional, casual, technical, storytelling.
- **language**: ISO code (en, sv). Defaults to site language.
### Edge cases
- Calling with an empty/missing content fails ("content is required") — write_blog_post no longer generates from a topic. Produce the content via your reasoning loop, then call this.
- Slugs are derived from the title; a duplicate title gets a numeric slug suffix (-2, -3, …) automatically.
- **status**: Optional. 'draft' (default) or 'published'. Pass 'published' to make the post live in one call — required when the user asks to "draft and publish".`,
  },
  {
    name: 'research_content',
    description: 'Deep AI research on a topic — audience insights, content angles, hooks, competitive landscape, and recommended structure. Use when: planning content strategy; understanding a topic before writing; needing competitive analysis. NOT for: writing a blog post (write_blog_post); generating multi-channel content (generate_content_proposal).',
    category: 'content',
    // Generative — runs through the ai-task hub (content_research task). Was
    // wired to db:content_research (CRUD list) which always returned 0 items.
    handler: 'ai-task:content_research',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'research_content',
        description: 'Deep AI research on a topic — audience insights, content angles, hooks, competitive landscape, and recommended structure. Use when: planning content strategy; understanding a topic before writing; needing competitive analysis. NOT for: writing a blog post (write_blog_post); generating multi-channel content (generate_content_proposal).',
        parameters: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              description: 'Topic to research',
            },
            target_audience: {
              type: 'string',
              description: 'Target audience description',
            },
            industry: {
              type: 'string',
              description: 'Industry context',
            },
            target_channels: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Channels: blog, newsletter, linkedin, x',
            },
          },
          required: [
            'topic',
            'target_channels',
          ],
        },
      },
    },
    instructions: `## research_content
### What
Deep AI research on a topic — audience insights, content angles, hooks, competitive landscape, and recommended structure.
### When to use
- First step in content pipeline before writing
- Admin asks for topic research or content ideas
- Autonomous content planning during heartbeat
### Parameters
- **topic**: Required. The subject to research.
- **target_audience**: Optional but improves relevance significantly.
- **industry**: Optional context for industry-specific insights.
- **target_channels**: Required. Array of channels: 'blog', 'newsletter', 'linkedin', 'x'.
### Edge cases
- AI-intensive operation — costs tokens. Use judiciously in autonomous mode.
- Chain: research_content → generate_content_proposal → write_blog_post.`,
  },
  {
    name: 'generate_content_proposal',
    description: 'Generate multi-channel content (blog, newsletter, LinkedIn, X) from a topic with brand voice and tone control. Use when: a user requests new content for multiple platforms; needing a content strategy for a given topic; planning a campaign that spans several channels. NOT for: writing a single blog post draft (write_blog_post); performing deep research on a topic (research_content).',
    category: 'content',
    // Generative — runs through the ai-task hub (content_proposal task). Was
    // wired to db:content_proposals (CRUD list) which always returned 0 items.
    handler: 'ai-task:content_proposal',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'generate_content_proposal',
        description: 'Generate multi-channel content (blog, newsletter, LinkedIn, X) from a topic with brand voice and tone control. Use when: a user requests new content for multiple platforms; needing a content strategy for a given topic; planning a campaign that spans several channels. NOT for: writing a single blog post draft (write_blog_post); performing deep research on a topic (research_content).',
        parameters: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              description: 'Content topic',
            },
            target_channels: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Channels: blog, newsletter, linkedin, x',
            },
            brand_voice: {
              type: 'string',
              description: 'Brand voice description',
            },
            target_audience: {
              type: 'string',
              description: 'Target audience',
            },
            tone_level: {
              type: 'number',
              description: '1-5 (1=formal, 5=casual)',
            },
            industry: {
              type: 'string',
              description: 'Industry context',
            },
          },
          required: [
            'topic',
            'target_channels',
          ],
        },
      },
    },
    instructions: `## generate_content_proposal
### What
Generates multi-channel content (blog, newsletter, LinkedIn, X) from a topic with brand voice control. Requires approval.
### When to use
- After research_content, to create actual content drafts
- Admin requests content for multiple channels
- Content pipeline workflow step
### Parameters
- **topic**: Required. Content topic or brief.
- **target_channels**: Required. Array: 'blog', 'newsletter', 'linkedin', 'x'.
- **brand_voice**: Optional. Description of brand voice.
- **tone_level**: 1-5 (1=formal, 5=casual). Default 3.
### Edge cases
- Requires approval before content is published.
- Output includes variants for each channel — review before publishing.
- If brand voice is not set, reads from soul document.`,
  },
  {
    name: 'publish_scheduled_content',
    description: 'Check and publish pages and blog posts that are due for scheduled publishing. Use when: automated publish cycle runs; checking if any content is ready to go live; processing scheduled content queue. NOT for: manually publishing a specific page (manage_page); writing new blog posts (write_blog_post).',
    category: 'content',
    handler: 'rpc:publish_scheduled_pages',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'publish_scheduled_content',
        description: 'Check and publish pages and blog posts that are due for scheduled publishing. Use when: automated publish cycle runs; checking if any content is ready to go live; processing scheduled content queue. NOT for: manually publishing a specific page (manage_page); writing new blog posts (write_blog_post).',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
    instructions: `## publish_scheduled_content
### What
Checks and publishes pages and blog posts that have passed their scheduled publish date.
### When to use
- Runs automatically via cron (every minute)
- Rarely called manually — the automation handles it
### Parameters
- None required.
### Edge cases
- Idempotent — safe to call multiple times.
- Only publishes content with status='scheduled' and scheduled_at <= now().`,
  },
  {
    name: 'manage_blog_posts',
    description: 'Manage existing blog posts: list, get, update, publish, unpublish, delete. Use when: modifying a blog post; changing publication status; performing bulk operations on blog posts. NOT for: creating a new blog post draft (write_blog_post); browsing visitor-facing posts (browse_blog).',
    category: 'content',
    handler: 'module:blog',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_blog_posts',
        description: 'Manage existing blog posts: list, get, update, publish, unpublish, delete. Use when: modifying a blog post; changing publication status; performing bulk operations on blog posts. NOT for: creating a new blog post draft (write_blog_post); browsing visitor-facing posts (browse_blog).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'list',
                'get',
                'update',
                'publish',
                'unpublish',
                'delete',
              ],
            },
            post_id: {
              type: 'string',
              description: 'Blog post UUID',
            },
            slug: {
              type: 'string',
              description: 'Blog post slug (for get)',
            },
            status: {
              type: 'string',
              description: 'Filter by status (for list)',
            },
            title: {
              type: 'string',
            },
            excerpt: {
              type: 'string',
            },
            featured_image: {
              type: 'string',
            },
            limit: {
              type: 'number',
              description: 'Max results (default 20)',
            },
          },
          required: [
            'action',
          ],
        },
      },
    },
    instructions: `## manage_blog_posts
### What
Manages existing blog posts: list, get, update, publish, unpublish, delete.
### When to use
- Admin asks to list, edit, or manage blog posts
- Publishing workflow: review → publish
- Content audits: find drafts, outdated posts
### Parameters
- **action**: Required. list, get, update, publish, unpublish, delete.
- **post_id** or **slug**: For get/update/publish/unpublish/delete.
- **status**: Filter (list) or set (update).
### Edge cases
- Publish sets published_at to now(). Unpublish reverts to draft.
- Use write_blog_post to CREATE new posts, this skill is for MANAGING existing ones.`,
  },
  {
    name: 'manage_blog_categories',
    description: 'Manage blog categories and tags: list, create, delete. Use when: organizing blog content into new categories; listing existing blog categories; cleaning up unused tags. NOT for: managing individual blog posts (manage_blog_posts); browsing published blog posts (browse_blog).',
    category: 'content',
    handler: 'module:blog',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_blog_categories',
        description: 'Manage blog categories and tags: list, create, delete. Use when: organizing blog content into new categories; listing existing blog categories; cleaning up unused tags. NOT for: managing individual blog posts (manage_blog_posts); browsing published blog posts (browse_blog).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'list_categories',
                'create_category',
                'list_tags',
                'create_tag',
              ],
            },
            name: {
              type: 'string',
            },
            slug: {
              type: 'string',
            },
            description: {
              type: 'string',
            },
          },
          required: [
            'action',
          ],
        },
      },
    },
    instructions: `## manage_blog_categories
### What
Manages blog categories and tags: list, create, delete.
### When to use
- Admin asks to organize blog content with categories/tags
- Before writing posts that need categorization
- Content taxonomy management
### Parameters
- **action**: Required. list_categories, create_category, list_tags, create_tag.
- **name**, **slug**: For creation.
### Edge cases
- Slug must be URL-safe. Auto-generated from name if not provided.
- Deleting a category does not delete associated posts.`,
  },
  {
    name: 'browse_blog',
    description: 'Browse published blog posts (visitor-facing). Use when: a user asks to see latest blog articles; you need to find existing blog content to link to; displaying content on a public-facing blog page. NOT for: managing blog post drafts (manage_blog_posts); listing blog categories (manage_blog_categories).',
    category: 'content',
    handler: 'module:blog',
    scope: 'both',
    tool_definition: {
      type: 'function',
      function: {
        name: 'browse_blog',
        description: 'Browse published blog posts (visitor-facing). Use when: a user asks to see latest blog articles; you need to find existing blog content to link to; displaying content on a public-facing blog page. NOT for: managing blog post drafts (manage_blog_posts); listing blog categories (manage_blog_categories).',
        parameters: {
          type: 'object',
          properties: {
            search: {
              type: 'string',
              description: 'Search term',
            },
            limit: {
              type: 'number',
              description: 'Max results (default 5)',
            },
          },
        },
      },
    },
    instructions: `## browse_blog
### What
Browse published blog posts (visitor-facing, read-only).
### When to use
- Visitor asks about blog content in chat
- Need to find published posts for reference
- NOT for admin management (use manage_blog_posts)
### Parameters
- **search**: Optional text search.
- **limit**: Max results, default 5.
### Edge cases
- Only returns published posts. Drafts and scheduled posts are excluded.
- Visitor-safe: no sensitive data exposed.`,
  },
  {
    name: 'content_calendar_view',
    description: 'Lists scheduled and draft content, identifies content gaps. Use when: reviewing editorial calendar, checking upcoming content, finding content gaps. NOT for: creating content (use write_blog_post), publishing content (use manage_blog_posts).',
    category: 'content',
    handler: 'module:blog',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'content_calendar_view',
        parameters: {
          type: 'object',
          properties: {
            include_drafts: {
              type: 'boolean',
            },
            look_ahead_days: {
              type: 'number',
            },
          },
        },
        description: 'Lists scheduled and draft content, identifies content gaps. Use when: reviewing editorial calendar, checking upcoming content, finding content gaps. NOT for: creating content (use write_blog_post), publishing content (use manage_blog_posts).',
      },
    },
    instructions: 'Audit the content pipeline. Analyze gaps in topics, frequency, and SEO coverage.',
  },
  {
    name: 'generate_social_post',
    description: 'Generate social media posts from existing blog content or content proposals. Use when: user wants LinkedIn/X posts from an article, repurposing blog content for social. NOT for: writing blog posts (use write_blog_post), batch social posts (use social_post_batch).',
    category: 'content',
    // Generative — runs through the ai-task hub (social_post task). Was wired to
    // db:content_proposals (CRUD list) which always returned 0 items. To
    // repurpose a blog post, pass its topic + key_points (fetch it via
    // browse_blog first); the hub does not fetch source content itself.
    handler: 'ai-task:social_post',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'generate_social_post',
        parameters: {
          type: 'object',
          required: [
            'platforms',
            'topic',
          ],
          properties: {
            tone: {
              enum: [
                'professional',
                'casual',
                'bold',
                'educational',
              ],
              type: 'string',
              description: 'Writing tone',
            },
            topic: {
              type: 'string',
              description: 'Subject/angle of the posts. When repurposing a blog post or proposal, pass its topic here and the salient points in key_points.',
            },
            key_points: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional bullet points to base the posts on (e.g. the key takeaways of the source article).',
            },
            platforms: {
              type: 'array',
              items: {
                enum: [
                  'linkedin',
                  'x',
                ],
                type: 'string',
              },
              description: 'Target platforms',
            },
            source_id: {
              type: 'string',
              description: 'ID of the blog post or proposal to repurpose',
            },
            source_type: {
              enum: [
                'blog_post',
                'proposal',
                'freeform',
              ],
              type: 'string',
              description: 'Type of source content',
            },
          },
        },
        description: 'Generate social media posts from existing blog content or content proposals. Use when: user wants LinkedIn/X posts from an article, repurposing blog content for social. NOT for: writing blog posts (use write_blog_post), batch social posts (use social_post_batch).',
      },
    },
    instructions: `## Social Post Generation Skill

When generating social posts:
1. If a blog_post_id or proposal_id is provided, fetch the source content first
2. Adapt the content for the target platform:
   - LinkedIn: Professional tone, 1300 chars max, use line breaks, include hashtags
   - X/Twitter: Concise, 280 chars max, punchy hook, 1-2 hashtags
3. Always include a call-to-action or link back to the original content
4. Generate 2-3 variants for A/B testing when possible
5. Store generated posts in content_proposals channel_variants

### Platform guidelines
- LinkedIn: Start with a hook question or bold statement. Use emoji sparingly. End with hashtags.
- X: Lead with the most compelling insight. Thread format for longer content.`,
  },
  {
    name: 'product_promoter',
    description: 'Creates a promotional blog post for a product. Use when: user wants to promote a product via blog, creating product-focused articles. NOT for: general blog writing (use write_blog_post), managing products (use manage_product).',
    category: 'content',
    handler: 'module:blog',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'product_promoter',
        parameters: {
          type: 'object',
          required: [
            'product_name',
            'key_benefits',
          ],
          properties: {
            publish: {
              type: 'boolean',
            },
            key_benefits: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
            product_name: {
              type: 'string',
            },
            target_audience: {
              type: 'string',
            },
          },
        },
        description: 'Creates a promotional blog post for a product. Use when: user wants to promote a product via blog, creating product-focused articles. NOT for: general blog writing (use write_blog_post), managing products (use manage_product).',
      },
    },
    instructions: 'Use to create SEO-friendly blog posts promoting products. Combine with search_web to research positioning.',
  },
  {
    name: 'seo_content_brief',
    description: 'Generates SEO content brief with keywords and outline. Use when: planning SEO-optimized content, keyword research, creating content outlines. NOT for: writing full articles (use write_blog_post), technical SEO audits (use seo_audit).',
    category: 'content',
    // Generative — runs through the ai-task hub (seo_content_brief task). Was
    // wired to db:content_research (CRUD list) which always returned 0 items.
    handler: 'ai-task:seo_content_brief',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'seo_content_brief',
        parameters: {
          type: 'object',
          required: [
            'topic',
          ],
          properties: {
            topic: {
              type: 'string',
            },
            content_type: {
              enum: [
                'blog_post',
                'landing_page',
                'kb_article',
              ],
              type: 'string',
            },
            target_audience: {
              type: 'string',
            },
          },
        },
        description: 'Generates SEO content brief with keywords and outline. Use when: planning SEO-optimized content, keyword research, creating content outlines. NOT for: writing full articles (use write_blog_post), technical SEO audits (use seo_audit).',
      },
    },
    instructions: 'Use before writing SEO-targeted content. Returns keywords, questions, competitor gaps, and outline.',
  },
  {
    name: 'social_post_batch',
    description: 'Creates social media posts for multiple platforms in batch. Use when: user wants posts for several platforms at once, bulk social content creation. NOT for: single platform post (use generate_social_post), blog writing (use write_blog_post).',
    category: 'content',
    // Fetches the blog post (title + excerpt) then generates per-platform social
    // posts via the social_post ai-task. Was db:content_proposals (dead list).
    handler: 'internal:social_post_batch',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'social_post_batch',
        parameters: {
          type: 'object',
          required: [
            'blog_post_id',
          ],
          properties: {
            tone: {
              enum: [
                'professional',
                'casual',
                'inspirational',
              ],
              type: 'string',
            },
            platforms: {
              type: 'array',
              items: {
                enum: [
                  'linkedin',
                  'x',
                  'instagram',
                ],
                type: 'string',
              },
            },
            blog_post_id: {
              type: 'string',
            },
          },
        },
        description: 'Creates social media posts for multiple platforms in batch. Use when: user wants posts for several platforms at once, bulk social content creation. NOT for: single platform post (use generate_social_post), blog writing (use write_blog_post).',
      },
    },
    instructions: 'After publishing blog content, create social variants. Requires approval before posting.',
  },
  {
    name: 'moderate_blog_comment',
    description: 'Approve, mark as spam, reject, or reset a reader comment on a blog post. Use when: an admin wants to publish a pending comment or purge spam. NOT for: creating comments (public form only) or deleting posts.',
    category: 'content',
    handler: 'rpc:moderate_blog_comment',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'moderate_blog_comment',
        description: 'Set a blog comment status. Values: approved (publishes it), spam, rejected, pending.',
        parameters: {
          type: 'object',
          // Declared without the underscore the RPC params carry: agent-execute
          // strips _-prefixed arguments (they are agent-internal) and re-adds
          // the prefix for functions listed in UNDERSCORE_PARAM_RPCS.
          required: ['comment_id', 'status'],
          properties: {
            comment_id: { type: 'string', description: 'blog_comments.id (uuid)' },
            status: {
              type: 'string',
              enum: ['pending', 'approved', 'spam', 'rejected'],
              description: 'Target moderation status',
            },
          },
        },
      },
    },
    instructions: 'Approve moves the comment to public. Spam/rejected hide it. Only admins can call this.',
  },
  {
    name: 'list_blog_comments',
    description: 'List blog comments filtered by status (pending by default) for moderation review. Use when: showing the moderation queue or auditing comments per post.',
    category: 'content',
    handler: 'db:blog_comments',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_blog_comments',
        description: 'List blog comments with optional post/status filter.',
        parameters: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['pending', 'approved', 'spam', 'rejected'],
            },
            post_id: { type: 'string' },
            limit: { type: 'number' },
          },
        },
      },
    },
    instructions: 'Use before moderate_blog_comment to pick comments needing action.',
  },
  {
    name: 'get_blog_rss_url',
    description: 'Return the public RSS feed URL for the blog. Use when: a caller asks for the RSS/Atom feed, or when integrating a syndication endpoint.',
    category: 'content',
    handler: 'builtin:site_meta',
    scope: 'external',
    tool_definition: {
      type: 'function',
      function: {
        name: 'get_blog_rss_url',
        description: 'Returns { url } pointing at the blog RSS feed edge function.',
        parameters: { type: 'object', properties: {} },
      },
    },
    instructions: 'The feed is served by the blog-rss edge function at /functions/v1/blog-rss and contains the 20 most recent published posts.',
  },
];

export const blogModule = defineModule<BlogModuleInput, BlogModuleOutput>({
  id: 'blog',
  name: 'Blog',
  version: '1.0.0',
  processes: ['content-to-conversion'],
  maturity: 'L4',
  description: 'Publish content to the blog',
  capabilities: ['content:receive', 'data:write', 'webhook:trigger'],
  tier: 'standard',
  inputSchema: blogModuleInputSchema,
  outputSchema: blogModuleOutputSchema,

  skills: [
    'write_blog_post',
    'manage_blog_posts',
    'manage_blog_categories',
    'browse_blog',
    'content_calendar_view',
    'product_promoter',
    'seo_content_brief',
    'social_post_batch',
    'generate_social_post',
    'research_content',
    'generate_content_proposal',
    'moderate_blog_comment',
    'list_blog_comments',
    'get_blog_rss_url',
  ],
  data: {
    // children first (FK-safe order)
    tables: ['blog_comments', 'blog_post_categories', 'blog_post_tags', 'blog_posts', 'blog_categories', 'blog_tags'],
  },
  skillSeeds: BLOG_SKILLS,

  webhookEvents: [
    { event: 'blog_post.published', description: 'A blog post was published' },
    { event: 'blog_post.updated', description: 'A blog post was updated' },
    { event: 'blog_post.deleted', description: 'A blog post was deleted' },
  ],

  async publish(input: BlogModuleInput): Promise<BlogModuleOutput> {
    try {
      const validated = blogModuleInputSchema.parse(input);
      const baseSlug = generateSlug(validated.title);
      const timestamp = Date.now().toString(36);
      const slug = `${baseSlug}-${timestamp}`;

      let contentJson: Json;
      if (isTiptapDocument(validated.content)) {
        contentJson = validated.content as Json;
      } else if (typeof validated.content === 'string') {
        contentJson = createDocumentFromMarkdown(validated.content) as unknown as Json;
      } else {
        contentJson = validated.content as Json;
      }

      const status = validated.options?.status || 'draft';
      const postData = {
        title: validated.title,
        slug,
        content_json: contentJson,
        excerpt: validated.excerpt || null,
        featured_image: validated.featured_image || null,
        featured_image_alt: validated.featured_image_alt || null,
        status,
        published_at: status === 'published' ? new Date().toISOString() : null,
        scheduled_at: validated.options?.schedule_at || null,
        author_id: validated.options?.author_id || null,
        meta_json: validated.meta ? {
          source_module: validated.meta.source_module,
          source_id: validated.meta.source_id,
          keywords: validated.meta.keywords,
          description: validated.meta.description,
        } as Json : null,
      };

      const { data, error } = await supabase
        .from('blog_posts')
        .insert(postData)
        .select('id, slug, status, published_at')
        .single();

      if (error) {
        logger.error('[BlogModule] Insert error:', error);
        return { success: false, error: error.message };
      }

      if (status === 'published') {
        try {
          await triggerWebhook({
            event: 'blog_post.published',
            data: { id: data.id, title: validated.title, slug: data.slug, url: `/blog/${data.slug}`, source_module: validated.meta?.source_module, source_id: validated.meta?.source_id },
          });
        } catch (webhookError) {
          logger.warn('[BlogModule] Webhook trigger failed:', webhookError);
        }
      }

      return {
        success: true,
        id: data.id,
        slug: data.slug,
        url: `/blog/${data.slug}`,
        status: data.status,
        published_at: data.published_at || undefined,
      };
    } catch (error) {
      logger.error('[BlogModule] Error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
});
