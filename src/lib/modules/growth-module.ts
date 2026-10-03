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
            // No underscore — see mark_social_post_posted below; the prefix is
            // added by UNDERSCORE_PARAM_RPCS, not declared here.
            since: {
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
    description: 'Create or schedule an organic social post (linkedin/x/instagram/facebook). Use when: queueing, drafting or scheduling organic social content for a channel. If scheduled_at is set, status becomes "scheduled"; otherwise "draft". Actual channel publish requires per-channel credentials — this stores + queues the post; mark_social_post_posted records the external ref once published. NOT for: writing the copy itself (generate_social_post) or paid campaigns (ad_campaign_create).',
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
    description: 'List organic social posts filtered by status/channel. Use when: inspecting the social calendar or moderation queue, or finding the post id before mark_social_post_posted. NOT for: creating or scheduling posts (schedule_social_post).',
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
    description: 'Mark an organic social post as posted with the external ref/url returned by the channel. Use when: a scheduled post has actually been published and needs its status + external reference recorded. NOT for: creating or scheduling posts (schedule_social_post).',
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
          // Declared WITHOUT the underscore even though the RPC params carry
          // one. agent-execute strips every _-prefixed argument before dispatch
          // (they are agent-internal, e.g. _caller_user_id) and then adds the
          // prefix back for functions in UNDERSCORE_PARAM_RPCS. Declaring
          // `_post_id` here meant the value was dropped on the way in.
          required: ['post_id'],
          properties: {
            post_id: { type: 'string' },
            external_ref: { type: 'string' },
            external_url: { type: 'string' },
          },
        },
      },
    },
    instructions: 'Call after the channel confirms the publish. Idempotent (posted_at only set on first call).',
  },

  {
    name: 'process_due_social_posts',
    description: 'Publish scheduled social posts whose publish time has passed. Use when: running the periodic social-post sweep (the Social Post Scheduler automation calls this). Takes no arguments. NOT for: scheduling a post (schedule_social_post).',
    category: 'growth',
    handler: 'internal:process_due_social_posts',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'process_due_social_posts',
        parameters: { type: 'object', properties: {} },
      },
    },
    instructions: 'The publish weld: linkedin posts go out via Composio (LINKEDIN_CREATE_LINKED_IN_POST signed with the connected account\'s author URN) and are marked posted with the external URL. Channels without a publisher — or LinkedIn without a connected account — are marked failed with the reason, never left lingering, so the queue stays honest. Scheduling IS the approval: only status=scheduled posts with a passed time are touched. Returns {work_done, processed:[{post_id, channel, status, external_url?, error?}]} — read the list from `processed`; `work_done` is how many posts this sweep changed (0 = empty queue, and then the scheduled run leaves no activity row).',
  },

  {
    name: 'sync_ad_metrics',
    description:
      'Pull live performance from the connected Meta ad account into the ad ledger: per-campaign spend, impressions, clicks, conversions, CTR and CPC for a date window, written to ad_campaigns (metrics, spent_cents, external_id; campaigns that exist on Meta but not here are created as platform "meta"). Runs nightly via the Ad Metrics Sync automation; call it directly after connecting Meta Ads or before reading ad_performance_check. Needs Meta Ads connected through Composio (Modules → Composio → Quick Connect → metaads). Use when: the Growth dashboard shows zeros; checking spend before ad_optimize; right after connecting the ad account. NOT for: creating campaigns (ad_campaign_create); reading what is already synced (ad_performance_check); organic social (list_social_posts).',
    category: 'growth',
    handler: 'internal:sync_ad_metrics',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'sync_ad_metrics',
        description:
          'Sync per-campaign spend and performance from the connected Meta ad account (via Composio) into ad_campaigns. dry_run reports what would change without writing.',
        parameters: {
          type: 'object',
          properties: {
            date_preset: {
              type: 'string',
              enum: ['today', 'yesterday', 'last_7d', 'last_14d', 'last_28d', 'last_30d', 'last_90d', 'this_month', 'last_month', 'maximum'],
              description: 'Meta insights window (default last_30d). The window is stored with the metrics so a reader knows what the numbers cover.',
            },
            ad_account_id: {
              type: 'string',
              description: 'Meta ad account to read (act_… or bare digits). Default: the Meta Ads integration\'s configured account, else the first account the connected user has access to.',
            },
            dry_run: {
              type: 'boolean',
              description: 'true = fetch and report the per-campaign numbers, write nothing (default false).',
            },
          },
          required: [],
        },
      },
    },
    instructions: `## sync_ad_metrics
### What
The feed for the ad ledger. Reads campaign-level insights from the connected Meta ad account through Composio's metaads toolkit and writes them to ad_campaigns: spent_cents, metrics { impressions, clicks, conversions, ctr, cpc_cents, date_preset, synced_at, source: "meta" }, external_id (Meta campaign id), status and objective when Meta reports them. A campaign that exists on Meta but not in the ledger is created (platform "meta"); nothing is ever deleted.
### Prerequisites
- Composio connected with an ACTIVE metaads account under entity "default" (Modules → Composio → Quick Connect → metaads). The Meta Ads integration card explains the one-time Meta app + Composio auth config.
- Optional: Meta Ads integration config adAccountId — which account to read when the user has several.
### Workflow
1. Connect Meta Ads → run sync_ad_metrics { dry_run: true } to see the account and campaigns found.
2. Run without dry_run (or wait for the nightly Ad Metrics Sync). Then ad_performance_check / the Growth dashboard show real numbers and ad_optimize recommends on them.
### Reading the result
- ad_account: which account was read. campaigns: per-campaign rows with meta_campaign_id, name, spend_cents, impressions, clicks, conversions, action (created / updated / unchanged / would_create / would_update).
- error "No Meta Ads account connected": connect it first; this skill cannot fall back to a token.
### Edge cases
- Conversions = the sum of Meta "actions" of lead/purchase/registration/contact types; other action types are ignored, so the figure is conservative.
- Insights are read at campaign level only; ad sets and ads are not stored.`,
  },
  {
    name: 'approve_content_campaign',
    description: 'Approve a content campaign (content_proposals) and FAN OUT its channel variants to the delivery rails: linkedin/twitter/instagram/facebook variants become social_posts rows (campaign_id set, image inherited, scheduled if the campaign has a time), the blog variant becomes a blog_posts draft, the newsletter variant a newsletters draft. Use when: a reviewed campaign should go live per its plan. NOT for: creating or editing a campaign (manage the proposal first), publishing an individual social post (schedule_social_post), or re-running delivery (idempotent — re-approval returns existing artifacts).',
    category: 'growth',
    handler: 'internal:approve_content_campaign',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'approve_content_campaign',
        description: 'Approve a content proposal and materialize its channel variants onto the delivery rails.',
        parameters: {
          type: 'object',
          required: ['proposal_id'],
          properties: {
            proposal_id: { type: 'string', description: 'content_proposals.id to approve.' },
            scheduled_for: { type: 'string', description: 'ISO timestamp overriding the proposal\'s own schedule for the social posts. Omit to use the proposal\'s scheduled_for; if neither exists the social posts are created as drafts.' },
          },
        },
      },
    },
    instructions: 'THE CAMPAIGN FAN-OUT — approve is the decision, the rails are the execution (same shape as propose→approve→voucher in accounting). What happens per channel variant: linkedin/twitter (→ channel x)/instagram/facebook → social_posts with campaign_id, content = text + hashtags, media_url = the variant\'s image_override or the campaign\'s featured_image, status scheduled when a time exists (the 15-minute sweep then publishes via Composio) else draft. blog → blog_posts DRAFT (body converted to a Tiptap doc, slug auto-derived, seo_keywords into meta_json) — a human publishes it from the blog surface. newsletter → newsletters DRAFT — sending stays behind the newsletter rail\'s own gate. print → skipped (no rail). Idempotent on approved campaigns: existing artifacts are returned, nothing duplicated. The response lists materialized ids per channel and every skipped channel with its reason.',
  },
];

const GROWTH_AUTOMATIONS: AutomationSeed[] = [
  {
    // The ad ledger's feed. Nightly, after Meta has closed the previous day;
    // a platform executor — deterministic, no FlowPilot reasoning involved.
    name: 'Ad Metrics Sync',
    description: 'Nightly: pull spend, impressions, clicks and conversions per campaign from the connected Meta ad account (via Composio) into ad_campaigns.',
    trigger_type: 'cron',
    trigger_config: { cron: '10 5 * * *', expression: '10 5 * * *' },
    skill_name: 'sync_ad_metrics',
    skill_arguments: {},
  },
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
  description: 'Campaigns, social queue and UTM attribution; an ad ledger fed nightly from the connected Meta ad account via Composio',
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
    'sync_ad_metrics',
    'schedule_social_post',
    'list_social_posts',
    'mark_social_post_posted',
    'process_due_social_posts',
    'approve_content_campaign',
  ],
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
