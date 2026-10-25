import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { overlayUrls, sitemapAlternates, type SitemapOverlay, type SitemapPage } from '../_shared/sitemap-alternates.ts';
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { postAlternates, postVersions, type PostOverlay } from '../_shared/i18n/blog-address.ts';

/**
 * sitemap — Generates a dynamic sitemap.xml from published pages and blog posts.
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' },
    });
  }

  try {
            const supabase = getServiceClient();

    // Determine base URL — NEVER hardcode a domain. Each self-hosted instance
    // must advertise its OWN domain so SEO/AEO is 100% the customer's brand.
    // Precedence: explicit ?base_url= (the Vercel proxy passes the request host)
    // → the site's configured siteUrl (site_settings key='general') → the
    // request origin as a last resort.
    const url = new URL(req.url);
    let baseUrl = url.searchParams.get('base_url') || '';
    if (!baseUrl) {
      const { data: general } = await supabase
        .from('site_settings').select('value').eq('key', 'general').maybeSingle();
      baseUrl = ((general?.value as Record<string, unknown> | null)?.siteUrl as string) || '';
    }
    if (!baseUrl) baseUrl = url.origin;
    baseUrl = baseUrl.replace(/\/+$/, '');

    // Fetch published pages
    const { data: pages } = await supabase
      .from('pages')
      .select('id, slug, updated_at, locale, translation_group_id')
      .eq('status', 'published')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });

    // Published overlays (content_translations): a page or a post in another
    // language without a row of its own. An instance without the table yet has none.
    const { data: overlayRows, error: overlayErr } = await supabase
      .from('content_translations')
      .select('entity, entity_id, locale, slug, strings')
      .eq('status', 'published');
    if (overlayErr && !['42P01', 'PGRST205'].includes(String(overlayErr.code))) console.warn('[sitemap] overlays unreadable:', overlayErr.message);
    type OverlayRow = { entity: string; entity_id: string; locale: string | null; slug: string | null; strings: PostOverlay['strings'] };
    const allOverlays = (overlayRows || []) as unknown as OverlayRow[];
    const pageSlugById = new Map(((pages || []) as Array<{ id: string; slug: string }>).map((p) => [p.id, p.slug]));
    const overlays: SitemapOverlay[] = allOverlays
      .filter((r) => r.entity === 'page')
      .map((r) => ({ page_slug: String(pageSlugById.get(r.entity_id) ?? ''), locale: String(r.locale ?? '') }))
      .filter((o) => o.page_slug && o.locale);

    // Fetch published blog posts, with their source language. An instance
    // without blog_posts.locale yet lists them at /blog/<slug>, as before.
    type PostHead = { id: string; slug: string; updated_at: string | null; locale?: string | null };
    let posts: PostHead[] = [];
    {
      const withLocale = await supabase
        .from('blog_posts')
        .select('id, slug, updated_at, locale')
        .eq('status', 'published')
        .order('updated_at', { ascending: false });
      if (!withLocale.error) posts = (withLocale.data ?? []) as PostHead[];
      else {
        const { data } = await supabase
          .from('blog_posts')
          .select('id, slug, updated_at')
          .eq('status', 'published')
          .order('updated_at', { ascending: false });
        posts = (data ?? []) as PostHead[];
      }
    }

    // Which language a stranger should get. The sitemap is the only channel a
    // search engine reads without executing JavaScript — the hreflang tags in
    // the head come from react-helmet, and this instance's prerender runs for
    // SOCIAL crawlers only.
    const { data: langRow, error: langErr } = await supabase
      .from('site_settings').select('value').eq('key', 'site_languages').maybeSingle();
    // Utan deklarationen utelämnas x-default — sitemapen ska ändå byggas, men
    // tystnaden får inte se ut som ett svar.
    if (langErr) console.warn('[sitemap] site_languages unreadable, omitting x-default:', langErr.message);
    const siteDefaultLanguage = String(
      (langRow?.value as { default?: string } | null)?.default ?? '',
    ).toLowerCase();
    const enabledLanguages = ((langRow?.value as { enabled?: string[] } | null)?.enabled ?? []).map((l) => String(l).toLowerCase());

    // Adressformen ägs av sitemapAlternates: standardspråket på roten, andra
    // språk som /lang/<basslugg>. <loc> och alternativen kommer ur SAMMA karta,
    // så en alternativlänk aldrig kan peka på en form sitemapen inte listar.
    const { canonicalPath, alternates } = sitemapAlternates({
      pages: (pages || []) as SitemapPage[],
      defaultLanguage: siteDefaultLanguage,
      baseUrl,
      homepageSlug: 'home',
    });
    const pageHref = (slug: string) => {
      const path = canonicalPath.get(slug) ?? (slug === 'home' ? '/' : `/${slug}`);
      return path === '/' ? baseUrl : `${baseUrl}${path}`;
    };
    // Overlay versions: extra <url> entries at /<lang>/<slug>, and the page's
    // own entry gains the alternate set.
    const overlay = overlayUrls((pages || []) as SitemapPage[], overlays, siteDefaultLanguage, baseUrl, 'home');
    for (const [slug, set] of overlay.pageAlternates) if (!alternates.has(slug)) alternates.set(slug, set);

    // Build XML
    const entries: string[] = [];

    // Pages
    for (const page of pages || []) {
      const loc = pageHref(page.slug);
      const lastmod = page.updated_at ? new Date(page.updated_at).toISOString().split('T')[0] : '';
      const langLinks = (alternates.get(page.slug) ?? [])
        .map((a) => `\n    <xhtml:link rel="alternate" hreflang="${escapeXml(a.hreflang)}" href="${escapeXml(a.href)}"/>`)
        .join('');
      entries.push(`  <url>
    <loc>${escapeXml(loc)}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>weekly</changefreq>
    <priority>${page.slug === 'home' ? '1.0' : '0.8'}</priority>${langLinks}
  </url>`);
    }

    // Overlay versions of pages
    const updatedBySlug = new Map<string, string | null>(((pages || []) as Array<{ slug: string; updated_at: string | null }>).map((p) => [p.slug, p.updated_at]));
    for (const u of overlay.urls) {
      const loc = u.path === '/' ? baseUrl : `${baseUrl}${u.path}`;
      const upd = updatedBySlug.get(u.page_slug);
      const lastmod = upd ? new Date(upd).toISOString().split('T')[0] : '';
      const langLinks = u.alternates
        .map((a) => `\n    <xhtml:link rel="alternate" hreflang="${escapeXml(a.hreflang)}" href="${escapeXml(a.href)}"/>`)
        .join('');
      entries.push(`  <url>
    <loc>${escapeXml(loc)}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>weekly</changefreq>
    <priority>${u.page_slug === 'home' ? '0.9' : '0.7'}</priority>${langLinks}
  </url>`);
    }

    // Blog posts: one <url> per published language version, each carrying
    // the post's full alternate set (blog-address.ts — the same rule the
    // post's head and the switcher use).
    const postOverlays = new Map<string, PostOverlay[]>();
    for (const r of allOverlays) {
      if (r.entity !== 'blog_post' || !r.locale) continue;
      if (!postOverlays.has(r.entity_id)) postOverlays.set(r.entity_id, []);
      postOverlays.get(r.entity_id)!.push({ locale: r.locale, slug: r.slug, strings: r.strings, status: 'published' });
    }
    for (const post of posts) {
      const lastmod = post.updated_at ? new Date(post.updated_at).toISOString().split('T')[0] : '';
      // One language: every post at /blog/<slug>, as written — the readers do the same.
      const single = enabledLanguages.length < 2;
      const versions = single
        ? [{ locale: siteDefaultLanguage || 'en', slug: post.slug, title: '', source: 'post' as const, href: `/blog/${post.slug}` }]
        : postVersions(post, postOverlays.get(post.id) ?? [], siteDefaultLanguage || String(post.locale ?? 'en'));
      const set = postAlternates(versions, siteDefaultLanguage || String(post.locale ?? 'en'), baseUrl);
      const langLinks = set
        .map((a) => `\n    <xhtml:link rel="alternate" hreflang="${escapeXml(a.hreflang)}" href="${escapeXml(a.href)}"/>`)
        .join('');
      for (const v of versions) {
        entries.push(`  <url>
    <loc>${escapeXml(`${baseUrl}${v.href}`)}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>${langLinks}
  </url>`);
      }
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join('\n')}
</urlset>`;

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    console.error('[sitemap] Error:', err);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml"></urlset>`, {
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
  }
});

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}