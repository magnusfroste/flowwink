import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sitemapAlternates, type SitemapPage } from '../_shared/sitemap-alternates.ts';
import { getServiceClient } from '../_shared/supabase-clients.ts';

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
      .select('slug, updated_at, locale, translation_group_id')
      .eq('status', 'published')
      .order('updated_at', { ascending: false });

    // Fetch published blog posts
    const { data: posts } = await supabase
      .from('blog_posts')
      .select('slug, updated_at')
      .eq('status', 'published')
      .order('updated_at', { ascending: false });

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

    // The SAME function that builds <loc>, so an alternate can never point
    // somewhere the sitemap does not also list.
    const pageHref = (slug: string) => (slug === 'home' ? baseUrl : `${baseUrl}/${slug}`);
    const alternates = sitemapAlternates({
      pages: (pages || []) as SitemapPage[],
      defaultLanguage: siteDefaultLanguage,
      href: pageHref,
    });

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

    // Blog posts
    for (const post of posts || []) {
      const loc = `${baseUrl}/blog/${post.slug}`;
      const lastmod = post.updated_at ? new Date(post.updated_at).toISOString().split('T')[0] : '';
      entries.push(`  <url>
    <loc>${escapeXml(loc)}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`);
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