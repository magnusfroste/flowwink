import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A blog post's category lives in ONE place: the blog_post_categories join.
 * The admin editor writes it and /blog/category/:slug reads it. The latest-posts
 * block filtered on meta_json.category instead — which nothing writes — so a
 * block with a category showed "No posts" on every site (found building the MJP
 * demo, 2026-09-28). And no agent could set a category or keep an imported
 * post's original date, so an import was a pile of uncategorised posts dated
 * today.
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

describe('a post category has one reader', () => {
  it('nothing reads or writes a category in blog_posts.meta_json', () => {
    const SHAPE = /meta_json['"]?\s*,\s*\{\s*category\b|meta_json\??\.category\b|meta_json->>'category'/;
    // Negative test: the shape the scanner exists for.
    expect(SHAPE.test(`q.contains('meta_json', { category: data.category })`)).toBe(true);
    expect(SHAPE.test(`q.eq('blog_post_categories.blog_categories.slug', data.category)`)).toBe(false);
    const offenders = [...srcFiles('src'), ...srcFiles('supabase/functions')].filter((f) => SHAPE.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('the latest-posts block filters through the join', () => {
    const block = read('src/components/public/blocks/LatestPostsBlock.tsx');
    expect(block).toMatch(/blog_post_categories!inner\(blog_categories!inner\(slug\)\)/);
    expect(block).toMatch(/\.eq\('blog_post_categories\.blog_categories\.slug', data\.category\)/);
  });
});

describe('an agent can import a post as it was', () => {
  const edge = read('supabase/functions/agent-execute/index.ts');

  it('write_blog_post keeps slug, original date and category', () => {
    const start = edge.indexOf('// write_blog_post — PURE SENSOR');
    const body = edge.slice(start, edge.indexOf('// --- Unsplash helper', start));
    expect(body).toMatch(/slug: requestedSlug/);
    expect(body).toMatch(/insertData\.published_at = importedPublishedAt \?\? new Date\(\)\.toISOString\(\)/);
    expect(body).toMatch(/await setBlogPostCategory\(supabase, data\.id, category\)/);
  });

  it('manage_blog_posts update sets category and corrects a published date', () => {
    const start = edge.indexOf('async function executeBlogPostsManagement(');
    const body = edge.slice(start, edge.indexOf("if (action === 'publish')", start));
    expect(body).toMatch(/setBlogPostCategory\(supabase, data\.id, category\)/);
    expect(body).toMatch(/published_at can only be set on a published post/);
  });

  it('a future date is a schedule, not a publication date', () => {
    expect(edge).toMatch(/published_at is in the future — to publish later, set scheduled_at/);
  });

  it('both skills declare the fields the handlers read', () => {
    type Seed = { name: string; tool_definition: { function: { parameters: { properties: Record<string, unknown> } } } };
    const artifact = JSON.parse(read('supabase/seed/module-skills.json')) as { modules: Array<{ skills: Seed[] }> };
    const skills = artifact.modules.flatMap((m) => m.skills);
    const props = (n: string) => Object.keys(skills.find((s) => s.name === n)!.tool_definition.function.parameters.properties);
    for (const p of ['slug', 'published_at', 'category', 'excerpt', 'featured_image', 'featured_image_alt']) expect(props('write_blog_post'), p).toContain(p);
    for (const p of ['category', 'published_at']) expect(props('manage_blog_posts'), p).toContain(p);
  });
});
