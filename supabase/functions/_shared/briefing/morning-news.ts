/**
 * What a morning has to say.
 *
 * Measured on optic, 2026-11-14 → 11-18: the Daily Briefing was mailed every
 * morning, yellow at 50/100, with one action item — "Traffic down 60% vs last
 * week — consider new content". The week had 19 page views and the one before
 * about 47. A person reading the site twice moves a week that size by double
 * digits; the percentage was arithmetic, not a statement, and it took ten
 * points off the health score for it.
 *
 * And the mail went out whether or not that item was there: one page view in
 * 24 hours ("1 visitors today") was a reason to write, and so was a blog post
 * for the seven mornings after it was published ("1 post published this
 * week").
 *
 * Two rules, pure — the briefing applies them, the tests read them:
 *
 *  1. Traffic has a floor. Under TRAFFIC_FLOOR page views in the week it is
 *     compared against there is no trend, and a site that has not reached the
 *     floor in either week is told its figures without being written to about
 *     them.
 *  2. A figure is told when the briefing goes; it is a REASON to write only
 *     when it is news: something to act on, or something that happened since
 *     the last briefing. The same post is not news seven mornings running.
 */

/** A week under this many page views is too small a base for a percentage. */
export const TRAFFIC_FLOOR = 100;

/** A trend below this (in percent) is a drop worth an action item. */
export const TRAFFIC_DROP_PERCENT = -20;

export interface TrafficReading {
  /** Page views, last 24 hours. */
  today: number;
  /** Page views, last 7 days. */
  week: number;
  /** Page views, the 7 days before that. */
  prevWeek: number;
}

export interface TrafficStatement {
  /** Percent against the week before; null when that week is under the floor. */
  trend: number | null;
  /** Whether the site has enough traffic for its figures to be a reason to write. */
  speaks: boolean;
  /** Whether the trend is a drop worth acting on. */
  down: boolean;
}

export function readTraffic({ week, prevWeek }: TrafficReading): TrafficStatement {
  const trend = prevWeek >= TRAFFIC_FLOOR
    ? Math.round(((week - prevWeek) / prevWeek) * 100)
    : null;
  return {
    trend,
    speaks: week >= TRAFFIC_FLOOR || prevWeek >= TRAFFIC_FLOOR,
    down: trend !== null && trend < TRAFFIC_DROP_PERCENT,
  };
}

/** `+12%`, `-34%`, or a dash when there is no trend to state. */
export function trendLabel(trend: number | null | undefined): string {
  if (trend === null || trend === undefined) return '—';
  return `${trend >= 0 ? '+' : ''}${trend}%`;
}

export type MorningReason =
  | 'action_items'
  | 'traffic'
  | 'new_leads'
  | 'post_published'
  | 'books'
  | 'operations';

export interface MorningFacts {
  /** Action items raised this morning (each one something a person can act on). */
  actionItems: number;
  /** Page views in the last 24 hours — counted only where analytics is on. */
  trafficToday: number;
  /** `readTraffic(...).speaks`. */
  trafficSpeaks: boolean;
  /** Leads captured in the last 24 hours. */
  leadsToday: number;
  /** Posts published since the last briefing (24 hours), not this week. */
  publishedSinceLastBriefing: number;
  booksFindings: number;
  opsFindings: number;
}

/**
 * Why this morning is worth writing about. Empty means the briefing writes its
 * row and sends nothing — no report version, no chat message, no mail.
 */
export function reasonsToWrite(f: MorningFacts): MorningReason[] {
  const reasons: MorningReason[] = [];
  if (f.actionItems > 0) reasons.push('action_items');
  if (f.trafficSpeaks && f.trafficToday > 0) reasons.push('traffic');
  if (f.leadsToday > 0) reasons.push('new_leads');
  if (f.publishedSinceLastBriefing > 0) reasons.push('post_published');
  if (f.booksFindings > 0) reasons.push('books');
  if (f.opsFindings > 0) reasons.push('operations');
  return reasons;
}
