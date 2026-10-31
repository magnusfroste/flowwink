/**
 * A visitor's form writes and does not read back. Anon may INSERT an
 * application, a booking, a form submission — never SELECT one — and
 * `.insert(…).select()` asks PostgREST for RETURNING, which needs SELECT:
 * "permission denied for table applications". The careers page failed every
 * candidate that way; no instance had ever received an application
 * (2026-10-31; SmartBookingBlock had the same bug earlier).
 *
 * Discover, don't enumerate: every public page and public block.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (!/^(__tests__|admin|account)$/.test(f)) walk(p, out);
    } else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}

describe('public forms do not read back what they insert', () => {
  it('no .insert(…).select() on a public surface', () => {
    const files = [...walk('src/components/public'), ...readdirSync('src/pages').filter((f) => /\.tsx$/.test(f)).map((f) => `src/pages/${f}`)];
    expect(files.length).toBeGreaterThan(50);
    const wrong: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8').replace(/\/\/[^\n]*/g, '');
      for (const m of src.matchAll(/\.insert\(/g)) {
        const chain = src.slice(m.index!, m.index! + 1500).split(/;\s*\n/)[0];
        if (/\)\s*\.select\(/.test(chain)) wrong.push(`${f}:${src.slice(0, m.index).split('\n').length}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
