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
    name: 'install_template',
    description:
      'Install a starter template from the bundled catalog: seeds pages, blog posts, KB categories/articles, products (and consultants/booking data when the template ships them), then records an installed_template manifest so the next install can cleanly uninstall it. Existing live content is preserved — colliding slugs/names are skipped and reported. Use when: asked to "install/apply/switch to the X template", set up a demo site, or seed starter content. NOT for: listing what is available (use list_templates), exporting the current site (use export_site_template), or creating a single page/post (use the pages/blog skills).',
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
              description: "Catalog template id (from list_templates), e.g. 'momentum', 'launchpad', 'blank'.",
            },
            publish: {
              type: 'boolean',
              description: 'Create content as published (default true). Pass false to seed everything as drafts.',
            },
            apply_settings: {
              type: 'boolean',
              description: 'Also merge template branding/chat/header/footer/SEO/cookie settings, homepage slug and required modules into site_settings (default false — content only).',
            },
            include_pages: { type: 'boolean', description: 'Seed pages (default true).' },
            include_blog_posts: { type: 'boolean', description: 'Seed blog posts (default true when the template has any).' },
            include_kb: { type: 'boolean', description: 'Seed KB categories + articles (default true when the template has any).' },
            include_products: { type: 'boolean', description: 'Seed products + stock (default true when the template has any).' },
          },
          required: ['template_id'],
        },
      },
    },
    instructions:
      'DOUBLE-GATED SKILL (requires_staging=true AND trust_level=approve): the first call does NOT install anything — it returns { staged: true, operation_id } with a preview. Handshake: 1) call install_template with your arguments, 2) call approve_pending_operation with p_id=<operation_id> (admin approval), 3) re-invoke install_template with the SAME arguments plus BOTH _approved_operation_id=<operation_id> AND _approved=true (passing only _approved_operation_id consumes the staged operation but stops at the trust gate with status=pending_approval). On execute it first uninstalls the previously installed template via its manifest (only resources that template created), then seeds content. Returns { created, skipped, manifest, uninstalled_previous, notes }. Colliding live slugs/names are skipped, never overwritten. Image URLs are used as-is (no media-library download). Site settings are untouched unless apply_settings=true.',
  },
  {
    name: 'export_site_template',
    description:
      'Export the current site as a reusable StarterTemplate JSON: serializes published pages (with blocks + meta), published blog posts, branding/chat/header/footer/SEO/cookie settings, homepage slug and enabled modules, and validates the result. Read-only — nothing is written. Use when: asked to "export this site as a template", back up the site structure, clone the site to another instance, or inspect what a template of this site would contain. NOT for: installing templates (use install_template), listing the catalog (use list_templates), or exporting media files (images are referenced by URL only).',
    category: 'system',
    handler: 'module:templates',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'export_site_template',
        description: 'Serialize the current site (pages, posts, settings) into StarterTemplate JSON.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: "Template id for the export (lowercase-hyphens, default 'site-export')." },
            name: { type: 'string', description: "Template display name (default 'Site Export')." },
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
    instructions:
      'Returns { template, validation: { valid, errors, warnings }, stats: { pages, blocks, blog_posts } }. The template object matches the StarterTemplate shape consumed by install_template / the admin Template Import tab, so the output can be re-imported on any FlowWink instance. Only PUBLISHED pages and blog posts are included; KB articles and products are not part of the export (same as the admin export page). Image URLs are referenced, not embedded.',
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
