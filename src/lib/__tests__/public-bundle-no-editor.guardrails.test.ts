import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

const SRC = resolve(__dirname, '../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'node_modules' || name === '__tests__') continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
  }
  return out;
}

/**
 * The rich-text editor must not reach the public page.
 *
 * `renderToHtml` imported @tiptap's generateHTML, so the whole editor --
 * @tiptap/core and ProseMirror state, view, transform, model -- rode along into
 * every page with a text block. A visitor's phone parsed an editor it would
 * never open before it could draw a paragraph (optic, 2026-09-16). Rendering
 * stored content is now a pure serializer, proven identical by
 * tiptap-render-equivalence.test.ts.
 *
 * This guard SCANS: any file outside the admin tree that imports @tiptap fails,
 * not a list of the ones that did. Admin is lazy-loaded and keeps the editor.
 */
describe('public code does not import the editor', () => {
  const importsEditor = (f: string) =>
    /from\s*['"]@tiptap\//.test(readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''));

  const publicFiles = walk(SRC).filter((f) => {
    const r = relative(SRC, f);
    return !r.startsWith('components/admin') && !r.startsWith('pages/admin');
  });

  it('scans real public code', () => {
    expect(publicFiles.some((f) => f.includes('components/public/blocks/TextBlock'))).toBe(true);
  });

  it('no file outside admin imports @tiptap', () => {
    const offenders = publicFiles.filter(importsEditor).map((f) => relative(SRC, f));
    expect(offenders, 'rendering needs a serializer, not the editor -- use renderToHtml from @/lib/tiptap-utils').toEqual([]);
  });
});
