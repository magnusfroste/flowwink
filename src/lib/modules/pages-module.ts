import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { Json } from '@/integrations/supabase/types';
import { triggerWebhook } from '@/lib/webhook-utils';
import { generateSlug, isTiptapDocument } from './helpers';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { defineModule } from '@/lib/module-def';
import {
  PageModuleInput,
  PageModuleOutput,
  pageModuleInputSchema,
  pageModuleOutputSchema,
} from '@/types/module-contracts';

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const PAGES_SKILLS: SkillSeed[] = [
  {
    name: 'generate_meta_description',
    description: 'Scan published pages for missing SEO meta descriptions and generate them via AI. Use when: improving site SEO; doing a content audit; filling gaps in meta_json. NOT for: writing page body content (manage_page); generating blog excerpts (write_blog_post).',
    category: 'content',
    handler: 'module:pages',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'generate_meta_description',
        description: 'Scan published pages for missing SEO meta descriptions and generate them via AI. Use when: improving site SEO; doing a content audit; filling gaps in meta_json. NOT for: writing page body content (manage_page); generating blog excerpts (write_blog_post).',
        parameters: {
          type: 'object',
          properties: {
            page_id: {
              type: 'string',
              description: 'Optional UUID of a single page to process.',
            },
            slug: {
              type: 'string',
              description: 'Optional slug of a single page to process (alternative to page_id).',
            },
            scan_all: {
              type: 'boolean',
              description: 'If true, return results even when nothing is missing.',
            },
            limit: {
              type: 'number',
              description: 'Max pages to process per run (1-50, default 10).',
            },
            dry_run: {
              type: 'boolean',
              description: 'If true, generate without saving — returns proposed text.',
            },
          },
        },
      },
    },
    instructions: `## generate_meta_description
### What
Scans published pages, finds those missing a meta description in meta_json, and generates one using AI based on the page title and content.
### When to use
- SEO maintenance heartbeat
- After a content migration that left meta_json empty
- When user reports low search visibility
- Targeted: when fixing a specific page
### Parameters
- **page_id** or **slug**: Optional. Process a single page only.
- **scan_all**: Optional boolean. If true, returns results even when nothing is missing (for reporting).
- **limit**: Optional, default 10, max 50. How many pages to process per run.
- **dry_run**: Optional. If true, generates but does not save — returns proposed text.
### Returns
Per-page results with generated text and updated/false. Cap is enforced server-side.
### Edge cases
- Skips pages where meta_json.description already exists and is >= 20 chars.
- Generates max 160 chars, language-matched to the title.
- If neither GEMINI_API_KEY nor OPENAI_API_KEY is set, returns error per page.`,
  },
  {
    name: 'generate_alt_text',
    description: 'Scan published pages for images missing alt-text and generate accessible alt descriptions via AI. Use when: improving accessibility (WCAG); SEO maintenance; auditing image content. NOT for: writing image captions or hero copy (manage_page_blocks).',
    category: 'content',
    handler: 'module:pages',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'generate_alt_text',
        description: 'Scan published pages for images missing alt-text and generate accessible alt descriptions via AI. Use when: improving accessibility (WCAG); SEO maintenance; auditing image content. NOT for: writing image captions or hero copy (manage_page_blocks).',
        parameters: {
          type: 'object',
          properties: {
            page_id: {
              type: 'string',
              description: 'Optional UUID of a single page to process.',
            },
            slug: {
              type: 'string',
              description: 'Optional slug of a single page to process.',
            },
            limit: {
              type: 'number',
              description: 'Max images to fix per run across all pages (1-100, default 20).',
            },
            dry_run: {
              type: 'boolean',
              description: 'If true, generate without saving — returns proposed alt-text.',
            },
          },
        },
      },
    },
    instructions: `## generate_alt_text
### What
Walks page content_json blocks, finds images without alt-text (image, imageUrl, src, images[].url patterns), and generates concise alt descriptions using AI.
### When to use
- Accessibility audit
- SEO maintenance heartbeat
- After bulk image upload that left alt empty
### Parameters
- **page_id** or **slug**: Optional. Process a single page only.
- **limit**: Optional, default 20, max 100. Max number of images to fix per run (across all pages).
- **dry_run**: Optional. If true, generates but does not save — returns proposed alt-text per image.
### Returns
Per-page summary with images_fixed count and the actual alt strings generated.
### Edge cases
- Uses image filename + page title/content as context for relevance.
- Caps at 125 chars per alt-text. No "image of" / "picture of" prefixes.
- Skips images with non-empty alt already set.`,
  },
  {
    name: 'manage_page',
    description: 'Full page lifecycle management: list, get, create, update, publish, archive, delete, rollback. Use when: creating a new page, publishing a draft, listing all pages, updating page metadata, archiving old content, creating destination page after migrate_url. NOT for: adding/editing individual blocks (use create_page_block or manage_page_blocks), scraping external sites (use migrate_url).',
    category: 'content',
    handler: 'module:pages',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_page',
        description: 'Full page lifecycle management: list, get, create, update, publish, archive, delete, rollback. Use when: creating a new page, publishing a draft, listing all pages, updating page metadata, archiving old content, creating destination page after migrate_url. NOT for: adding/editing individual blocks (use create_page_block or manage_page_blocks), scraping external sites (use migrate_url).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'list',
                'get',
                'create',
                'update',
                'publish',
                'archive',
                'delete',
                'rollback',
              ],
            },
            page_id: {
              type: 'string',
              description: 'Page UUID (for get/update/publish/archive/delete/rollback)',
            },
            slug: {
              type: 'string',
              description: 'Page slug (for get or create)',
            },
            title: {
              type: 'string',
              description: 'Page title (for create/update)',
            },
            status: {
              type: 'string',
              description: 'Filter by status (for list)',
            },
            meta: {
              type: 'object',
              description: 'Page meta JSON (for create/update)',
              properties: {},
            },
            blocks: {
              type: 'array',
              description: 'Content blocks for create/update. Each block: { id, type, data }. Block types: hero, text, cta, accordion, info-box, two-column, quote, separator, etc.',
              items: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    description: 'UUID — use crypto.randomUUID() or any unique string',
                  },
                  type: {
                    type: 'string',
                    description: 'Block type: hero, text, cta, accordion, info-box, two-column, quote, separator, stats, features, form, newsletter',
                  },
                  data: {
                    type: 'object',
                    description: 'Block-specific data. text block: { content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "..." }] }] } }. hero block: { title, subtitle, buttonText, buttonLink }. accordion: { title, items: [{ question, answer }] }. cta: { title, subtitle, buttonText, buttonLink }.',
                    properties: {},
                  },
                },
                required: [
                  'type',
                  'data',
                ],
              },
            },
          },
          required: [
            'action',
          ],
        },
      },
    },
    instructions: `## manage_page
### What
Full page lifecycle management: list, get, create, update, publish, archive, delete, rollback.
### When to use
- Admin asks to create, edit, or manage pages
- Content pipeline: create landing pages, update existing content
- Page status changes (publish, archive, schedule)
- Immediately after migrate_url to create the target page before adding blocks
### Parameters
- **action**: Required. One of: list, get, create, update, publish, unpublish, archive, delete, rollback.
- **page_id** or **slug**: Required for most actions except list/create.
- **title**, **content_json**, **meta_json**: For create/update.
### Edge cases
- Delete is soft-delete (archive). Hard delete requires explicit confirmation.
- Rollback restores previous version from page_versions table.
- content_json must be a valid ContentBlock[] array.`,
  },
  {
    name: 'manage_page_blocks',
    description: 'Manipulate blocks on a page: list, add, update, remove, reorder, duplicate, toggle visibility. Use when: designing a page layout; repositioning elements; showing/hiding specific content blocks. NOT for: managing global site blocks (manage_global_blocks); creating new pages (manage_page).',
    category: 'content',
    handler: 'module:pages',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_page_blocks',
        description: 'Manipulate blocks on a page: list, add, update, remove, reorder, duplicate, toggle visibility. Use when: designing a page layout; repositioning elements; showing/hiding specific content blocks. NOT for: managing global site blocks (manage_global_blocks); creating new pages (manage_page).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'list',
                'add',
                'update',
                'remove',
                'reorder',
                'duplicate',
                'toggle_visibility',
              ],
            },
            page_id: {
              type: 'string',
              description: 'Page UUID',
            },
            block_id: {
              type: 'string',
              description: 'Block UUID (for update/remove/duplicate/toggle)',
            },
            block_type: {
              type: 'string',
              description: 'Block type (for add): text, hero, cta, accordion, info-box, two-column, quote, separator, stats, features, form, newsletter',
            },
            block_data: {
              type: 'object',
              description: 'Block content data. text: { content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "..." }] }] } }. hero: { title, subtitle, buttonText, buttonLink }. accordion: { title, items: [{ question, answer }] }. cta: { title, subtitle, buttonText, buttonLink }. info-box: { title, content, variant }. two-column: { leftTitle, leftContent, rightTitle, rightContent }.',
              properties: {},
            },
            position: {
              type: 'number',
              description: 'Insert position (for add)',
            },
            block_ids: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Ordered block IDs (for reorder)',
            },
          },
          required: [
            'action',
            'page_id',
          ],
        },
      },
    },
    instructions: `## manage_page_blocks
### What
Granular block-level operations on pages: add, update, remove, reorder blocks.
### When to use
- Admin wants to modify specific blocks on a page without replacing the entire content
- Adding a new section to an existing page
- Reordering page layout
### Parameters
- **action**: Required. One of: add, update, remove, reorder.
- **page_id**: Required. The page to modify.
- **block_id**: Required for update/remove.
- **block_data**: Block object for add/update.
- **position**: Insert position for add.
- **block_ids**: Ordered array for reorder.
### Edge cases
- block_data must match the ContentBlock schema for the block type.
- Reorder requires ALL block_ids in the desired order.`,
  },
  {
    name: 'landing_page_compose',
    description: 'Autonomously compose a landing page from the block library based on campaign goal, target audience, and optional ad campaign reference. Use when: building a campaign landing page; creating a targeted page for an ad; composing a page from AI-generated content. NOT for: migrating existing pages (migrate_url); managing individual blocks (manage_page_blocks).',
    category: 'automation',
    handler: 'db:pages',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'landing_page_compose',
        description: 'Autonomously compose a landing page from the block library based on campaign goal, target audience, and optional ad campaign reference. Use when: building a campaign landing page; creating a targeted page for an ad; composing a page from AI-generated content. NOT for: migrating existing pages (migrate_url); managing individual blocks (manage_page_blocks).',
        parameters: {
          type: 'object',
          properties: {
            goal: {
              type: 'string',
              description: 'Campaign/page goal, e.g. "Generate leads for consulting services" or "Promote summer sale"',
            },
            target_audience: {
              type: 'string',
              description: 'Target audience description, e.g. "Small business owners aged 30-50 looking for IT consulting"',
            },
            campaign_id: {
              type: 'string',
              description: 'Optional: Link to an existing ad_campaign UUID for messaging alignment',
            },
            page_title: {
              type: 'string',
              description: 'Page title (used for slug generation)',
            },
            tone: {
              type: 'string',
              enum: [
                'professional',
                'casual',
                'urgent',
                'inspirational',
                'technical',
              ],
              description: 'Desired tone of voice (default: professional)',
            },
            include_blocks: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Optional: specific block types to include (e.g. ["pricing", "testimonials"])',
            },
          },
          required: [
            'goal',
            'target_audience',
            'page_title',
          ],
        },
      },
    },
    instructions: `You compose high-converting landing pages by selecting from the platform's block library.

## Available block types (use only these):
hero, text, cta, features, stats, testimonials, pricing, accordion, form, newsletter, quote, two-column, info-box, logos, comparison, social-proof, countdown, chat-launcher, separator

## Composition rules:
1. ALWAYS start with a hero block — strong headline + subheadline + CTA
2. Follow with value proposition blocks (features, stats, two-column)
3. Add social proof (testimonials, logos, social-proof)
4. Include at least one conversion block (cta, form, newsletter, chat-launcher)
5. End with a final CTA or contact section
6. Use separator blocks between major sections
7. Keep total blocks between 5-10 for focused landing pages
8. Match tone and messaging to the target audience
9. If linked to an ad campaign, align messaging with campaign objective

## Output format:
Return a valid content_json array of ContentBlock objects with proper data for each block type.`,
  },
  {
    name: 'site_branding_get',
    description: 'Read current site branding settings including logo, colors, fonts, and favicon. Use when: retrieving current brand settings; checking active color scheme; verifying logo URL. NOT for: updating branding (site_branding_update); managing site settings (manage_site_settings).',
    category: 'content',
    handler: 'db:site_settings',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'site_branding_get',
        description: 'Read current site branding settings including logo, colors, fonts, and favicon. Use when: retrieving current brand settings; checking active color scheme; verifying logo URL. NOT for: updating branding (site_branding_update); managing site settings (manage_site_settings).',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
    instructions: `## site_branding_get
### What
Reads current site branding settings: logo, colors, fonts, favicon.
### When to use
- Admin asks about current branding
- Before making branding changes (get current state)
- Content creation that needs brand context
### Parameters
- None required.
### Edge cases
- Returns null for unset values.
- Use site_branding_update to make changes.`,
  },
  {
    name: 'site_branding_update',
    description: 'Update site branding settings — logo URL, primary/accent colors, font family, favicon. Use when: changing the site logo; updating brand colors; applying a new visual identity. NOT for: reading current branding (site_branding_get); managing global blocks (manage_global_blocks).',
    category: 'content',
    handler: 'db:site_settings',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'site_branding_update',
        description: 'Update site branding settings — logo URL, primary/accent colors, font family, favicon. Use when: changing the site logo; updating brand colors; applying a new visual identity. NOT for: reading current branding (site_branding_get); managing global blocks (manage_global_blocks).',
        parameters: {
          type: 'object',
          properties: {
            logo_url: {
              type: 'string',
              description: 'URL to logo image',
            },
            favicon_url: {
              type: 'string',
              description: 'URL to favicon',
            },
            primary_color: {
              type: 'string',
              description: 'Primary brand color (hex)',
            },
            accent_color: {
              type: 'string',
              description: 'Accent color (hex)',
            },
            font_family: {
              type: 'string',
              description: 'Primary font family name',
            },
          },
          required: [],
        },
      },
    },
    instructions: `## site_branding_update
### What
Updates site branding settings — logo, colors, fonts, favicon. Requires approval.
### When to use
- Admin asks to change logo, colors, or fonts
- Rebranding workflow
### Parameters
- **logo_url**: URL to logo image.
- **favicon_url**: URL to favicon.
- **primary_color**: Hex color code.
- **accent_color**: Hex color code.
- **font_family**: Font family name.
### Edge cases
- Requires approval — branding changes are visible to all visitors immediately.
- Logo and favicon should be hosted in the media library or a CDN.`,
  },
  {
    name: 'create_page_block',
    description: 'Create a new content block on an existing page. Supports batch mode for adding multiple blocks at once. Use when: building a page after manage_page created it, adding sections during migration, user asks to add a hero/features/CTA section. NOT for: creating pages (use manage_page), editing existing blocks (use manage_page_blocks), full page migrations (use migrate_url first).',
    category: 'content',
    handler: 'module:pages',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'create_page_block',
        parameters: {
          type: 'object',
          required: [
            'page_id',
            'block_type',
          ],
          properties: {
            action: {
              type: 'string',
              const: 'add',
              description: 'Action to perform',
            },
            blocks: {
              type: 'array',
              items: {
                type: 'object',
                required: [
                  'type',
                  'data',
                ],
                properties: {
                  data: {
                    type: 'object',
                    description: 'Block-specific data',
                  },
                  type: {
                    type: 'string',
                    description: 'Block type',
                  },
                },
              },
              description: 'BATCH MODE: Array of blocks to add in one call. Each: {type, data}. Use this to add 5-20 blocks at once instead of calling one at a time.',
            },
            page_id: {
              type: 'string',
              description: 'UUID of the page to add the block to',
            },
            position: {
              type: 'integer',
              description: 'Position to insert the block at (0-indexed, default: end)',
            },
            block_data: {
              type: 'object',
              description: 'Content data for the block',
            },
            block_type: {
              type: 'string',
              description: 'Type of block to create (hero, text, features, etc.)',
            },
          },
        },
        description: 'Create content blocks on a page. Supports BATCH: pass blocks[] array with multiple {type,data} objects to add 5-20 blocks in ONE call. Also supports single block via block_type + block_data. Use batch mode when building full pages — much more efficient than one block at a time. Available block types: hero, text, cta, features, stats, testimonials, pricing, accordion, form, newsletter, quote, two-column, info-box, logos, comparison, social-proof, countdown, chat-launcher, separator, tabs, marquee, embed, table, progress, badge, floating-cta, notification-toast, parallax-section, bento-grid, section-divider, gallery, image, youtube, map, team, timeline, products, announcement-bar, lottie, webinar, featured-carousel, quick-links, trust-bar, category-nav, shipping-info, ai-assistant.',
      },
    },
    instructions: 'Use this only after a page exists. Required: page_id and block_type. If page_id is missing, first call manage_page with action=create and use the returned page_id. Then call create_page_block.',
  },
  {
    name: 'generate_site_from_identity',
    description: 'Generate a complete website from the Business Identity profile. Use when: setting up a brand new site, user says "build my website", generating initial site structure. NOT for: editing existing pages (use manage_page), migrating external sites (use migrate_url).',
    category: 'content',
    handler: 'db:pages',
    scope: 'both',
    tool_definition: {
      type: 'function',
      function: {
        name: 'generate_site_from_identity',
        parameters: {
          type: 'object',
          properties: {
            page_title: {
              type: 'string',
              description: 'Optional override for page title. Defaults to company name.',
            },
            include_footer: {
              type: 'boolean',
              description: 'Generate global footer. Default true.',
            },
            include_header: {
              type: 'boolean',
              description: 'Generate global header. Default true.',
            },
            include_landing_page: {
              type: 'boolean',
              description: 'Generate landing page. Default true.',
            },
          },
          additionalProperties: false,
        },
        description: 'Generate a complete website from the Business Identity profile. Use when: setting up a brand new site, user says "build my website", generating initial site structure. NOT for: editing existing pages (use manage_page), migrating external sites (use migrate_url).',
      },
    },
    instructions: 'Use when a client has filled in their Business Identity and wants a website generated. AI analyzes available data fields and composes appropriate blocks. Requires approval. Page created as draft.',
  },
  {
    // Exposes the admin Copilot site-builder reasoning loop as a first-class
    // MCP skill so external claws (OpenClaw, sales/ops claws) can drive the
    // same block-by-block site builder that the admin /admin/copilot UI uses.
    // ONE implementation of the loop — two consumers (admin UI + MCP).
    name: 'build_site_step',
    description: 'Run one step of the site-builder reasoning loop: takes conversation history + current module state, returns next assistant message and optionally a tool_call (create_block / migrate_url / update_footer / activate_modules). Caller is responsible for applying the tool_call and feeding the result back as the next user message. Use when: an external operator wants to drive the AI site builder programmatically; building or migrating a website block-by-block from another agent. NOT for: directly creating a single page (manage_page) or block (create_page_block); migrating a single URL without iterative feedback (migrate_url).',
    category: 'content',
    handler: 'edge:copilot-action',
    scope: 'both',
    tool_definition: {
      type: 'function',
      function: {
        name: 'build_site_step',
        description: 'Run one step of the site-builder reasoning loop. Returns { message, toolCall? } — caller applies the toolCall (creating a block, migrating a URL, updating footer, activating a module), then calls again with the result appended to messages. Loop ends when no toolCall is returned.',
        parameters: {
          type: 'object',
          properties: {
            messages: {
              type: 'array',
              description: 'Full conversation history. Each item: { role: "user"|"assistant", content: string }.',
              items: {
                type: 'object',
                properties: {
                  role: { type: 'string', enum: ['user', 'assistant'] },
                  content: { type: 'string' },
                },
                required: ['role', 'content'],
              },
              minItems: 1,
            },
            currentModules: {
              type: 'object',
              description: 'Optional current ModulesSettings snapshot so the builder knows which modules are already enabled. If omitted, defaults are used.',
              additionalProperties: true,
            },
            migrationState: {
              type: 'object',
              description: 'Optional active migration context: { sourceUrl, platform } when a migration loop is in progress.',
              properties: {
                sourceUrl: { type: 'string' },
                platform: { type: 'string' },
              },
              additionalProperties: false,
            },
          },
          required: ['messages'],
          additionalProperties: false,
        },
      },
    },
    instructions: `## build_site_step
### What
Single step of the AI site-builder. Same loop the admin /admin/copilot UI uses, exposed for external claws.
### When to use
- An external operator wants to build or migrate a website iteratively
- You want block-by-block control with approval between each step
### How to drive the loop
1. Send messages = [{ role: 'user', content: 'Build a SaaS landing page for X' }]
2. Receive { message, toolCall? }
3. If toolCall.name === 'create_block' → render/save the block, then continue with messages += [{ role: 'assistant', content: message }, { role: 'user', content: 'approved, next' }]
4. If toolCall.name === 'migrate_url' → run migrate_url skill, feed extracted blocks back
5. If toolCall.name === 'update_footer' → call manage_global_blocks with slot=footer
6. If toolCall.name === 'activate_modules' → enable listed modules, continue
7. Loop until response has no toolCall
### Tool calls returned
- create_<type>_block — extract data, persist via create_page_block
- migrate_url — call site-migration migrate_url skill
- update_footer — phone/email/address fields → global footer block
- activate_modules — list of module ids to enable
### Edge cases
- Stateless on the server side — caller owns the conversation history.
- Returns 429/402 on AI provider rate-limit / credits exhausted — back off and retry.`,
  },
];

export const pagesModule = defineModule<PageModuleInput, PageModuleOutput>({
  id: 'pages',
  name: 'Pages',
  version: '1.0.0',
  processes: ['content-to-conversion'],
  maturity: 'L4',
  description: 'Create and publish CMS pages',
  capabilities: ['content:receive', 'data:write', 'webhook:trigger'],
  inputSchema: pageModuleInputSchema,
  outputSchema: pageModuleOutputSchema,

  skills: [
    'manage_page',
    'manage_page_blocks',
    'create_page_block',
    'manage_global_blocks',
    'generate_site_from_identity',
    'landing_page_compose',
    'build_site_step',
  ],
  skillSeeds: PAGES_SKILLS,

  webhookEvents: [
    { event: 'page.published', description: 'A page was published' },
    { event: 'page.updated', description: 'A page was updated' },
    { event: 'page.deleted', description: 'A page was deleted' },
  ],

  async publish(input: PageModuleInput): Promise<PageModuleOutput> {
    try {
      const validated = pageModuleInputSchema.parse(input);
      const baseSlug = validated.slug || generateSlug(validated.title);
      const timestamp = Date.now().toString(36);
      const slug = validated.slug ? baseSlug : `${baseSlug}-${timestamp}`;

      let contentJson: Json;
      if (Array.isArray(validated.content)) {
        contentJson = validated.content as Json;
      } else if (typeof validated.content === 'string') {
        contentJson = [{ id: crypto.randomUUID(), type: 'text', data: { content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: validated.content }] }] } } }] as Json;
      } else if (isTiptapDocument(validated.content)) {
        contentJson = [{ id: crypto.randomUUID(), type: 'text', data: { content: validated.content } }] as Json;
      } else {
        contentJson = [] as Json;
      }

      const status = validated.options?.status || 'draft';
      const pageData = {
        title: validated.title,
        slug,
        content_json: contentJson as Json,
        status,
        show_in_menu: validated.options?.show_in_menu ?? false,
        menu_order: validated.options?.menu_order ?? 0,
        scheduled_at: validated.options?.schedule_at || null,
        meta_json: validated.meta ? {
          source_module: validated.meta.source_module,
          source_id: validated.meta.source_id,
          seo_title: validated.meta.seo_title,
          seo_description: validated.meta.seo_description,
        } as Json : null,
      };

      const { data, error } = await supabase
        .from('pages')
        .insert(pageData)
        .select('id, slug, status')
        .single();

      if (error) {
        logger.error('[PagesModule] Insert error:', error);
        return { success: false, error: error.message };
      }

      if (status === 'published') {
        try {
          await triggerWebhook({
            event: 'page.published',
            data: { id: data.id, title: validated.title, slug: data.slug, url: `/${data.slug}`, source_module: validated.meta?.source_module },
          });
        } catch (webhookError) {
          logger.warn('[PagesModule] Webhook failed:', webhookError);
        }
      }

      return { success: true, id: data.id, slug: data.slug, url: `/${data.slug}`, status: data.status };
    } catch (error) {
      logger.error('[PagesModule] Error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
});
