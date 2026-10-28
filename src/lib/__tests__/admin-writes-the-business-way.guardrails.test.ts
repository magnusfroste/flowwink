import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { wallClockToInstant, instantToWallClock } from '../../../supabase/functions/_shared/locale/home';
import { parseAmountToCents } from '../../../supabase/functions/_shared/reconciliation/bank-csv';

/**
 * Pass 1 over the admin (2026-10-26): places that WROTE wrong data — the
 * business's clock, its currency, its amounts.
 * docs/architecture/locale-and-formatting.md §3c.
 */
describe('datetime-local is the business\'s wall clock', () => {
  it('10:00 in Stockholm (summer) is 08:00Z, and back', () => {
    expect(wallClockToInstant('2026-07-03T10:00', 'Europe/Stockholm')).toBe('2026-07-03T08:00:00.000Z');
    expect(instantToWallClock('2026-07-03T08:00:00Z', 'Europe/Stockholm')).toBe('2026-07-03T10:00');
  });
  it('winter is +01:00, and New York is behind', () => {
    expect(wallClockToInstant('2026-01-15T10:00', 'Europe/Stockholm')).toBe('2026-01-15T09:00:00.000Z');
    expect(wallClockToInstant('2026-01-15T10:00', 'America/New_York')).toBe('2026-01-15T15:00:00.000Z');
  });
  it('empty stays empty', () => {
    expect(wallClockToInstant('', 'Europe/Stockholm')).toBeNull();
    expect(instantToWallClock(null, 'Europe/Stockholm')).toBe('');
  });
});

describe('CSV amounts are read the way people write them', () => {
  it('1 234,50 / 1.234,50 / 1500 / 1234.5', () => {
    expect(parseAmountToCents('1 234,50')).toBe(123450);
    expect(parseAmountToCents('1.234,50')).toBe(123450);
    expect(parseAmountToCents('1500')).toBe(150000);
    expect(parseAmountToCents('1234.5')).toBe(123450);
  });
});

/**
 * Discover, don't enumerate: no admin file may write the UTC day as a
 * document's date, or default a currency to a literal.
 */
const ROOTS = ['src/components/admin', 'src/pages/admin', 'src/hooks', 'src/lib/modules'];
function files(): Array<{ f: string; src: string }> {
  const out: Array<{ f: string; src: string }> = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (!/__tests__/.test(p)) walk(p); continue; }
      if (/\.tsx?$/.test(p) && !/\.test\./.test(p)) out.push({ f: p.slice(process.cwd().length + 1), src: readFileSync(p, 'utf8') });
    }
  };
  for (const r of ROOTS) walk(join(process.cwd(), r));
  return out;
}

describe('admin writes the business\'s day and currency', () => {
  const all = files();
  it('no UTC "today" (new Date().toISOString().slice(0, 10))', () => {
    const SHAPE = /new Date\(\)\.toISOString\(\)\.(slice\(0, ?10\)|split\('T'\)\[0\])/;
    expect(all.filter(({ src }) => SHAPE.test(src)).map(({ f }) => f)).toEqual([]);
  });
  it('no currency state or default initialised to a literal SEK/EUR', () => {
    const SHAPE = /useState\(\s*['"](SEK|EUR|USD)['"]\s*\)|currency:\s*['"](EUR|USD)['"]/;
    // ModuleDetailSheet holds API EXAMPLES in template strings, not defaults.
    const EXAMPLES = new Set(['src/components/admin/modules/ModuleDetailSheet.tsx']);
    expect(all.filter(({ f, src }) => !EXAMPLES.has(f) && SHAPE.test(src)).map(({ f }) => f)).toEqual([]);
  });
  it('no hard-coded (SEK)/(kr) in a label', () => {
    const SHAPE = /<Label[^>]*>[^<]*\((SEK|kr)[,)/ ]/;
    expect(all.filter(({ src }) => SHAPE.test(src)).map(({ f }) => f)).toEqual([]);
  });
});
