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
              description: 'Page SEO and display settings (for create/update) — the keys below are the ones the public page reads; any other key is stored and ignored. On update it REPLACES the stored meta: read it with get and send it back with your change. meta_json is accepted as an alias.',
              properties: {
                seoTitle: { type: 'string', description: 'Search/share title WITHOUT the site name — the site title template adds it ("X-HT waterjet" → "X-HT waterjet | Company"). Keep the whole under ~60 characters.' },
                description: { type: 'string', description: 'Meta description, 120–160 characters. Search results and link previews show it.' },
                og_image: { type: 'string', description: 'Absolute https URL of the image link previews show (LinkedIn, Slack, WhatsApp). Usually the page hero image.' },
                noIndex: { type: 'boolean', description: 'Ask search engines not to index this page.' },
                noFollow: { type: 'boolean', description: 'Ask search engines not to follow its links.' },
                showTitle: { type: 'boolean', description: 'false hides the automatic page title above the blocks (a page opening with a hero never shows it).' },
                titleAlignment: { type: 'string', enum: ['left', 'center'], description: 'Alignment of that automatic page title.' },
              },
            },
            meta_json: {
              type: 'object',
              description: 'Alias for meta. get returns the column under this name, so this is the name you naturally send back.',
              properties: {
                seoTitle: { type: 'string', description: 'Search/share title WITHOUT the site name — the site title template adds it ("X-HT waterjet" → "X-HT waterjet | Company"). Keep the whole under ~60 characters.' },
                description: { type: 'string', description: 'Meta description, 120–160 characters. Search results and link previews show it.' },
                og_image: { type: 'string', description: 'Absolute https URL of the image link previews show (LinkedIn, Slack, WhatsApp). Usually the page hero image.' },
                noIndex: { type: 'boolean', description: 'Ask search engines not to index this page.' },
                noFollow: { type: 'boolean', description: 'Ask search engines not to follow its links.' },
                showTitle: { type: 'boolean', description: 'false hides the automatic page title above the blocks (a page opening with a hero never shows it).' },
                titleAlignment: { type: 'string', enum: ['left', 'center'], description: 'Alignment of that automatic page title.' },
              },
            },
            version_id: {
              type: 'string',
              description: 'For action rollback: the page_versions UUID to restore. Omit to roll back to the most recent version.',
            },
            show_in_menu: {
              type: 'boolean',
              description: 'Whether the page appears in the site navigation menu (for create/update). A page created by an agent should say where it belongs: top-level pages true; sub-pages of a hub (a service detail under /services, a chapter under a guide) usually false — they are reached from their hub, not the header. Omitted on create → true (the column default); omitted on update → unchanged.',
            },
            menu_order: {
              type: 'integer',
              description: 'Position in the navigation menu, ascending from 0 (for create/update). list returns every page\'s menu_order — read it before choosing a slot. Omitted on create → 0; omitted on update → unchanged.',
            },
            locale: {
              type: 'string',
              description: 'create: the language the page is written in, as the site declares it (site_languages.enabled, e.g. "sv", "en"). Omitted → the site\'s default language. On a site with more than one language, a page written in the other language MUST say so, or it is filed and served as the default language. Not for update — manage_page_translation set_locale moves an existing page.',
            },
            scheduled_at: {
              type: 'string',
              description: 'update: ISO timestamp to publish the page at. Queues it (status reviewing) — publish_scheduled_content takes it live when the time passes. null takes it out of the queue.',
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
  **SEO lives in meta** under exactly these keys — the ones the public page and link
  previews read: \`seoTitle\` (no site name: the title template adds it), \`description\`
  (120–160 chars), \`og_image\` (absolute URL, usually the hero image), \`noIndex\`,
  \`noFollow\`. \`seo_title\`/\`seo_description\`/\`metaDescription\` are NOT read — a page
  written with them has no description (found building the MJP demo, 2026-09-28).
  Check a page with \`seo_audit_page\`.
  Every one of those four names is declared in this skill's schema and honoured by the
  handler — an instruction that names an argument the schema hides gets the caller bounced
  for doing exactly as it was told, so the two are kept in lockstep here.
- **show_in_menu** (boolean), **menu_order** (integer): Menu placement, honoured by BOTH create
  and update. A page created by an agent should say where it belongs in the menu: top-level
  pages \`show_in_menu: true\`; sub-pages of a hub (service details, guide chapters, campaign
  variants) usually \`show_in_menu: false\` — visitors reach them from the hub, and a header
  that lists every sub-page is the failure mode. \`menu_order\` is ascending from 0; \`list\`
  returns every page's menu_order and show_in_menu, so read it before picking a slot.
  Omitted on update → unchanged. Omitted on create → in the menu, order 0.
- **locale** (string, create only): the language the page is written in, as the site declares
  it (\`site_languages.enabled\` — "sv", "en"…). Omitted → the site's default language. On a
  site with more than one language, read the declaration first (manage_site_settings get
  \`site_languages\`) and say which language you are writing: a Swedish page created without
  \`locale\` on an English-default site is stamped "en", served at the English address and
  offered to nobody as Swedish. A language the site does not declare is refused with the list.
  An existing page is moved with manage_page_translation \`set_locale\`, never through update.
- **scheduled_at** (update, ISO timestamp): publish later. The page waits as \`reviewing\` and
  \`publish_scheduled_content\` (every 15 minutes) takes it live once the time passes —
  the same contract as manage_blog_posts. \`null\` takes it out of the queue.
- **Update writes exactly what you send and refuses what it cannot read.** An argument
  this skill does not declare (\`is_published\`, \`hidden\`, \`in_menu\`, \`published\`…) is
  REFUSED with the nearest valid name and the full valid list — never dropped. The
  response echoes \`updated_fields\` plus the row's \`show_in_menu\` / \`menu_order\`, so
  read it back rather than trusting "updated".
### Edge cases
- Delete is soft-delete (archive). Hard delete requires explicit confirmation.
- Rollback restores previous version from page_versions table.
- There is no \`unpublish\` action — use action \`archive\` (or update status via the admin UI).
### content_json — the block contract (read before writing a single block)
content_json is a ContentBlock[]: [{ type, data }]. The types and the field names
inside data are NOT free-form, and inventing them is the #1 reason a page write fails.
**The block envelope** (next to \`type\` and \`data\`, same for every block type):
\`sectionBackground\` — the SURFACE the renderer paints behind the block: \`none\` (page
background), \`muted\` (soft band), \`accent\` (brand tint), \`dark\` (the INVERSE of the current
theme — on a dark site this is the light "paper" section). Omitted = the renderer alternates
muted/none for you. \`anchorId\` — the section's id for in-page links (#pricing). A page whose
rhythm needs "dark hero, light intro, dark features" is written with sectionBackground, not
with CSS; describe_blocks returns this envelope with every answer.
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
    description: 'Update site branding settings — logo (light and dark), favicon, primary color (light and dark), accent color, heading/body fonts. Only the fields passed change; the rest of the branding is kept. Use when: changing the site logo; updating brand colors; giving the dark theme its own logo or primary; applying a new visual identity. NOT for: reading current branding (site_branding_get); managing global blocks (manage_global_blocks).',
    category: 'content',
    handler: 'db:site_settings',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'site_branding_update',
        description: 'Update site branding settings — logo (light and dark), favicon, primary color (light and dark), accent color, heading/body fonts. Only the fields passed change; the rest of the branding is kept. Use when: changing the site logo; updating brand colors; giving the dark theme its own logo or primary; applying a new visual identity. NOT for: reading current branding (site_branding_get); managing global blocks (manage_global_blocks).',
        parameters: {
          type: 'object',
          properties: {
            logo_url: {
              type: 'string',
              description: 'URL to the logo shown on light backgrounds (the default logo)',
            },
            logo_dark_url: {
              type: 'string',
              description: 'URL to the logo shown when the site is in dark theme (header and footer swap to it). Empty string removes it, and the light logo is used in both themes.',
            },
            favicon_url: {
              type: 'string',
              description: 'URL to favicon',
            },
            primary_color: {
              type: 'string',
              description: 'Primary brand color for the light theme (hex, e.g. #1a56db). The dark-theme primary is derived from it unless primary_color_dark is set.',
            },
            primary_color_dark: {
              type: 'string',
              description: 'Primary color used in dark theme (hex). Set it when the light primary is very dark or very light — a black primary on a dark theme has no contrast. Empty string removes the override (derived again).',
            },
            accent_color: {
              type: 'string',
              description: 'Accent color (hex)',
            },
            font_family: {
              type: 'string',
              description: 'One font family for BOTH headings and body. Use heading_font / body_font to set them separately.',
            },
            heading_font: {
              type: 'string',
              description: 'Font family for headings (overrides font_family for headings)',
            },
            brand_tagline: {
              type: 'string',
              description: 'The one-sentence line under the logo in the footer, written in the site\'s default language (it is one value; the footer shows it only on pages in that language). Empty string clears it. Rewrite it when the site\'s default language changes.',
            },
            body_font: {
              type: 'string',
              description: 'Font family for body text (overrides font_family for body)',
            },
            default_theme: {
              type: 'string',
              enum: ['light', 'dark', 'system'],
              description: 'The theme visitors get: light, dark, or the visitor\'s OS setting. A dark site is this dial — never a CSS overlay in custom_scripts.',
            },
            allow_theme_toggle: {
              type: 'boolean',
              description: 'Whether visitors may switch theme. false = default_theme is forced for everyone.',
            },
            border_radius: {
              type: 'string',
              enum: ['none', 'sm', 'md', 'lg'],
              description: 'Corner radius for buttons, cards, panels and images. "none" is sharp everywhere.',
            },
            heading_transform: {
              type: 'string',
              enum: ['none', 'uppercase'],
              description: 'Heading case. "uppercase" for an all-caps display style.',
            },
            heading_weight: {
              type: 'string',
              enum: ['semibold', 'bold', 'black'],
              description: 'Heading weight: semibold (600), bold (700, default), black (800).',
            },
            heading_tracking: {
              type: 'string',
              enum: ['tight', 'normal', 'wide'],
              description: 'Heading letter-spacing: tight (default), normal, wide.',
            },
            heading_color: {
              type: 'string',
              enum: ['foreground', 'primary', 'accent'],
              description: 'Heading colour where the page is LIGHT: same as the text (default), the primary colour, or the accent. A brand manual that says "blue headings on white" sets primary here.',
            },
            heading_color_dark: {
              type: 'string',
              enum: ['foreground', 'primary', 'accent'],
              description: 'Heading colour where the page is DARK — the dark theme and the dark bands (sectionBackground "dark") of a light page. "Yellow headings on black" sets accent here.',
            },
            background_color: {
              type: 'string',
              description: 'The page GROUND where the page is light, hex (#ffffff). Unset = the design system\'s near-white. The dark theme\'s inverse band takes it too.',
            },
            background_color_dark: {
              type: 'string',
              description: 'The page GROUND where the page is dark, hex. A manual whose dark ground is pure black sets "#000000" here — never main{background} in custom_scripts. The light theme\'s inverse band takes it too.',
            },
            gradient_highlight: {
              type: 'string',
              description: 'The LIGHT tone of the brand\'s pixel gradient, hex (Synclair: frost blue #C4DEFF). Read by every section-divider with shape "pixel-gradient"; set once here, not per divider. Unset = the gradient runs ground → primary → ground.',
            },
            section_alternation: {
              type: 'string',
              enum: ['auto', 'none'],
              description: 'The renderer\'s automatic band alternation: auto (default) tints every second plain block; none paints every plain block on the page ground. A flat design that changes surface only through its own dividers and sectionBackground bands sets none — site-wide, instead of sectionBackground "none" on block after block.',
            },
            logo_animation_url: {
              type: 'string',
              description: 'The logo-mark ANIMATED (mp4/webm, a few seconds): plays in the header where the light logo shows, then settles into it. Sideload the file with media_browse import_from_url first. Empty string removes it.',
            },
            logo_animation_dark_url: {
              type: 'string',
              description: 'The animation for dark surfaces (where logo_dark_url shows). Empty string removes it.',
            },
            logo_animation: {
              type: 'string',
              enum: ['once', 'loop', 'off'],
              description: 'How the logo animation plays: once per visit then the static logo (default), loop, or off. Reduced-motion visitors always get the static logo.',
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
- **logo_url** / **logo_dark_url**: the logo for light backgrounds, and the one the header/footer swap to in dark theme.
- **favicon_url**: URL to favicon.
- **primary_color** / **primary_color_dark**: hex. The light primary is the brand colour; dark is derived from it unless set explicitly.
- **accent_color**: hex.
- **font_family** (both), or **heading_font** / **body_font** separately.
- **default_theme** (light | dark | system) and **allow_theme_toggle**: a dark site is \`default_theme: "dark"\` — with \`allow_theme_toggle: false\` every visitor gets it.
- **border_radius** (none | sm | md | lg): buttons, cards, panels and images follow one dial.
- **heading_transform** (none | uppercase), **heading_weight** (semibold | bold | black), **heading_tracking** (tight | normal | wide): the display style of every heading on the site.
- **section_alternation** (auto | none): the renderer tints every second plain block by itself; "none" turns that off site-wide for a flat design (Synclair: only the pixel-gradient dividers and the sectionBackground bands change surface). Prefer this over sectionBackground "none" on block after block.
- **background_color** / **background_color_dark** (hex): the page ground per theme — "the site is black" is \`background_color_dark: "#000000"\`, not CSS on main. **gradient_highlight** (hex): the light tone of the brand's pixel gradient, read by every section-divider with shape "pixel-gradient" — one fact, set here once.
- **heading_color** / **heading_color_dark** (foreground | primary | accent): the heading colour on light and on dark surfaces. The inverse band of a page (sectionBackground "dark") takes the dark one. "Yellow headings on a dark ground, blue on a light one" = \`heading_color_dark: "accent", heading_color: "primary"\`. Explicit colour classes a block sets on its own heading (a hero's light text, a CTA panel) still win.
- **logo_animation_url** / **logo_animation_dark_url** (mp4/webm) + **logo_animation** (once | loop | off): the logo-mark animated in the header, per surface like the logos. The header plays it and settles into the static logo; "once" is once per browser session; reduced-motion visitors get the static logo. Bring the file in with \`media_browse import_from_url\` (mp4/webm up to 8 MB) and pass the url it returns — never a header video script in custom_scripts.
### The design has dials — use them, never a stylesheet
Section surfaces are per block: \`sectionBackground\` (none | muted | accent | dark) on the block envelope — \`dark\` is the INVERSE of the current theme, so on a dark site it is the light "paper" section. Hero backgrounds are \`backgroundType\` (color | image | video). What these cannot express is a product gap: say so with report_finding. A CSS/JS overlay in custom_scripts is refused above 16 KB, and below it it is still invisible to inspect_rendered_page and breaks on the next deploy.
### Semantics
- Non-destructive: a call changes ONLY the fields it passes. Setting the dark logo does not touch colours, radius or anything else. Read the current state with site_branding_get first if you need it.
- Theme-aware: the app shows logoDark / primaryColorDark in dark theme and logo / primaryColor in light. If the brand's primary is near-black or near-white, set primary_color_dark too — otherwise the derived dark primary may still be too dark against the dark surface.
- An empty string clears a dark override (logo_dark_url: "" or primary_color_dark: "").
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
    description: 'Find translated text that has fallen behind its source, per string: the Swedish heading was changed, the English overlay still carries the old one — or was never translated. Use when: checking whether translations are up to date; before a launch or campaign in a second language; periodically as content hygiene; to get the unit keys set_translation needs. NOT for: translating (translate_page rewrites exactly the stale and missing units); creating a page for another market (manage_page with locale). Optional locale or slug narrows it. Pages still stored as sibling rows (the pre-overlay model) are reported under legacy_siblings until convert_translation_groups has run.',
    category: 'content',
    handler: 'internal:list_stale_translations',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_stale_translations',
        description: 'List missing and stale translation units per page and language. Exact — a hash per string, no threshold.',
        parameters: {
          type: 'object',
          properties: {
            entity: { type: 'string', enum: ['page', 'blog_post'], description: 'Only pages or only blog posts. Default: both.' },
            locale: { type: 'string', description: 'Only this language, e.g. "en". Default: every enabled language (a page or post is never listed in its own).' },
            slug: { type: 'string', description: 'Only this page.' },
            include_missing: { type: 'boolean', description: 'Default true. false lists only units whose source changed after translation.' },
            limit: { type: 'number', description: 'Max units listed across all findings, default 200.' },
          },
        },
      },
    },
    instructions: `## list_stale_translations

### What a finding is
Each entry is one page in one language with the units that are MISSING (never
translated — the visitor sees the source text) or STALE (translated, but the
source string changed since — the visitor sees the old translation). Both are
visible on the public page by design; this is the list of them.

### Acting on a finding
- Whole page: translate_page(slug, locale) — rewrites exactly the missing and
  stale units, keeps every fresh one (a human's polish survives).
- One string: set_translation(slug, locale, unit, text) with the unit key from
  the finding.
- Then publish_translation(slug, locale) if the overlay is still a draft.

Never rewrite a page's content_json to translate it — the structure lives on the
page, the text in the overlay.`,
  },
  {
    name: 'translate_site_into',
    description: 'Legacy name for enable_language: add a language to the site. Copies NOTHING any more — a language with no translations is an empty overlay, and translate_page fills it per page. Use when: an operator says "add Swedish" and the agent knows this name. NOT for: translating a page (translate_page); a different page for a market (manage_page with locale). Prefer enable_language.',
    category: 'content',
    handler: 'internal:enable_language',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'translate_site_into',
        description: 'Add a language to the site (alias of enable_language). Copies no pages.',
        parameters: {
          type: 'object',
          properties: {
            locale: { type: 'string', description: 'Language tag: "sv", "de", "en-GB".' },
            dry_run: { type: 'boolean', description: 'Report which pages would need translating, change nothing.' },
          },
          required: ['locale'],
        },
      },
    },
    instructions: `## translate_site_into — now enable_language
Until 2026-10 this copied every published page into a draft per language. The
copies were the cause of drift (design edits had to be repeated per language).
It now adds the language and returns the pages that lack a published overlay —
translate_page(slug, locale) per page, translate_ui_text(locale), then
publish_translation(slug, locale). Nothing is copied.`,
  },
  {
    name: 'enable_language',
    description: 'Add a language to the site (site_languages.enabled). Copies nothing: a language with no translations is an empty overlay, and the switcher lists a page in it only once its overlay is published. Use when: an operator asks to "add English" or "make the site available in German"; before translate_page on a language the site does not declare yet. NOT for: translating pages (translate_page), the strings around the content (translate_ui_text), changing which language visitors land in (manage_site_settings key site_languages). dry_run reports which pages would need translating.',
    category: 'content',
    handler: 'internal:enable_language',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'enable_language',
        description: 'Declare a language on the site. Copies no pages; returns the pages to translate.',
        parameters: {
          type: 'object',
          properties: {
            locale: { type: 'string', description: 'Language tag: "sv", "de", "en-GB".' },
            dry_run: { type: 'boolean', description: 'Report what would be enabled and which pages need translating; change nothing.' },
          },
          required: ['locale'],
        },
      },
    },
    instructions: `## enable_language

### Order of work for a new language
1. enable_language(locale) — the language is declared; the result lists every
   published page without a published overlay in it (todo)
2. translate_page(slug, locale) per page in todo — fills the page's overlay
3. translate_ui_text(locale) — buttons, chat, cookie banner, footer
4. publish_translation(slug, locale) per page once reviewed — the switcher
   lists a page in the language only when its overlay is published
5. Only when visitors should LAND in the new language, change
   site_languages.default (manage_site_settings) — a separate decision

### What it refuses
The site's own language. Enabling an already enabled language is a no-op that
still returns the todo list.`,
  },
  {
    name: 'translate_page',
    description:
      "Translate one page into another language, server-side, keeping the design: give slug (the page) + locale (the language to translate INTO). The page's structure stays where it is; the text lands in the page's overlay for that language, and only units that are missing or stale are translated — a translation a human polished survives until its source string changes. Use when: a language was enabled and a page has no overlay in it yet; list_stale_translations shows missing or stale units; a page was edited in the site language. NOT for: a different page for a market (manage_page with locale); editing one string by hand (set_translation); the strings around the content (translate_ui_text). Legacy: a page that still has a sibling row in the language is translated in place as before.",
    category: 'content',
    handler: 'internal:translate_page',
    scope: 'internal',
    trust_level: 'notify',
    instructions: `## translate_page
### What it does
Collects the page's text as UNITS — title, SEO meta, every prose string of every
block (<block.id>.<field>), each rich-text document as one unit — compares them
with the page's overlay for the language, and translates exactly the units that
are MISSING or STALE through the instance's AI in bounded batches. Fresh units
are never rewritten. The result is written to page_translations; the page's
content_json is not touched.
### Arguments
- slug (or page_id): the page — the one written in the site's language.
- locale: the language to translate INTO, e.g. "en". Required for the overlay.
- publish: true sets the overlay to published when every unit translated.
  Default false: a draft a person reviews (publish_translation later).
- dry_run: true reports units found / missing / stale and a sample; writes nothing.
- force: true retranslates every unit, fresh ones included (rarely right).
- context: glossary or tone notes ("keep 'Business Operating System' in English").
### Order of work for a new language
1. enable_language(locale)
2. translate_page(slug, locale) per page the result lists
3. translate_ui_text(locale)
4. publish_translation(slug, locale) once reviewed
### Reading the result
units_translated / units_untranslated / coverage are the facts. A unit that came
back untranslated keeps its old entry if it had one (stale, but better than the
source language) and is listed by list_stale_translations; set_translation fixes
one by hand. A large page may say "N of M batches done" — call again; translated
units are kept. Never re-send content_json through manage_page to "finish" a
translation: that is how a 24-block page became 11.`,
    tool_definition: {
      type: 'function',
      function: {
        name: 'translate_page',
        description: "Translate a page's text into a language, structure preserved: slug + locale. Only missing and stale units are translated.",
        parameters: {
          type: 'object',
          properties: {
            slug: { type: 'string', description: 'The page (written in the site language), e.g. "services"' },
            page_id: { type: 'string', description: 'Page id (alternative to slug)' },
            source_slug: { type: 'string', description: 'Legacy alias for slug' },
            locale: { type: 'string', description: 'Language to translate INTO, e.g. "en"' },
            publish: { type: 'boolean', description: 'Publish the overlay when fully translated (default false)' },
            dry_run: { type: 'boolean', description: 'Report units found / missing / stale, write nothing' },
            force: { type: 'boolean', description: 'Retranslate every unit, fresh ones included' },
            context: { type: 'string', description: 'Glossary / tone notes for the translator' },
          },
        },
      },
    },
  },
  {
    name: 'set_translation',
    description: 'Set one translated string by hand: slug (the page) + locale + unit (from list_stale_translations or the page editor\'s translation view) + text, or doc for a rich-text unit. Fresh by definition — stamped with the current source hash, so translate_page will not overwrite it until the source string changes. Use when: a translation is right except one phrase; a term must follow a glossary; removing an entry (remove: true) so the source text shows again. NOT for: translating a whole page (translate_page); editing the page\'s own text (manage_page).',
    category: 'content',
    handler: 'internal:set_translation',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'set_translation',
        description: 'Write one unit of a page\'s translation overlay by hand.',
        parameters: {
          type: 'object',
          properties: {
            entity: { type: 'string', enum: ['page', 'blog_post'], description: 'Default "page". "blog_post": slug is the post, units are post.title, post.excerpt, post.content, …' },
            slug: { type: 'string', description: 'The page (written in the site language) or, with entity blog_post, the post' },
            page_id: { type: 'string', description: 'Page id (alternative to slug)' },
            post_id: { type: 'string', description: 'Post id (entity blog_post, alternative to slug)' },
            locale: { type: 'string', description: 'The overlay\'s language, e.g. "en"' },
            unit: { type: 'string', description: 'Unit key: "page.title", "page.meta.seoTitle", "<block.id>.data.title", "<block.id>.data.items[0].description"' },
            text: { type: 'string', description: 'The translated text (text units)' },
            doc: { type: 'object', description: 'The translated Tiptap document (rich-text units)' },
            remove: { type: 'boolean', description: 'Remove the entry — the unit shows the source text again' },
          },
          required: ['locale', 'unit'],
        },
      },
    },
  },
  {
    name: 'publish_translation',
    description: 'Publish (or unpublish) translation overlays: slug + locale for one page, or locale alone for EVERY page that has an overlay in that language (one call publishes a language). status published|draft. Visitors and the language switcher see a page in a language only when its overlay is published AND the page itself is. Use when: a translation has been reviewed; a whole language is ready to go live; a language version must be withdrawn without deleting the work. NOT for: publishing the page itself (manage_page publish); translating (translate_page). min_coverage refuses to publish below a coverage floor (per page in the bulk form); translated_slug sets the per-language address and needs slug.',
    category: 'content',
    handler: 'internal:publish_translation',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'publish_translation',
        description: 'Set a translation overlay to published or draft; optionally its per-language slug.',
        parameters: {
          type: 'object',
          properties: {
            entity: { type: 'string', enum: ['page', 'blog_post'], description: 'Default "page". "blog_post" publishes a post\'s overlay (slug = the post).' },
            slug: { type: 'string', description: 'The page (written in the site language), or the post. Omit to act on every page (or post) with an overlay in locale.' },
            page_id: { type: 'string', description: 'Page id (alternative to slug)' },
            post_id: { type: 'string', description: 'Post id (entity blog_post)' },
            locale: { type: 'string', description: 'The overlay\'s language' },
            status: { type: 'string', enum: ['published', 'draft'], description: 'Default published' },
            min_coverage: { type: 'number', description: 'Refuse to publish below this coverage percent (0–100). Default: no floor.' },
            translated_slug: { type: 'string', description: 'Per-language address, e.g. "services" for /en/services. Empty string clears it.' },
          },
          required: ['locale'],
        },
      },
    },
  },
  {
    name: 'convert_translation_groups',
    description: 'Convert pages stored as sibling rows per language (the pre-overlay model: home + home-sv) into ONE page with a translation overlay per language, so the design lives once. Use when: an instance still has translation groups (list_stale_translations reports legacy_siblings, the pages list shows -sv/-en copies); migrating a site to the overlay model. NOT for: translating (translate_page); a page that should differ per market (keep it a page: decisions keep_as_page). ALWAYS dry_run first (the default): it pairs every string per block (by id, by position when the shape is equal, by type when one block of that type is left unmatched on each side), reports missing and extra text, and writes nothing — and a dry run needs NO approval, only the live run does. A group where a version has text the source has no place for is blocked until decisions names drop_extra or keep_as_page per slug.',
    category: 'content',
    handler: 'internal:convert_translation_groups',
    scope: 'internal',
    trust_level: 'approve',
    tool_definition: {
      type: 'function',
      function: {
        name: 'convert_translation_groups',
        description: 'Sibling-row translations → overlays. dry_run (default true) reports the plan per group.',
        parameters: {
          type: 'object',
          properties: {
            dry_run: { type: 'boolean', description: 'Default true: report, write nothing.' },
            slug: { type: 'string', description: 'Only the group this page (any version) belongs to.' },
            decisions: { type: 'object', description: 'Per sibling slug: "drop_extra" (convert; the extra text is dropped and listed) or "keep_as_page" (it leaves the group and stays a page).' },
            limit: { type: 'number', description: 'Max groups per run, default 50.' },
          },
        },
      },
    },
    instructions: `## convert_translation_groups

### What happens per group, on a live run
1. The source is the version in the site's language (else the oldest).
2. Every other version's text is paired with the source's units (block id +
   field; by block position when ids differ but the shape is the same) and
   written as that language's overlay, stamped with the source's CURRENT
   hashes — fresh, because it WAS the translation of this source.
3. Text identical to the source (an untranslated copy) is left out: those
   units show the source text and list_stale_translations names them.
4. The sibling row is soft-deleted (trash, restorable) and its old address
   redirects (301) to /<lang>/<source slug>.
5. The source leaves the group: the page now has overlays.

### Order of work
1. dry_run (default) — read every group's paired / missing / extra.
2. For each BLOCKED group decide per slug: drop_extra or keep_as_page.
3. dry_run: false with the decisions. Start with ONE group (slug) on a live site.
4. list_stale_translations → translate_page for what is missing.

Never run it live on a site you have not dry-run first.`,
  },
  {
    name: 'manage_page_translation',
    description:
      'LEGACY (pre-overlay model): set a page locale, create/link sibling pages as language versions, list a page\'s language versions. Use when: an instance still stores translations as sibling rows and a version must be linked or its locale fixed; checking which sibling versions a page has. NOT for: translating a page (translate_page with locale — writes the page\'s overlay, no copy); adding a language (enable_language); editing page content (manage_page). Creating new sibling copies is discouraged — the overlay keeps one design per page.',
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
- **footer surface** (primary | ground | inverse | muted): which surface the footer sits on. primary (default) paints it in the brand colour — on a dark site whose dark primary is the accent that is a whole footer in the accent colour, which a brand manual usually forbids; set ground (page ground) or inverse (the opposite surface) there: { slot: "footer", action: "update", block_data: { surface: "ground" } }.
- **block_data**: Block configuration object for update.
### Header menu button and header link
- \`desktopMenu: 'hamburger'\` on the header's block_data hides the inline menu on
  desktop and shows a menu button that opens a full panel with the menu's groups
  as columns. Default \`'inline'\`. Phones keep their mobile menu either way.
- \`ctaText\` + \`ctaUrl\` keep ONE link visible in the header row as a button
  (e.g. "Contact" → /contact-us). Both or neither.
- update MERGES block_data into the stored block at the top level: send only
  the fields you change. A nested field (customNavItems) is replaced whole.
### Footer legal links (the row under the footer)
- \`legalLinks: [{ id, label, url, enabled, labels? }]\` — \`label\` is written in the
  site's DEFAULT language; \`labels\` carries the other languages by tag:
  \`{ id: "privacy", label: "Privacy policy", labels: { sv: "Integritetspolicy" }, url: "/privacy", enabled: true }\`.
  On a multilingual site give every link its \`labels\`, or visitors in the other
  language read the default language's word. When the default language changes,
  move the old label into \`labels\` and write \`label\` in the new default.
- Internal urls ("/contact") are sent to the visitor's language version of the
  page automatically; external urls are left as they are.
- legalLinks is an array: update replaces it whole — send every link.
### Footer link columns
- \`showMenuColumns: true\` on the footer's block_data shows the HEADER menu's groups
  (customNavItems with children) as link columns above the footer; menu items with no
  children form a first, untitled column. The menu is the one list — edit the header,
  and the footer follows. Quick links (\`showQuickLinks\`) list pages with show_in_menu.
### Edge cases
- Toggle enables/disables a global block without deleting it.
- Changes affect ALL pages immediately.`,
  },
];

export const pagesModule = defineModule<PageModuleInput, PageModuleOutput>({
  id: 'pages',
  name: 'Pages',
  version: '1.0.0',
  processes: ['content-to-conversion'],
  maturity: 'L4',
  description: 'Create and publish website pages, header, footer and navigation',
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
