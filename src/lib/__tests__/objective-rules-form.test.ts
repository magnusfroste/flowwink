import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readObjectiveRules, writeObjectiveRules, criteriaToRows, rowsToCriteria } from '@/lib/objective-rules';

describe('an objective\'s rules as a form', () => {
  it('reads the keys the platform enforces and keeps the rest untouched', () => {
    const c = { cadence: { max: 1, per: 'week', every: 2, counts: 'write_blog_post' }, requires_business_identity: true, priority: 'high', deadline: '2026-12-31', newsletter_flow: 'welcome' };
    const r = readObjectiveRules(c);
    expect(r.cadence).toEqual({ max: 1, per: 'week', every: 2, counts: 'write_blog_post' });
    expect(r.requiresIdentity).toBe(true);
    expect(r.rest).toEqual({ newsletter_flow: 'welcome' });
    expect(writeObjectiveRules(r)).toEqual(c);
  });
  it('writes only what is set; every 1 is the default and not stored', () => {
    const r = readObjectiveRules({});
    expect(writeObjectiveRules(r)).toEqual({});
    expect(writeObjectiveRules({ ...r, cadence: { max: 2, per: 'day', every: 1, counts: ' write_blog_post ' } }))
      .toEqual({ cadence: { max: 2, per: 'day', counts: 'write_blog_post' } });
    // A rhythm without a counted skill is no rhythm (partitionByCadence fails open on it).
    expect(writeObjectiveRules({ ...r, cadence: { max: 1, per: 'day', every: 1, counts: '' } })).toEqual({});
  });
  it('a malformed cadence is read as a sane one', () => {
    expect(readObjectiveRules({ cadence: { max: 'x', per: 'month', counts: 5 } }).cadence).toEqual({ max: 1, per: 'day', every: 1, counts: '' });
  });
  it('success criteria round-trip through rows, numbers stay numbers', () => {
    const crit = { posts_published: 3, channel: 'blog', done: true, extra: { a: 1 } };
    expect(rowsToCriteria(criteriaToRows(crit))).toEqual(crit);
    expect(rowsToCriteria([{ name: ' ', value: '1' }, { name: 'x', value: '' }])).toEqual({});
  });
  it('the sheet no longer offers example keys nothing reads', () => {
    const src = readFileSync('src/components/admin/skills/ObjectivesPanel.tsx', 'utf8');
    for (const k of ['max_posts_per_day', 'token_budget', 'excluded_skills']) expect(src).not.toContain(k);
    expect(src).toContain('writeObjectiveRules(');
  });
});
