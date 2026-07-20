import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { Json } from '@/integrations/supabase/types';
import type { SkillSeed, AutomationSeed } from '@/lib/module-bootstrap';
import { defineModule } from '@/lib/module-def';
import {
  GrowthCampaignInput,
  GrowthCampaignOutput,
  growthCampaignInputSchema,
  growthCampaignOutputSchema,
} from '@/types/module-contracts';

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const GROWTH_SKILLS: SkillSeed[] = [
  {
    name: 'ad_campaign_create',
    description: 'Create a new ad campaign with objective, budget, target audience, and platform. Requires approval due to budget commitment. Use when: launching a marketing initiative; defining advertising parameters; allocating ad budget. NOT for: generating ad creatives (ad_creative_generate); optimizing existing campaigns (ad_optimize).',
    category: 'growth',
    handler: 'db:ad_campaigns',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'ad_campaign_create',
        description: 'Create a new ad campaign with objective, budget, target audience, and platform. Requires approval due to budget commitment. Use when: launching a marketing initiative; defining advertising parameters; allocating ad budget. NOT for: generating ad creatives (ad_creative_generate); optimizing existing campaigns (ad_optimize).',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Campaign name',
            },
            platform: {
              type: 'string',
              enum: [
                'meta',
                'google',
                'linkedin',
              ],
              description: 'Ad platform',
            },
            objective: {
              type: 'string',
              enum: [
                'awareness',
                'traffic',
                'leads',
                'conversions',
              ],
              description: 'Campaign objective',
            },
            budget_cents: {
              type: 'number',
              description: 'Daily budget in cents',
            },
            currency: {
              type: 'string',
              description: 'Currency code (default SEK)',
            },
            target_audience: {
              type: 'object',
              description: 'Target audience config: demographics, interests, location',
            },
            start_date: {
              type: 'string',
              description: 'Start date YYYY-MM-DD',
            },
            end_date: {
              type: 'string',
              description: 'End date YYYY-MM-DD',
            },
          },
          required: [
            'name',
            'platform',
            'objective',
            'budget_cents',
          ],
        },
      },
    },
    instructions: `## ad_campaign_create
### What
Creates a new ad campaign with objective, budget, target audience, and platform. Requires approval due to budget commitment.
### When to use
- Admin asks to create an advertising campaign
- Part of paid growth workflow
### Parameters
- **name**: Required. Campaign name.
- **platform**: Required. meta, google, or linkedin.
- **objective**: Required. awareness, traffic, leads, conversions.
- **budget_cents**: Required. Daily budget in cents.
### Edge cases
- Requires approval because it commits real budget.
- Creates in 'draft' status until approved and activated.
- Chain: ad_campaign_create → ad_creative_generate → activate.`,
  },
  {
    name: 'ad_creative_generate',
    description: 'Generate ad creative (headline, body, CTA) using AI based on campaign objective and target audience. Use when: creating ad copy for a campaign; generating variations for A/B testing; needing creative inspiration. NOT for: creating campaigns (ad_campaign_create); checking ad performance (ad_performance_check).',
    category: 'growth',
    handler: 'internal:ad_creative_generate',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'ad_creative_generate',
        description: 'Generate ad creative (headline, body, CTA) using AI based on campaign objective and target audience. Use when: creating ad copy for a campaign; generating variations for A/B testing; needing creative inspiration. NOT for: creating campaigns (ad_campaign_create); checking ad performance (ad_performance_check).',
        parameters: {
          type: 'object',
          properties: {
            campaign_id: {
              type: 'string',
              description: 'Campaign UUID to generate creative for',
            },
            type: {
              type: 'string',
              enum: [
                'image',
                'video',
                'text',
                'carousel',
              ],
              description: 'Creative type',
            },
            tone: {
              type: 'string',
              enum: [
                'professional',
                'casual',
                'urgent',
                'storytelling',
              ],
              description: 'Ad tone',
            },
            key_message: {
              type: 'string',
              description: 'Core message or value proposition',
            },
            cta: {
              type: 'string',
              description: 'Call to action text',
            },
          },
          required: [
            'campaign_id',
            'type',
          ],
        },
      },
    },
    instructions: `## ad_creative_generate
### What
Generates ad creative (headline, body, CTA) using AI based on campaign objective and target audience.
### When to use
- After creating an ad campaign, generate creative assets
- A/B testing: generate multiple creative variants
### Parameters
- **campaign_id**: Required. Campaign UUID.
- **type**: Required. image, video, text, or carousel.
- **tone**: Ad tone: professional, casual, urgent, storytelling.
- **key_message**: Core value proposition.
### Edge cases
- AI-generated — review before activating.
- Multiple creatives per campaign enable A/B testing.`,
  },
  {
    name: 'ad_performance_check',
    description: 'Check ad campaign performance metrics: spend, impressions, clicks, CTR, CPC, conversions. Use when: monitoring campaign metrics; building performance reports; evaluating ROI. NOT for: optimizing campaigns (ad_optimize); creating campaigns (ad_campaign_create).',
    category: 'growth',
    handler: 'db:ad_campaigns',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'ad_performance_check',
        description: 'Check ad campaign performance metrics: spend, impressions, clicks, CTR, CPC, conversions. Use when: monitoring campaign metrics; building performance reports; evaluating ROI. NOT for: optimizing campaigns (ad_optimize); creating campaigns (ad_campaign_create).',
        parameters: {
          type: 'object',
          properties: {
            campaign_id: {
              type: 'string',
              description: 'Campaign UUID (omit for all campaigns)',
            },
            period: {
              type: 'string',
              enum: [
                'today',
                'week',
                'month',
                'all',
              ],
              description: 'Time period',
            },
          },
        },
      },
    },
    instructions: `## ad_performance_check
### What
Checks ad campaign performance metrics: spend, impressions, clicks, CTR, CPC, conversions.
### When to use
- Admin asks about ad performance
- Part of weekly digest
- Before ad_optimize to gather data
### Parameters
- **campaign_id**: Optional. Omit for all campaigns.
- **period**: today, week, month, all.
### Edge cases
- New campaigns may show zeros — wait at least 24h for meaningful data.
- Metrics are from the internal tracking system, not the ad platform API.`,
  },
  {
    name: 'ad_optimize',
    description: 'Analyze campaign performance and recommend optimizations: pause underperformers, scale winners, adjust budgets. Requires approval. Use when: reviewing campaign results; optimizing ad spend; identifying underperforming ads. NOT for: creating campaigns (ad_campaign_create); generating creatives (ad_creative_generate).',
    category: 'growth',
    handler: 'internal:ad_optimize',
    scope: 'internal',
    // Budget-affecting actions (pause/scale/rebalance) must be human-approved before execution.
    trust_level: 'approve',
    tool_definition: {
      type: 'function',
      function: {
        name: 'ad_optimize',
        description: 'Analyze campaign performance and recommend optimizations: pause underperformers, scale winners, adjust budgets. Requires approval. Use when: reviewing campaign results; optimizing ad spend; identifying underperforming ads. NOT for: creating campaigns (ad_campaign_create); generating creatives (ad_creative_generate).',
        parameters: {
          type: 'object',
          properties: {
            campaign_id: {
              type: 'string',
              description: 'Campaign UUID to optimize (omit for all)',
            },
            action: {
              type: 'string',
              enum: [
                'analyze',
                'pause_underperformers',
                'scale_winners',
                'rebalance_budget',
              ],
              description: 'Optimization action',
            },
            threshold_ctr: {
              type: 'number',
              description: 'Minimum CTR threshold (default 0.5%)',
            },
            threshold_cpc_cents: {
              type: 'number',
              description: 'Max CPC in cents before pausing',
            },
          },
        },
      },
    },
    instructions: `## ad_optimize
### What
Analyzes campaign performance and recommends optimizations. Requires approval for budget changes.
### When to use
- Campaigns have been running for 3+ days
- Admin asks to optimize ad spend
- Automated optimization in growth workflows
### Parameters
- **campaign_id**: Optional. Omit for all campaigns.
- **action**: analyze, pause_underperformers, scale_winners, rebalance_budget.
- **threshold_ctr**: Min CTR before pausing (default 0.5%).
### Edge cases
- Requires approval for budget-affecting actions.
- Always analyze first, then act on recommendations.`,
  },
  {
    name: 'get_attribution_report',
    description: 'Return campaign/source/medium attribution over a window: visits, unique visitors, leads, orders, and revenue by UTM. Use when: reviewing which campaigns actually drive conversions; comparing paid vs organic sources.',
    category: 'growth',
    handler: 'rpc:utm_attribution_report',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'get_attribution_report',
        description: 'Aggregated attribution report grouped by utm_source/medium/campaign.',
        parameters: {
          type: 'object',
          properties: {
            _since: {
              type: 'string',
              description: 'ISO timestamp lower bound (default: 30 days ago).',
            },
          },
        },
      },
    },
    instructions: 'Use before ad_optimize to see which campaigns actually convert. Compares last-touch UTMs on leads/orders.',
  },
  {
    name: 'schedule_social_post',
    description: 'Create or schedule an organic social post (linkedin/x/instagram/facebook). If scheduled_at is set, status becomes "scheduled"; otherwise "draft". Actual channel publish requires per-channel credentials — this stores + queues the post; mark_social_post_posted records the external ref once published.',
    category: 'growth',
    handler: 'db:social_posts',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'schedule_social_post',
        description: 'Insert a row into social_posts with channel, content, and optional scheduled_at.',
        parameters: {
          type: 'object',
          required: ['content', 'channel'],
          properties: {
            content: { type: 'string' },
            channel: { type: 'string', enum: ['linkedin', 'x', 'instagram', 'facebook', 'other'] },
            scheduled_at: { type: 'string', description: 'ISO timestamp (optional).' },
            link_url: { type: 'string' },
            media_url: { type: 'string' },
            blog_post_id: { type: 'string' },
          },
        },
      },
    },
    instructions: 'Chain from generate_social_post: generate the copy, then call schedule_social_post per channel.',
  },
  {
    name: 'list_social_posts',
    description: 'List organic social posts filtered by status/channel — inspect the calendar or moderation queue.',
    category: 'growth',
    handler: 'db:social_posts',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_social_posts',
        description: 'List social_posts.',
        parameters: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['draft', 'scheduled', 'posted', 'failed', 'cancelled'] },
            channel: { type: 'string', enum: ['linkedin', 'x', 'instagram', 'facebook', 'other'] },
            limit: { type: 'number' },
          },
        },
      },
    },
    instructions: 'Use before mark_social_post_posted to pick the right post id.',
  },
  {
    name: 'mark_social_post_posted',
    description: 'Mark an organic social post as posted with the external ref/url returned by the channel.',
    category: 'growth',
    handler: 'rpc:mark_social_post_posted',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'mark_social_post_posted',
        description: 'Set status=posted on a social_posts row.',
        parameters: {
          type: 'object',
          required: ['_post_id'],
          properties: {
            _post_id: { type: 'string' },
            _external_ref: { type: 'string' },
            _external_url: { type: 'string' },
          },
        },
      },
    },
    instructions: 'Call after the channel confirms the publish. Idempotent (posted_at only set on first call).',
  },

  {
    name: 'process_due_social_posts',
    description: 'Process scheduled social posts whose publish time has passed. Use when: running the periodic social-post sweep (the Social Post Scheduler automation calls this). Takes no arguments. NOT for: scheduling a post (manage_social_post).',
    category: 'growth',
    handler: 'rpc:process_due_social_posts',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'process_due_social_posts',
        parameters: { type: 'object', properties: {} },
      },
    },
    instructions: 'Sweep RPC. Without per-channel publisher credentials wired, due posts are marked failed with a "no publisher configured" note rather than silently lingering — so the queue never grows unbounded.',
  },
];

const GROWTH_AUTOMATIONS: AutomationSeed[] = [
  {
    name: 'Social Post Scheduler',
    description: 'Every 15 minutes, process scheduled social posts whose publish time has passed.',
    trigger_type: 'cron',
    trigger_config: { cron: '*/15 * * * *', expression: '*/15 * * * *' },
    skill_name: 'process_due_social_posts',
    skill_arguments: {},
  },
];

export const growthModule = defineModule<GrowthCampaignInput, GrowthCampaignOutput>({
  id: 'paidGrowth',
  name: 'Paid Growth',
  version: '1.0.0',
  processes: ['content-to-conversion'],
  maturity: 'L3',
  description: 'Manage ad campaigns and track paid growth performance',
  capabilities: ['data:read', 'data:write'],
  tier: 'standard',
  inputSchema: growthCampaignInputSchema,
  outputSchema: growthCampaignOutputSchema,

  skills: [
    'ad_campaign_create',
    'ad_creative_generate',
    'ad_performance_check',
    'ad_optimize',
    'get_attribution_report',
    'schedule_social_post',
    'list_social_posts',
    'mark_social_post_posted',
  , 'process_due_social_posts'],
  data: {
    tables: ['ad_creatives', 'ad_campaigns', 'content_proposals', 'content_research', 'utm_attributions', 'social_posts'],
  },
  skillSeeds: GROWTH_SKILLS,
  automations: GROWTH_AUTOMATIONS,

  async publish(input: GrowthCampaignInput): Promise<GrowthCampaignOutput> {
    try {
      const validated = growthCampaignInputSchema.parse(input);

      const insertData = {
        name: validated.name,
        platform: validated.platform,
        objective: validated.objective || null,
        budget_cents: validated.budget_cents,
        currency: validated.currency || 'SEK',
        target_audience: (validated.target_audience || {}) as Json,
        status: 'draft' as const,
      };

      const { data, error } = await supabase
        .from('ad_campaigns')
        .insert([insertData])
        .select('id, name, status')
        .single();

      if (error) throw error;

      logger.log(`[GrowthModule] Campaign created: ${data.id}`);

      return {
        success: true,
        campaign_id: data.id,
        name: data.name,
        status: data.status,
      };
    } catch (err) {
      logger.error('[GrowthModule] Failed to create campaign:', err);
      return {
        success: false,
        campaign_id: '',
        name: input.name,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  },
});
