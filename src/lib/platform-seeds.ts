/**
 * Platform Seeds
 *
 * Skills and automations that are part of the FlowWink platform itself,
 * NOT owned by any opt-in module. They must exist on every instance
 * regardless of which modules are enabled.
 *
 * Examples: the daily briefing (deterministic metric aggregation + LLM summary
 * — a SaaS automation, not an agent action), platform health checks, etc.
 *
 * Design rule: only put things here that are required for the *platform* to
 * function. Anything that adds value to a specific business domain should live
 * in the corresponding module under `src/lib/modules/`.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { logger } from '@/lib/logger';
import type { SkillSeed, AutomationSeed } from '@/lib/module-bootstrap';

export const PLATFORM_SKILLS: SkillSeed[] = [
  {
    name: 'run_daily_briefing',
    description:
      "Generate the daily business briefing: health score, key metrics (visitors, leads, orders, revenue), AI summary and action items. Writes to flowpilot_briefings + admin FlowChat. Use when: scheduled daily run; admin requests today's briefing. NOT for: weekly review (weekly_business_digest); ad-hoc analytics (analyze_analytics).",
    category: 'analytics',
    handler: 'edge:flowpilot-briefing',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'run_daily_briefing',
        description:
          'Generate the daily business briefing as a platform SaaS automation. Deterministic metric aggregation + a single LLM summary. NOT a ReAct loop.',
        parameters: {
          type: 'object',
          properties: {
            source: { type: 'string', description: 'Trigger source label (cron, manual, automation).' },
          },
        },
      },
    },
    instructions: `## run_daily_briefing
### What
Platform SaaS automation. Deterministic metric aggregation + one LLM call for narrative summary. NOT a ReAct loop, NOT a FlowPilot skill.
### When
Scheduled daily 07:00 UTC via the "Daily Briefing" automation in /admin/automations. Also runnable on demand by an admin.
### Output
- Row in flowpilot_briefings (consumed by BusinessPulseWidget)
- System message in the admin FlowChat
- Email to the owner if Resend is configured`,
  },
  {
    name: 'search_web',
    description: 'Search the web for information. Supports Firecrawl and Jina providers. Use when: researching a topic; finding current information; answering questions requiring web data. NOT for: scraping a specific URL (scrape_url); fetching login-walled content (browser_fetch).',
    category: 'search',
    handler: 'edge:web-search',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'search_web',
        description: 'Search the web for information. Supports Firecrawl and Jina providers. Use when: researching a topic; finding current information; answering questions requiring web data. NOT for: scraping a specific URL (scrape_url); fetching login-walled content (browser_fetch).',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            limit: {
              type: 'number',
              description: 'Max results (default 5)',
            },
            preferred_provider: {
              type: 'string',
              enum: [
                'auto',
                'firecrawl',
                'jina',
              ],
              description: 'Provider selection: auto (free first), firecrawl (paid, deep), jina (fast, free)',
            },
          },
          required: [
            'query',
          ],
        },
      },
    },
    instructions: `# Web Search — Provider Knowledge

## Providers Available
- **Firecrawl** (paid): Premium search quality, includes scraped content from results, best for deep research where you need full page content alongside results. Costs credits per search.
- **Jina Search** (free tier available): Fast, lightweight web search. Free tier has rate limits. Good for quick lookups, trend checks, and simple queries.

## When to Use Which
| Scenario | Provider | Why |
|----------|----------|-----|
| Quick fact check | jina | Free, fast, sufficient |
| Prospect/company research | firecrawl | Richer results with scraped content |
| Content trend research | jina | Volume of searches, cost-efficient |
| Deep competitive analysis | firecrawl | Needs full page content |
| General knowledge lookup | auto | Let the system decide |

## Decision Framework
1. **Default to auto** — the system tries free providers first, then paid
2. **Use preferred_provider='jina'** when you want speed and cost savings
3. **Use preferred_provider='firecrawl'** when result quality and depth matter more than cost
4. If a free search returns poor/empty results, retry with firecrawl before giving up

## Parameters
- query: Search query (required)
- limit: Max results (default 5)
- preferred_provider: 'auto' | 'firecrawl' | 'jina' (default 'auto')`,
  },
  {
    name: 'scrape_url',
    description: 'Scrape a single URL and extract content as markdown. Supports Firecrawl and Jina Reader. Use when: extracting content from a public webpage; converting web pages to markdown; needing text from an accessible URL. NOT for: accessing login-walled sites (browser_fetch); searching multiple pages (search_web).',
    category: 'search',
    handler: 'edge:web-scrape',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'scrape_url',
        description: 'Scrape a single URL and extract content as markdown. Supports Firecrawl and Jina Reader. Use when: extracting content from a public webpage; converting web pages to markdown; needing text from an accessible URL. NOT for: accessing login-walled sites (browser_fetch); searching multiple pages (search_web).',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL to scrape',
            },
            max_length: {
              type: 'number',
              description: 'Max content chars (default 10000)',
            },
            preferred_provider: {
              type: 'string',
              enum: [
                'auto',
                'firecrawl',
                'jina',
              ],
              description: 'Provider: auto (free first), firecrawl (JS rendering, paid), jina (fast, free)',
            },
          },
          required: [
            'url',
          ],
        },
      },
    },
    instructions: `# Web Scrape — Provider Knowledge

## Providers Available
- **Firecrawl** (paid): Full JS rendering, handles SPAs, dynamic content, anti-bot bypassing. Best for modern web apps, LinkedIn pages, JS-heavy sites. Costs credits per scrape.
- **Jina Reader** (free tier available): Converts URLs to clean markdown. Works great for static content, blogs, documentation, news articles. Free tier has rate limits.

## When to Use Which
| Scenario | Provider | Why |
|----------|----------|-----|
| Blog post / article | jina | Free, clean markdown output |
| LinkedIn page | firecrawl | Needs JS rendering + anti-bot |
| Documentation page | jina | Static content, free is fine |
| SPA / dynamic web app | firecrawl | JS rendering required |
| Company about page | auto | Try free first |
| Landing page analysis | firecrawl | Better at extracting full layout |

## Decision Framework
1. **Default to auto** — tries free first, falls back to paid
2. **Use preferred_provider='jina'** for static content (blogs, docs, news)
3. **Use preferred_provider='firecrawl'** for JS-heavy sites, SPAs, LinkedIn, or when jina returns empty/garbage
4. If content looks truncated or broken, retry with firecrawl

## Parameters
- url: URL to scrape (required)
- max_length: Max content length in chars (default 10000)
- preferred_provider: 'auto' | 'firecrawl' | 'jina' (default 'auto')`,
  },
  {
    name: 'manage_site_settings',
    description: 'Read and update site settings including module configuration, site name, theme, etc. Use when: retrieving global configurations; changing website name; enabling or disabling modules. NOT for: updating site branding (site_branding_update); managing global blocks (manage_global_blocks).',
    category: 'system',
    handler: 'db:site_settings',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_site_settings',
        description: 'Read and update site settings including module configuration, site name, theme, etc. Use when: retrieving global configurations; changing website name; enabling or disabling modules. NOT for: updating site branding (site_branding_update); managing global blocks (manage_global_blocks).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'get',
                'get_all',
                'update',
              ],
            },
            key: {
              type: 'string',
              description: 'Settings key to read/update',
            },
            value: {
              type: 'object',
              description: 'New value (for update)',
            },
          },
          required: [
            'action',
          ],
        },
      },
    },
    instructions: `## manage_site_settings
### What
Reads and updates site settings including module configuration, site name, theme, AI config, chat config.
### When to use
- Admin asks to change site settings
- System configuration queries
- Module enable/disable
### Parameters
- **action**: Required. get, get_all, update.
- **key**: Settings key (modules, site_name, theme, ai_config, chat_config, etc.).
- **value**: New value for update.
### Edge cases
- Some settings changes require page reload to take effect.
- ai_config controls which AI provider FlowPilot uses.
- Be careful with module toggles — disabling a module hides its UI.`,
  },
];

export const PLATFORM_AUTOMATIONS: AutomationSeed[] = [
  {
    name: 'Daily Briefing',
    description:
      'Platform automation. Generates the daily business briefing every morning at 07:00 UTC and posts it to admin FlowChat. Runs deterministically (no ReAct).',
    trigger_type: 'cron',
    trigger_config: { cron: '0 7 * * *', timezone: 'UTC' },
    skill_name: 'run_daily_briefing',
    skill_arguments: { source: 'automation' },
    executor: 'platform',
  },
];

/**
 * Seed all platform-level skills and automations.
 * Idempotent — safe to run multiple times. Refreshes definition fields on
 * existing rows so deploys propagate without a manual DB poke.
 */
export async function bootstrapPlatform(): Promise<{
  seededSkills: number;
  seededAutomations: number;
  errors: string[];
}> {
  const result = { seededSkills: 0, seededAutomations: 0, errors: [] as string[] };

  for (const skill of PLATFORM_SKILLS) {
    try {
      const { data: existing } = await supabase
        .from('agent_skills')
        .select('id')
        .eq('name', skill.name)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('agent_skills')
          .update({
            enabled: true,
            mcp_exposed: true,
            description: skill.description,
            instructions: skill.instructions || null,
            tool_definition: skill.tool_definition as Json,
            category: skill.category,
            handler: skill.handler,
            scope: skill.scope,
          })
          .eq('id', existing.id);
      } else {
        const { error } = await supabase.from('agent_skills').insert([
          {
            name: skill.name,
            description: skill.description,
            category: skill.category,
            handler: skill.handler,
            scope: skill.scope,
            tool_definition: skill.tool_definition as Json,
            instructions: skill.instructions || null,
            enabled: true,
            mcp_exposed: true,
            origin: 'bundled' as const,
            trust_level: skill.trust_level ?? ('notify' as const),
          },
        ]);
        if (error) throw error;
      }
      result.seededSkills++;
    } catch (err) {
      const msg = `Platform skill ${skill.name}: ${err instanceof Error ? err.message : 'Unknown'}`;
      result.errors.push(msg);
      logger.error(`[platform-seeds] ${msg}`);
    }
  }

  for (const auto of PLATFORM_AUTOMATIONS) {
    try {
      const { data: existing } = await supabase
        .from('agent_automations')
        .select('id')
        .eq('name', auto.name)
        .maybeSingle();

      if (!existing) {
        const { error } = await supabase.from('agent_automations').insert([
          {
            name: auto.name,
            description: auto.description,
            trigger_type: auto.trigger_type,
            trigger_config: auto.trigger_config as Json,
            skill_name: auto.skill_name,
            skill_arguments: auto.skill_arguments as Json,
            executor: auto.executor ?? 'platform',
            enabled: true,
          },
        ]);
        if (error) throw error;
        result.seededAutomations++;
      }
    } catch (err) {
      const msg = `Platform automation ${auto.name}: ${err instanceof Error ? err.message : 'Unknown'}`;
      result.errors.push(msg);
      logger.error(`[platform-seeds] ${msg}`);
    }
  }

  logger.log(
    `[platform-seeds] Seeded ${result.seededSkills} platform skills, ${result.seededAutomations} platform automations`
  );
  return result;
}
