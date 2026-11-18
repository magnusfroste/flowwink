/**
 * The Daily Briefing writes when the morning has news (2026-11-18).
 *
 * Optic was mailed every morning from 11-14 to 11-18, yellow at 50/100, with
 * one action item: "Traffic down 60% vs last week — consider new content" —
 * on 19 page views against about 47. Without that item the mail would have
 * gone anyway: one page view in 24 hours was a reason to write, and so was a
 * blog post for the seven mornings after it was published.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  readTraffic,
  reasonsToWrite,
  trendLabel,
  TRAFFIC_DROP_PERCENT,
  TRAFFIC_FLOOR,
  type MorningFacts,
} from '../../../supabase/functions/_shared/briefing/morning-news';

const briefing = readFileSync('supabase/functions/flowpilot-lifecycle/briefing.ts', 'utf8');
/** The source without comments: a rule quoted in a comment is not the rule. */
const code = briefing.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const quiet: MorningFacts = {
  actionItems: 0, trafficToday: 0, trafficSpeaks: false, leadsToday: 0,
  publishedSinceLastBriefing: 0, booksFindings: 0, opsFindings: 0,
};

describe('traffic has a floor', () => {
  it('a small week is not compared in percent — optic, 2026-11-18', () => {
    const t = readTraffic({ today: 1, week: 19, prevWeek: 47 });
    expect(t).toEqual({ trend: null, speaks: false, down: false });
  });

  it('the floor is the base week: the week the percentage is counted on', () => {
    expect(readTraffic({ today: 0, week: 10, prevWeek: TRAFFIC_FLOOR - 1 }).trend).toBeNull();
    expect(readTraffic({ today: 0, week: 10, prevWeek: TRAFFIC_FLOOR }).trend).toBe(-90);
  });

  it('a real drop on a real base is still a drop', () => {
    const t = readTraffic({ today: 40, week: 300, prevWeek: 500 });
    expect(t).toEqual({ trend: -40, speaks: true, down: true });
    expect(readTraffic({ today: 40, week: 420, prevWeek: 500 }).down).toBe(false); // -16 %
    expect(TRAFFIC_DROP_PERCENT).toBe(-20);
  });

  it('a first week of traffic has no trend, and is not "+100%"', () => {
    expect(readTraffic({ today: 3, week: 12, prevWeek: 0 })).toEqual({ trend: null, speaks: false, down: false });
    // Growth past the floor speaks, though there is still nothing to compare with.
    expect(readTraffic({ today: 30, week: 240, prevWeek: 20 })).toEqual({ trend: null, speaks: true, down: false });
  });

  it('no trend is a dash, never "0%" or "null%"', () => {
    expect(trendLabel(null)).toBe('—');
    expect(trendLabel(undefined)).toBe('—');
    expect(trendLabel(12)).toBe('+12%');
    expect(trendLabel(-34)).toBe('-34%');
    expect(trendLabel(0)).toBe('+0%');
  });
});

describe('a figure is a reason to write only when it is news', () => {
  it('optic on an ordinary morning: one page view, a post from last week — nothing is sent', () => {
    expect(reasonsToWrite({ ...quiet, trafficToday: 1 })).toEqual([]);
  });

  it('the morning after a post is published is told once', () => {
    expect(reasonsToWrite({ ...quiet, trafficToday: 1, publishedSinceLastBriefing: 1 })).toEqual(['post_published']);
  });

  it('a site with traffic is told its day', () => {
    expect(reasonsToWrite({ ...quiet, trafficToday: 35, trafficSpeaks: true })).toEqual(['traffic']);
    expect(reasonsToWrite({ ...quiet, trafficToday: 0, trafficSpeaks: true })).toEqual([]);
  });

  it('what a person can act on always is', () => {
    expect(reasonsToWrite({ ...quiet, actionItems: 2 })).toEqual(['action_items']);
    expect(reasonsToWrite({ ...quiet, leadsToday: 1 })).toEqual(['new_leads']);
    expect(reasonsToWrite({ ...quiet, booksFindings: 1, opsFindings: 3 })).toEqual(['books', 'operations']);
  });
});

describe('the briefing applies the rules', () => {
  it('reads the trend through the floor and nowhere else', () => {
    expect(code).toMatch(/const traffic = readTraffic\(\{ today: trafficToday, week: trafficWeek, prevWeek: trafficPrevWeek \}\);/);
    expect(code).toMatch(/const trafficTrend = traffic\.trend;/);
    // No second threshold: the drop is asked of the rule, never re-derived.
    expect(code).not.toMatch(/trafficTrend\s*<\s*-?\d/);
    expect(code).not.toMatch(/trafficPrevWeek > 0/);
  });

  it('raises the action item and takes the health points only for a real drop', () => {
    expect(code).toMatch(/if \(on\("analytics"\) && traffic\.down && trafficTrend !== null\) \{/);
    expect(code).toMatch(/if \(traffic\.down\) healthScore -= 10;/);
    expect(code).toMatch(/if \(trafficTrend !== null && trafficTrend > 0\) healthScore \+= 5;/);
  });

  it('decides whether to send from the reasons, not from having a figure', () => {
    expect(code).toMatch(/const worthTelling = reasons\.length > 0;/);
    expect(code).not.toMatch(/const worthTelling = [^;]*summaryParts/);
    const facts = code.slice(code.indexOf('const reasons = reasonsToWrite({'), code.indexOf('const worthTelling ='));
    expect(facts).toMatch(/trafficToday: on\("analytics"\) \? trafficToday : 0,/);
    expect(facts).toMatch(/leadsToday: on\("leads"\) \? newLeadsToday : 0,/);
    expect(facts).toMatch(/publishedSinceLastBriefing: on\("blog"\) \? publishedSinceLastBriefing : 0,/);
  });

  it('counts a post as news for the 24 hours after it was published', () => {
    expect(code).toMatch(/\.select\("id, title, published_at", \{ count: "exact" \}\)/);
    expect(code).toMatch(/p\.published_at && new Date\(p\.published_at\) >= yesterday/);
    // "Yesterday" is 24 hours back from the run, and the briefing runs once a day.
    expect(code).toMatch(/yesterday\.setDate\(yesterday\.getDate\(\) - 1\);/);
  });

  it('writes down why it wrote', () => {
    const insert = code.slice(code.indexOf('.from("flowpilot_briefings")\n      .insert({'));
    expect(insert.slice(0, 400)).toMatch(/metrics: \{ \.\.\.metrics, reasons \},/);
  });

  it('never prints a trend it does not have', () => {
    expect(code).not.toMatch(/\$\{trafficTrend\}%/);
    expect(code).toMatch(/trafficTrend === null \? "" : ` \(\$\{trendLabel\(trafficTrend\)\} vs last week\)`/);
    expect(code).toMatch(/val === null \?/);
  });
});
