import { defineModule } from '@/lib/module-def';
import type { SkillSeed, AutomationSeed } from '@/lib/module-bootstrap';
import { z } from 'zod';

// ── Visitor Intelligence Module ──────────────────────────────────────────────
// Signal-plugin pattern (see mem://architecture/module-signal-plugins):
// listens on page-view telemetry produced by the analytics core, evaluates
// configurable rules from site_settings.visitor_intelligence_rules, and emits
// scored signals against identified leads. Ranks entirely on-platform — no
// third-party analytics needed.
//
// Why a module (togglable) instead of core:
//   Analytics tracking = core (everyone needs page_views).
//   Rules + scoring + timeline widget = optional layer; some sites don't want it.
// ─────────────────────────────────────────────────────────────────────────────

const inputSchema = z.object({
  action: z.enum(['score', 'get_timeline']),
  lead_id: z.string().uuid().optional(),
});

const outputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

const VISITOR_INTELLIGENCE_SKILLS: SkillSeed[] = [
  {
    name: 'score_visitor_intent',
    description:
      'Run visitor-intelligence rules to detect behavioral signals (return visits, pricing interest, deep engagement, reawakening) and bump lead scores. Use when: refreshing lead priority based on browsing; after a new lead is created; during weekly review. NOT for: raw analytics (analyze_analytics); one-off scoring rules (edit visitor_intelligence_rules in site_settings).',
    category: 'analytics',
    handler: 'edge:score-visitor-intent',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'score_visitor_intent',
        description: 'Evaluate visitor-intelligence rules and fire signals against identified leads.',
        parameters: {
          type: 'object',
          properties: {
            lead_id: { type: 'string', description: 'Optional — evaluate a single lead. Omit to evaluate all recently identified visitors.' },
          },
        },
      },
    },
    instructions: `## score_visitor_intent
### What
Evaluates visitor-intelligence rules against page_views for identified leads. Fires visitor_signals rows and bumps lead.score.
### When to use
- Cron-driven refresh (every 15 min recommended).
- Manual: after a lead is created or after a marketing push.
### Idempotency
A rule won't double-fire the same day per lead. Safe to run repeatedly.`,
  },
  {
    name: 'get_visitor_timeline',
    description:
      'Fetch a lead\'s recent browsing behavior: page views + fired signals in one chronological stream. Use when: preparing a sales call; explaining why a lead score changed; debugging tracking. NOT for: aggregated site traffic (analyze_analytics).',
    category: 'analytics',
    handler: 'db:page_views',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'get_visitor_timeline',
        description: 'Get behavioral timeline for a lead.',
        parameters: {
          type: 'object',
          required: ['lead_id'],
          properties: {
            lead_id: { type: 'string' },
            limit: { type: 'number', description: 'Default 50.' },
          },
        },
      },
    },
    instructions: `## get_visitor_timeline
Returns page_views + visitor_signals for a lead, most recent first. Filter by lead_id.`,
  },
];

export const visitorIntelligenceModule = defineModule<Input, Output>({
  id: 'visitorIntelligence',
  name: 'Visitor Intelligence',
  version: '1.0.0',
  processes: ['lead-to-customer', 'content-to-conversion'],
  maturity: 'L2',
  description:
    'Behavioral signals from anonymous browsing — identity stitching, rule-based scoring, and a per-lead visitor timeline in the CRM.',
  capabilities: ['data:read', 'data:write'],
  tier: 'standard',
  inputSchema,
  outputSchema,

  skills: ['score_visitor_intent', 'get_visitor_timeline'],
  skillSeeds: VISITOR_INTELLIGENCE_SKILLS,

  async publish(input: Input): Promise<Output> {
    return { success: true, message: `visitor-intelligence ${input.action} ok` };
  },
});
