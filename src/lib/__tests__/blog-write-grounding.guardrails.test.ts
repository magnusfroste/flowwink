import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: blog writing is grounded and slug collisions cannot fail a post.
 *
 * Live session on autoversio, 2026-07-22 ("skriv en blog post … referera till
 * www.clawable.org"):
 *
 *   1. FlowPilot wrote the post from MEMORY — no search_web, no scrape — and
 *      only fetched the real site after Magnus asked "läste du från siten
 *      eller tog du från minnet?". The product promise is research, not
 *      guessing, and per Law 2 the fix is skill metadata: a Grounding rule in
 *      write_blog_post's instructions.
 *   2. The regenerated post kept the title → same slug → the handler crashed
 *      on blog_posts' UNIQUE slug constraint, while the skill's instructions
 *      claimed duplicates get a numeric suffix. The handler now makes that
 *      claim true instead of the instructions lying.
 */

const root = process.cwd();
const seed = readFileSync(join(root, 'src/lib/modules/blog-module.ts'), 'utf8');
const ae = readFileSync(join(root, 'supabase/functions/agent-execute/index.ts'), 'utf8');

describe('write_blog_post grounding and slug safety', () => {
  it('the seed instructs research-first for external subjects', () => {
    const block = seed.slice(seed.indexOf("name: 'write_blog_post'"));
    expect(block).toMatch(/Grounding — research before you write/);
    expect(block).toMatch(/never write about a specific\s*\n?external subject from memory/);
  });

  it('the handler suffixes colliding slugs instead of crashing on the constraint', () => {
    const start = ae.indexOf('const baseSlug = resolvedTitle');
    expect(start, 'slug uniqueness logic missing from the blog handler').toBeGreaterThan(0);
    const block = ae.slice(start, start + 700);
    expect(block).toMatch(/existing\.has\(slug\)/);
    expect(block).toMatch(/`\$\{baseSlug\}-\$\{n\}`/);
  });

  it('the instructions describe the suffix behaviour the handler actually has', () => {
    expect(seed).toMatch(/duplicate title gets a numeric slug suffix/);
    expect(seed, 'the old false uniqueness claim is back').not.toMatch(
      /Title must be unique; duplicates get a numeric suffix/,
    );
  });
});
