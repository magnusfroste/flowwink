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
  description: 'Dashboard with insights on leads, deals, and newsletter performance',
  capabilities: ['data:read'],
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
