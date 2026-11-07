import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Write surfaces must accept the identifiers their read surfaces accept (#99).
 *
 * Found by driving the gateway as an external agent would: `manage_page`
 * resolves a slug, but `manage_page_blocks` answered "page_id is required";
 * `manage_kb_article` action=get resolves a TITLE, but action=update answered
 * "article_id or slug is required". Both times the agent held a perfectly good
 * identifier and had to go find another one — a write surface pickier than the
 * read surface that precedes it is a trap, not a safeguard.
 *
 * The class is easy to reintroduce (a new action destructures only the id), so
 * this pins the resolution points rather than the prose.
 */
const SRC = readFileSync(
  join(process.cwd(), 'supabase/functions/_shared/execute/core.ts'),
  'utf-8',
);

describe('write/read identifier parity', () => {
  it('manage_page_blocks takes a slug where it takes a page_id', () => {
    const block = SRC.slice(SRC.indexOf("case 'manage_page_blocks': {"));
    const head = block.slice(0, 800);
    expect(head).toMatch(/const \{[^}]*\bslug\b/);
    expect(head).toContain('resolvePageId');
  });

  it('create_page_block takes a slug where it takes a page_id', () => {
    const block = SRC.slice(SRC.indexOf("case 'create_page_block': {"));
    const head = block.slice(0, 900);
    expect(head).toMatch(/\bslug\b/);
  });

  it('KB article writes resolve a title, not only an id or slug', () => {
    const fn = SRC.slice(SRC.indexOf('async function resolveArticleId'));
    const body = fn.slice(0, 1600);
    expect(body).toMatch(/args\?\.title/);
    // Ambiguity must never silently pick one row on a WRITE.
    expect(body).toMatch(/disambiguate|pass article_id or slug/i);
  });

  it('the errors name every accepted identifier, so a wrong guess self-corrects', () => {
    expect(SRC).toContain('article_id, slug or title is required');
    expect(SRC).toContain('page_id or slug is required');
    // The old one-identifier messages must not come back.
    expect(SRC).not.toContain("throw new Error('page_id is required')");
    expect(SRC).not.toContain("throw new Error('article_id or slug is required')");
  });
});
