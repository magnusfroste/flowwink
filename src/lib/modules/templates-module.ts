import { logger } from '@/lib/logger';
import { defineModule } from '@/lib/module-def';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { z } from 'zod';

const templatesInputSchema = z.object({
  action: z.enum(['export', 'import', 'install']),
  templateId: z.string().optional(),
  meta: z.record(z.unknown()).optional(),
});

const templatesOutputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  templateId: z.string().optional(),
});

type TemplatesInput = z.infer<typeof templatesInputSchema>;
type TemplatesOutput = z.infer<typeof templatesOutputSchema>;

/**
 * export_site_template is where "save the live site as a template" lives.
 *
 * The gap Magnus named: templates had import and export, but the export landed
 * nowhere — an agent that had just built a site over MCP would have had to
 * transcribe its own work back through manage_site_template by hand. save_as
 * closes that here rather than adding a second verb elsewhere: three other
 * skill descriptions already point at THIS name for "export the current site",
 * and a surface with two words for one job grows two half-working generations.
 *
 * The behaviour rules live in the description, not only the instructions — the
 * description is the tier an agent reads BEFORE choosing the call.
 */
const EXPORT_SITE_TEMPLATE_DESCRIPTION =
  'Read the live site back as a reusable StarterTemplate — published pages with their blocks, blog posts, branding/header/footer/SEO/cookie settings, homepage slug and enabled modules — and optionally SAVE it: pass save_as=<name> to store it in site_templates (idempotent on the name), so install_template reproduces this site on another instance. Without save_as nothing is written. include=[pages,blog,kb,products,wiki,documents] controls what is carried: wiki = every wiki page (markdown, tags, hierarchy, visibility); documents = every uploaded document (metadata, indexed text, and the stored file embedded when it fits — visibility shared/role/private kept, never widened). Whatever exists on the site but is not included is listed in export_report.skipped with the flag that would include it, so an omitted section never reads as an empty one. Media: by default the ABSOLUTE image URLs are referenced, not copied, and keep resolving to this instance after the template is installed elsewhere (export_report.assets counts them by host); copy_media=true downloads the images the carried content references from this instance\'s public storage and embeds them so install_template re-uploads them and rewrites the URLs. LIMITS (Free tier: one edge call has 150 s and the export is one JSON body): files are fetched sequentially within a 100 s budget, max_file_mb (default 8, max 20) per file and max_payload_mb (default 16, max 40) in total; a file that does not fit is NAMED in export_report.skipped with its reason and its document still travels with text + metadata — the export never fails as a whole. embed_files=false carries documents without their bytes. By default it STRIPS the fields that identify the origin instance (organisation name, agent prompts, SEO title, contact details, endpoints) — pass strip_identity=false to keep them; identity.stripped names every removal and identity.possible_secrets scans what remains for credential-shaped strings. Use when: saving a site an agent or admin just built, moving a whole site (content, knowledge and images) to a new instance, backing up the site structure, or inspecting what a template of this site would contain. NOT for: installing a template (install_template), authoring a template body by hand (manage_site_template), or a database backup (Supabase backups carry orders, contacts and every other table).';

const TEMPLATE_SKILLS: SkillSeed[] = [
  {
    name: 'list_templates',
    description:
      'List the starter-template catalog (bundled template JSON) plus which template (if any) is currently installed on this site. Use when: a user asks "what templates are available?", "what site am I running?", or before installing/switching a template. NOT for: actually installing a template (use install_template — a staged skill) or exporting the current site (use export_site_template).',
    category: 'system',
    handler: 'module:templates',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_templates',
        description: 'List available templates and the currently installed one.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list'] },
          },
          required: ['action'],
        },
      },
    },
    instructions:
      'Returns { catalog: [...], installed: {...} | null }. Catalog rows have id/name/tagline/category plus content counts (pages/blog_posts/kb_categories/products) and required_modules. installed has template_id, template_name, installed_at. To actually install, use install_template (staged).',
  },
  {
    name: 'manage_site_template',
    description:
      "Author the instance's own SITE templates: get, create, update or archive the reusable website bodies (pages, blocks, branding, header/footer/SEO) that install_template turns into a live site. IMPORTANT: load this skill's full instructions (read_skill / skill_read) BEFORE composing — they carry the page recipes, the StarterTemplate body shape, the composition rules and what belongs in settings rather than in a page. Call describe_blocks for exact field names; a guessed key is silently dropped and the section renders empty. Every create/update returns `validation` — a non-empty errors list means the write was REFUSED. Use when: the business wants its own starter site, a new vertical needs a template, or you are asked to design a website. NOT for: installing one (install_template), editing the live site's pages (manage_page_blocks), or exporting the current site (export_site_template).",
    category: 'system',
    handler: 'rpc:manage_site_template',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_site_template',
        description: 'Get, create, update or archive a reusable site template stored on this instance.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'get', 'create', 'update', 'archive'] },
            template: { type: 'string', description: "REQUIRED for get/update/archive — the template's exact name or its UUID. A unique name prefix also resolves; an ambiguous one errors with the candidates listed." },
            name: { type: 'string', description: 'REQUIRED for create. On update, renames the template.' },
            description: { type: 'string', description: 'One line on who this template is for — what an admin reads in the picker.' },
            category: { type: 'string', description: "Grouping in the picker, e.g. 'agency', 'saas', 'ecommerce'." },
            icon: { type: 'string', description: 'Lucide icon name (PascalCase) for the picker.' },
            tagline: { type: 'string', description: 'Short pitch shown under the name.' },
            template_json: { type: 'object', description: 'REQUIRED for create — the StarterTemplate body: { pages[], blogPosts[], branding, chatSettings, headerSettings, footerSettings, seoSettings, siteSettings{homepageSlug}, requiredModules[] }. On update, omit to leave unchanged.' },
            is_active: { type: 'boolean' },
          },
          required: ['action'],
          'x-action-required': { create: ['name', 'template_json'], get: ['template'], update: ['template'], archive: ['template'] },
        },
      },
    },
    instructions: `THE SITE COMPOSITION GUIDE — FlowWink owns the framework; the INSTANCE owns the content.

STEP 0, GATHER CONTEXT FIRST (never compose from a blank page):
1. \`manage_site_template action=list\` and \`list_templates\` — the existing templates ARE the house style; mirror their page set, section rhythm and voice.
2. \`describe_blocks\` — the block vocabulary with exact field names. Never guess a field name from an example; a wrong key is silently dropped and the section renders empty.
3. \`search_kb\` / \`search_wiki\` for the instance's positioning, tone and product language.
The platform supplies structure; the instance's own material supplies the words. Do not invent claims, customer names, metrics or logos — placeholder copy that reads as placeholder beats fabricated proof.

THE BODY: \`template_json\` is a StarterTemplate — \`{ pages[], blogPosts[], branding, chatSettings, headerSettings, footerSettings, seoSettings, siteSettings{homepageSlug}, requiredModules[] }\`. Each page is \`{ title, slug, isHomePage?, blocks[], meta{}, menu_order?, showInMenu? }\`. Each block is \`{ type, data{} }\` where \`data\` matches that block type exactly.

RICH TEXT: fields typed \`tiptap\` MUST be JSON objects — \`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"…"}]}]}\` — never strings. A stringified doc renders as nothing and looks correct in the payload; \`create\` refuses it and names the field.

PAGE RECIPES (a starting rhythm, not a rule):
- **home**: hero → features or bento-grid → two-column story → social proof (testimonials / logos / stats) → CTA.
- **services/products**: hero → pricing or comparison → accordion (objections) → CTA.
- **about**: two-column story → timeline → team → CTA.
- **contact**: contact or form → map, and nothing else competing for the eye.
- **support/help**: ai-faq or accordion → quick-links → chat-launcher.

COMPOSITION:
- Use the blocks' full range. A page written with only title+content looks like the poor cousin of what the renderer can do. \`two-column\` is the most underused: \`eyebrow\` + \`eyebrowColor\`, \`titleSize\` (default | large | display), \`accentText\` with \`accentPosition\`, \`imageAspect\` / \`imageFit\` / \`imageRounded\`, \`secondImageSrc\`, \`stickyColumn\`, \`ctaText\`/\`ctaUrl\` with \`note\`.
- Alternate eyebrows across sections instead of repeating H2-only headers. At most one \`accentText\` per page — it is seasoning, not sauce.
- Every page needs one clear next action. Two CTAs competing on the same screen is none.
- \`features\` requires an \`icon\` on every item (PascalCase Lucide names).
- Full-bleed blocks (hero, parallax-section, marquee, featured-carousel) already span the viewport — do not wrap them in a container-style section.

WHAT BELONGS WHERE: branding, header, footer, SEO and cookie settings are template-level, not page blocks — a logo pasted into a hero is not a header. \`requiredModules\` lists what the template's pages actually need (a booking block needs the booking module); it is a declaration, not a switch.

FROM THE LIVE SITE INSTEAD: if the site already exists — you just built it, or an admin did — do NOT transcribe it into \`template_json\` by hand. \`export_site_template save_as=<name>\` reads it back and stores it in one call. Compose here only when there is no site to read.

MECHANICS: \`create\` is idempotent on name — an existing name returns \`already_existed: true\`; use \`action=update\` to change a body. Every create/update returns \`validation\` — a non-empty \`errors\` list means the write was refused; \`warnings\` are advice worth reading. \`archive\` deactivates; templates are not deleted, because an installed site's provenance points back at them.`,
  },

  {
    name: 'install_template',
    description:
      'Install a starter template — either from the bundled catalog OR one authored on this instance (site_templates): seeds pages, blog posts, KB categories/articles, products (and consultants/booking data when the template ships them), then records an installed_template manifest so the next install can cleanly uninstall it. A template exported with export_site_template can also carry the site\'s KNOWLEDGE and FILES: wiki pages (restored on the slug — existing updated, never duplicated), documents (keyed on title + file_name; metadata, indexed text and the stored file; visibility kept as exported and never widened) and embedded media (uploaded to this instance\'s public storage with every URL in the content rewritten to point here). template_id accepts a catalog id (from list_templates) or a stored template\'s name/UUID (from manage_site_template action=list) — that is what closes the authoring loop: compose with manage_site_template, install with this. Existing live content is preserved — colliding slugs/names are skipped and reported. Use when: asked to "install/apply/switch to the X template", put an authored template live, move an exported site onto a fresh instance, set up a demo site, or seed starter content. NOT for: listing what is available (list_templates for the catalog, manage_site_template action=list for authored ones), exporting the current site (use export_site_template), or creating a single page/post (use the pages/blog skills).',
    category: 'system',
    handler: 'module:templates',
    scope: 'internal',
    trust_level: 'approve',
    requires_staging: true,
    tool_definition: {
      type: 'function',
      function: {
        name: 'install_template',
        description: 'Install a catalog template: seed pages/posts/KB/products and record the install manifest.',
        parameters: {
          type: 'object',
          properties: {
            template_id: {
              type: 'string',
              description: "Catalog template id (from list_templates), e.g. 'momentum', 'launchpad', 'blank' — OR the name/UUID of a template authored on this instance (manage_site_template action=list). An unknown value answers with both lists.",
            },
            publish: {
              type: 'boolean',
              description: 'Create content as published (default true). Pass false to seed everything as drafts.',
            },
            apply_settings: {
              type: 'boolean',
              description: 'Also merge template branding/chat/header/footer/SEO/cookie settings, homepage slug and required modules into site_settings (default false — content only).',
            },
            country: {
              type: 'string',
              description: 'ISO 3166-1 alpha-2 of the business, e.g. "SE", "NO", "DE". Picks the chart of accounts (an exact pack beats the template\'s own) and, on an instance with no home yet, sets it the way set_business_home does — general.country plus the country\'s currency and time zone in platform_locale — so the install is born in its own currency. An existing home is never overridden.',
            },
            include_pages: { type: 'boolean', description: 'Seed pages (default true).' },
            include_blog_posts: { type: 'boolean', description: 'Seed blog posts (default true when the template has any).' },
            include_kb: { type: 'boolean', description: 'Seed KB categories + articles (default true when the template has any).' },
            include_products: { type: 'boolean', description: 'Seed products + stock (default true when the template has any).' },
            include_wiki: { type: 'boolean', description: 'Restore the wiki pages an export carried (default true when the template has any). Keyed on slug: existing pages are updated, new ones created, none duplicated; parent_slug applied once every page exists.' },
            include_documents: { type: 'boolean', description: 'Restore the documents an export carried (default true when the template has any). Keyed on title + file_name: existing documents get their metadata and text updated (the stored file is left alone), new ones are created with the carried file re-sealed against its sha256. Visibility is kept as exported and never widened.' },
            include_media: { type: 'boolean', description: 'Upload the media files a copy_media export embedded and rewrite their URLs in the content (default true when the template has any). false leaves the URLs pointing at the origin instance. A file already at the same bucket/path is never overwritten: identical bytes are reused, a different file keeps its place and the copy is written beside it (media_written_beside_existing).' },
            media_base_url: { type: 'string', description: "The public base URL new media URLs are written with, e.g. 'https://api.customer.se'. Default: SUPABASE_PUBLIC_URL, then API_EXTERNAL_URL, then SUPABASE_URL — set it on a self-hosted target whose runtime only knows its internal gateway." },
          },
          required: ['template_id'],
        },
      },
    },
    instructions:
      'DOUBLE-GATED SKILL (requires_staging=true AND trust_level=approve): the first call does NOT install anything — it returns { staged: true, operation_id } with a preview. Handshake: 1) call install_template with your arguments, 2) call approve_pending_operation with p_id=<operation_id> (you confirm your own staged preview), 3) re-invoke install_template with the SAME arguments plus _approved_operation_id=<operation_id> — this answers status=pending_approval with an approval_request_id, because a HUMAN must approve in /admin/approvals (do NOT send _approved=true yet: without an approved request it is refused with no_approved_request), 4) once approved, re-call ONCE with the same arguments plus _approved_operation_id, _approved=true and _approval_request_id=<approval_request_id>. On execute it first uninstalls the previously installed template via its manifest (only resources that template created — wiki pages, documents and media files are recorded for provenance and NEVER removed by a later install), then seeds content. Order: media first (uploaded to the same bucket/path on this instance, every URL in the content rewritten before a page is written), then pages, products, consultants/booking, blog, KB, wiki, documents. Returns { created, updated, skipped, media_rewritten_urls, manifest, uninstalled_previous, notes }. Colliding live slugs/names are skipped, never overwritten; wiki (slug) and documents (title + file_name) are UPDATED instead, so re-installing the same export is idempotent. Document visibility is kept as exported — a role-scoped document whose role is missing here narrows to private; nothing becomes public. Without embedded media, image URLs are used as-is. Site settings are untouched unless apply_settings=true.',
  },
  {
    name: 'export_site_template',
    description: EXPORT_SITE_TEMPLATE_DESCRIPTION,
    category: 'system',
    handler: 'module:templates',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'export_site_template',
        description: EXPORT_SITE_TEMPLATE_DESCRIPTION,
        parameters: {
          type: 'object',
          properties: {
            save_as: {
              type: 'string',
              description: 'Store the export as a reusable template under this name, instead of only returning the JSON. Idempotent: an existing name is UPDATED, never duplicated. Omit for a read-only preview. This is what closes the loop — install_template then reproduces the site from this name on any instance.',
            },
            strip_identity: {
              type: 'boolean',
              description: "Remove the fields that identify the ORIGIN instance — organisation name, brand tagline, logo, agent system prompt and welcome message, SEO title, contact email/phone/address, and any configured endpoints. DEFAULT TRUE, because a template is a design that travels and none of those are design. Pass false only when cloning your own site to a second instance of the same organisation. identity.stripped lists every removal with its reason; identity.possible_secrets scans what REMAINS for credential-shaped strings either way.",
            },
            include: {
              type: 'array',
              items: { type: 'string', enum: ['pages', 'blog', 'kb', 'products', 'wiki', 'documents'] },
              description: "What to carry. Default ['pages','blog']. 'wiki' = every wiki page (title, slug, markdown, tags, parent_slug, visibility). 'documents' = every uploaded document: metadata, indexed text and the stored file (embedded within the size/time budget; visibility kept as is). Anything present on the site but not included is listed in export_report.skipped with the flag that would include it — an absent section never silently reads as an empty one.",
            },
            copy_media: {
              type: 'boolean',
              description: "Default false: image URLs are REFERENCED and keep resolving to this instance. true: download the images the carried pages/posts/settings reference from this instance's public storage (cms-images, river-media) and embed them in the export, so install_template uploads them on the target and rewrites every URL. Files on other hosts stay referenced either way; export_report.assets says which it did.",
            },
            embed_files: {
              type: 'boolean',
              description: "Default true: each document's stored file is embedded (base64 + SHA-256 seal). false: documents travel with metadata and indexed text only — the way to carry a large archive's knowledge when its bytes would not fit one call.",
            },
            max_file_mb: {
              type: 'number',
              description: 'Largest single file (document or media) to embed, in MB. Default 8, max 20. A larger file is skipped and named in export_report.skipped; its document still travels.',
            },
            max_payload_mb: {
              type: 'number',
              description: 'Total embedded payload across documents and media, in MB of BASE64 (what the body actually carries — about 4/3 of the raw file sizes). Default 16, max 40 — the export is one JSON body stored in one row. Once reached, the remaining files are skipped and named.',
            },
            media_hosts: {
              type: 'array',
              items: { type: 'string' },
              description: "Extra hosts (or URLs) that count as THIS instance's own for copy_media, e.g. ['api.customer.se']. The runtime's SUPABASE_URL, SUPABASE_PUBLIC_URL and API_EXTERNAL_URL always count; on a self-hosted stack the runtime URL is the internal gateway, so name the public domain the content uses. Bytes are still read from this instance's storage by bucket + path — naming a host never fetches from it.",
            },
            id: { type: 'string', description: "Template id for the export (lowercase-hyphens, default 'site-export' or a slug of save_as)." },
            name: { type: 'string', description: "Template display name (defaults to save_as, else 'Site Export')." },
            description: { type: 'string', description: 'Template description.' },
            category: {
              type: 'string',
              enum: ['startup', 'enterprise', 'compliance', 'platform', 'helpcenter'],
              description: "Gallery category (default 'enterprise').",
            },
            icon: { type: 'string', description: "Lucide icon name (default 'Sparkles')." },
            tagline: { type: 'string', description: 'Short gallery tagline.' },
          },
        },
      },
    },
    instructions: `## What comes back
\`{ template, validation, saved, stats, export_report }\`. The \`template\` object is
a StarterTemplate — the same shape install_template and the admin Import tab
consume — so it re-imports on any FlowWink instance.

With \`save_as\`, \`template\` is the LEAN body (no base64): the embedded files are
stored with the template, and \`template_payload\` counts them. Megabytes of
base64 in a tool answer would flood your context and cut off export_report. A
preview (no \`save_as\`) returns the full body with the files, because then the
answer IS the export.

## Saving
Without \`save_as\` this is a PREVIEW: nothing is written. With \`save_as\` the
template is stored in \`site_templates\` under that name (existing name → updated,
never duplicated) and \`saved.template_id\` comes back. That is the whole loop:

  build the site (manage_page + create_page_block)
    → export_site_template save_as="Customer starter"
    → install_template template_id="Customer starter" on the next instance

## What it takes, and what it admits it left
Always: published pages with their blocks and meta, branding, chat, header,
footer, SEO, AEO, cookie banner, homepage slug, accounting locale, and the list
of enabled modules as \`requiredModules\`. Optional via \`include\`: \`blog\`
(default on), \`kb\`, \`products\`, \`wiki\`, \`documents\`. Drafts are never
included — a template seeds content, and an unpublished draft has not been
approved for anyone to see.

\`export_report.skipped\` lists every section that exists on this site but is not
in the template, with the flag that would include it. Read it before you save: a
template that quietly omits 34 products looks identical to one from a site that
has none.

## The knowledge: wiki and documents
\`wiki\` carries every wiki page as the wiki stores it: \`slug\`, \`title\`,
\`content_md\`, \`tags\`, \`parent_slug\`, \`visibility\` (internal | admin),
\`editable_by\`. install_template restores on the slug — an existing page is
updated, a new one created, none duplicated — and applies the hierarchy once
every page exists.

\`documents\` carries every uploaded document: metadata (title, file_name,
category, tags, folder, description), the indexed text (\`content_md\`, what
makes it searchable), \`visibility\` (shared | role | private, with
\`visible_to_role\`) — and the stored file, embedded as \`file: { base64, sha256,
bytes }\` when it fits the budget. Visibility is carried verbatim and the
installer never widens it: a private document stays private, a role-scoped one
whose role does not exist on the target (or has no role) is written as private
and listed in \`documents_narrowed_to_private\`, and the bytes land in
the PRIVATE documents bucket whose files follow their row's visibility. Nothing
uploaded ever becomes public. install_template keys on (title, file_name):
existing → metadata and text updated, the stored file left alone; new → created,
the carried bytes re-sealed and compared with the sha256 they left with.

A saved template that carries a role-scoped or private document, or an
admin-only wiki page, is readable by ADMINS ONLY (a trigger stamps
\`site_templates.carries_restricted_content\` on every write and the "Authenticated
view site templates" policy reads it); \`saved.readable_by\` says which applies.
Storing an export never widens what the rows themselves allowed.

A document whose file did not fit still travels — \`file_omitted\` says why, and
export_report.skipped names it. \`file_ref\` is a file that was referenced on the
origin too (an external URL, a demo fixture) and is restored as the same reference.

## The limits — one edge call, one JSON body
The Free tier gives an edge invocation 150 s of wall-clock, and the export is
stored as one jsonb row and returned as one response. So:
- storage fetches run one by one against a 100 s budget;
- \`max_file_mb\` (default 8, max 20) caps a single file, \`max_payload_mb\`
  (default 16, max 40) caps everything embedded, counted as the base64 the body
  carries (about 4/3 of the raw size) — each file is STREAMED and the
  read stops the moment it crosses the cap, so a 300 MB video costs no more
  than the cap and is reported, never loaded whole;
- what does not fit is SKIPPED AND NAMED in \`export_report.skipped\` (with the
  file names and the reason: over max_file_mb, payload full, time budget,
  unreachable) — the export never fails as a whole because one PDF was 40 MB;
- \`export_report.limits\` reports the caps in force and \`embedded_mb\` used.
For an archive bigger than one call: \`embed_files=false\` carries every
document's knowledge (text + metadata) without bytes, and the files move by hand
or in a separate export with a narrower \`include\`.

## The origin instance's identity
Settings are not design: they say who this is. \`strip_identity\` (default TRUE)
removes organisation name, brand tagline, logo, the agent's system prompt and
welcome message, SEO title and template, contact email/phone/address, and any
configured endpoints. \`identity.stripped\` names every removal with its reason.

This is not cosmetic. A real export carried
\`chatSettings.welcomeMessage: "…sign in (demo@flowwink.com / demo1234)…"\` —
installed on a customer, their chat widget would have greeted visitors with
somebody else's login.

Pass \`strip_identity: false\` only when cloning your own site to a second
instance of the SAME organisation.

\`identity.possible_secrets\` runs either way, over whatever survived, and flags
credential-shaped strings with the value redacted. The named list of identity
fields will always be incomplete — settings gain fields — so the scan is the
half that keeps working. It reports and never deletes: a false positive that
removed real content would be worse than the leak.

\`identity.broken_nav_targets\` lists navigation entries pointing at pages the
template does not contain.

## The images
\`export_report.assets\` counts the ABSOLUTE media URLs in the body (images, plus
mp4/webm/glb — one definition for the count and the copy) and groups them
by host. By default (\`copy_media\` false, \`assets.mode: "referenced"\`) those
URLs are not copied — installed elsewhere they keep resolving to their current
host, and break the day it goes away. A template whose pictures point home is a
mirror, not a template.

\`copy_media: true\` (\`assets.mode: "copied"\`) downloads every image the carried
content references from THIS instance's public storage (cms-images,
river-media) within the same budget and embeds it as \`media[]\` — url, bucket,
path, sha256, base64. install_template uploads each one to the same bucket and
path on the target and rewrites every occurrence of the URL before a single
page is written — pages, posts, wiki and document text alike — so the new site
stands alone. \`assets.copied\` lists what was embedded; \`assets.referenced\`
what stayed a reference and why (another site, a storage host not recognised as
this instance's, not a public bucket); \`export_report.skipped\` what the budget
left out. \`assets.mode: "none_copied"\` means copy_media ran and embedded
nothing — read \`referenced\` before calling the export portable. On a
self-hosted stack pass \`media_hosts\` with the public domain the content uses.

## Validation
\`validation\` comes from the same database function the write enforces, so a
preview can never disagree with a refusal. A non-empty \`errors\` list means a
\`save_as\` call WOULD BE or WAS refused; \`warnings\` are advice.`,
  },
];

export const templatesModule = defineModule<TemplatesInput, TemplatesOutput>({
  id: 'templates',
  name: 'Templates',
  version: '1.0.0',
  processes: [],
  maturity: 'L3',
  description: 'Template gallery, export current site as reusable template, and import templates from file',
  capabilities: ['data:read', 'data:write'],
  tier: 'core',
  inputSchema: templatesInputSchema,
  outputSchema: templatesOutputSchema,

  skills: ['list_templates', 'install_template', 'export_site_template'],
  skillSeeds: TEMPLATE_SKILLS,

  async publish(input: TemplatesInput): Promise<TemplatesOutput> {
    logger.log('[TemplatesModule] Action:', input.action);
    return { success: true, templateId: input.templateId };
  },
});
