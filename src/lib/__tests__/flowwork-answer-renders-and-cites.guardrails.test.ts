/**
 * Flowwork on Nordbrygg, 2026-10-31: a top-5 table came out as one paragraph
 * of pipes, the source cards in the side panel were cut mid-word, and a
 * five-source answer showed "48 cited" — everything retrieved, not what the
 * answer cited.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { citedRefs } from '../cited-refs';

const read = (p: string) => readFileSync(p, 'utf8');

describe('citedRefs', () => {
  it('reads single, listed and ranged citations', () => {
    expect([...citedRefs('Erik first [1]. Then [3, 5] and [19–23].')].sort((a, b) => a - b)).toEqual([1, 3, 5, 19, 20, 21, 22, 23]);
    expect([...citedRefs('see [7][8] and [10-11]')].sort((a, b) => a - b)).toEqual([7, 8, 10, 11]);
  });
  it('ignores what is not a citation', () => {
    expect(citedRefs('no markers here').size).toBe(0);
    expect(citedRefs('between [1990–2026]').size).toBe(0);
  });
});

describe('the answer renders and the panel tells cited from retrieved', () => {
  it('Flowwork answers render GFM tables', () => {
    const bubble = read('src/components/admin/workspace/MessageBubble.tsx');
    expect(bubble).toMatch(/remarkPlugins=\{\[remarkGfm\]\}/);
  });
  it('the side panel shows cited sources, retrieved behind a toggle, and the list fits the panel', () => {
    const page = read('src/pages/admin/WorkspaceChatPage.tsx');
    expect(page).toMatch(/const cited = retrieved\.filter\(\(c\) => citedSet\.has\(c\.ref\)\)/);
    expect(page).toMatch(/`\$\{cited\.length\} cited · \$\{retrieved\.length\} retrieved`/);
    expect(page).toMatch(/<CitationsDrawer\s+bare/);
    expect(read('src/components/admin/workspace/CitationsDrawer.tsx')).toMatch(/if \(bare\) \{\s*return <div className="space-y-2">\{list\}<\/div>;/);
  });
});
