import { ModuleDefinition } from '@/types/module-contracts';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const siteMigrationInputSchema = z.object({
  action: z.enum(['discover', 'migrate_page', 'analyze_brand']),
  url: z.string().url(),
  /** Only for 'discover' — optional search filter for map results */
  search: z.string().optional(),
  /** Only for 'migrate_page' */
  pageType: z.enum(['page', 'blog', 'kb']).optional(),
  slug: z.string().optional(),
  title: z.string().optional(),
});

export const siteMigrationOutputSchema = z.object({
  success: z.boolean(),
  /** discover → list of URLs, migrate_page → created page id */
  data: z.any().optional(),
  /** Extracted branding when available */
  branding: z.record(z.any()).optional(),
  error: z.string().optional(),
  /** Which integrations were used */
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

export const siteMigrationModule: ModuleDefinition<SiteMigrationInput, SiteMigrationOutput> = {
  id: 'siteMigration',
  name: 'Site Migration',
  version: '1.0.0',
  description: 'Clone and migrate external websites into FlowWink. Discovers pages, extracts branding, and creates blocks that match the source site\'s visual identity.',
  capabilities: ['data:read', 'data:write', 'content:receive'],
  inputSchema: siteMigrationInputSchema,
  outputSchema: siteMigrationOutputSchema,

  async publish(input: SiteMigrationInput): Promise<SiteMigrationOutput> {
    const validated = siteMigrationInputSchema.parse(input);

    try {
      switch (validated.action) {
        // ------------------------------------------------------------------
        // DISCOVER — find all pages on a site (sitemap + firecrawl map)
        // ------------------------------------------------------------------
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

        // ------------------------------------------------------------------
        // MIGRATE PAGE — scrape + AI block mapping with branding
        // ------------------------------------------------------------------
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

        // ------------------------------------------------------------------
        // ANALYZE BRAND — extract branding only (used by Brand Guide)
        // ------------------------------------------------------------------
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
};

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
  aiProvider: 'auto' as const, // resolved by Layer 1 (resolveAiConfig)
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
