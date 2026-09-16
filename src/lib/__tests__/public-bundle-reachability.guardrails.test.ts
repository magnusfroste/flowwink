import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';

/**
 * What a visitor's phone must parse before the page can draw.
 *
 * Three leaks into the public first chunk had the SAME shape: a public file
 * imported one small thing through an index, and the index dragged in something
 * huge (optic's landing page, 2026-09-16):
 *
 *   five blocks  -> `icons` from lucide-react        -> 1 541 icons   (#528)
 *   renderToHtml -> @tiptap/react                    -> the editor    (#529)
 *   app shell    -> locale-packs index -> se pack    -> BAS 2024 chart of accounts
 *
 * Checking the three files that bit us would guard exactly those three. This
 * walks the STATIC import graph from the app root instead — dynamic `import()`
 * and `lazy(() => import(...))` are the escape hatches and are not followed —
 * and fails on anything forbidden that is reachable, printing the chain that
 * reaches it. The next barrel leak fails here without anyone adding a line.
 */

const SRC = resolve(__dirname, '../..');
const ROOTS = ['App.tsx'];
const EXTS = ['', '.ts', '.tsx', '.js', '/index.ts', '/index.tsx'];

type Edge = { spec: string; clause: string };

function strip(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Static, value-bearing imports and re-exports. Type-only ones are erased. */
function staticEdges(code: string): Edge[] {
  const out: Edge[] = [];
  const re = /(?:^|\n|;)\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    if (m[2]) continue; // import type / export type
    out.push({ spec: m[4], clause: m[3] });
  }
  const bare = /(?:^|\n|;)\s*import\s*['"]([^'"]+)['"]/g;
  while ((m = bare.exec(code))) out.push({ spec: m[1], clause: '' });
  return out;
}

function resolveLocal(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const e of EXTS) {
    const p = base + e;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

interface Graph { files: Map<string, string[]>; packages: Map<string, { file: string; clause: string }[]> }

function walk(): Graph {
  const files = new Map<string, string[]>();      // reachable file -> chain from root
  const packages = new Map<string, { file: string; clause: string }[]>();
  const queue: Array<{ file: string; chain: string[] }> = ROOTS.map((r) => ({ file: join(SRC, r), chain: [r] }));
  while (queue.length) {
    const { file, chain } = queue.shift()!;
    if (files.has(file)) continue;
    files.set(file, chain);
    const code = strip(readFileSync(file, 'utf8'));
    for (const { spec, clause } of staticEdges(code)) {
      const local = resolveLocal(file, spec);
      if (local) {
        if (!files.has(local)) queue.push({ file: local, chain: [...chain, relative(SRC, local)] });
      } else if (!spec.startsWith('.') && !spec.startsWith('@/')) {
        const list = packages.get(spec) ?? [];
        list.push({ file: relative(SRC, file), clause });
        packages.set(spec, list);
      }
    }
  }
  return { files, packages };
}

describe('the public first chunk', () => {
  const g = walk();
  const chainTo = (abs: string) => (g.files.get(abs) ?? []).join('\n    -> ');

  it('the walker actually reaches the public page and its blocks', () => {
    const reached = [...g.files.keys()].map((f) => relative(SRC, f));
    expect(reached).toContain('pages/PublicPage.tsx');
    expect(reached.some((f) => f.startsWith('components/public/blocks/'))).toBe(true);
    expect(reached.length).toBeGreaterThan(100);
  });

  it('reaches nothing under src/data (charts of accounts, templates, seed data)', () => {
    const leaked = [...g.files.keys()].filter((f) => relative(SRC, f).startsWith('data/'));
    const report = leaked.map((f) => `  ${relative(SRC, f)}\n    via ${chainTo(f)}`).join('\n');
    expect(leaked, `data reachable from the app root:\n${report}`).toEqual([]);
  });

  it('reaches no @tiptap package (the editor)', () => {
    const hits = [...g.packages.entries()].filter(([pkg]) => pkg.startsWith('@tiptap/'));
    const report = hits.flatMap(([pkg, users]) => users.map((u) => `  ${pkg} in ${u.file}`)).join('\n');
    expect(hits, `editor reachable from the app root:\n${report}`).toEqual([]);
  });

  it('reaches no import of the whole lucide icon set', () => {
    const users = g.packages.get('lucide-react') ?? [];
    const whole = users.filter((u) => /\bicons\b/.test(u.clause) || /\*\s+as\s+\w+/.test(u.clause));
    const report = whole.map((u) => `  ${u.file}: import ${u.clause}`).join('\n');
    expect(whole, `whole icon set reachable from the app root:\n${report}`).toEqual([]);
  });
});
