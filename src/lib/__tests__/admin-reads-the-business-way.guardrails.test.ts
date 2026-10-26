import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Admin DISPLAY goes through the business's formatter (usePlatformFormat /
 * liveFormat): its locale, its clock, its currency. Pass 1 (2026-10-26) moved
 * ~150 sites — date-fns format(new Date(x), 'yyyy-MM-dd'), toLocale*() with
 * 'en-US' / 'sv-SE' / the browser's locale, (cents / 100).toFixed(…) + 'SEK'.
 *
 * Discover, don't enumerate: every admin file is scanned for those SHAPES and
 * the count may only shrink. What is left is deliberate — CSV and file-format
 * exports (machines read "1234.50"), input values, developer-only pages.
 */
const ROOTS = ['src/components/admin', 'src/pages/admin', 'src/hooks', 'src/lib'];
const SHAPES: Array<[string, RegExp]> = [
  ['date-fns format(new Date(x), …)', /\bformat\(new Date\([^)]*\), '[^']*'\)/g],
  ['toLocale*() with a fixed or browser locale', /\.toLocale(Date|Time)?String\(\s*(\)|'[a-z]{2}(-[A-Z]{2})?'|undefined|\[\])/g],
  ['money by hand', /\([a-zA-Z_.?]*(cents|Cents)[a-zA-Z_.?]* \/ 100\)\.toFixed\(/g],
];

function scan(): Record<string, string[]> {
  const out: Record<string, string[]> = Object.fromEntries(SHAPES.map(([k]) => [k, []]));
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (!/__tests__|locale-packs/.test(p)) walk(p); continue; }
      if (!/\.tsx?$/.test(p) || /\.test\./.test(p)) continue;
      const src = readFileSync(p, 'utf8');
      for (const [k, re] of SHAPES) {
        for (const m of src.matchAll(re)) out[k].push(`${p.slice(process.cwd().length + 1)}: ${m[0]}`);
      }
    }
  };
  for (const r of ROOTS) walk(join(process.cwd(), r));
  return out;
}

describe('admin reads amounts and dates the business\'s way', () => {
  const found = scan();
  // Ceilings as of 2026-10-26 — lower them when you remove one, never raise.
  const CEILING: Record<string, number> = {
    'date-fns format(new Date(x), …)': 13,
    'toLocale*() with a fixed or browser locale': 9,
    'money by hand': 7,
  };
  for (const [k] of SHAPES) {
    it(`${k}: at most ${CEILING[k]}`, () => {
      expect(found[k].length, found[k].join('\n')).toBeLessThanOrEqual(CEILING[k]);
    });
  }
});
