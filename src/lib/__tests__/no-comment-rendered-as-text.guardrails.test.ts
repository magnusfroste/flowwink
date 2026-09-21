import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

/**
 * A comment between JSX tags is not a comment — it is text, and React paints it.
 *
 * #350 (2026-08-30) wrote an explanation as `/* … *\/` straight between two JSX
 * elements in three dialogs. It type-checked, it linted, it built — and every
 * visitor session opened in the AI chat showed a paragraph about Radix scroll
 * viewports above the transcript (Magnus, 2026-09-21). The same text reached the
 * A2A test chat and the template import dialog.
 *
 * The guard does not list those three files. It parses EVERY .tsx under src/
 * with the TypeScript compiler and fails on any JSX text node shaped like a
 * comment — a block-comment opener or closer, or a line that starts with `// `.
 * A real comment in JSX is `{/* … *\/}`, which is not a text node and passes.
 */

const root = join(__dirname, '../../..');

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') tsxFiles(path, out);
    } else if (entry.name.endsWith('.tsx')) {
      out.push(path);
    }
  }
  return out;
}

const COMMENT_SHAPED = /\/\*|\*\/|^\s*\/\/\s/m;

function commentsRenderedAsText(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (node.kind === ts.SyntaxKind.JsxText) {
      const raw = node.getText(sf);
      if (COMMENT_SHAPED.test(raw)) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        found.push(`${relative(root, file)}:${line}: ${raw.trim().slice(0, 70).replace(/\s+/g, ' ')}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

describe('no comment is rendered as text', () => {
  const files = tsxFiles(join(root, 'src'));

  it('scans the whole tree, not a list', () => {
    // A guard that silently scans nothing is the one that lets the next one through.
    expect(files.length).toBeGreaterThan(500);
  });

  it('every comment between JSX tags is wrapped in braces', () => {
    const offenders = files.flatMap(commentsRenderedAsText);
    expect(offenders, 'A comment between JSX tags renders as text — write it as {/* … */}').toEqual([]);
  });

  it('the scanner catches the shape it exists for', () => {
    // Negative test: prove the detector fires on the exact bug, so a green run means something.
    const probe = join(root, 'src/lib/__tests__/fixtures/__probe-comment-as-text.tsx');
    const source = 'export const X = () => (\n  <div>\n    /* this would be painted */\n    <span />\n  </div>\n);\n';
    const sf = ts.createSourceFile(probe, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let hit = false;
    const visit = (n: ts.Node) => {
      if (n.kind === ts.SyntaxKind.JsxText && COMMENT_SHAPED.test(n.getText(sf))) hit = true;
      ts.forEachChild(n, visit);
    };
    visit(sf);
    expect(hit).toBe(true);

    const wrapped = source.replace('/* this would be painted */', '{/* this is a comment */}');
    const sf2 = ts.createSourceFile(probe, wrapped, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let hit2 = false;
    const visit2 = (n: ts.Node) => {
      if (n.kind === ts.SyntaxKind.JsxText && COMMENT_SHAPED.test(n.getText(sf2))) hit2 = true;
      ts.forEachChild(n, visit2);
    };
    visit2(sf2);
    expect(hit2).toBe(false);
  });
});
