import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A vertical list inside ScrollArea truncates through ONE prop, not a selector
 * hack per list.
 *
 * Radix lays the viewport's child out as `display: table; min-width: 100%`, so
 * the list grows to its longest row and the control at the row's right end is
 * clipped. The /chat conversation history looked undeletable on synclairvision
 * (2026-10-02) — a first fix moved the delete out of the title button, and the
 * row stayed clipped because the table wrapper, not the button nesting, was the
 * cause (2026-10-04). ProjectRail had hit the same thing two weeks earlier and
 * fixed it locally. `fitWidth` on ScrollArea is the one writer; this guard keeps
 * the per-instance hack from coming back.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

function srcFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    if (e.isDirectory()) { if (e.name !== 'node_modules') srcFiles(join(dir, e.name), out); }
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(join(dir, e.name));
  }
  return out;
}

describe('ScrollArea.fitWidth is the one place the Radix table wrapper is blocked', () => {
  it('the component implements it on the viewport', () => {
    const src = read('src/components/ui/scroll-area.tsx');
    expect(src).toMatch(/fitWidth\?: boolean/);
    expect(src).toMatch(/fitWidth && "\[&>div\]:!block/);
  });

  it('no component reaches into the viewport with its own selector', () => {
    const SHAPE = /data-radix-scroll-area-viewport\]/;
    expect(SHAPE.test('[&>[data-radix-scroll-area-viewport]>div]:!block')).toBe(true);
    const offenders = srcFiles('src').filter((f) => SHAPE.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('the lists that were clipped use it', () => {
    for (const [file, marker] of [
      ['src/pages/ChatPage.tsx', /<ScrollArea className="flex-1 min-h-0" fitWidth>/],
      ['src/components/admin/projects/ProjectRail.tsx', /<ScrollArea className="w-full flex-1" fitWidth>/],
      ['src/pages/admin/WikiPage.tsx', /rounded-md border" fitWidth/],
    ] as const) {
      expect(read(file), file).toMatch(marker);
    }
  });
});
