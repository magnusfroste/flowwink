/**
 * A pin is where one colleague keeps their hands — not a claim about the team.
 *
 * The wiki tree is alphabetical and hierarchical, which is right for finding a
 * page you have never opened and wrong for returning to the four you open every
 * day. Pins are the shortcut past the hierarchy; the hierarchy itself stays the
 * team-level answer to "this matters" (parent it high and everyone sees it).
 *
 * Built to stay out of the local session's way: a new hook file plus WikiTree,
 * which had not been touched since 2026-08-08 — while WikiPage.tsx took four
 * changes in three days and one the morning this landed. No migration, no
 * schema change, no shared file in flight.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');

const hook = read('src/hooks/useWikiPins.ts');
const tree = read('src/components/admin/wiki/WikiTree.tsx');

describe('pins follow the platform storage convention', () => {
  it('live in profiles.preferences, not localStorage', () => {
    // The pinned-pages migration exists because localStorage lost every user's
    // pins the day the instance moved to its real domain.
    expect(strip(hook)).not.toMatch(/localStorage/);
    expect(hook).toMatch(/\.from\('profiles'\)/);
    expect(hook).toMatch(/wiki_pins/);
  });

  it('merge-write so a sibling preference is never clobbered', () => {
    // ownership_lens and pinned_pages share this object.
    expect(hook).toMatch(/\{ \.\.\.prefs, wiki_pins: next \}/);
  });
});

describe('a pin survives a rename and dies with the page', () => {
  it('stores slugs, not titles', () => {
    // usePinnedPages stores {href,name,icon} and shows a stale name after a
    // rename. Here the slug is the key and the title is read from the live list.
    expect(hook).toMatch(/Promise<string\[\]>/);
    expect(hook).toMatch(/typeof s === 'string'/);
  });

  it('resolves against the live page list and drops what no longer exists', () => {
    expect(tree).toMatch(/bySlug\.get\(slug\)/);
    expect(tree).toMatch(/\.filter\(\(p\): p is WikiPageListItem => !!p\)/);
  });
});

describe('the affordance behaves', () => {
  it('pinning does not navigate — the row is a link', () => {
    const btn = tree.slice(tree.indexOf('function PinButton'));
    expect(btn).toMatch(/e\.preventDefault\(\)/);
    expect(btn).toMatch(/e\.stopPropagation\(\)/);
  });

  it('a pinned page shows its state without hovering', () => {
    // Hiding state behind hover is how people lose track of what they pinned.
    expect(tree).toMatch(/pinned \? 'opacity-100' : 'opacity-0 group-hover:opacity-100/);
  });

  it('the limit explains itself instead of silently doing nothing', () => {
    expect(tree).toMatch(/Pin limit reached/);
    expect(hook).toMatch(/atLimit/);
  });
});

describe('it stays out of the busy file', () => {
  it('WikiTree reads the pins itself rather than taking them as props', () => {
    // WikiPage.tsx is the local session's active surface; touching it would
    // have meant a conflict for a feature that needs nothing from it.
    expect(tree).toMatch(/useWikiPins\(user\?\.id\)/);
  });
});
