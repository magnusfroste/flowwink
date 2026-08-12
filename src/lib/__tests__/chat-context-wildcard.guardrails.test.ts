import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `includedPageSlugs: ['*']` means EVERY page — on every reader.
 *
 * The wildcard is the contract three parties share: templates ship `['*']` so
 * a freshly installed site grounds its chat in its own content, the frontend
 * context indicator renders it as "All pages", and the edge readers select
 * the content. Two of the three used to disagree — the edge treated `'*'` as
 * a literal slug, so `.in('slug', ['*'])` matched nothing and the chunk
 * filter dropped every page chunk.
 *
 * The failure was invisible in the settings UI (the flags read as ON, because
 * they WERE on) and looked like a model problem: asked to list the site's
 * process pages, the assistant invented seven that do not exist, while KB
 * answers stayed correct because KB travels a different path. Worse, each
 * template reinstall overwrote an admin's hand-picked slug list with `['*']`,
 * silently switching page grounding back off.
 *
 * These tests pin the shared helper's semantics AND that both edge readers
 * route through it — a future reader reintroducing `.length > 0` is the exact
 * regression to catch.
 */

const ROOT = join(__dirname, '../../..');
const CHAT_CONTEXT = join(ROOT, 'supabase/functions/_shared/chat-context.ts');
const CHAT_COMPLETION = join(ROOT, 'supabase/functions/chat-completion/index.ts');

/** Pull the pure helper out of the Deno module and run it in vitest. */
function extractHelper(): (slugs: string[] | null | undefined) => boolean {
  const src = readFileSync(CHAT_CONTEXT, 'utf-8');
  const start = src.indexOf('export function allowsAllPages');
  expect(start, 'allowsAllPages must exist in _shared/chat-context.ts').toBeGreaterThan(-1);
  const end = src.indexOf('\n}\n', start);
  const js = src
    .slice(start, end + 2)
    .replace('export function', 'function')
    .replace('(slugs: string[] | null | undefined): boolean', '(slugs)');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(`${js}; return allowsAllPages;`)() as (s: string[] | null | undefined) => boolean;
}

describe('page-slug wildcard semantics', () => {
  const allowsAllPages = extractHelper();

  it('treats the template wildcard as every page', () => {
    expect(allowsAllPages(['*'])).toBe(true);
  });

  it('treats an empty list as unrestricted (historical meaning)', () => {
    expect(allowsAllPages([])).toBe(true);
    expect(allowsAllPages(undefined)).toBe(true);
    expect(allowsAllPages(null)).toBe(true);
  });

  it('honours a hand-picked allowlist', () => {
    expect(allowsAllPages(['home', 'pricing'])).toBe(false);
  });

  it('lets the wildcard win when mixed with explicit slugs', () => {
    // An admin who adds pages to a list that already contains '*' still means
    // "all of them" — never "these two only".
    expect(allowsAllPages(['home', '*'])).toBe(true);
  });
});

describe('every edge reader routes through the shared helper', () => {
  it('the legacy KB builder does not filter when the wildcard is present', () => {
    const src = readFileSync(CHAT_CONTEXT, 'utf-8');
    expect(src).toMatch(/if\s*\(!allowsAllPages\(includedSlugs\)\)\s*query\s*=\s*query\.in\('slug'/);
    expect(
      src,
      "buildKnowledgeBase must not gate on list length — '*' has length 1 and would filter everything out",
    ).not.toMatch(/includedSlugs\.length\s*>\s*0/);
  });

  it('the retrieval chunk filter does not filter when the wildcard is present', () => {
    const src = readFileSync(CHAT_COMPLETION, 'utf-8');
    expect(src).toMatch(/if\s*\(!allowsAllPages\(slugAllowlist\)\)/);
    expect(
      src,
      "the chunk filter must not gate on list length — '*' would drop every page chunk",
    ).not.toMatch(/slugAllowlist\.length\s*>\s*0/);
  });
});
