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
    description: 'Full page lifecycle management for WEBSITE/CMS pages — the pages visitors see on the public site. Use when: creating or editing a website page (landing page, about, services, contact), publishing a draft, listing all pages, updating page metadata, archiving old content, creating destination page after migrate_url. NOT for: adding/editing individual blocks (use create_page_block or manage_page_blocks), scraping external sites (use migrate_url), product documentation pages (manage_docs_page), knowledge base Q&A (manage_kb_article).',
    category: 'content',
    handler: 'module:pages',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_page',
        description: 'Full page lifecycle management for WEBSITE/CMS pages — the pages visitors see on the public site. Use when: creating or editing a website page (landing page, about, services, contact), publishing a draft, listing all pages, updating page metadata, archiving old content, creating destination page after migrate_url. NOT for: adding/editing individual blocks (use create_page_block or manage_page_blocks), scraping external sites (use migrate_url), product documentation pages (manage_docs_page), knowledge base Q&A (manage_kb_article).',
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
              description: 'Page UUID or slug (for get/update/publish/archive/delete/rollback — slugs are resolved automatically)',
            },
            slug: {
              type: 'string',
              description: 'Page slug. Identifies an existing page for get/update/publish/archive/delete/rollback when page_id is omitted; names the NEW page for create.',
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
              description: 'Page meta JSON (for create/update). meta_json is accepted as an alias — send back what get returned.',
              properties: {},
            },
            meta_json: {
              type: 'object',
              description: 'Alias for meta. get returns the column under this name, so this is the name you naturally send back.',
              properties: {},
            },
            version_id: {
              type: 'string',
              description: 'For action rollback: the page_versions UUID to restore. Omit to roll back to the most recent version.',
            },
            content_json: {
              type: 'array',
              description: 'Alias for blocks — get returns the page body under this name, so this is the name you naturally send back. Same contract and same validation as blocks; send one of the two, not both.',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'UUID — use crypto.randomUUID() or any unique string' },
                  type: { type: 'string', description: 'Block type (kebab-case; describe_blocks lists them)' },
                  data: { type: 'object', description: 'Block-specific data — the block\'s EXACT field names', properties: {} },
                },
                required: ['type', 'data'],
              },
            },
            blocks: {
              type: 'array',
              description: 'Content blocks for create/update — a FULL replacement of the page body. content_json is accepted as an alias (send back what get returned). Each block: { id, type, data }. Invalid blocks make the whole update FAIL with per-block reasons (nothing is written); fix the named fields and retry.',
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
                    description: 'Block-specific data — use the block\'s EXACT field names (describe_blocks returns them; unknown fields are rejected). text: { title?, content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "..." }] }] } }. hero: { title, subtitle?, eyebrow?, primaryButton: { text, url } }. accordion: { title?, items: [{ question, answer: <Tiptap doc> }] }. cta: { title, subtitle?, buttonText, buttonUrl }. two-column: { eyebrow?, title?, content: <Tiptap doc>, imageSrc?, ctaText?, ctaUrl? }.',
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
- **action**: Required. One of: list, get, create, update, publish, archive, delete, rollback.
- **page_id** or **slug**: Required for most actions except list/create.
- **title**, **meta** (alias **meta_json**), **blocks** (alias **content_json**): For create/update.
  Every one of those four names is declared in this skill's schema and honoured by the
  handler — an instruction that names an argument the schema hides gets the caller bounced
  for doing exactly as it was told, so the two are kept in lockstep here.
- **version_id**: For rollback only. Omit to restore the most recent version.
### Edge cases
- Delete is soft-delete (archive). Hard delete requires explicit confirmation.
- Rollback restores previous version from page_versions table.
- There is no \`unpublish\` action — use action \`archive\` (or update status via the admin UI).
### content_json — the block contract (read before writing a single block)
content_json is a ContentBlock[]: [{ type, data }]. The types and the field names
inside data are NOT free-form, and inventing them is the #1 reason a page write fails.
- **Two envelope spellings exist — never mix them in one call.**
  This skill takes \`blocks: [{ type, data }]\`.
  Its sibling \`create_page_block\` takes \`block_type\` + \`block_data\` (and also
  accepts \`blocks: [{ type, data }]\`).
  Taking THIS skill's array shell with THAT skill's field names —
  \`blocks: [{ block_type: "hero", block_data: { … } }]\` — is a real, repeated way
  to lose an entire page write. Both spellings are now tolerated here and folded to
  \`{ type, data }\` before validation, but write one form per call: if a block
  carries both, \`type\`/\`data\` win and the other half is discarded.
  This tolerance covers the ENVELOPE only — it does not extend to type names or to
  field names inside data, which must match exactly (see the next two bullets).
- **Never author blocks from memory.** Call \`describe_blocks\` FIRST — no argument for
  the catalogue of every renderable type, then \`describe_blocks({ block_type })\` for
  each type you are about to write — and use its exact type strings and field names.
  It is free to call; one lookup costs less than one refused write.
  It also answers WHICH block a piece of content belongs in, not only which fields it
  has — read that before you compose a page, or you will ship an essay in \`text\`
  blocks where the hand-built templates use \`features\`, \`stats\`, \`timeline\` and
  \`accordion\` (\`text\` is 2.9% of all blocks across them, and no page uses two).
- **Block types are kebab-case**, never snake_case: "two-column" (not two_column),
  "sticky-scroll" (not sticky_story), "bento-grid", "announcement-bar", "social-proof".
  A type nothing renders is an invisible hole in the page, not an error you will see.
- **The renderer's own field names win.** The misses that keep happening:
  hero requires \`title\` (NOT headline) and reads subtitle / eyebrow /
  primaryButton: { text, url } — not body, primary_cta or secondary_cta;
  cta requires one of \`buttonText\` | \`primaryButtonText\` | \`buttons\` (with buttonUrl);
  text requires \`content\`. Other required fields: features→features|items, stats→stats,
  testimonials→testimonials, team→members, logos→logos, accordion→items, tabs→tabs,
  pricing→tiers, timeline→steps, two-column→content|imageSrc, image→src, gallery→images,
  quote→quote, table→columns, marquee→items, bento-grid→items, form→fields, map→address.
- **Rich-text fields are Tiptap doc OBJECTS**, never markdown or plain strings:
  { "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "…" }] }] }.
  Applies to content, answer, leftColumn, rightColumn.
- **The write is fail-closed and all-or-nothing.** If ONE block is missing a required
  field, carries a field the type does not have, or names a type that does not exist,
  the entire create/update is refused and NOTHING is written — no partial page, no
  half-saved draft. An unknown field is refused for the same reason a missing one is:
  nothing renders it, so its content would sit in the database invisible while the page
  looked thin. The error names the block, the field, and the right field name when there
  is one; fix it and resend the complete array.`,
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
              description: 'Page UUID — or pass slug instead; both are accepted and resolved.',
            },
            slug: {
              type: 'string',
              description: 'Page slug. Works anywhere page_id does, so the slug you used with manage_page carries straight over — no lookup call needed.',
            },
            block_id: {
              type: 'string',
              description: 'Block UUID (for update/remove/duplicate/toggle)',
            },
            block_type: {
              type: 'string',
              description: 'Block type (for add): text, hero, cta, accordion, info-box, two-column, quote, separator, stats, features, form, newsletter. NOTE the shape: block_type and block_data are SEPARATE top-level arguments — there is no nested "block" object. A full add call is { action: "add", slug, block_type: "text", block_data: { content: {...} } }.',
            },
            block_data: {
              type: 'object',
              description: 'Block content data — use the block\'s EXACT field names (describe_blocks returns them; unknown fields are rejected, not silently ignored). text: { title?, content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "..." }] }] } }. hero: { title, subtitle?, eyebrow?, primaryButton: { text, url } }. accordion: { title?, items: [{ question, answer: <Tiptap doc> }] }. cta: { title, subtitle?, buttonText, buttonUrl }. info-box: { title, content: <Tiptap doc>, variant }. two-column: { eyebrow?, title?, content: <Tiptap doc>, imageSrc?, ctaText?, ctaUrl? }.',
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
- **page_id**: The page to modify. A **slug** is accepted here too and resolved
  automatically — pass whichever you hold; you never need a lookup call just to
  turn a slug into an id.
- **block_id**: Required for update/remove.
- **block_data**: The block's DATA FIELDS for add/update (e.g. { title, subtitle, features }). A full block object { id, type, data } is also accepted — the data inside is unwrapped. Update MERGES into existing data field-by-field; send only the fields you change.
- **position**: Insert position for add.
- **block_ids**: Ordered array for reorder.
### Edge cases
- block_data must match the ContentBlock schema for the block type.
- Reorder requires ALL block_ids in the desired order.
### Hard rules that break silently if guessed (learned from real agent writes)
- **Never author a block from memory — call describe_blocks FIRST, every time.**
  No argument returns the catalogue of renderable types; \`describe_blocks({ block_type })\`
  returns that type's exact field contract. Write only the type strings and field
  names it gave you. It is free to call; one lookup costs less than one refused write.
- **Block types are kebab-case, never snake_case**: "two-column" (not two_column),
  "sticky-scroll" (not sticky_story), "bento-grid", "announcement-bar". Invented
  types (e.g. "faq", "call_to_action", "two_column") and invented fields are
  REJECTED at write time — nothing is written and the turn is lost.
- **The renderer's own field names win.** The recurring misses:
  hero requires \`title\` (NOT headline) and reads subtitle / eyebrow /
  primaryButton: { text, url } — not body, primary_cta or secondary_cta;
  cta requires one of \`buttonText\` | \`primaryButtonText\` | \`buttons\` (plus buttonUrl);
  text requires \`content\` as a Tiptap doc object.
- **Fail-closed, per call**: a block missing a required field or carrying an unknown
  field is refused outright — nothing partial is stored. Read the error (it names the
  block, the field, and a filled example) and resend the corrected shape.
- **bento-grid: give at least one item span "wide" or "large".** All-normal
  spans defeat the bento layout — it renders as a plain equal-cell grid.
- **icon fields are exact lucide-react names in PascalCase**: "Cpu", "Shield",
  "TrendingUp". Lowercase ("cpu") renders NO icon — the lookup is exact.
- **Every item in an items/tiers/members array needs a stable string id**
  ("bento-privat-ai"). Editors key on it; missing ids break later editing.
- **Send only fields the block's schema declares.** Invented fields (e.g.
  layout/ctaText on bento-grid) are rejected at write time with the correct
  example structure in the error — read that hint and resend, do not retry
  the same shape. Enum-ish numbers are validated too (bento columns: 3 or 4).
### Use the blocks' full range — do not compose with the minimum
Blocks carry far more editorial control than their obvious fields, and pages
written with only title+content look like the poor cousin of what the renderer
can do. The one agents underuse most is **two-column**:
- **eyebrow** (small uppercase label above the title, e.g. "TJÄNSTER") +
  **eyebrowColor** (defaults to brand primary)
- **titleSize**: default | large | display — and **accentText**, a script-font
  word paired with the title ("Excellence"), placed via **accentPosition**
  (start | end | inline)
- **imageAspect** (1:1, 4:3, 3:2, 16:9, 21:9), **imageFit** (cover | contain),
  **imageRounded** (none→full), **secondImageSrc** for a collage feel,
  **stickyColumn** (image | text pins while the other scrolls)
- **ctaText/ctaUrl** with **note** for small print under the button
Alternate eyebrows across sections instead of repeating H2-only headers, and use
one accentText per page at most — it is seasoning, not sauce. Full field lists
for every block live in the platform's block reference; when unsure what a block
supports, ask for its schema rather than guessing from examples.`,
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
          // Deliberately empty: neither identifier nor block shape is a single
          // required name. The handler accepts page_id OR slug, and block_type
          // + block_data OR blocks[] — either/or shapes JSON Schema cannot
          // express. Listing page_id + block_type as required bounced two calls
          // the handler documents and honours (a slug-identified page, and
          // batch mode). The handler's own errors name both alternatives.
          required: [],
          type: 'object',
          properties: {
            action: {
              type: 'string',
              const: 'add',
              description: 'Optional and ignored — this skill only adds. Present so a caller that sends it is not bounced.',
            },
            slug: {
              type: 'string',
              description: 'Page slug — an alternative to page_id, resolved automatically. Pass one of the two.',
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
              description: 'UUID of the page to add the block to (a slug is also accepted, here or in `slug`)',
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
    instructions: `## create_page_block
### What
Add one block (block_type + block_data) or many (blocks[]: [{ type, data }]) to a page
that already exists. Batch is preferred when building a page — 5–20 blocks in one call.
### Order
Use this only after a page exists. Required: page_id (or slug) and block_type. If you
have no page_id, call manage_page action=create first and use the id it returns.
### Two envelope spellings exist — never mix them in one call
This skill's own names are \`block_type\` + \`block_data\` (single block). Its sibling
\`manage_page\` takes \`blocks: [{ type, data }]\` — and this skill's batch array uses
that same \`{ type, data }\` form, NOT block_type/block_data.
So there are exactly two legal shapes here:
  single: { page_id, block_type: "hero", block_data: { title, … } }
  batch:  { page_id, blocks: [{ type: "hero", data: { title, … } }, …] }
Taking the array shell with the single-block field names —
\`blocks: [{ block_type: "hero", block_data: { … } }]\` — is a real, repeated way to
lose a whole page write. Both spellings are now folded to \`{ type, data }\` before
validation on both skills, but write ONE form per call: if a block carries both,
\`type\`/\`data\` win and the other half is discarded. The tolerance covers the
ENVELOPE only — type names and the field names inside data must still match exactly.
### The block contract — never author blocks from memory
- **Call \`describe_blocks\` FIRST, every time.** No argument returns the catalogue of
  every renderable type; \`describe_blocks({ block_type })\` returns that type's exact
  field contract. Use its exact type strings and field names — do not reconstruct them
  from an example or from another site. It is free to call.
- **Block types are kebab-case, never snake_case**: "two-column" (not two_column),
  "sticky-scroll" (not sticky_story), "bento-grid", "announcement-bar", "social-proof".
- **The renderer's own field names win.** hero requires \`title\` (NOT headline) and
  reads subtitle / eyebrow / primaryButton: { text, url } — not body, primary_cta or
  secondary_cta. cta requires one of \`buttonText\` | \`primaryButtonText\` | \`buttons\`
  (plus buttonUrl). text requires \`content\`. Other required fields: features→features|items,
  stats→stats, testimonials→testimonials, team→members, accordion→items, tabs→tabs,
  pricing→tiers, timeline→steps, two-column→content|imageSrc, image→src, gallery→images,
  quote→quote, table→columns, marquee→items, bento-grid→items, form→fields, map→address.
- **Rich-text fields are Tiptap doc OBJECTS**, never markdown or plain strings:
  { "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "…" }] }] }.
- **Every item in an items/tiers/members array needs a stable string id**, and icon
  fields are exact lucide-react PascalCase names ("ShieldCheck", not "shield").
### Fail-closed
An invalid block is never written — an invented type, an unknown field or a missing
required field is refused with the block named, the valid field list, and a filled
example. In batch mode each block is judged on its own: the refused ones come back in
\`errors\` while the valid ones are added, so ALWAYS compare \`blocks_added\` with the
number you sent and re-send the rejected ones corrected. Never report a section as
created without checking \`errors\`.`,
  },
  {
    // Exposes the admin Copilot site-builder reasoning loop as a first-class
    // MCP skill so external claws (OpenClaw, sales/ops claws) can drive the
    // same block-by-block site builder that the admin /admin/copilot UI uses.
    // ONE implementation of the loop — two consumers (admin UI + MCP).
    name: 'build_site_step',
    description: 'Run one step of the site-builder reasoning loop: takes conversation history + current module state, returns next assistant message and optionally a tool_call (create_block / migrate_url / update_footer / activate_modules). Caller is responsible for applying the tool_call and feeding the result back as the next user message. Use when: an external operator wants to drive the AI site builder programmatically; building or migrating a website block-by-block from another agent. NOT for: directly creating a single page (manage_page) or block (create_page_block); migrating a single URL without iterative feedback (migrate_url).',
    category: 'content',
    handler: 'internal:build_site_step',
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
  {
    name: 'manage_redirect',
    description:
      'Manage URL redirects (301/302) from old paths to new pages or external URLs. Use when: a page slug changed and old links must keep working, consolidating pages, migrating from another site, fixing 404s. NOT for: renaming a page slug itself (manage_page) or navigation menus.',
    category: 'content',
    handler: 'rpc:manage_redirect',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_redirect',
        description:
          'list/create/update/delete rows in page_redirects. The public site resolves redirects on 404 (chains followed up to 5 hops, loops rejected at create). create upserts on from_path.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['list', 'create', 'update', 'delete'] },
            p_redirect_id: { type: 'string', format: 'uuid', description: 'Target redirect (update/delete)' },
            p_from_path: { type: 'string', description: 'Old path, e.g. "/old-pricing" (leading slash optional, matched case-insensitively)' },
            p_to_path: { type: 'string', description: 'New path (e.g. "/pricing") or a full external https:// URL' },
            p_status_code: { type: 'integer', enum: [301, 302], description: '301 permanent (default) or 302 temporary' },
            p_is_active: { type: 'boolean' },
            p_note: { type: 'string' },
            p_limit: { type: 'integer', default: 100 },
          },
        },
      },
    },
    instructions:
      'create upserts by from_path and rejects self-redirects and immediate 2-hop loops. Paths are normalized (lowercased, slashes trimmed). hit_count/last_hit_at on each row show real traffic through the redirect.',
  },
  {
    name: 'list_stale_translations',
    description: 'Find language versions of pages that have fallen behind their freshest sibling — the Swedish page was improved but the English one was not. Use when: checking whether translations are up to date; before a launch or campaign in a second language; periodically as content hygiene. NOT for: creating translations (translate_site_into, manage_page_translation); translating text (read the page and update the sibling). Returns each stale version with how many days it is behind. The threshold (default 24h) exists because batch operations touch every row at once — do not lower it to chase precision.',
    category: 'content',
    handler: 'rpc:list_stale_translations',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_stale_translations',
        description: 'List page translations older than their freshest sibling by more than a threshold.',
        parameters: {
          type: 'object',
          properties: {
            min_hours: { type: 'number', description: 'Threshold in hours, default 24. Guards against batch operations reading as drift.' },
          },
        },
      },
    },
    instructions: `## list_stale_translations

### The process gap this closes
A page per language stores the truth but hides the drift: nothing tells anyone
that the English services page is missing last week's Swedish improvements.
This lists exactly those — each stale version, its freshest sibling, and the
gap in days.

### Acting on a finding
1. Read the FRESHEST version (manage_page get, by base_slug)
2. Read the stale sibling and compare what changed
3. Update the sibling's content via manage_page update — translate the changed
   parts, do not overwrite text a human already localized
4. The sibling's updated_at moves forward and the finding clears itself

Never auto-publish a rewritten translation without being asked: propose the
update, or stage it as the page's draft state allows.`,
  },
  {
    name: 'translate_site_into',
    description: 'Copy every published page into a new language in one go, as drafts, and add that language to the site. Use when: a site installed from a template is in one language and someone wants a second one; an operator asks to "add Swedish" or "make an English version of the site". NOT for: translating a single page (manage_page_translation create); changing which language visitors get by default (manage_site_settings, key site_languages). Run with dry_run first — it reports how many pages would be copied without writing anything. Idempotent: a page that already has a version in the target language is skipped, so it can never duplicate. The copies are DRAFTS with the source text still in them; translating that text and publishing each page are separate steps.',
    category: 'content',
    handler: 'rpc:translate_site_into',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'translate_site_into',
        description: 'Copy all published pages into a new language as drafts. Idempotent.',
        parameters: {
          type: 'object',
          properties: {
            locale: { type: 'string', description: 'Language tag for the new version: "sv", "de", "en-GB".' },
            dry_run: { type: 'boolean', description: 'Default true. Reports what would be copied without writing.' },
            limit: { type: 'number', description: 'Max pages per run, default 200, cap 1000.' },
          },
          required: ['locale'],
        },
      },
    },
    instructions: `## translate_site_into

### What it does, and what it does not
Copies every PUBLISHED page written in the site's own language into a draft in
the target language, in the same translation group, and adds the language to
\`site_languages.enabled\`.

It copies. It does not translate: each draft still holds the source text.
Translating is the next step — \`translate_page\` per draft (source_slug +
locale), then \`translate_ui_text\` for the strings around the content, then
publish. Never rewrite a draft's content_json through manage_page to translate
it: the text is too large for a chat turn and pages come back shortened.

### Order of work
1. \`dry_run: true\` — report the number back before writing anything
2. \`dry_run: false\` — the drafts appear
3. translate_page each draft (source_slug + locale); translate_ui_text(locale); publish
4. Only when the visitor should LAND in the new language, change
   \`site_languages.default\` — that is a separate decision and a separate call

### What it refuses
The site's own language: there would be nothing to copy from. It also skips any
page that already has a version in the target language, so running it twice is
safe and the second run reports zero.

### Reading the result
\`pages_without_a_version\` is the number that matters to a human. \`failed\`
lists any page that could not be copied, with the reason — usually a slug
collision, which is worth reporting rather than retrying blindly.`,
  },
  {
    name: 'translate_page',
    description:
      "Translate one page's text into its own language — title, SEO meta and every block — server-side, keeping the block structure intact. Give the target page (e.g. home-sv) or source_slug + locale (the version is found or created). Use when: a language was added and the copied drafts still carry the source text; a page was edited in the site language and its translations are stale (list_stale_translations). NOT for: copying pages into a new language (translate_site_into), linking versions (manage_page_translation), editing text by hand (manage_page).",
    category: 'content',
    handler: 'internal:translate_page',
    scope: 'internal',
    trust_level: 'notify',
    instructions: `## translate_page
### What it does
Walks the page's content_json, meta_json and title, translates every prose string through the instance's AI in bounded batches, and writes the SAME tree back with the strings replaced. Ids, urls, icons, variants, names and link targets are left alone. Block count and shape cannot change — if they would, nothing is written.
### Arguments
- slug (or page_id): the target-language page, e.g. "home-sv". The source is the site-language version in the same translation group.
- OR source_slug + locale: e.g. source_slug "home", locale "sv" — the sv version is found, or created as a draft first.
- publish: true publishes when every string translated. Default false: a draft a person reviews.
- dry_run: true reports strings found and a sample, writes nothing.
- context: glossary or tone notes ("keep 'Business Operating System' in English").
### Order of work for a new language
1. translate_site_into(locale) — copies every published page into drafts
2. translate_page per draft (source_slug + locale, or the draft's slug)
3. translate_ui_text(locale) — the strings around the content (buttons, chat, cookie banner)
4. publish (translate_page publish: true, or manage_page publish) once reviewed
### Reading the result
strings_translated vs strings_untranslated is the fact that matters. A large page may say "N of M batches done" — call again; translated text is kept. Never re-send content_json through manage_page to "finish" a translation: that is how a 24-block page became 11.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'translate_page',
        description: "Translate a page's text into its locale server-side, structure preserved. Give slug (target page) or source_slug + locale.",
        parameters: {
          type: 'object',
          properties: {
            slug: { type: 'string', description: 'Target-language page slug, e.g. "home-sv"' },
            page_id: { type: 'string', description: 'Target page id (alternative to slug)' },
            source_slug: { type: 'string', description: 'Source page slug, with locale — the version is found or created' },
            locale: { type: 'string', description: 'Target language tag with source_slug, e.g. "sv"' },
            publish: { type: 'boolean', description: 'Publish when fully translated (default false)' },
            dry_run: { type: 'boolean', description: 'Report what would be translated, write nothing' },
            context: { type: 'string', description: 'Glossary / tone notes for the translator' },
          },
        },
      },
    },
  },
  {
    name: 'manage_page_translation',
    description:
      'Multi-language pages: set a page locale, create/link translations of a page, list a page\'s language versions. Use when: translating the site into another language, linking existing pages as language pairs, checking which locales a page has. NOT for: editing page content (manage_page) or translating raw text (translate utility).',
    category: 'content',
    handler: 'rpc:manage_page_translation',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_page_translation',
        description:
          'set_locale/link/unlink/create/list over pages.locale + pages.translation_group_id. create clones the source page as a draft in the new locale (slug gets a -<locale> suffix); the public page offers published translations via ?lang=.',
        parameters: {
          type: 'object',
          required: ['p_action', 'p_slug'],
          properties: {
            p_action: { type: 'string', enum: ['set_locale', 'link', 'unlink', 'create', 'list'] },
            p_slug: { type: 'string', description: 'Slug of the (source) page' },
            p_locale: { type: 'string', description: 'Locale code, e.g. en, sv, de (set_locale/create)' },
            p_target_slug: { type: 'string', description: 'Slug of the page to link as a translation (link)' },
            p_title: { type: 'string', description: 'Title for the new translation (create; defaults to source title + locale)' },
          },
        },
      },
    },
    instructions:
      'Pages in the same translation_group_id are language versions of each other; one page per locale per group. create copies content_json as a DRAFT — translate the copy with translate_page (never by re-sending content_json through manage_page) and publish it. link requires the two pages to already have different locales (use set_locale first). The public site resolves ?lang=<locale> to the published translation.',
  },
  {
    name: 'manage_page_experiment',
    description:
      'A/B test two versions of a page: create an experiment between a control page and a variant page, start/stop it, and read impressions/conversions/lift per variant. Use when: optimizing a landing page or hero, comparing two copy versions, concluding which variant won. NOT for: creating the variant page content itself (manage_page).',
    category: 'analytics',
    handler: 'rpc:manage_page_experiment',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_page_experiment',
        description:
          'create/start/stop/conclude/list/results over page_experiments. Visitors are split deterministically (sticky by visitor id); variant B content is served in place of the control page. results returns unique impressions, conversions, rates and lift.',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['create', 'start', 'stop', 'conclude', 'list', 'results'] },
            p_experiment_id: { type: 'string', format: 'uuid', description: 'Target experiment (start/stop/conclude/results)' },
            p_page_slug: { type: 'string', description: 'Control page A slug (create)' },
            p_variant_slug: { type: 'string', description: 'Variant page B slug (create) — usually a draft copy of the control with the change to test' },
            p_name: { type: 'string', description: 'Experiment name (create)' },
            p_traffic_split: { type: 'number', description: 'Fraction of visitors who see variant B, 0-1 exclusive (default 0.5)' },
            p_goal: { type: 'string', description: 'What counts as a conversion, e.g. "form submit"' },
            p_winner: { type: 'string', enum: ['a', 'b'], description: 'Winning variant (conclude)' },
          },
        },
      },
    },
    instructions:
      'Workflow: clone the page (manage_page or manage_page_translation-style copy) and edit the variant → create → start. Only one running experiment per page. The variant page can stay a draft — its content is served through the experiment engine. Conversions are recorded on form submissions on the page. conclude with p_winner records the outcome; to ship variant B, copy its content onto the control page.',
  },
  // Header/footer live under Pages — the globalElements module is off by
  // default ("merged into Pages"), so seeding here is what makes the skill exist.
  {
    name: 'manage_global_blocks',
    description:
      'Manage global blocks (header, footer, etc): list, get, update, toggle active status. Use when: changing header/footer content; reviewing active global elements; toggling visibility of a global block. NOT for: managing page-specific blocks (manage_page_blocks); updating site branding (site_branding_update).',
    category: 'content',
    handler: 'module:globalElements',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_global_blocks',
        description:
          'Manage global blocks (header, footer, etc): list, get, update, toggle active status. Use when: changing header/footer content; reviewing active global elements; toggling visibility of a global block. NOT for: managing page-specific blocks (manage_page_blocks); updating site branding (site_branding_update).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'get', 'update', 'toggle'] },
            slot: { type: 'string', description: 'Slot name (header, footer, etc.)' },
            block_data: { type: 'object', description: 'Block data for update' },
            category: {
              type: 'string',
              description:
                'Free-text category label for organizing global blocks. With action=update: sets the block category. With action=list: filters results to this category.',
            },
          },
          required: ['action'],
        },
      },
    },
    instructions: `## manage_global_blocks
### What
Manages global blocks (header, footer, announcement bar, etc.): list, get, update, toggle.
### When to use
- Admin asks to change header, footer, or site-wide elements
- Branding updates that affect global layout
### Parameters
- **action**: Required. list, get, update, toggle.
- **slot**: Slot name: header, footer, announcement, etc.
- **block_data**: Block configuration object for update.
### Edge cases
- Toggle enables/disables a global block without deleting it.
- Changes affect ALL pages immediately.`,
  },
];

export const pagesModule = defineModule<PageModuleInput, PageModuleOutput>({
  id: 'pages',
  name: 'Website',
  version: '1.0.0',
  processes: ['content-to-conversion'],
  maturity: 'L4',
  description: 'Create and publish website pages, header, footer, branding and navigation',
  capabilities: ['content:receive', 'data:write', 'webhook:trigger'],
  tier: 'standard',
  inputSchema: pageModuleInputSchema,
  outputSchema: pageModuleOutputSchema,

  skills: [
    'manage_page',
    'manage_page_blocks',
    'create_page_block',
    'manage_global_blocks',
    'build_site_step',
  ],
  data: {
    tables: ['page_versions', 'page_views', 'pages'],
  },
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
