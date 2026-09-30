/* eslint-disable @typescript-eslint/no-explicit-any -- prerender reads dynamic, loosely-typed PostgREST JSON */
export const config = { runtime: 'edge' };

import { pagePath, splitLanguagePrefix } from '../src/lib/language-path';

declare const process: { env: Record<string, string | undefined> };

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function pg(base: string, key: string, query: string): Promise<any[]> {
  try {
    const r = await fetch(`${base}/rest/v1/${query}`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
    });
    if (!r.ok) return [];
    return (await r.json()) as any[];
  } catch {
    return [];
  }
}

/**
 * Crawler prerender for social-share cards.
 *
 * Vercel rewrites route ONLY requests whose User-Agent matches a social crawler
 * (facebookexternalhit, Twitterbot, LinkedInBot, Slackbot, Discordbot, WhatsApp,
 * …) here — see vercel.json. Real users and JS-rendering search engines
 * (Googlebot/bingbot) are never routed here; they get the SPA, whose meta comes
 * from react-helmet. This returns a tiny HTML doc carrying the CUSTOMER's
 * OG/Twitter meta (their title, description, image, and own domain) for the
 * requested page — so every social share is 100% their brand, never FlowWink's.
 *
 * Identity comes from the same Supabase the Vite build already points at
 * (site_settings key='seo' + per-page blog_posts/pages) — no new configuration.
 */
export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = (url.searchParams.get('path') || '/').replace(/\/+$/, '') || '/';
  // Sidans eget språk, och dess syskon — båda tomma tills en sida slås upp.
  let pageLocale = '';
  let siblings: any[] = [];
  // /en/product: prefixet är språket, resten är GRUPPENS basslugg. Vilka
  // prefix som finns avgörs av sajtens deklaration — fylls i när
  // inställningarna lästs.
  let requestedLang: string | null = null;
  let byKeyOuter: Record<string, any> = {};
  let canonicalUrl = '';
  const host = req.headers.get('host') || url.host;
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const origin = `${proto}://${host}`;
  const pageUrl = path === '/' ? origin : `${origin}${path}`;

  const base = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';

  let title = 'Website';
  let siteName = '';
  let description = '';
  let image = '';
  let logoFallback = '';
  let twitter = '';
  let titleTemplate = '%s';
  let isArticle = false;
  let noIndex = false;
  let noFollow = false;

  if (base && key) {
    const settings = await pg(base, key, 'site_settings?key=in.(seo,general,branding,site_languages)&select=key,value');
    const byKey: Record<string, any> = {};
    for (const row of settings) byKey[row.key] = row.value || {};
    byKeyOuter = byKey;
    const seo = byKey.seo || {};
    const branding = byKey.branding || {};
    title = seo.siteTitle || branding.organizationName || 'Website';
    siteName = seo.siteTitle || branding.organizationName || title;
    description = seo.defaultDescription || branding.brandTagline || '';
    image = seo.ogImage || '';
    logoFallback = branding.logo || '';
    twitter = seo.twitterHandle || '';
    titleTemplate = seo.titleTemplate || '%s';

    const langs = (byKey.site_languages || {}) as { default?: string; enabled?: string[] };
    const split = splitLanguagePrefix(path, langs.enabled ?? [], String(langs.default ?? 'en'));
    requestedLang = split.lang;


    const blog = path.match(/^\/blog\/(.+)$/);
    const kb = path.match(/^\/kb\/([^/]+)$/);
    if (kb) {
      // Same head as KbArticlePage: the title, and the question (or the start
      // of the answer) as the description. Anon eyes: RLS decides what a
      // visitor may see, so an internal article never lends it its words.
      isArticle = true;
      const slug = encodeURIComponent(decodeURIComponent(kb[1]));
      const [article] = await pg(
        base,
        key,
        `kb_articles?slug=eq.${slug}&is_published=eq.true&select=title,question,answer_text&limit=1`,
      );
      if (article) {
        if (article.title) title = article.title;
        const d = article.question || String(article.answer_text || '').slice(0, 155);
        if (d) description = d;
      }
    } else if (blog) {
      isArticle = true;
      const slug = encodeURIComponent(decodeURIComponent(blog[1]));
      const [post] = await pg(
        base,
        key,
        `blog_posts?slug=eq.${slug}&status=eq.published&select=title,excerpt,featured_image&limit=1`,
      );
      if (post) {
        if (post.title) title = post.title;
        if (post.excerpt) description = post.excerpt;
        if (post.featured_image) image = post.featured_image;
      }
    } else {
      // Startsidan är den mest besökta sidan och den enda som INTE slogs upp —
      // path '/' hoppade över hela uppslaget, så crawlers fick lang="en" på en
      // svensk startsida medan varenda undersida var rätt. Roten pekar på en
      // riktig sidrad via general.homepageSlug, och den raden bär språket.
      const homepageSlug = String((byKey.general || {}).homepageSlug || 'home');
      const langs = (byKey.site_languages || {}) as { default?: string; enabled?: string[] };
      const defaultLang = String(langs.default ?? 'en');
      // /en → engelska startsidan; /en/product → basen 'product', språket 'en'.
      const requestedRest = requestedLang !== null
        ? splitLanguagePrefix(path, langs.enabled ?? [], defaultLang).rest
        : path;
      const rawSlug = requestedRest === '/'
        ? homepageSlug
        : decodeURIComponent(requestedRest.replace(/^\//, ''));
      const slug = encodeURIComponent(rawSlug);
      let [page] = await pg(
        base,
        key,
        `pages?slug=eq.${slug}&status=eq.published&select=slug,title,meta_json,locale,translation_group_id&limit=1`,
      );
      // Prefix begärt: sidan vi vill visa är SYSKONET i det språket, inte
      // basraden. Basen är bara adressens ryggrad.
      if (page && requestedLang && page.translation_group_id
          && String(page.locale ?? '').toLowerCase() !== requestedLang) {
        const [sibling] = await pg(
          base,
          key,
          `pages?translation_group_id=eq.${encodeURIComponent(String(page.translation_group_id))}`
            + `&locale=eq.${encodeURIComponent(requestedLang)}&status=eq.published&select=slug,title,meta_json,locale,translation_group_id&limit=1`,
        );
        if (sibling) page = sibling;
      }
      if (page) {
        if (page.title) title = page.title;
        // Kanonisk adress på prefixformen — även när den GAMLA adressen
        // (/product-en) begärdes. Det är omdirigeringens crawler-halva:
        // klienten navigerar, boten läser rel=canonical.
        if (page.translation_group_id) {
          const canonSiblings = await pg(
            base,
            key,
            `pages?translation_group_id=eq.${encodeURIComponent(String(page.translation_group_id))}`
              + `&status=eq.published&select=slug,locale`,
          );
          const baseSlug = canonSiblings.find(
            (x: any) => String(x.locale ?? '').toLowerCase().split('-')[0] === defaultLang.toLowerCase().split('-')[0],
          )?.slug ?? null;
          const p2 = pagePath({
            slug: String(page.slug), locale: page.locale ? String(page.locale) : null,
            defaultLanguage: defaultLang, baseSlug, homepageSlug,
          });
          canonicalUrl = p2 === '/' ? `${origin}/` : `${origin}${p2}`;
          siblings = canonSiblings;
        }
        // Språket följer sidan. Skalet hade `lang="en"` hårdkodat, så en
        // crawler fick veta att en svensk sida var engelsk — samma fel som
        // index.html bar innan sidorna fick sitt eget språk.
        if (page.locale) pageLocale = String(page.locale);

        const m = (page.meta_json || {}) as Record<string, unknown>;
        // The same keys PublicPage puts in its head (the page-SEO contract,
        // #579): a share preview that disagrees with the tab is a second truth.
        if (typeof m.seoTitle === 'string' && m.seoTitle.trim()) title = m.seoTitle.trim();
        noIndex = m.noIndex === true;
        noFollow = m.noFollow === true;
        description = (m.description as string) || (m.seoDescription as string) || (m.metaDescription as string) || description;
        image = (m.ogImage as string) || (m.og_image as string) || (m.image as string) || image;
      }
    }
  }

  const fullTitle = title === siteName ? title : titleTemplate.replace('%s', title);

  // No SEO image configured: fall back to the brand logo so a share still
  // shows something recognisable rather than a bare link.
  const usingLogo = !image && !!logoFallback;
  if (usingLogo) image = logoFallback;

  // WhatsApp/Facebook/LinkedIn drop relative image paths — always absolutize.
  if (image && !/^https?:\/\//i.test(image)) {
    image = `${origin}${image.startsWith('/') ? '' : '/'}${image}`;
  }

  // summary_large_image without an image renders as a bare link on X/Twitter.
  const twitterCard = image ? (usingLogo ? 'summary' : 'summary_large_image') : 'summary';

  const tags = [
    `<title>${esc(fullTitle)}</title>`,
    description && `<meta name="description" content="${esc(description)}">`,
    // Dev mode promises "hidden from search engines", but the client-side tag
    // only reaches JS-running crawlers — the prerendered head must carry it too.
    (byKeyOuter.seo || {}).developmentMode === true
      ? '<meta name="robots" content="noindex, nofollow">'
      : (noIndex || noFollow) && `<meta name="robots" content="${[noIndex ? 'noindex' : 'index', noFollow ? 'nofollow' : 'follow'].join(', ')}">`,
    `<meta property="og:type" content="${isArticle ? 'article' : 'website'}">`,
    `<meta property="og:title" content="${esc(fullTitle)}">`,
    description && `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(pageUrl)}">`,
    siteName && `<meta property="og:site_name" content="${esc(siteName)}">`,
    image && `<meta property="og:image" content="${esc(image)}">`,
    image && `<meta property="og:image:secure_url" content="${esc(image)}">`,
    // No og:image:width/height: the renderer does not know the image's size,
    // and it used to claim 1200x630 for every image — a product render or a
    // portrait photo too. A wrong size is worse than none: crawlers read the
    // file when the size is absent.
    `<meta name="twitter:card" content="${twitterCard}">`,

    `<meta name="twitter:title" content="${esc(fullTitle)}">`,
    description && `<meta name="twitter:description" content="${esc(description)}">`,
    image && `<meta name="twitter:image" content="${esc(image)}">`,
    twitter && `<meta name="twitter:site" content="${esc(twitter)}">`,
    `<link rel="canonical" href="${esc(canonicalUrl || pageUrl)}">`,
    // Samma adressform som sidhuvudet och sitemapen: standardspråket på
    // roten, andra språk som /lang/<basslugg> — via samma pagePath.
    ...(siblings.length > 1
      ? (() => {
          const langs = (byKeyOuter.site_languages || {}) as { default?: string };
          const defaultLang = String(langs.default ?? 'en');
          const homepageSlug = String((byKeyOuter.general || {}).homepageSlug || 'home');
          const baseSlug = siblings.find(
            (s: any) => String(s.locale ?? '').toLowerCase().split('-')[0] === defaultLang.toLowerCase().split('-')[0],
          )?.slug ?? null;
          return siblings
            .filter((s: any) => s?.slug && s?.locale)
            .map((s: any) => {
              const p = pagePath({
                slug: String(s.slug), locale: String(s.locale),
                defaultLanguage: defaultLang, baseSlug, homepageSlug,
              });
              return `<link rel="alternate" hreflang="${esc(String(s.locale).toLowerCase())}" `
                + `href="${esc(p === '/' ? `${origin}/` : `${origin}${p}`)}">`;
            });
        })()
      : []),
  ]
    .filter(Boolean)
    .join('\n    ');

  const html = `<!doctype html>
<html lang="${esc(pageLocale || 'en')}">
  <head>
    <meta charset="utf-8">
    ${tags}
  </head>
  <body>
    <h1>${esc(fullTitle)}</h1>
    ${description ? `<p>${esc(description)}</p>` : ''}
    <p><a href="${esc(pageUrl)}">${esc(pageUrl)}</a></p>
  </body>
</html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=300',
    },
  });
}
