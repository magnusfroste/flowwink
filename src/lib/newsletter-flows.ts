/**
 * Newsletter flows are FlowPilot objectives, not automations.
 *
 * Until 2026-11 a flow was an agent_automations row that ran
 * lead_nurture_sequence on a cron or an event with fixed arguments. That skill
 * saves ONE email someone WROTE for ONE lead — lead_id, subject and content_md
 * are required — so a fixed-argument run can never succeed: optic's
 * "Re-engagement sequence" failed every Monday with "lead_id is required" and
 * the Automation Health panel called it erroring. A flow needs judgement
 * (which leads are cold, what to say to each), which is what the heartbeat
 * brings to an objective. The rhythm lives in structure (constraints.cadence),
 * not in the goal's prose; `standing` keeps a flow from being completed.
 *
 * The goal texts are mirrored in the migration that converts the old rows
 * (20261103120000_newsletter-flows-become-objectives.sql) — the guardrail test
 * newsletter-flows-are-objectives keeps the two identical.
 */

export type NewsletterFlowKey = 'welcome' | 're_engage' | 'upsell';

export interface NewsletterFlowPreset {
  label: string;
  name: string;
  description: string;
  goal: string;
  cadence: { counts: 'lead_nurture_sequence'; max: number; per: 'day' | 'week' };
}

export const NEWSLETTER_FLOW_PRESETS: Record<NewsletterFlowKey, NewsletterFlowPreset> = {
  welcome: {
    label: 'Welcome',
    name: 'Welcome sequence',
    description: 'FlowPilot drafts a welcome email for each new lead, daily. Drafts only — a person sends them.',
    goal: 'Newsletter flow — welcome: every day, find leads created since yesterday that have no welcome draft yet (manage_leads list), read each one (manage_leads get) and write a short welcome email in the site\'s language, saved with lead_nurture_sequence (sequence_type welcome). Drafts only — a person reviews and sends them. This is a standing flow: never complete it.',
    cadence: { counts: 'lead_nurture_sequence', max: 10, per: 'day' },
  },
  re_engage: {
    label: 'Re-engage',
    name: 'Re-engagement sequence',
    description: 'FlowPilot drafts a re-engagement email for cold leads, weekly. Drafts only — a person sends them.',
    goal: 'Newsletter flow — re-engage: once a week, find leads with no activity in the last 60 days and no re-engage draft in the last 30 (manage_leads list), read each one (manage_leads get) and write a short re-engagement email in the site\'s language, saved with lead_nurture_sequence (sequence_type re-engage). Drafts only — a person reviews and sends them. This is a standing flow: never complete it.',
    cadence: { counts: 'lead_nurture_sequence', max: 20, per: 'week' },
  },
  upsell: {
    label: 'Upsell',
    name: 'Post-purchase upsell',
    description: 'FlowPilot drafts an upsell email for leads who just ordered, daily. Drafts only — a person sends them.',
    goal: 'Newsletter flow — upsell: every day, find leads with an order completed since yesterday and no upsell draft yet, read each one (manage_leads get) and write a short follow-up offering related products in the site\'s language, saved with lead_nurture_sequence (sequence_type upsell). Drafts only — a person reviews and sends them. This is a standing flow: never complete it.',
    cadence: { counts: 'lead_nurture_sequence', max: 10, per: 'day' },
  },
};

/** The constraints an objective carries when it is a newsletter flow. */
export function newsletterFlowConstraints(key: NewsletterFlowKey) {
  return {
    newsletter_flow: key,
    standing: true,
    no_destructive_actions: true,
    cadence: NEWSLETTER_FLOW_PRESETS[key].cadence,
  };
}

export function isNewsletterFlowKey(v: unknown): v is NewsletterFlowKey {
  return typeof v === 'string' && v in NEWSLETTER_FLOW_PRESETS;
}
