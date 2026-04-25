import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { defineModule } from '@/lib/module-def';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const siteMigrationInputSchema = z.object({
  action: z.enum(['discover', 'migrate_page', 'analyze_brand']),
  url: z.string().url(),
  search: z.string().optional(),
  pageType: z.enum(['page', 'blog', 'kb']).optional(),
  slug: z.string().optional(),
  title: z.string().optional(),
});

export const siteMigrationOutputSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  branding: z.record(z.any()).optional(),
  error: z.string().optional(),
  providers: z.object({
    scraper: z.enum(['firecrawl', 'jina', 'none']).optional(),
    ai: z.enum(['openai', 'gemini', 'local']).optional(),
  }).optional(),
});

export type SiteMigrationInput = z.infer<typeof siteMigrationInputSchema>;
export type SiteMigrationOutput = z.infer<typeof siteMigrationOutputSchema>;

// ---------------------------------------------------------------------------
// Module Definition
// ---------------------------------------------------------------------------

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const SITEMIGRATION_SKILLS: SkillSeed[] = [
  {
    name: 'migrate_url',
    description: 'Migrate an external webpage into FlowWink-ready blocks with brand extraction and page discovery. Use when: user pastes a URL to migrate, importing content from an external website, rebuilding an existing site in FlowWink. NOT for: creating pages from scratch (use manage_page), adding blocks manually (use create_page_block), scraping for data extraction only (use scrape_url).',
    category: 'content',
    handler: 'edge:migrate-page',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'migrate_url',
        description: 'Migrate an external webpage into FlowWink-ready blocks with brand extraction and page discovery. Use when: user pastes a URL to migrate, importing content from an external website, rebuilding an existing site in FlowWink. NOT for: creating pages from scratch (use manage_page), adding blocks manually (use create_page_block), scraping for data extraction only (use scrape_url).',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The full URL to migrate (e.g. https://example.com)',
            },
            pageType: {
              type: 'string',
              enum: [
                'page',
                'blog',
                'kb',
              ],
              description: 'Target page type (default: page)',
            },
            slug: {
              type: 'string',
              description: 'Optional target slug override',
            },
            title: {
              type: 'string',
              description: 'Optional target title override',
            },
          },
          required: [
            'url',
          ],
        },
      },
    },
    instructions: `# Website Migration — Multi-Step Orchestration

## CRITICAL RULE
After calling migrate_url, you MUST IMMEDIATELY call manage_page with the returned blocks.
Do NOT only summarize or ask follow-up if page creation has not happened yet.

## Flow (execute tools, don't just describe)
1. Call migrate_url with URL
2. Call manage_page with action='create' using returned title + blocks
3. Confirm page created (capture page_id/slug)
4. Offer to migrate discovered otherPages

## Required behavior
- If migrate_url returns blocks: create page directly
- If migrate_url returns otherPages: list them and ask if user wants bulk migration
- Preserve source language unless user asks otherwise
- Never fabricate blocks; use extracted content only`,
  },
];

export const siteMigrationModule = defineModule<SiteMigrationInput, SiteMigrationOutput>({
  id: 'siteMigration',
  name: 'Site Migration',
  version: '1.0.0',
  description: 'Clone and migrate external websites into FlowWink. Discovers pages, extracts branding, and creates blocks that match the source site\'s visual identity.',
  capabilities: ['data:read', 'data:write', 'content:receive'],
  inputSchema: siteMigrationInputSchema,
  outputSchema: siteMigrationOutputSchema,

  skills: [
    'migrate_url',
  ],
  skillSeeds: SITEMIGRATION_SKILLS,

  async publish(input: SiteMigrationInput): Promise<SiteMigrationOutput> {
    const validated = siteMigrationInputSchema.parse(input);

    try {
      switch (validated.action) {
        case 'discover': {
          const { data, error } = await supabase.functions.invoke('firecrawl-map', {
            body: { url: validated.url, options: { search: validated.search, limit: 500 } },
          });
          if (error) return { success: false, error: error.message };
          return {
            success: true,
            data: data?.links || data?.data || [],
            providers: { scraper: 'firecrawl' },
          };
        }

        case 'migrate_page': {
          const { data, error } = await supabase.functions.invoke('migrate-page', {
            body: {
              url: validated.url,
              pageType: validated.pageType || 'page',
              slug: validated.slug,
              title: validated.title,
            },
          });
          if (error) return { success: false, error: error.message };
          return {
            success: data?.success ?? true,
            data: data?.page || data,
            branding: data?.brandingExtracted,
            providers: {
              scraper: 'firecrawl',
              ai: data?.aiProvider,
            },
          };
        }

        case 'analyze_brand': {
          const { data, error } = await supabase.functions.invoke('analyze-brand', {
            body: { url: validated.url },
          });
          if (error) return { success: false, error: error.message };
          return {
            success: true,
            branding: data?.branding || data,
            providers: { scraper: 'firecrawl' },
          };
        }

        default:
          return { success: false, error: `Unknown action: ${validated.action}` };
      }
    } catch (err: any) {
      logger.error('[site-migration] Module error:', err);
      return { success: false, error: err.message || 'Migration failed' };
    }
  },
});

// ---------------------------------------------------------------------------
// Module Metadata (for registry & UI)
// ---------------------------------------------------------------------------

export const siteMigrationMeta = {
  id: 'siteMigration',
  name: 'Site Migration',
  description: 'Clone external websites into FlowWink with visual fidelity. Discovers pages, extracts branding, and maps content to blocks.',
  category: 'content' as const,
  icon: 'Globe',
  autonomy: 'agent-capable' as const,
  defaultEnabled: true,
  dependencies: [],
  requiredIntegrations: ['firecrawl'],
  optionalIntegrations: ['jina'],
  aiProvider: 'auto' as const,
  skills: ['page_migration', 'generate_site_from_identity'],
  features: [
    'Sitemap discovery & URL mapping',
    'Single page import',
    'Full site migration',
    'Branding extraction & design token mapping',
    'AI-powered block generation with brand fidelity',
    'Browser Control extension boost (optional)',
  ],
};
