/**
 * Where an instance sends its feedback and its daily ping unless the operator
 * points it elsewhere. One constant, read by the module, the settings hook and
 * the admin page — never spelled twice.
 */
export const FEEDBACK_DEFAULT_ENDPOINT = 'https://www.flowwink.com';

export interface FeedbackSettings {
  /** The receiving site (https://www.flowwink.com) or a functions URL ending in /content-api. Empty = this instance. */
  endpoint: string;
  /** The daily ping (instance id, site URL, version, enabled modules). */
  share_usage: boolean;
  /** The public board's heading and intro on a receiving instance. */
  board_title: string;
  board_intro: string;
}

export const defaultFeedbackSettings: FeedbackSettings = {
  endpoint: FEEDBACK_DEFAULT_ENDPOINT,
  share_usage: true,
  board_title: 'Feedback',
  board_intro: 'Bug reports, feature requests and questions. Vote for what matters to you.',
};

export type FeedbackBoardId = 'bug' | 'feature' | 'template' | 'question';
export const FEEDBACK_BOARD_LABELS: Record<FeedbackBoardId, string> = { bug: 'Bug reports', feature: 'Feature requests', template: 'Templates', question: 'Questions' };
export const FEEDBACK_STATUS_LABELS: Record<string, string> = { open: 'Open', planned: 'Planned', in_progress: 'In progress', done: 'Done', declined: 'Declined' };

/** Two URLs name the same instance when their hosts match. */
export function sameHost(a: string | null | undefined, b: string | null | undefined): boolean {
  const host = (u: string | null | undefined) => { try { return new URL(String(u ?? '')).host.toLowerCase(); } catch { return ''; } };
  const ha = host(a), hb = host(b);
  return !!ha && ha === hb;
}

/** Does this instance RECEIVE (the endpoint is empty or names this site)? */
export function receivesHere(endpoint: string | null | undefined, ownSiteUrl: string | null | undefined): boolean {
  const e = String(endpoint ?? '').trim();
  if (!e) return true;
  return sameHost(e, ownSiteUrl);
}
