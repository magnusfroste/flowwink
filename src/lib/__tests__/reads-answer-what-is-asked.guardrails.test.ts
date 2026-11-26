/**
 * A read answers what the question needs (2026-11-22).
 *
 * www's morning heartbeat asked for every post and for the knowledge on a
 * topic in its first step: 21 000 + 26 000 characters, 27 000 tokens carried
 * on every later step. A long list of posts is titles; a knowledge search is
 * its best hits whole and the rest as previews.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BLOG_LIST_WHOLE_UP_TO, KNOWLEDGE_PREVIEW_CHARS, KNOWLEDGE_WHOLE_HITS, KNOWLEDGE_BEST_HIT_MAX_CHARS, auditPostList, shapeBlogList, shapeKnowledgeHits,
} from '../../../supabase/functions/_shared/skills/lean-answers';

const read = (p: string) => readFileSync(join(__dirname, '../../..', p), 'utf-8');

const post = (i: number) => ({
  id: `00000000-0000-0000-0000-0000000000${String(i).padStart(2, '0')}`,
  slug: `a-post-about-something-specific-${i}`,
  title: `A post about something specific, number ${i}`,
  excerpt: 'x'.repeat(180),
  featured_image: `https://images.example.com/${'y'.repeat(120)}.jpg`,
  published_at: '2026-11-20T06:00:00.000000+00:00',
  reading_time_minutes: 4,
});
const hit = (i: number, chars = 2500) => ({ title: `Hit ${i}`, url: `/kb/${i}`, content: 'z'.repeat(chars), score: 1 - i / 100 });

describe('a list of posts', () => {
  it('a short list is what a visitor is shown: excerpt and image stay', () => {
    const r = shapeBlogList(Array.from({ length: BLOG_LIST_WHOLE_UP_TO }, (_, i) => post(i)));
    expect(r.compact).toBeUndefined();
    expect(r.posts[0]).toHaveProperty('featured_image');
  });

  it('a long list is slug, title and date — a third of the size, and says how to get the rest', () => {
    const all = Array.from({ length: 34 }, (_, i) => post(i));
    const r = shapeBlogList(all);
    expect(Object.keys(r.posts[0])).toEqual(['slug', 'title', 'published_at']);
    expect(r.posts[0].published_at).toBe('2026-11-20');
    expect(r.posts).toHaveLength(34);
    expect(JSON.stringify(r).length).toBeLessThan(JSON.stringify(all).length / 3);
    expect(r.note).toMatch(/full: true/);
    expect(r.note).toMatch(/manage_blog_posts get/);
  });

  it('full: true lists every post whole', () => {
    const r = shapeBlogList(Array.from({ length: 34 }, (_, i) => post(i)), { full: true });
    expect(r.posts[0]).toHaveProperty('excerpt');
  });
});

describe('a knowledge search', () => {
  it('the best hits are whole, the rest previews that say so', () => {
    const hits = Array.from({ length: 11 }, (_, i) => hit(i));
    const r = shapeKnowledgeHits(hits);
    expect(r.results.slice(0, KNOWLEDGE_WHOLE_HITS).every((h) => h.content.length === 2500 && !h.cut)).toBe(true);
    expect(r.results.slice(KNOWLEDGE_WHOLE_HITS).every((h) => h.cut === true && h.content.length <= KNOWLEDGE_PREVIEW_CHARS + 1)).toBe(true);
    // Every hit keeps its title and address: the breadth is not what is cut.
    expect(r.results.map((h) => h.url)).toEqual(hits.map((h) => h.url));
    expect(JSON.stringify(r).length).toBeLessThan(JSON.stringify(hits).length / 2);
    expect(r.note).toMatch(/8 were cut/);
  });

  it('a short hit is never marked cut, and three hits carry no note', () => {
    expect(shapeKnowledgeHits([hit(0), hit(1), hit(2), hit(3, 200)]).note).toBeUndefined();
    expect(shapeKnowledgeHits([hit(0), hit(1), hit(2)]).note).toBeUndefined();
  });

  it('a best hit that is a whole page keeps its first 2 500 characters (www, 2026-11-26: 17 000 chars)', () => {
    const r = shapeKnowledgeHits([hit(0, 6000), hit(1, 900)]);
    expect(r.results[0].cut).toBe(true);
    expect(r.results[0].content.length).toBeLessThanOrEqual(KNOWLEDGE_BEST_HIT_MAX_CHARS + 1);
    expect(r.results[1].cut).toBeUndefined();
  });

  it('full: true returns every hit whole', () => {
    const r = shapeKnowledgeHits(Array.from({ length: 11 }, (_, i) => hit(i)), { full: true });
    expect(r.results.every((h) => h.content.length === 2500)).toBe(true);
  });
});

describe('a blog audit', () => {
  it('lists the posts with a finding and counts the clean ones (liteit, 2026-11-26: 12 400 chars of nothing to fix)', () => {
    const posts = Array.from({ length: 12 }, (_, i) => ({ slug: `p${i}`, words: 800 }));
    const r = auditPostList(posts, [{ slug: 'p3' }, { slug: 'p3' }], false);
    expect(r.posts.map((p) => p.slug)).toEqual(['p3']);
    expect(r.clean_posts).toBe(11);
    expect(r.note).toMatch(/full: true/);
    expect(auditPostList(posts, [], true).posts).toHaveLength(12);
    expect(auditPostList(posts, [], false)).toMatchObject({ posts: [], clean_posts: 12 });
  });
  it('the handler uses it and the skill declares full', () => {
    const core = read('supabase/functions/_shared/execute/core.ts');
    expect(core).toMatch(/\.\.\.auditPostList\(perPost, findings, full === true\)/);
    expect(read('src/lib/modules/blog-module.ts')).toMatch(/List every post with its measures/);
  });
});

describe('the skills use the rule and declare the way out', () => {
  it('both handlers shape their answer', () => {
    const core = read('supabase/functions/_shared/execute/core.ts');
    expect(core).toMatch(/shapeBlogList\(\(data \|\| \[\]\)[^\n]+full: a\.full === true/);
    expect(core).toMatch(/shapeKnowledgeHits\(chunks\.map/);
  });

  it('`full` is a declared parameter of both', () => {
    const blog = read('src/lib/modules/blog-module.ts');
    expect(blog.slice(blog.indexOf("name: 'browse_blog'"), blog.indexOf('## browse_blog'))).toMatch(/full: \{\s+type: 'boolean'/);
    const seeds = read('src/lib/platform-seeds.ts');
    const at = seeds.indexOf("name: 'search_knowledge'");
    expect(seeds.slice(at, at + 2600)).toMatch(/full: \{\s+type: 'boolean'/);
  });
});
