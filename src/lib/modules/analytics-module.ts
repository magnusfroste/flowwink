import { defineModule } from '@/lib/module-def';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { z } from 'zod';

const inputSchema = z.object({
  action: z.enum(['dashboard', 'seo_audit', 'feedback_analysis', 'weekly_digest']),
  page_url: z.string().optional(),
  period_days: z.number().int().positive().optional(),
});

const outputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const ANALYTICS_SKILLS: SkillSeed[] = [
  {
    name: 'weekly_business_digest',
    description: 'Generate a cross-module business summary covering views, leads, bookings, orders, posts, newsletters. Use when: weekly business review; executive summary needed; monitoring overall business health. NOT for: analyzing specific analytics (analyze_analytics); learning from data (learn_from_data).',
    category: 'analytics',
    // Aggregation RPC (was db:agent_activity CRUD list which returned raw rows
    // instead of a digest). Computes period counts/revenue across modules.
    handler: 'rpc:weekly_business_digest',
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
    name: 'manage_conversion_goal',
    description: 'Define what counts as a conversion on this site: a new lead, a booking, a paid order, an accepted quote, a subscription, or a specific page being reached — with what one completion is worth when the record carries no amount of its own. Use when: setting up goal tracking, changing what a goal is worth, listing the goals. NOT for: reading the results (conversion_report) or traffic (analyze_analytics).',
    category: 'analytics',
    handler: 'rpc:manage_conversion_goal',
    scope: 'internal',
    trust_level: 'notify',
    instructions:
      'One active goal per definition — a second goal counting the same kind (and page) is refused, because it would count the same conversion twice. p_value_cents is only used for kinds that carry no amount (lead, booking without a price, page_reached); orders, accepted quotes and subscriptions report their real amount, and the report says which of the two it is (value_source).',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_conversion_goal',
        description: 'Create, update, list or delete a conversion goal.',
        parameters: {
          type: 'object',
          properties: {
            p_action: { type: 'string', enum: ['list', 'create', 'update', 'delete'] },
            p_goal_id: { type: 'string', format: 'uuid' },
            p_name: { type: 'string' },
            p_kind: { type: 'string', enum: ['lead', 'booking', 'order', 'quote_accepted', 'subscription', 'page_reached'] },
            p_page_slug: { type: 'string', description: 'Required for page_reached: which page counts' },
            p_value_cents: { type: 'integer', description: 'What one completion is worth when the record carries no amount' },
            p_is_active: { type: 'boolean' },
          },
          required: ['p_action'],
        },
      },
    },
  },
  {
    name: 'conversion_report',
    description: 'How many visitors turned into what the site is for: completions per goal, conversion rate, value, and the campaign and landing page each completion came from. Use when: "is the site working?", judging a campaign, reporting on marketing. NOT for: raw traffic (analyze_analytics) or which page produced the leads (page_conversion_report).',
    category: 'analytics',
    handler: 'rpc:conversion_report',
    scope: 'internal',
    instructions:
      'A conversion rate is completions divided by UNIQUE VISITORS in the window. With no page views the rate is absent, not zero — nothing was measured, because the tracker runs in the visitor\'s browser. value_source says whether the amount is real (orders, accepted quotes, subscriptions) or assumed from the goal\'s value; never present an assumed amount as revenue.',
    tool_definition: {
      type: 'function',
      function: {
        name: 'conversion_report',
        description: 'Goal completions, conversion rate, value, by campaign and landing page.',
        parameters: {
          type: 'object',
          properties: {
            p_days: { type: 'integer', description: 'Window in days (default 30, max 365)' },
            p_goal_id: { type: 'string', format: 'uuid', description: 'One goal; omit for all active goals' },
          },
        },
      },
    },
  },
  {
    name: 'page_conversion_report',
    description: 'Which page produced the leads: views, visitors, leads, customers and the revenue of those leads, per page. Use when: deciding what to write more of, judging a landing page, "which page actually brings business?". NOT for: goals and campaigns (conversion_report) or SEO wording (seo_audit_page).',
    category: 'analytics',
    handler: 'rpc:page_conversion_report',
    scope: 'internal',
    instructions:
      'A page is credited with a lead when that lead browsed it — the visitor is stitched to the lead (stitch_visitor_to_lead), which also fills lead_id backwards on earlier views. A lead that browsed several pages is credited to EACH of them, so the revenue column does not sum to total revenue; quote it per page, never as a total.',
    tool_definition: {
      type: 'function',
      function: {
        name: 'page_conversion_report',
        description: 'Leads, customers and revenue per page.',
        parameters: {
          type: 'object',
          properties: {
            p_days: { type: 'integer', description: 'Window in days (default 30, max 365)' },
            p_limit: { type: 'integer', description: 'Pages to return (default 25, max 200)' },
          },
        },
      },
    },
  },
  {
    name: 'analytics_dashboard',
    description: 'The site dashboard in one answer: page views, unique visitors, new leads and customers, visitor→lead and lead→customer rates, top pages, top sources and the goals. Use when: someone asks how the site is doing, or a briefing needs the numbers the admin dashboard shows. NOT for: a single goal (conversion_report) or per-page detail (page_conversion_report).',
    category: 'analytics',
    handler: 'rpc:analytics_dashboard',
    scope: 'internal',
    instructions:
      'These are exactly the figures /admin/analytics shows, so an agent and a human quote the same numbers. With no page views in the window the answer says so in note — report that instead of "0 % conversion", which would read as a failing site rather than an unmeasured one.',
    tool_definition: {
      type: 'function',
      function: {
        name: 'analytics_dashboard',
        description: 'Traffic, leads, conversion rates, top pages and sources, goals.',
        parameters: {
          type: 'object',
          properties: { p_days: { type: 'integer', description: 'Window in days (default 30, max 365)' } },
        },
      },
    },
  },
  {
    name: 'analyze_analytics',
    description: 'Get page view analytics for a given period. Use when: reviewing website traffic; analyzing page performance; generating traffic reports. NOT for: analyzing chat feedback (analyze_chat_feedback); generating business digests (weekly_business_digest).',
    category: 'analytics',
    handler: 'db:page_views',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'analyze_analytics',
        description: 'Get page view analytics for a given period. Use when: reviewing website traffic; analyzing page performance; generating traffic reports. NOT for: analyzing chat feedback (analyze_chat_feedback); generating business digests (weekly_business_digest).',
        parameters: {
          type: 'object',
          properties: {
            period: {
              type: 'string',
              enum: [
                'today',
                'week',
                'month',
                'quarter',
              ],
              description: 'Time period',
            },
          },
        },
      },
    },
    instructions: `## analyze_analytics
### What
Retrieves page view analytics for a given time period.
### When to use
- User asks about traffic, views, or site performance
- Part of weekly_business_digest or reporting workflows
- When evaluating content performance
### Parameters
- **period**: 'today', 'week', 'month', 'quarter'. Defaults to 'week'.
### Edge cases
- Returns aggregated data — for per-page breakdown, check the response structure.
- New sites may have no data — handle gracefully.`,
  },
  {
    name: 'seo_audit_page',
    description: 'Run an SEO audit on a page or blog post, checking title, meta, content depth, images, links. Use when: optimizing a page for search engines; reviewing SEO before publishing; identifying SEO issues. NOT for: analyzing page traffic (analyze_analytics); updating page content (manage_page).',
    category: 'analytics',
    handler: 'module:analytics',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'seo_audit_page',
        description: 'Run an SEO audit on a page or blog post, checking title, meta, content depth, images, links. Use when: optimizing a page for search engines; reviewing SEO before publishing; identifying SEO issues. NOT for: analyzing page traffic (analyze_analytics); updating page content (manage_page).',
        parameters: {
          type: 'object',
          properties: {
            slug: {
              type: 'string',
              description: 'Page or blog post slug to audit',
            },
          },
          required: [
            'slug',
          ],
        },
      },
    },
    instructions: `## seo_audit_page
### What
Runs an SEO audit on a page or blog post, checking title, meta, content depth, images, and links.
### When to use
- Admin asks for SEO analysis
- Before publishing important pages
- Content quality check during heartbeat
### Parameters
- **slug**: Required. Page or blog post slug to audit.
### Edge cases
- Works on both pages and blog posts.
- Returns actionable recommendations with severity levels.`,
  },
  {
    name: 'kb_gap_analysis',
    description: 'Analyze chat data to find questions not covered by KB articles, underperforming articles, and content gaps. Use when: improving knowledge base coverage; identifying frequently asked but unanswered questions; planning KB content. NOT for: managing KB articles (manage_kb_article); analyzing feedback sentiment (analyze_chat_feedback).',
    category: 'analytics',
    handler: 'module:analytics',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'kb_gap_analysis',
        description: 'Analyze chat data to find questions not covered by KB articles, underperforming articles, and content gaps. Use when: improving knowledge base coverage; identifying frequently asked but unanswered questions; planning KB content. NOT for: managing KB articles (manage_kb_article); analyzing feedback sentiment (analyze_chat_feedback).',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Max uncovered questions (default 20)',
            },
          },
        },
      },
    },
    instructions: `## kb_gap_analysis
### What
Analyzes chat data to find questions not covered by KB articles, underperforming articles, and content gaps.
### When to use
- Admin asks "what questions can't the chat answer?"
- Knowledge base improvement cycles
- Content strategy: identify missing topics
### Parameters
- **limit**: Max uncovered questions to return (default 20).
### Edge cases
- Requires chat history data to produce meaningful results.
- Chain: kb_gap_analysis → manage_kb_article(create) for each gap.`,
  },
  {
    name: 'analyze_chat_feedback',
    description: 'Analyze chat feedback: summary stats, negative feedback drill-down. Use when: monitoring customer satisfaction; identifying knowledge gaps; reviewing support quality. NOT for: getting raw feedback data (support_get_feedback); analyzing KB gaps (kb_gap_analysis).',
    category: 'analytics',
    handler: 'module:analytics',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'analyze_chat_feedback',
        description: 'Analyze chat feedback: summary stats, negative feedback drill-down. Use when: monitoring customer satisfaction; identifying knowledge gaps; reviewing support quality. NOT for: getting raw feedback data (support_get_feedback); analyzing KB gaps (kb_gap_analysis).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'summary',
                'negative_only',
              ],
            },
            period: {
              type: 'string',
              enum: [
                'week',
                'month',
                'quarter',
              ],
            },
            limit: {
              type: 'number',
            },
          },
        },
      },
    },
    instructions: `## analyze_chat_feedback
### What
Analyzes chat feedback: summary statistics, negative feedback drill-down.
### When to use
- Admin asks about chat satisfaction or quality
- Part of weekly digest or performance review
- Identifying problematic chat responses
### Parameters
- **action**: summary (overall stats) or negative_only (drill into bad feedback).
- **period**: week, month, quarter.
### Edge cases
- Negative feedback includes the original question and AI response for context.
- Use insights to improve KB articles and chat configuration.`,
  },
];

export const analyticsModule = defineModule<Input, Output>({
  id: 'analytics',
  name: 'Analytics',
  version: '1.0.0',
  processes: ['content-to-conversion', 'record-to-report', 'support-to-resolution'],
  maturity: 'L3',
  description: 'Dashboard with insights on leads, deals, and newsletter performance',
  capabilities: ['data:read'],
  tier: 'standard',
  inputSchema,
  outputSchema,

  skills: [
    'analyze_analytics',
    'seo_audit_page',
    'kb_gap_analysis',
    'analyze_chat_feedback',
    'weekly_business_digest',
    'support_get_feedback',
    'competitor_monitor',
  ],
  skillSeeds: ANALYTICS_SKILLS,

  async publish(input: Input): Promise<Output> {
    return { success: true, message: `Analytics ${input.action} completed` };
  },
});
