import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appendSent, DAILY_CAP, feedbackKey, judgeFeedback, type SentFeedback } from '../../../supabase/functions/_shared/feedback/feedback-cadence';

/**
 * Guardrail: every operator reports what works badly upstream — once.
 *
 * Magnus 2026-10-31: FlowPilot and external agents run the platform as well as
 * the business, and submit_feedback to www.flowwink.com is the loop that makes
 * a defect seen on one instance fixed on all of them. A person reads that
 * board; an hourly heartbeat on eight instances must not file the same broken
 * job every hour.
 */
const now = new Date('2026-10-31T12:00:00Z');
const at = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();

describe('submit_feedback cadence', () => {
  it('the same report is the same key, however it is punctuated', () => {
    expect(feedbackKey("Cron job 'weekly-river' never runs!")).toBe(feedbackKey('cron job weekly river never runs'));
  });

  it('refuses a repeat for 14 days and names the earlier post', () => {
    const log: SentFeedback[] = [{ key: feedbackKey('X fails'), title: 'X fails', at: at(24 * 3), post_id: 'p1' }];
    const r = judgeFeedback(log, { title: 'x fails.', unattended: false, now });
    expect(r).toMatchObject({ status: 'refused', code: 'ALREADY_REPORTED', retryable: false });
    expect(r!.hint).toMatch(/post p1/);
    expect(judgeFeedback([{ ...log[0], at: at(24 * 15) }], { title: 'X fails', unattended: false, now })).toBeNull();
  });

  it('caps an unattended agent at the daily share, never a person', () => {
    const log = Array.from({ length: DAILY_CAP }, (_, i) => ({ key: `k${i}`, title: `t${i}`, at: at(i + 1), unattended: true }));
    expect(judgeFeedback(log, { title: 'something new', unattended: true, now })?.code).toBe('FEEDBACK_DAILY_CAP');
    expect(judgeFeedback(log, { title: 'something new', unattended: false, now })).toBeNull();
    expect(appendSent(Array.from({ length: 120 }, (_, i) => ({ key: `${i}`, title: `${i}`, at: at(i) })), { key: 'n', title: 'n', at: at(0) })).toHaveLength(100);
  });

  it('submit_feedback judges before it sends, and attended is stamped by the server', () => {
    const exec = readFileSync(join(__dirname, '../../../supabase/functions/_shared/execute/core.ts'), 'utf8');
    expect(exec).toMatch(/const refused = judgeFeedback\(sentLog, \{ title, unattended \}\);\s*if \(refused\) return refused;/);
    expect(exec).toMatch(/\(args as Record<string, unknown>\)\._attended = Boolean\(attendedUserId\);/);
  });
});

describe('the receiving board groups a fleet defect', () => {
  it('the same defect from several instances is one cluster, widest first', async () => {
    const { clusterReports } = await import('../../../supabase/functions/_shared/feedback/feedback-clusters');
    const post = (id: string, title: string, site: string, sha: string, at: string) =>
      ({ id, title, board: 'bug', status: 'open', origin_site_url: site, origin: { skills_sha: sha }, created_at: at });
    const clusters = clusterReports([
      post('1', 'Weekly river never runs', 'https://a', 'aaa', '2026-10-30T10:00:00Z'),
      post('2', 'weekly river never runs!', 'https://b', 'bbb', '2026-10-31T10:00:00Z'),
      post('3', 'Something else', 'https://a', 'aaa', '2026-10-31T11:00:00Z'),
    ]);
    expect(clusters[0]).toMatchObject({ posts: 2, instances: ['https://a', 'https://b'], versions: ['aaa', 'bbb'], post_ids: ['1', '2'] });
    expect(clusters).toHaveLength(2);
  });
});
