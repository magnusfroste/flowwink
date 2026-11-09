import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The generated docs say what the code says (2026-11-09).
 *
 * Two generators scrape source with regexes, and both had drifted into wrong
 * output nobody read: generate-module-docs cut a skill description at its first
 * escaped apostrophe ("pass the identity\") and described translate_content by
 * its first PARAMETER; generate-edge-function-docs took any comment in a file's
 * first 80 lines as its purpose, so generate-invoice-pdf was "WinAnsi, which
 * has no U+202F…" and create-checkout ended in a stray comment terminator.
 *
 * This reads the SHAPE of those failures in the committed output, so a
 * regeneration that reintroduces one is red — whichever generator does it.
 */
const root = join(__dirname, '../../..');
const moduleDocs = readdirSync(join(root, 'docs/modules')).filter((f) => f.endsWith('.md'));
const read = (rel: string) => readFileSync(join(root, rel), 'utf-8');

describe('generated docs read right', () => {
  it('no skill row is cut at an escape or carries one', () => {
    const bad: string[] = [];
    for (const f of moduleDocs) {
      for (const line of read(`docs/modules/${f}`).split('\n')) {
        if (!/^\| `[a-z0-9_]+` \| (internal|external|both) \|/.test(line)) continue;
        if (/\\ \|$/.test(line) || /\\['"`]/.test(line)) bad.push(`${f}: ${line.slice(0, 90)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('a skill is described by its own description, not a parameter\'s', () => {
    // translate_content declares tool_definition before description in no seed
    // today, but its first parameter description starts "What to translate".
    expect(read('docs/modules/blog.md')).not.toMatch(/`translate_content` \| \w+ \| What to translate/);
    expect(read('scripts/generate-module-docs.ts')).toMatch(/topLevelDescriptionAt\(obj\)/);
  });

  it('every edge function has a purpose, and none is a stray implementation note', () => {
    const rows = read('docs/reference/edge-functions.md').split('\n').filter((l) => /^\| `[a-z0-9-]+` \|/.test(l));
    expect(rows.length).toBeGreaterThan(60);
    const bad = rows.filter((l) => {
      const purpose = l.split('|').slice(4, -1).join('|').trim();
      return !purpose || /\*\/$/.test(purpose) || /^(RPC|WinAnsi|Input:)\b/.test(purpose);
    });
    expect(bad).toEqual([]);
  });

  it('the purpose comes from the header: comments below the first statement are not read', () => {
    const gen = read('scripts/generate-edge-function-docs.ts');
    expect(gen).toMatch(/const lines = all\.slice\(0, end\);/);
  });
});
