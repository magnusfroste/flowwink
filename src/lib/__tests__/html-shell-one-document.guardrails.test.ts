import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { injectHead, helmetOwned, shellCacheControl } from '@/lib/seo-shell';

/**
 * One HTML document per URL, whoever asks.
 *
 * Hermes checked synclairvision's <title> with a plain HTTP fetch and read
 * "Website" (2026-10-04, #625). The SEO values were right and react-helmet set
 * them in a browser, but the served HTML carried the brandless shell for every
 * reader except a hand-listed set of social/AI crawlers — a guard that
 * enumerated. These guards hold the replacement: no User-Agent routing in
 * vercel.json, the shell injector fills the head without duplicating what the
 * SPA will manage, and the cache follows the same dial as get-page.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('vercel.json serves every navigation the same way', () => {
  const vercel = JSON.parse(read('vercel.json')) as { routes: Array<{ src: string; dest?: string; has?: unknown; handle?: string }> };

  it('no route branches on User-Agent', () => {
    const conditional = vercel.routes.filter((r) => r.has !== undefined);
    expect(conditional).toEqual([]);
    expect(JSON.stringify(vercel)).not.toMatch(/facebookexternalhit|Googlebot|user-agent/i);
  });

  it('the HTML document route precedes the filesystem fallback and excludes assets and api', () => {
    const idx = vercel.routes.findIndex((r) => r.dest?.startsWith('/api/html'));
    const fs = vercel.routes.findIndex((r) => r.handle === 'filesystem');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(fs).toBeGreaterThan(idx);
    const src = new RegExp(vercel.routes[idx].src);
    for (const nav of ['/', '/team', '/en/product', '/blog/some-post', '/kb/article-x']) expect(src.test(nav), nav).toBe(true);
    for (const asset of ['/assets/index-abc.js', '/favicon.svg', '/runtime-config.js', '/api/sitemap', '/index.html', '/og.png']) expect(src.test(asset), asset).toBe(false);
  });
});

describe('injectHead fills the shell without a second truth', () => {
  const shell = read('index.html');
  const tags = [
    '<title>Meet the Team &amp; Board | Synclair Vision</title>',
    '<meta name="description" content="Meet the team.">',
    '<meta property="og:type" content="website">',
    '<meta name="twitter:card" content="summary">',
    '<link rel="canonical" href="https://example.com/team">',
  ];

  it('replaces the placeholder title and the structural social tags, keeps the rest of the shell', () => {
    const out = injectHead(shell, { tags, lang: 'sv-SE' });
    expect(out.match(/<title/g)?.length).toBe(1);
    expect(out).toContain('<title data-rh="true">Meet the Team &amp; Board | Synclair Vision</title>');
    expect(out).not.toContain('<title>Website</title>');
    expect(out.match(/property="og:type"/g)?.length).toBe(1);
    expect(out.match(/name="twitter:card"/g)?.length).toBe(1);
    expect(out).toContain('<html lang="sv-se"');
    // the SPA still boots: root node and runtime config untouched
    expect(out).toContain('id="root"');
    expect(out).toContain('__FLOWWINK_RUNTIME__');
    expect(out).toContain('/runtime-config.js');
  });

  it('every injected tag is Helmet-owned so hydration reconciles instead of duplicating', () => {
    const out = injectHead(shell, { tags, lang: null });
    for (const t of ['<title data-rh="true">', '<meta data-rh="true" name="description"', '<link data-rh="true" rel="canonical"']) expect(out).toContain(t);
    expect(helmetOwned('<meta data-rh="true" name="x">')).toBe('<meta data-rh="true" name="x">');
    expect(helmetOwned('<script>x</script>')).toBe('<script>x</script>');
  });

  it('an invalid lang leaves the shell language alone; a shell without a title is refused', () => {
    expect(injectHead(shell, { tags, lang: '"><script>' })).toContain('<html lang="en"');
    expect(() => injectHead('<html><head></head><body></body></html>', { tags })).toThrow(/no <title>/);
  });
});

describe('the document cache follows the Edge caching dial', () => {
  it('on: the configured minutes at the CDN, browsers always revalidate', () => {
    expect(shellCacheControl({ enableEdgeCaching: true, edgeCacheTtlMinutes: 10 })).toBe('public, max-age=0, s-maxage=600, stale-while-revalidate=60');
    expect(shellCacheControl({ enableEdgeCaching: true, edgeCacheTtlMinutes: 999 })).toContain('s-maxage=3600');
  });

  it('off or unset: a 30-second micro-cache', () => {
    expect(shellCacheControl({ enableEdgeCaching: false })).toBe('public, max-age=0, s-maxage=30, stale-while-revalidate=300');
    expect(shellCacheControl(null)).toContain('s-maxage=30');
  });

  it('api/html.ts reads the performance key and uses the shared policy', () => {
    const fn = read('api/html.ts');
    expect(fn).toMatch(/site_settings\?key=in\.\([^)]*performance[^)]*\)/);
    expect(fn).toMatch(/shellCacheControl\(/);
    expect(fn).toMatch(/injectHead\(shell/);
    // the function never branches on who is asking
    expect(fn).not.toMatch(/headers\.get\(['"]user-agent['"]\)/i);
  });
});

describe('the shell carries the customer\'s favicon, not the platform\'s', () => {
  // Until 2026-10-21 the build's index.html kept FlowWink's icon links and only
  // the hydrated app swapped them — a crawler, a link preview, a bookmark made
  // before JS ran and a tab's first paint showed the platform's mark on a
  // customer's site (synclair).
  const shell = '<!doctype html><html lang="en"><head>\n    <title>Website</title>\n    <link rel="icon" type="image/svg+xml" href="/favicon.svg">\n    <link rel="icon" type="image/x-icon" href="/favicon.ico">\n  </head><body></body></html>';
  it('with a branding favicon the static icon links are replaced by it, with its type and an apple-touch-icon for a raster', async () => {
    const { injectHead, iconMimeType, iconTags } = await import('../seo-shell');
    const out = injectHead(shell, { tags: ['<title>Synclair</title>'], icon: 'https://x.supabase.co/storage/v1/object/public/cms-images/brand/synclair-favicon-512.png' });
    expect(out).not.toMatch(/favicon\.svg|favicon\.ico/);
    expect(out).toMatch(/<link rel="icon" type="image\/png" href="https:\/\/x\.supabase\.co[^"]*synclair-favicon-512\.png">/);
    // Not Helmet's: a data-rh icon is deleted by react-helmet-async on the first navigation.
    expect(out).not.toMatch(/<link data-rh="true" rel="(icon|apple-touch-icon)"/);
    expect(out).toMatch(/<link rel="apple-touch-icon" href="[^"]*synclair-favicon-512\.png">/);
    expect(iconMimeType('/a/b.ico')).toBe('image/x-icon');
    expect(iconMimeType('data:image/svg+xml;base64,AAA')).toBe('image/svg+xml');
    expect(iconMimeType('/no-extension')).toBeNull();
    expect(iconTags('/m.svg')).toHaveLength(1); // no apple-touch for a vector
  });
  it('without one the platform\'s links stay — a site that set no favicon is not blanked', async () => {
    const { injectHead } = await import('../seo-shell');
    const out = injectHead(shell, { tags: ['<title>Website</title>'], icon: null });
    expect(out).toMatch(/favicon\.svg/);
    expect(out).toMatch(/favicon\.ico/);
  });
});
