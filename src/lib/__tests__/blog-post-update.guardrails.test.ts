/**
 * manage_blog_posts update says what it did — no silent "updated: true".
 *
 * Live on www (2026-10-29): an operator sent meta_json with an SEO
 * description; the handler destructured neither it nor anything like it, wrote
 * only updated_at and answered "updated: true". Posts rewritten to ~900 words
 * kept "2 min read". Source-reading guard (agent-execute is Deno and cannot be
 * imported here); the pure pieces (readingMinutes, mergePostMeta) are unit
 * tested in content-quality.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blogModule } from '@/lib/modules/blog-module';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const exec = read('supabase/functions/agent-execute/index.ts');
const start = exec.indexOf('async function executeBlogPostsManagement(');
const handler = exec.slice(start, exec.indexOf("if (action === 'publish')", start));
const known = (() => {
  const m = exec.match(/const MANAGE_BLOG_POSTS_ARGS = new Set\(\[([^\]]+)\]\);/);
  return m ? m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')) : [];
})();
const declared = Object.keys(
  (blogModule.skillSeeds!.find((s) => s.name === 'manage_blog_posts')!.tool_definition as { function: { parameters: { properties: Record<string, unknown> } } }).function.parameters.properties,
);

describe('the arguments the handler reads are the arguments the skill declares', () => {
  it('one for one — a declared field the handler ignores, or a read field nobody can discover, fails here', () => {
    expect(known.length).toBeGreaterThan(15);
    expect([...known].sort()).toEqual([...declared].sort());
  });
  it('the new fields are declared with a description (Law 2)', () => {
    const props = (blogModule.skillSeeds!.find((s) => s.name === 'manage_blog_posts')!.tool_definition as { function: { parameters: { properties: Record<string, { description?: string }> } } }).function.parameters.properties;
    for (const k of ['seo_title', 'meta_description', 'og_image', 'meta_json', 'featured_image_alt']) expect(props[k]?.description, k).toBeTruthy();
    expect(props.meta_json.description).toMatch(/MERGED/);
    const m = blogModule.skillSeeds!.find((s) => s.name === 'manage_blog_posts')!;
    expect(m.instructions).toMatch(/ignored/);
    expect(m.instructions).toMatch(/UNKNOWN_PARAMETERS/);
    expect(m.instructions).toMatch(/reading_time_minutes/);
  });
});

describe('meta: merged into what is there, under the keys the readers read', () => {
  it('seo_title / meta_description / og_image land on seoTitle / description / ogImage', () => {
    expect(handler).toMatch(/if \(seo_title !== undefined\) metaPatch\.seoTitle = seo_title;/);
    expect(handler).toMatch(/if \(meta_description !== undefined\) metaPatch\.description = meta_description;/);
    expect(handler).toMatch(/if \(og_image !== undefined\) metaPatch\.ogImage = og_image;/);
    expect(handler).toMatch(/updates\.meta_json = mergePostMeta\(curMeta\?\.meta_json, metaPatch\);/);
  });
  it('those are the keys the post page, the shell and the card read', () => {
    const page = read('src/pages/BlogPostPage.tsx');
    expect(page).toMatch(/meta\.seoTitle/);
    expect(page).toMatch(/meta\.description/);
    expect(page).toMatch(/meta\.ogImage/);
    const html = read('api/html.ts');
    expect(html).toMatch(/m\.seoTitle/);
    expect(html).toMatch(/m\.description/);
    expect(html).toMatch(/m\.ogImage/);
    expect(read('api/og.ts')).toMatch(/m\.description/);
  });
  it('a meta change re-translates (the overlays carry post.meta.seoTitle / description)', () => {
    expect(handler).toMatch(/const textChanged = [^;]*updates\.meta_json !== undefined;/);
  });
  it('the answer reads meta back from the row', () => {
    expect(handler).toMatch(/\.select\('id, title, status, featured_image, published_at, meta_json, reading_time_minutes'\)/);
    expect(handler).toMatch(/meta: \{ seoTitle: data\.meta_json\?\.seoTitle/);
  });
});

describe('an unknown argument is named, never swallowed', () => {
  it('ignored args are listed beside a real change, and refused with UNKNOWN_PARAMETERS when nothing known changed', () => {
    expect(handler).toMatch(/const ignored = Object\.keys\(args\)\.filter\(\(k\) => !k\.startsWith\('_'\) && !MANAGE_BLOG_POSTS_ARGS\.has\(k\)\);/);
    expect(handler).toMatch(/code: 'UNKNOWN_PARAMETERS', retryable: true, ignored,/);
    expect(handler).toMatch(/code: 'MISSING_REQUIRED_PARAMETER', retryable: true,/);
    expect(handler).toMatch(/\.\.\.\(ignored\.length \? \{ ignored, note:/);
    // The refusal comes BEFORE the write.
    expect(handler.indexOf("code: 'UNKNOWN_PARAMETERS'")).toBeLessThan(handler.indexOf(".update(updates).eq('id', resolvedPostId)"));
  });
  it('both codes are in the envelope\'s vocabulary', () => {
    const errs = read('supabase/functions/_shared/agent-errors.ts');
    expect(errs).toContain("'UNKNOWN_PARAMETERS'");
    expect(errs).toContain("'MISSING_REQUIRED_PARAMETER'");
  });
});

describe('reading time follows the body', () => {
  it('update recomputes it whenever the body changes; write_blog_post stores it', () => {
    expect(handler).toMatch(/if \(updates\.content_json !== undefined\) updates\.reading_time_minutes = readingMinutes\(updates\.content_json\);/);
    const w = exec.indexOf('// write_blog_post — PURE SENSOR');
    expect(exec.slice(w, exec.indexOf('// --- Unsplash helper', w))).toMatch(/reading_time_minutes: readingMinutes\(tiptapDoc\),/);
  });
});
