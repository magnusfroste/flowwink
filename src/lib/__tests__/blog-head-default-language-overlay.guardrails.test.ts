import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A post written in Swedish on an English-default site has its English
 * version as an overlay, served at /blog/<english-slug> — no prefix, so the
 * head renderer sees no requested language. Gating the overlay-slug lookup on
 * a prefix left those addresses with the site title and no description for
 * every reader without JS (nordbrygg, 2026-10-25). The browser was right; the
 * crawler's head was not.
 */
describe('api/html.ts: an overlay slug names the post in every language', () => {
  const src = readFileSync(join(process.cwd(), 'api/html.ts'), 'utf8');
  const blog = src.slice(src.indexOf('} else if (blog) {'));

  it('looks the slug up among overlays whether or not the address has a prefix', () => {
    const lookup = blog.indexOf('content_translations?entity=eq.blog_post&locale=eq.');
    expect(lookup).toBeGreaterThan(0);
    const guard = blog.slice(0, lookup).match(/if \(([^)]*)\) \{\s*const \[hit\][^]*$/);
    expect(guard?.[1]).toBe('!post');
  });

  it('asks for the overlay in the language the address resolves to, the default included', () => {
    expect(blog).toMatch(/const lang = requestedLang \?\? defaultLang;/);
    expect(blog).toMatch(/locale=eq\.\$\{encodeURIComponent\(lang\)\}&slug=eq\.\$\{slug\}/);
  });
});
