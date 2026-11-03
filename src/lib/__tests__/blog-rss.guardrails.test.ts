import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: the blog's RSS feed answers, on the site's own address.
 *
 * www 2026-10-30: the archive's RSS button opened the app shell (no
 * api/blog-rss route existed) and the feed itself answered "Failed to
 * generate RSS feed" — it embedded profiles.email, a column anon has no grant
 * on, and one ungranted column fails the whole PostgREST query. Called
 * directly, its links also named the functions host instead of the site.
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('blog RSS', () => {
  it('no function that reads as anon embeds profiles.email (anon may read full_name, never email)', () => {
    const dir = join(root, 'supabase/functions');
    const offenders: string[] = [];
    for (const name of readdirSync(dir)) {
      const file = join(dir, name, 'index.ts');
      if (!existsSync(file)) continue;
      const src = readFileSync(file, 'utf8');
      if (!src.includes('getAnonClient()')) continue;
      if (/profiles(![a-z_]+)?\([^)]*\bemail\b/.test(src)) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });

  it('the feed builds its links on the site address: base_url, then general.siteUrl, then the request', () => {
    const fn = read('supabase/functions/blog-rss/index.ts');
    expect(fn).toMatch(/siteOrigin\(url\.searchParams\.get\('base_url'\), generalResult\.data\?\.value, url\)/);
    expect(fn).not.toMatch(/const siteUrl = `\$\{url\.protocol\}\/\/\$\{url\.host\}`/);
  });

  it('brand covers: the feed carries the derived card, never the stock photo the site no longer shows', () => {
    const fn = read('supabase/functions/blog-rss/index.ts');
    expect(fn).toMatch(/const brandCovers = blogSettings\.coverStyle === 'brand';/);
    expect(fn).toMatch(/enclosure\(brandCovers \? `\$\{siteUrl\}\/api\/og\?path=/);
  });

  it('/api/blog-rss exists on the site — the address the archive button and atom:link name — and passes base_url', () => {
    expect(read('src/pages/BlogArchivePage.tsx')).toMatch(/'\/api\/blog-rss'/);
    const route = read('api/blog-rss.ts');
    expect(route).toMatch(/\/functions\/v1\/blog-rss/);
    expect(route).toMatch(/searchParams\.set\('base_url', origin\)/);
    expect(route).toMatch(/searchParams\.set\('lang', lang\)/);
    expect(read('nginx.conf')).toMatch(/location = \/api\/blog-rss \{/);
  });
});
