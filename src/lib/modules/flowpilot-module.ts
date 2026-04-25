import { defineModule } from '@/lib/module-def';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { z } from 'zod';

const inputSchema = z.object({
  action: z.enum(['status', 'heartbeat']),
});

const outputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const FLOWPILOT_SKILLS: SkillSeed[] = [
  {
    name: 'create_objective',
    description: 'Create a new high-level objective for FlowPilot to work toward. Use when: defining a new strategic goal; initiating a new project; setting a long-term target for operations. NOT for: creating CRM tasks (crm_task_create); managing automations (manage_automations).',
    category: 'automation',
    handler: 'module:objectives',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'create_objective',
        description: 'Create a new high-level objective for FlowPilot to work toward. Use when: defining a new strategic goal; initiating a new project; setting a long-term target for operations. NOT for: creating CRM tasks (crm_task_create); managing automations (manage_automations).',
        parameters: {
          type: 'object',
          properties: {
            goal: {
              type: 'string',
              description: 'The objective goal text',
            },
            constraints: {
              type: 'object',
              description: 'Guardrails for the objective',
            },
            success_criteria: {
              type: 'object',
              description: 'How to measure completion',
            },
          },
          required: [
            'goal',
          ],
        },
      },
    },
    instructions: `## create_objective
### What
Creates a new high-level objective for FlowPilot's autonomous operation.
### When to use
- Admin defines a new business goal
- Heartbeat identifies a gap that needs a structured plan
- System integrity issues require a tracked fix
### Parameters
- **goal**: Required. Clear, measurable goal text.
- **constraints**: Optional guardrails (e.g., no_destructive_actions, deadline, max budget).
- **success_criteria**: Optional measurable criteria for completion.
### Edge cases
- Check existing objectives first to avoid duplicates (query agent_objectives table).
- Objectives drive heartbeat behavior — be specific in goal text.
- Keep active objectives to <5 to maintain focus.`,
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
    name: 'weekly_business_digest',
    description: 'Generate a cross-module business summary covering views, leads, bookings, orders, posts, newsletters. Use when: weekly business review; executive summary needed; monitoring overall business health. NOT for: analyzing specific analytics (analyze_analytics); learning from data (learn_from_data).',
    category: 'analytics',
    handler: 'db:agent_activity',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'weekly_business_digest',
        description: 'Generate a cross-module business summary covering views, leads, bookings, orders, posts, newsletters. Use when: weekly business review; executive summary needed; monitoring overall business health. NOT for: analyzing specific analytics (analyze_analytics); learning from data (learn_from_data).',
        parameters: {
          type: 'object',
          properties: {
            period: {
              type: 'string',
              enum: [
                'day',
                'week',
                'month',
              ],
              description: 'Report period',
            },
            format: {
              type: 'string',
              enum: [
                'structured',
                'markdown',
              ],
              description: 'Output format',
            },
          },
        },
      },
    },
    instructions: `## weekly_business_digest
### What
Generates a cross-module business summary covering views, leads, bookings, orders, posts, and newsletters.
### When to use
- Automated: runs via cron every Friday at 16:00 UTC
- Admin asks for a business summary or report
- Heartbeat needs performance context
### Parameters
- **period**: 'day', 'week', 'month'. Default 'week'.
- **format**: 'structured' (JSON) or 'markdown'. Default 'structured'.
### Edge cases
- Returns zeros for modules that have no data — this is normal for new sites.
- Can be heavy on DB queries — avoid running more than once per hour.`,
  },
  {
    name: 'learn_from_data',
    description: 'Analyze page views, chat feedback, and lead conversions to distill learnings into persistent memory. Use when: heartbeat learning cycle; extracting insights from operational data; building institutional knowledge. NOT for: analyzing analytics directly (analyze_analytics); generating business digests (weekly_business_digest).',
    category: 'analytics',
    handler: 'edge:flowpilot-learn',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'learn_from_data',
        description: 'Analyze page views, chat feedback, and lead conversions to distill learnings into persistent memory. Use when: heartbeat learning cycle; extracting insights from operational data; building institutional knowledge. NOT for: analyzing analytics directly (analyze_analytics); generating business digests (weekly_business_digest).',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
    instructions: `## learn_from_data
### What
Analyzes page views, chat feedback, and lead conversions to distill learnings into persistent memory.
### When to use
- Runs daily via cron (flowpilot-learn at 03:00)
- Heartbeat reflection phase
- Admin asks "what have you learned?"
### Parameters
- None required.
### Edge cases
- Saves insights to agent_memory with category='context'.
- Idempotent — repeated calls refine rather than duplicate learnings.
- Requires sufficient data to produce meaningful insights.`,
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
  {
    name: 'manage_automations',
    description: 'Create and manage agent automations (cron jobs, event triggers, signal handlers). Use when: setting up recurring tasks; defining automatic event responses; implementing signal processing logic. NOT for: creating objectives (create_objective); processing incoming signals (process_signal).',
    category: 'automation',
    handler: 'module:automations',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_automations',
        description: 'Create and manage agent automations (cron jobs, event triggers, signal handlers). Use when: setting up recurring tasks; defining automatic event responses; implementing signal processing logic. NOT for: creating objectives (create_objective); processing incoming signals (process_signal).',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
            },
            description: {
              type: 'string',
            },
            trigger_type: {
              type: 'string',
              enum: [
                'cron',
                'event',
                'signal',
                'manual',
              ],
            },
            trigger_config: {
              type: 'object',
            },
            skill_name: {
              type: 'string',
              description: 'Skill to execute',
            },
            skill_arguments: {
              type: 'object',
            },
            enabled: {
              type: 'boolean',
            },
          },
          required: [
            'name',
            'skill_name',
          ],
        },
      },
    },
    instructions: `## manage_automations
### What
Creates and manages agent automations (cron jobs, event triggers, signal handlers).
### When to use
- Admin asks to automate a recurring task
- Setting up event-driven workflows (e.g., "when a lead is created, qualify it")
- Managing existing automation schedules
### Parameters
- **name**: Required. Automation name.
- **skill_name**: Required. The database skill to execute.
- **trigger_type**: cron, event, signal, manual.
- **trigger_config**: Trigger-specific config (cron expression, event name, etc.).
- **enabled**: Boolean. New automations default to disabled per LAW 7.
### Edge cases
- skill_name must reference a DATABASE skill, not a built-in tool.
- Cron expressions use standard format: minute hour day month weekday.
- New automations are disabled by default — admin must explicitly enable.`,
  },
  {
    name: 'users_list',
    description: 'List platform users with their roles. Shows email, role, and last sign-in. Use when: admin needs to review team members; checking user access levels; auditing platform users. NOT for: managing user roles (N/A); creating new users (N/A).',
    category: 'crm',
    handler: 'db:profiles',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'users_list',
        description: 'List platform users with their roles. Shows email, role, and last sign-in. Use when: admin needs to review team members; checking user access levels; auditing platform users. NOT for: managing user roles (N/A); creating new users (N/A).',
        parameters: {
          type: 'object',
          properties: {
            role: {
              type: 'string',
              enum: [
                'admin',
                'approver',
                'writer',
              ],
              description: 'Filter by role',
            },
            limit: {
              type: 'number',
              description: 'Max results (default 20)',
            },
          },
          required: [],
        },
      },
    },
    instructions: `## users_list
### What
Lists platform users with their roles.
### When to use
- Admin asks about team members or users
- Role management queries
- Audit: who has admin access
### Parameters
- **role**: Filter by role: admin, approver, writer.
- **limit**: Max results (default 20).
### Edge cases
- Shows email, role, and last sign-in.
- Does not include customers — only platform users.`,
  },
];

export const flowpilotModule = defineModule<Input, Output>({
  id: 'flowpilot',
  name: 'FlowPilot',
  version: '1.0.0',
  description: 'Autonomous AI operator — skills, objectives, automations and workflows',
  capabilities: ['data:read', 'data:write'],
  inputSchema,
  outputSchema,

  skills: [
    // FlowPilot consumes skills from other modules — it doesn't own module-specific skills.
    // Core skills (create_objective, manage_automations, etc.) are defined in CORE_SKILLS.
  ],
  skillSeeds: FLOWPILOT_SKILLS,

  async publish(input: Input): Promise<Output> {
    return { success: true, message: `FlowPilot ${input.action} completed` };
  },
});
