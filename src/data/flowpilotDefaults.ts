/**
 * Default FlowPilot bootstrap configuration.
 *
 * These are the starter objectives, automations, and workflows seeded on
 * every fresh installation — regardless of which template is used.
 *
 * Rules for this list:
 * - Few but high-value: each entry must deliver an immediate "wow" moment
 * - Universal: must make sense for any business type
 * - Executable: FlowPilot must be able to act on it autonomously
 */
export const DEFAULT_FLOWPILOT_BOOTSTRAP = {
  objectives: [
    {
      goal: 'Establish content presence — publish one well-researched blog post per week, grounded in the business identity and published knowledge',
      success_criteria: { published_posts: 3 },
      // Mirrors the live seeder's two guards. cadence caps how often (one post
      // a week); requires_business_identity decides when it may start at all —
      // it holds until company_profile carries company_name + services. The
      // LIVE seeder is flowpilot-module.ts (starterObjectiveRow births it
      // 'paused' on an identity-less install); this copy stays in sync so a
      // rewire cannot resurrect the old ungated, uncapped seed.
      constraints: {
        no_destructive_actions: true,
        cadence: { counts: 'write_blog_post', max: 1, per: 'week' },
        requires_business_identity: true,
      },
    },
    {
      goal: 'Research our top 3 competitors — document their positioning, pricing, and content gaps we can exploit',
      success_criteria: { competitors_researched: 3 },
      constraints: { no_destructive_actions: true },
    },
    {
      goal: 'Set up weekly digest — monitor site performance and report key metrics every Friday',
      success_criteria: { weekly_digest_active: true },
    },
  ],
  automations: [
    {
      name: 'Weekly Business Digest',
      description: 'Every Friday afternoon, analyze performance and generate a business digest with key metrics, wins, and next week priorities.',
      trigger_type: 'cron' as const,
      trigger_config: { cron: '0 16 * * 5', timezone: 'UTC' },
      skill_name: 'weekly_business_digest',
      skill_arguments: {},
      enabled: true,
    },
  ],
  workflows: [
    {
      name: 'Content Pipeline',
      description: 'Research a topic, generate a blog post proposal, write and publish.',
      steps: [
        { id: 'step-1', skill_name: 'research_content', skill_args: { query: '{{topic}}' } },
        { id: 'step-2', skill_name: 'generate_content_proposal', skill_args: { research_context: '{{step-1.output}}' } },
        { id: 'step-3', skill_name: 'write_blog_post', skill_args: { proposal: '{{step-2.output}}' }, on_failure: 'stop' },
      ],
      trigger_type: 'manual' as const,
      trigger_config: {},
      enabled: true,
    },
  ],
};
