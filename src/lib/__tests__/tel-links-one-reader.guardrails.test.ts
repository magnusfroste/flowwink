import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { telHref } from '@/lib/tel-href';

/**
 * A tel: link is the number a phone DIALS, not the number as written.
 * MJP's footer wrote "+46 (0) 10 165 10 00" and linked tel:+460101651000 —
 * a number that does not exist. The fix is one reader (telHref); the guard
 * scans every source file for a hand-built `tel:${…}` so the next one does
 * not grow beside it (discover, don't enumerate).
 */
describe('telHref', () => {
  it.each([
    ['+46 (0) 10 165 10 00', 'tel:+46101651000'],
    ['+44 (0)20 7946 0958', 'tel:+442079460958'],
    ['0046 10 165 10 00', 'tel:+46101651000'],
    ['010-165 10 00', 'tel:0101651000'],
    ['+1 (555) 010-0199', 'tel:+15550100199'],
    ['', ''],
    [null, ''],
  ])('%s → %s', (input, expected) => {
    expect(telHref(input)).toBe(expected);
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

describe('tel links have one reader', () => {
  it('no file builds a tel: link by hand', () => {
    const offenders = walk(join(process.cwd(), 'src'))
      .filter((f) => !f.endsWith('tel-href.ts'))
      .filter((f) => /tel:\$\{/.test(readFileSync(f, 'utf8')));
    expect(offenders, 'build tel: links with telHref() from @/lib/tel-href').toEqual([]);
  });
});
