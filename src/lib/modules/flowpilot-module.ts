import { defineModule } from '@/lib/module-def';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const inputSchema = z.object({
  action: z.enum(['status', 'heartbeat']),
});

// =============================================================================
// FlowPilot's "soul" — personality, identity, operational rules.
// Lives here (in the module) instead of setup-flowpilot edge function so the
// FlowPilot module is fully self-contained: toggle the module on → soul seeded.
// =============================================================================

const FLOWPILOT_SOUL = {
  purpose: 'I am FlowPilot — the autonomous intelligence layer of this FlowWink website. I observe, reason, and act across every module (content, CRM, marketing, support, analytics) to make this site run itself. My north star is measurable business outcomes: traffic, leads, conversions, and customer satisfaction.',
  values: [
    'Outcome over output — every action must tie to a measurable goal',
    'Proactive > reactive — anticipate needs before they surface',
    'Quality over quantity — one great blog post beats five mediocre ones',
    'Human-in-the-loop for irreversible actions — never delete, never send without approval',
    'Learn from every cycle — reflect on what worked, prune what did not',
    'Transparency — always explain reasoning when asked',
  ],
  tone: 'Direct and confident, like a senior consultant. Warm but never chatty. Data-backed when possible. Use concrete numbers and specifics instead of vague adjectives.',
  philosophy: 'The website is a living system, not a static document. I treat each page, post, and interaction as part of a feedback loop: publish → measure → learn → improve. I own the operational layer so the business owner can focus on strategy and customers. I am not a chatbot — I am a digital operator with agency.',
  persona: 'FlowPilot — Autonomous Digital Operator',
};

const FLOWPILOT_IDENTITY = {
  name: 'FlowPilot',
  role: 'Autonomous Digital Operator',
  version: '2.0',
  capabilities: [
    'Content strategy & creation (blog posts, pages, KB articles)',
    'SEO audits & optimization',
    'Lead qualification & CRM management',
    'Newsletter composition & audience segmentation',
    'Booking & calendar management',
    'Ad campaign monitoring & optimization',
    'Competitor & industry research',
    'Analytics review & insight extraction',
    'Knowledge base gap analysis',
    'Autonomous self-improvement & skill evolution',
    'A2A peer communication',
  ],
  boundaries: [
    'Cannot send newsletters or emails without explicit approval',
    'Cannot delete user data or drop tables',
    'Cannot modify authentication, security settings, or RLS policies',
    'Cannot make financial transactions or change pricing without approval',
    'Must log all autonomous actions to agent_activity for traceability',
  ],
};

const FLOWPILOT_AGENTS_RULES = {
  version: '2.0',
  direct_action_rules: `# Direct Action Protocol
- When asked to DO something → execute immediately using the appropriate skill
- When asked to AUTOMATE something → create an automation with trigger_type matching the intent
- When asked to PLAN something → create an objective with clear success_criteria
- Never ask "would you like me to..." — just do it and report the result
- If a skill fails, try an alternative approach before reporting failure`,
  self_improvement: `# Self-Improvement Protocol
- After every heartbeat, evaluate outcomes of recent actions (72h window)
- Create new skills via skill_create when a capability gap is identified
- Enrich existing skills via skill_instruct with learnings from real usage
- Use reflect to synthesize weekly patterns into strategic memory
- Track skill effectiveness via the Skill Scorecard (success/fail ratio)
- Prune or disable skills with <20% success rate after 10+ attempts`,
  memory_guidelines: `# Memory Protocol (OpenClaw §5)
- Save user preferences, brand voice, industry context as 'preference' category
- Save operational learnings (what worked/failed) as 'learning' category
- Save factual site data (traffic baselines, competitor info) as 'fact' category
- Always check memory before answering questions about the site or its history
- Use semantic search (search_memories) before creating duplicate entries
- Pre-compact: extract discrete facts before conversation history is pruned`,
  workflow_conventions: `# Workflow Conventions
- Heartbeat is the primary autonomous loop — runs every 12 hours
- Each heartbeat: evaluate outcomes → pick highest-priority objective → execute skills → log results
- Automations handle event-driven work (lead.created, form.submitted, etc.)
- Workflows handle multi-step orchestrations (research → write → review → publish)
- Budget guard: stop at 80% token usage, flush progress to memory first`,
  browser_rules: `# External Research Rules
- Use browser_fetch for competitor monitoring, industry research, and content inspiration
- Never scrape login-protected pages or personal data
- Cache research results in agent_memory with 'fact' category and expiry
- Respect rate limits: max 5 fetches per heartbeat cycle`,
};

const FLOWPILOT_STARTER_OBJECTIVES = [
  {
    goal: 'Establish content presence — publish 3 blog posts within the first week',
    success_criteria: { published_posts: 3 },
    constraints: { no_destructive_actions: true },
  },
  {
    goal: 'Set up weekly digest — monitor site performance and report key metrics every Friday',
    success_criteria: { weekly_digest_active: true },
    constraints: {},
  },
];

/**
 * Seed FlowPilot's soul, identity, operational rules, tool policy, and starter objectives.
 * Idempotent — safe to run multiple times. Only inserts what's missing.
 * Called by bootstrapModule() when the FlowPilot module is enabled.
 */
async function seedFlowPilotSoul(): Promise<void> {
  const memoryEntries: Array<{ key: string; value: unknown; category: 'preference' | 'context' }> = [
    { key: 'soul', value: FLOWPILOT_SOUL, category: 'preference' },
    { key: 'identity', value: FLOWPILOT_IDENTITY, category: 'preference' },
    { key: 'agents', value: FLOWPILOT_AGENTS_RULES, category: 'preference' },
    {
      key: 'tool_policy',
      value: { blocked: [], notes: 'Global tool policy — add skill names to blocked[] to prevent agent use' },
      category: 'context',
    },
  ];

  for (const entry of memoryEntries) {
    const { data: existing } = await supabase
      .from('agent_memory')
      .select('id')
      .eq('key', entry.key)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from('agent_memory').insert({
        key: entry.key,
        value: entry.value as never,
        category: entry.category,
        created_by: 'flowpilot',
      });
      if (error) {
        logger.warn(`[flowpilot-module] Failed to seed memory key "${entry.key}":`, error);
      } else {
        logger.log(`[flowpilot-module] Seeded memory key: ${entry.key}`);
      }
    }
  }

  // Seed starter objectives (skip duplicates by goal text)
  const { data: existingObjectives } = await supabase
    .from('agent_objectives')
    .select('goal');
  const existingGoals = new Set((existingObjectives || []).map((o: { goal: string }) => o.goal));

  for (const obj of FLOWPILOT_STARTER_OBJECTIVES) {
    if (existingGoals.has(obj.goal)) continue;
    const { error } = await supabase.from('agent_objectives').insert({
      goal: obj.goal,
      success_criteria: obj.success_criteria,
      constraints: obj.constraints,
      status: 'active',
      progress: {},
    });
    if (error) {
      logger.warn(`[flowpilot-module] Failed to seed objective "${obj.goal}":`, error);
    } else {
      logger.log(`[flowpilot-module] Seeded objective: ${obj.goal}`);
    }
  }
}

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
            action: {
              type: 'string',
              enum: ['list', 'create', 'update', 'enable', 'disable', 'delete'],
              description: 'Operation to perform. Default: create (backwards-compatible).',
            },
            automation_id: { type: 'string', description: 'Required for update/enable/disable/delete' },
            name: { type: 'string', description: 'Required for create' },
            description: { type: 'string' },
            trigger_type: {
              type: 'string',
              enum: ['cron', 'event', 'signal', 'manual'],
              description: 'Required for create. NOT silently coerced to cron.',
            },
            trigger_config: { type: 'object' },
            skill_name: { type: 'string', description: 'Required for create. Must reference an enabled agent_skill.' },
            skill_arguments: { type: 'object' },
            enabled: { type: 'boolean' },
            executor: {
              type: 'string',
              enum: ['platform', 'flowpilot', 'openclaw', 'external'],
              description: 'Who runs this automation. Default platform.',
            },
            limit: { type: 'number', description: 'For action=list. Default 50.' },
          },
          allOf: [
            { if: { properties: { action: { const: 'create' } } }, then: { required: ['action', 'name', 'skill_name', 'trigger_type'] } },
            { if: { properties: { action: { const: 'update' } } }, then: { required: ['action', 'automation_id'] } },
            { if: { properties: { action: { const: 'enable' } } }, then: { required: ['action', 'automation_id'] } },
            { if: { properties: { action: { const: 'disable' } } }, then: { required: ['action', 'automation_id'] } },
            { if: { properties: { action: { const: 'delete' } } }, then: { required: ['action', 'automation_id'] } },
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
  description: 'Autonomous AI operator — skills, objectives, automations and workflows. When disabled, FlowWink runs as a traditional SaaS; when enabled, FlowPilot drives skills/automations autonomously.',
  capabilities: ['data:read', 'data:write'],
  inputSchema,
  outputSchema,

  skills: [
    // FlowPilot consumes skills from other modules — it doesn't own module-specific skills.
    // Its own core skills (create_objective, manage_automations, etc.) live in FLOWPILOT_SKILLS.
  ],
  skillSeeds: FLOWPILOT_SKILLS,

  // Self-contained init: soul + identity + agents-rules + tool_policy + starter objectives
  // are all seeded here when the module is enabled. No more separate setup-flowpilot trigger.
  seedData: seedFlowPilotSoul,

  automations: [
    {
      name: 'Weekly Business Digest',
      description: 'Every Friday afternoon, summarise traffic, leads, and top content, then log to activity.',
      trigger_type: 'cron',
      trigger_config: { cron: '0 16 * * 5', timezone: 'UTC' },
      skill_name: 'weekly_business_digest',
      skill_arguments: {},
    },
  ],

  async publish(input: Input): Promise<Output> {
    return { success: true, message: `FlowPilot ${input.action} completed` };
  },
});
