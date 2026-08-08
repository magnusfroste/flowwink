import { supabase } from '@/integrations/supabase/client';
import { callSkill } from '@/lib/call-skill';
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
/**
 * migrate_url is a SENSOR. The A/B against an agent with a browser
 * (restagard.se, 2026-08-08) showed the extraction was good and the composition
 * was not — so the skill reports observations and the agent composes. The
 * behaviour rules live in the description, not only the instructions, because
 * the description is the tier an agent reads BEFORE choosing the call.
 */
const MIGRATE_URL_DESCRIPTION =
  'Read an external website as OBSERVATIONS an agent composes from — site page inventory (action=survey, the default), or one page\'s title candidates, headings, text, images with role hints and brand tokens (action=read). Returns NO blocks and writes nothing: you call describe_blocks, then manage_page + create_page_block yourself. Every count travels with a render report — when render.confidence is "shell" the page is JavaScript-rendered and the numbers describe a loading screen, so re-read it through a browser (relay_result / browser_fetch force_relay) instead of composing. action=compose is the legacy one-shot that also asks a model for blocks. Use when: cloning or importing an existing website, inventorying what pages a site has, reading a page before rebuilding it. NOT for: creating pages from scratch (manage_page), adding blocks manually (create_page_block), reading a page for facts rather than structure (browser_fetch or scrape_url).';

const SITEMIGRATION_SKILLS: SkillSeed[] = [
  {
    name: 'migrate_url',
    description: MIGRATE_URL_DESCRIPTION,
    category: 'content',
    handler: 'edge:migrate-page',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'migrate_url',
        description: MIGRATE_URL_DESCRIPTION,
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The full URL to read (e.g. https://example.com or https://example.com/about)',
            },
            action: {
              type: 'string',
              enum: ['survey', 'read', 'compose'],
              description: "survey (default) = the whole site's page inventory, no page content. read = one page's observations (title candidates, headings, text, images with role hints, branding) — YOU turn them into blocks. compose = the legacy one-shot that also asks a model for blocks; only for a single page when you are not composing yourself.",
            },
            site_name: {
              type: 'string',
              description: 'Only with action=read: the site name from the survey. Pass it — sites that put the company name in every page\'s <title> would otherwise give every page that same title.',
            },
            relay_result: {
              type: 'object',
              description: 'Only with action=read: a browser result ({title, html, content}) for a page that could not be read server-side. Turns the browser output into a full observation.',
            },
            pageType: {
              type: 'string',
              enum: [
                'page',
                'blog',
                'kb',
              ],
              description: 'compose only — target page type (default: page)',
            },
            slug: {
              type: 'string',
              description: 'compose only — target slug override',
            },
            title: {
              type: 'string',
              description: 'compose only — target title override',
            },
          },
          required: [
            'url',
          ],
        },
      },
    },
    instructions: `# migrate_url — the site sensor

## What this is
A SENSOR, not a page builder. It reports what a site contains; you decide what it
becomes. survey and read write nothing and return no blocks. The source page has
no hero, no call-to-action and no section boundaries to copy — those are your
decisions, and no extractor can make them for you.

## The loop
1. **survey** — \`migrate_url({url})\`. Returns every page found via navigation and
   sitemap, categorised page/blog/kb, plus platform and brand tokens. This is the
   step you cannot do by hand: a menu shows nine pages, a sitemap shows fifty.
   The inventory is not a plan — pick what is worth keeping.
2. **read** — \`migrate_url({url: <one page>, action: 'read', site_name: <from step 1>})\`
   per page you kept. Pass site_name: on sites that title every page after the
   company (restagard.se does), it is the only thing that stops all nine pages
   from being called "Resta Gård".
3. **describe_blocks** — get the field contract for each block type you intend to
   use. Never guess a field name.
4. **manage_page(action='create')**, then **create_page_block** — compose.
5. **manage_page(action='publish')** — a draft is invisible. \`action='update'\`
   with a status field is a silent no-op; publishing needs action='publish'.

## Reading the observation
- **title.recommended** is the answer. \`title.candidates\` shows the disagreement:
  when \`h1_is_site_name\` is true, the page's only <h1> is the SITE name and is
  identical on every page — using it names every page after the company.
- **render.confidence** governs everything else. \`high\` = trust the counts.
  \`partial\` = check against the live page. \`shell\` = you are blind; the numbers
  describe a loading screen, not the site. Never compose from a shell.
- **images[].role_hint** — logo / icon / hero / content. Picking the hero by pixel
  size picks logos; a 1240x1240 seal is bigger than the farm photo you wanted.
- **branding is null with a reason**, never an empty object. "No payload came
  back" and "the site has no brand" are different facts.

## When the page is JavaScript-rendered
read answers \`{action: 'relay_required'}\` with a \`partial_observation\`. That is
an honest refusal, not a failure to retry blindly. Either hand back a browser
result — \`migrate_url({url, action:'read', relay_result:{title, html, content}})\`
— or use browser_fetch with force_relay=true and compose from its text. In the
admin panel the Chrome extension answers this automatically; unattended, say so
rather than publishing a page built from a loading screen.

## Rules
- Preserve the source language unless asked otherwise.
- Never invent content the observation does not contain.
- Images in an observation are the SOURCE site's URLs. Copy them into this
  instance's storage before going live, or the new site breaks when the old one
  goes away.`,
  },
  {
    name: 'analyze_brand',
    description: 'Scrape a website and extract its brand palette, fonts, logo and tone for the brand guide. Use when: setting up a new site brand from an existing URL. NOT for: full page migration (migrate_url); company data enrichment (enrich_company).',
    category: 'content',
    handler: 'internal:analyze_brand',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'analyze_brand',
        parameters: {
          type: 'object',
          required: ["url"],
          properties: {
            url: { type: 'string', description: 'Site URL to analyze' },
          },
        },
      },
    },
  },
];

export const siteMigrationModule = defineModule<SiteMigrationInput, SiteMigrationOutput>({
  id: 'siteMigration',
  name: 'Site Migration',
  version: '1.0.0',
  processes: ['content-to-conversion'],
  maturity: 'L3',
  description: 'Clone and migrate external websites into FlowWink. Discovers pages, extracts branding, and creates blocks that match the source site\'s visual identity.',
  capabilities: ['data:read', 'data:write', 'content:receive'],
  tier: 'standard',
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
          // `firecrawl-map` was deleted in the edge-surface consolidation and
          // this call was never re-pointed — it 404'd silently. Discovery is now
          // the sensor's survey action, which also categorises the pages.
          const { data, error } = await supabase.functions.invoke('migrate-page', {
            body: { url: validated.url, action: 'survey' },
          });
          if (error) return { success: false, error: error.message };
          return {
            success: data?.success ?? true,
            data: data?.pages || [],
            branding: data?.branding || undefined,
            providers: { scraper: data?.render?.strategy === 'jina' ? 'jina' : 'firecrawl' },
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
          const data = await callSkill('analyze_brand', ({ url: validated.url }) as Record<string, unknown>);
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
  skills: ['migrate_url'],
  features: [
    'Site survey — sitemap + navigation discovery, pages categorised',
    'Page observations an agent composes from (titles, headings, text, images by role)',
    'Render report: says when it read a JavaScript shell instead of the page',
    'Routing check: says when a URL served some other page\'s content',
    'Browser relay escalation via the Chrome extension',
    'Legacy one-shot import (action=compose) with AI block generation',
  ],
};
