import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * No button inside a button, on any visitor surface.
 *
 * /chat's conversation rows were a <button> that contained a <Button> (delete).
 * Invalid HTML, and the title span had no min-w-0, so a long title pushed the
 * delete past the aside's edge where the scroll area clipped it — the rows
 * looked undeletable (synclairvision, 2026-10-02). The shape is what this
 * guard scans for, in every public page and component: an interactive element
 * opened inside a <button …>…</button> block. Zero tolerance — there was one
 * offender when it was written and it was the bug.
 */
const ROOT = join(__dirname, '../../..');
const ROOTS = ['src/pages', 'src/components/public', 'src/components/chat', 'src/components/account'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (!/__tests__|\/admin/.test(p)) walk(p, out); }
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

export function nestedInteractive(src: string): boolean {
  const code = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/[^\n]*/g, '');
  const re = /<button\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    const end = code.indexOf('</button>', m.index + 7);
    if (end === -1) continue;
    const inner = code.slice(m.index + 7, end);
    if (/<(Button|button|a|input|select|textarea)\b/.test(inner)) return true;
  }
  return false;
}

describe('no interactive element inside a <button> on visitor surfaces', () => {
  const files = ROOTS.flatMap((r) => walk(join(ROOT, r)));

  it('scans the public surfaces', () => {
    expect(files.some((f) => f.includes('pages/ChatPage.tsx'))).toBe(true);
    expect(files.some((f) => f.includes('components/public/blocks'))).toBe(true);
  });

  it('finds none', () => {
    const offenders = files.filter((f) => nestedInteractive(readFileSync(f, 'utf-8'))).map((f) => relative(ROOT, f));
    expect(offenders, 'make the inner control a sibling of the button, not its child').toEqual([]);
  });

  it('the detector itself catches the shape', () => {
    expect(nestedInteractive('<button onClick={a}><span/><Button onClick={b}/></button>')).toBe(true);
    expect(nestedInteractive('<div><button onClick={a}>x</button><Button onClick={b}/></div>')).toBe(false);
  });

  it("/chat's delete is a labelled sibling with room to stay in view", () => {
    const src = readFileSync(join(ROOT, 'src/pages/ChatPage.tsx'), 'utf-8');
    expect(src).toMatch(/aria-label=\{t\('chat\.deleteConversation'/);
    expect(src).toMatch(/className="flex-1 min-w-0 truncate"/);
  });
});
