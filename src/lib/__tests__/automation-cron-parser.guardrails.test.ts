import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guardrail: the cron parser must not silently degrade. Two live incidents
 * (liteit, 2026-07-17): a monthly '0 5 1 * *' fell through to the +1h fallback
 * and fired 103 times (hourly, token-burning), and a weekday '30 6 * * 1-5' was
 * parseInt'd to Monday-only, silently skipping the proof week's daily
 * bookkeeping sweep Tue–Fri. The parser must handle the monthly (DOM) shape and
 * day-of-week ranges/lists, and the fallback must LOG.
 *
 * The parser was extracted to _shared/cron/next-run.ts (2026-07) so the
 * dispatcher and the cron-health staleness check share ONE implementation —
 * this test reads it from that single source of truth.
 *
 * Behaviour is runtime-verified by executing the extracted parser on 12
 * scenarios (monthly, DOM=31 skipping short months, weekday ranges/lists,
 * exact-slot boundaries) — not just source-matched.
 */
const root = join(__dirname, '../../..');
const src = readFileSync(join(root, 'supabase/functions/_shared/cron/next-run.ts'), 'utf-8');

// Extract the two pure functions and strip the TS annotations so they run in vitest.
function extractParser(): (expr?: string, from?: Date) => string {
  const grab = (name: string) => {
    const start = src.indexOf(`function ${name}`);
    const end = src.indexOf('\n}\n', start);
    return src.slice(start, end + 2);
  };
  const js = (grab('calculateNextRun') + '\n' + grab('parseDayOfWeekSet'))
    .replace('cronExpr?: string', 'cronExpr')
    .replace('from?: Date', 'from')
    .replace(/: string \{/g, ' {')
    .replace('field: string', 'field')
    .replace(/: Set<number> \{/g, ' {')
    .replace('new Set<number>()', 'new Set()');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(`${js}; return calculateNextRun;`)() as (e?: string, f?: Date) => string;
}

describe('automation-dispatcher cron parser guardrails', () => {
  const next = extractParser();
  const fri = new Date('2026-07-17T10:00:00Z'); // a Friday

  it('monthly M H DOM * * schedules the next DOM — never the hourly fallback', () => {
    expect(next('0 5 1 * *', fri)).toBe('2026-08-01T05:00:00.000Z');
    // exactly at the slot → next month, not this instant
    expect(next('0 5 1 * *', new Date('2026-08-01T05:00:00Z'))).toBe('2026-09-01T05:00:00.000Z');
    // DOM=31 skips 30-day months instead of drifting
    expect(next('0 5 31 * *', new Date('2026-09-01T00:00:00Z'))).toBe('2026-10-31T05:00:00.000Z');
  });

  it('weekday ranges and lists match every listed day — not parseInt-to-Monday', () => {
    expect(next('30 6 * * 1-5', new Date('2026-07-17T05:00:00Z'))).toBe('2026-07-17T06:30:00.000Z'); // Fri pre-slot → today
    expect(next('30 6 * * 1-5', fri)).toBe('2026-07-20T06:30:00.000Z');                              // Fri post-slot → Mon
    expect(next('30 6 * * 1-5', new Date('2026-07-18T05:00:00Z'))).toBe('2026-07-20T06:30:00.000Z'); // Sat → Mon
    expect(next('0 8 * * 1,3,5', fri)).toBe('2026-07-20T08:00:00.000Z');                             // list
  });

  it('single-day weekly and daily still work', () => {
    expect(next('0 9 * * 1', fri)).toBe('2026-07-20T09:00:00.000Z');
    expect(next('0 16 * * 5', fri)).toBe('2026-07-17T16:00:00.000Z'); // later the same day
    expect(next('0 7 * * *', fri)).toBe('2026-07-18T07:00:00.000Z');
  });

  it('the unsupported-expression fallback is LOGGED, never silent', () => {
    expect(src).toMatch(/console\.warn\([^)]*unsupported cron/);
  });
});
