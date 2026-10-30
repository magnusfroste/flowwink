import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: a removed blog post's address follows its redirect.
 *
 * www 2026-10-30: 29 retired posts got 301s to /blog in page_redirects
 * (manage_redirect) and still showed "Page not found" with HTTP 200 — only
 * PublicPage asked the table, and a post is served by BlogPostPage.
 * Two halves now read it: the shell (a real 301/302 for search engines) and
 * the in-app hook (navigation inside the SPA, and the Docker image).
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('blog post redirects', () => {
  it('api/html.ts answers a missing post with the redirect as a real 301/302', () => {
    const html = read('api/html.ts');
    expect(html).toMatch(/\/rest\/v1\/rpc\/resolve_redirect/);
    expect(html).toMatch(/status: d\.status_code === 302 \? 302 : 301/);
    expect(html).toMatch(/if \(!post\) \{\s*const moved = await resolveRedirect\(base, key, path, origin\);\s*if \(moved\) return moved;/);
  });

  it('usePublicBlogPost asks resolve_redirect when no post answers — one language and many', () => {
    const hook = read('src/hooks/useBlogPosts.ts');
    expect(hook).toMatch(/supabase\.rpc\('resolve_redirect' as any, \{ p_path: path \}\)/);
    expect(hook).toMatch(/if \(!multilingual\) return \{ post, redirect: post \? null : await redirectFor\(blogPostPath\(slug, language, defaultLanguage\)\)/);
    expect(hook).toMatch(/if \(!post\) return \{ post: null, redirect: await redirectFor\(blogPostPath\(slug, language, defaultLanguage\)\)/);
    // BlogPostPage already follows `redirect` and renders nothing meanwhile — not a 404.
    const page = read('src/pages/BlogPostPage.tsx');
    expect(page).toMatch(/if \(served\?\.redirect && served\.redirect !== location\.pathname\) navigate\(served\.redirect, \{ replace: true \}\);/);
    expect(page).toMatch(/return served\?\.redirect \? null : <NotFound \/>;/);
  });
});
