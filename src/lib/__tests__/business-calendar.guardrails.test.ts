import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { businessPeriod, startOfBusinessDay, resolveHome } from '../../../supabase/functions/_shared/locale/home';
import { todayLine } from '../../../supabase/functions/_shared/locale/today-line';

/**
 * The business's calendar on the server and in SQL (2026-10-26, pass 1).
 * docs/architecture/locale-and-formatting.md §3b/§3c.
 */
describe('periods on the business\'s calendar', () => {
  // Monday 2026-10-26 00:30 in Stockholm (CET) = Sunday 23:30Z.
  const mondayNight = new Date('2026-10-25T23:30:00Z');
  it('"this week" on Monday 00:30 in Stockholm is THIS week, not last', () => {
    expect(businessPeriod('Europe/Stockholm', 'this_week', mondayNight)).toEqual({ start: '2026-10-26', end: '2026-11-01' });
    expect(businessPeriod('UTC', 'this_week', mondayNight)).toEqual({ start: '2026-10-19', end: '2026-10-25' });
  });
  it('months', () => {
    const firstOfNov = new Date('2026-10-31T23:30:00Z'); // 00:30 on 1 Nov in Stockholm
    expect(businessPeriod('Europe/Stockholm', 'this_month', firstOfNov)).toEqual({ start: '2026-11-01', end: '2026-11-30' });
    expect(businessPeriod('Europe/Stockholm', 'last_month', firstOfNov)).toEqual({ start: '2026-10-01', end: '2026-10-31' });
  });
  it('the business\'s midnight', () => {
    expect(startOfBusinessDay('Europe/Stockholm', new Date('2026-07-03T12:00:00Z')).toISOString()).toBe('2026-07-02T22:00:00.000Z');
  });
  it('a model is told the business\'s date and zone', () => {
    const line = todayLine(resolveHome({ platform_locale: { default_timezone: 'Europe/Stockholm' } }), new Date('2026-10-31T23:30:00Z'));
    expect(line).toMatch(/2026-11-01/);
    expect(line).toMatch(/Europe\/Stockholm/);
  });
});

describe('SQL: today is the business\'s', () => {
  const dir = join(process.cwd(), 'supabase/migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const read = (f: string) => readFileSync(join(dir, f), 'utf8');
  it('SLA business hours read the business\'s zone', () => {
    const last = files.filter((f) => read(f).includes('FUNCTION public.business_minutes_add(')).pop()!;
    const sql = read(last);
    expect(sql).toMatch(/v_tz text := public\.business_timezone\(\)/);
    expect(sql).toMatch(/AT TIME ZONE v_tz/);
  });
  it('no migration after the calendar one uses CURRENT_DATE or now()::date', () => {
    const FLOOR = '20261026020000';
    const offenders = files
      .filter((f) => f.slice(0, 14) > FLOOR)
      .filter((f) => /\bCURRENT_DATE\b|now\(\)::date/i.test(read(f).replace(/--[^\n]*/g, '')));
    expect(offenders, 'use public.platform_today()').toEqual([]);
  });
});

describe('edge: no new UTC "today" where a business date is meant', () => {
  const root = join(process.cwd(), 'supabase/functions');
  const hits: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, n.name);
      if (n.isDirectory()) { walk(p); continue; }
      if (!p.endsWith('.ts') || /test/.test(p)) continue;
      readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
        if (/setHours\(0, ?0, ?0, ?0\)|setUTCHours\(0, ?0, ?0, ?0\)|new Date\(\)\.getFullYear\(\)/.test(l) && !/^\s*(\/\/|\*)/.test(l)) hits.push(`${p.slice(root.length + 1)}:${i + 1}`);
      });
    }
  };
  walk(root);
  // Zero today; a new one is a business date on the UTC clock.
  const CEILING = 0;
  it(`at most ${CEILING}`, () => {
    expect(hits.length, hits.join('\n')).toBeLessThanOrEqual(CEILING);
  });
});
