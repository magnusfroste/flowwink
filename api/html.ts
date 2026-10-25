/* eslint-disable @typescript-eslint/no-explicit-any -- prerender reads dynamic, loosely-typed PostgREST JSON */
export const config = { runtime: 'edge' };

import { blogPostPath, pagePath, postAlternates, postVersions, splitLanguagePrefix } from '../src/lib/language-path';
import { resolveOgImage } from '../src/lib/og-card';
import { injectHead, shellCacheControl } from '../src/lib/seo-shell';

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
 * The HTML document for every page navigation — ONE document for every reader.
 *
 * Vercel rewrites every non-asset, non-API path here (vercel.json). Until
 * 2026-10-04 only a hand-listed set of social and AI crawlers were routed here
 * and got a tiny prerendered head; browsers, Googlebot, Bingbot, curl and an
 * operator's own check got the static `index.html` and read "Website" (Hermes
 * on synclairvision, #625). A User-Agent list is a guard that enumerates: every
 * reader it does not name sees the wrong title.
 *
 * Now the function fetches the shell the build produced (`/index.html`, served
 * statically), fills its <head> with the CUSTOMER's title, description, OG and
 * Twitter meta, canonical and hreflang for the requested page, and returns the
 * real SPA. The SPA hydrates on top; the injected tags carry `data-rh` so
 * react-helmet-async reconciles them instead of adding a second set.
 *
 * Caching follows the Performance → Edge caching dial exactly like get-page
 * does (see shellCacheControl). Identity comes from the same Supabase the Vite
 * build points at (site_settings seo/general/branding/site_languages/
 * performance + per-page pages/blog_posts/kb_articles) — no new configuration.
 * If the shell cannot be fetched (preview protection, a cold miss during a
 * deploy) the function answers with a minimal head-only document, the old
 * behaviour, so a crawler still gets the right title.
 */

/** Browser hardening every HTML response carries (mirrors vercel.json → routes[0].headers). */
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(self), microphone=(self), geolocation=(), payment=(self)',
} as const;

/** The build's index.html, per isolate. A deployment is immutable, so one fetch per isolate suffices. */
let shellCache: { html: string; at: number } | null = null;
const SHELL_TTL_MS = 10 * 60 * 1000;

async function loadShell(origin: string, req: Request): Promise<string | null> {
  if (shellCache && Date.now() - shellCache.at < SHELL_TTL_MS) return shellCache.html;
  try {
    // `/index.html` has an extension, so vercel.json serves it from the
    // filesystem — this never re-enters the function. On a protected preview
    // deployment the static file sits behind Vercel's login too, so the
    // visitor's own credentials travel with the fetch: their cookie and the
    // automation bypass header. Production has no protection and sends neither.
    const headers: Record<string, string> = { accept: 'text/html' };
    for (const h of ['cookie', 'x-vercel-protection-bypass', 'x-vercel-set-bypass-cookie']) {
      const v = req.headers.get(h);
      if (v) headers[h] = v;
    }
    const r = await fetch(`${origin}/index.html`, { headers, redirect: 'manual' });
    if (!r.ok) return null;
    const html = await r.text();
    if (!/<title>[^<]*<\/title>/.test(html) || !/id="root"/.test(html)) return null;
    shellCache = { html, at: Date.now() };
    return html;
  } catch {
    return null;
  }
}

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
  // A blog post's language versions, as ready <link rel=alternate> pairs.
  let blogAlternates: Array<{ hreflang: string; href: string }> = [];
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
  let favicon = '';
  let twitter = '';
  let titleTemplate = '%s';
  let isArticle = false;
  let noIndex = false;
  let noFollow = false;

  if (base && key) {
    const settings = await pg(base, key, 'site_settings?key=in.(seo,general,branding,site_languages,performance)&select=key,value');
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
    favicon = typeof branding.favicon === 'string' ? branding.favicon.trim() : '';
    twitter = seo.twitterHandle || '';
    titleTemplate = seo.titleTemplate || '%s';

    const langs = (byKey.site_languages || {}) as { default?: string; enabled?: string[] };
    const split = splitLanguagePrefix(path, langs.enabled ?? [], String(langs.default ?? 'en'));
    requestedLang = split.lang;


    // /blog/<slug> in the site language, /<lang>/blog/<slug> in the others (§9).
    const blogRest = requestedLang !== null ? split.rest : path;
    const blog = blogRest.match(/^\/blog\/(.+)$/);
    // /sv/blog and its lists are Swedish whatever they contain.
    if (requestedLang && /^\/blog(\/|$)/.test(blogRest)) pageLocale = requestedLang;
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
      const defaultLang = String(langs.default ?? 'en').toLowerCase();
      const lang = requestedLang ?? defaultLang;
      const slug = encodeURIComponent(decodeURIComponent(blog[1]));
      const cols = 'id,slug,title,excerpt,featured_image,meta_json,locale';
      let [post] = await pg(base, key, `blog_posts?slug=eq.${slug}&status=eq.published&select=${cols}&limit=1`);
      // An instance without blog_posts.locale yet: the post as written, as before.
      if (!post) [post] = await pg(base, key, `blog_posts?slug=eq.${slug}&status=eq.published&select=title,excerpt,featured_image&limit=1`);
      // An overlay's own slug names the post — /sv/blog/<svensk-slug>, and
      // /blog/<english-slug> too when the post was written in Swedish: the
      // site language has no prefix, so `requestedLang` is null there.
      if (!post) {
        const [hit] = await pg(base, key, `content_translations?entity=eq.blog_post&locale=eq.${encodeURIComponent(lang)}&slug=eq.${slug}&status=eq.published&select=entity_id&limit=1`);
        if (hit?.entity_id) [post] = await pg(base, key, `blog_posts?id=eq.${encodeURIComponent(String(hit.entity_id))}&status=eq.published&select=${cols}&limit=1`);
      }
      if (post) {
        const m = { ...((post.meta_json || {}) as Record<string, unknown>) };
        let postTitle = post.title as string | undefined;
        let postExcerpt = post.excerpt as string | undefined;
        if (post.id) {
          const own = String(post.locale ?? defaultLang).toLowerCase();
          const overlays = await pg(base, key, `content_translations?entity=eq.blog_post&entity_id=eq.${encodeURIComponent(String(post.id))}&status=eq.published&select=locale,slug,strings`);
          const versions = postVersions({ slug: String(post.slug), locale: own, title: postTitle }, overlays, defaultLang);
          blogAlternates = postAlternates(versions, defaultLang, origin);
          const here = versions.find((v) => v.locale === lang);
          if (here) {
            pageLocale = here.locale;
            canonicalUrl = `${origin}${blogPostPath(here.slug, here.locale, defaultLang)}`;
            if (here.source === 'overlay') {
              // The overlay's text wins where it has it; a missing unit shows the source.
              const strings = (overlays.find((o) => o.locale === lang)?.strings ?? {}) as Record<string, { text?: string }>;
              const t = (k: string) => strings[k]?.text?.trim() || '';
              if (t('post.title')) postTitle = t('post.title');
              if (t('post.excerpt')) postExcerpt = t('post.excerpt');
              if (t('post.meta.seoTitle')) m.seoTitle = t('post.meta.seoTitle');
              if (t('post.meta.description')) m.description = t('post.meta.description');
            }
          } else {
            // Not in this language: the post's own address is the canonical one.
            pageLocale = own;
            canonicalUrl = `${origin}${blogPostPath(String(post.slug), own, defaultLang)}`;
          }
        }
        if (postTitle) title = postTitle;
        if (typeof m.seoTitle === 'string' && m.seoTitle.trim()) title = m.seoTitle.trim();
        description = (m.description as string) || postExcerpt || description;
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
        `pages?slug=eq.${slug}&status=eq.published&select=id,slug,title,meta_json,locale,translation_group_id&limit=1`,
      );
      // Överläggsmodellen (page_translations): sidan i ett annat språk utan
      // egen rad. Prefix begärt och ingen syskonrad → titel, meta och språk ur
      // det publicerade överlägget; alternativen är sidan + dess överlägg.
      let overlayText: Record<string, { text?: string }> | null = null;
      if (page && requestedLang && String(page.locale ?? '').toLowerCase() !== requestedLang && !page.translation_group_id) {
        const [ov] = await pg(
          base,
          key,
          `page_translations?page_id=eq.${encodeURIComponent(String(page.id))}&locale=eq.${encodeURIComponent(requestedLang)}&status=eq.published&select=locale,strings&limit=1`,
        );
        if (ov?.strings) {
          overlayText = ov.strings as Record<string, { text?: string }>;
          const all = await pg(
            base,
            key,
            `page_translations?page_id=eq.${encodeURIComponent(String(page.id))}&status=eq.published&select=locale`,
          );
          siblings = [{ slug: page.slug, locale: page.locale }, ...all.map((x: any) => ({ slug: page.slug, locale: x.locale }))];
          const p2 = pagePath({ slug: String(page.slug), locale: requestedLang, defaultLanguage: defaultLang, baseSlug: String(page.slug), homepageSlug });
          canonicalUrl = p2 === '/' ? `${origin}/` : `${origin}${p2}`;
          pageLocale = requestedLang;
        }
      }
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
        if (page.locale && !overlayText) pageLocale = String(page.locale);

        const m = { ...((page.meta_json || {}) as Record<string, unknown>) };
        if (overlayText) {
          // Överläggets text vinner där den finns; saknad enhet visar källan.
          const t = (k: string) => overlayText?.[k]?.text?.trim() || '';
          if (t('page.title')) title = t('page.title');
          if (t('page.meta.seoTitle')) m.seoTitle = t('page.meta.seoTitle');
          if (t('page.meta.description')) m.description = t('page.meta.description');
          if (t('page.meta.seoDescription')) m.seoDescription = t('page.meta.seoDescription');
          if (t('page.meta.metaDescription')) m.metaDescription = t('page.meta.metaDescription');
        }
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
  // No explicit image anywhere → the DERIVED card (api/og), drawn from the
  // brand dials and the page's own title and picture. The logo-only
  // "summary" card is what a site got before 2026-10-21; it stays as the
  // fallback only when the derived card cannot be addressed (no origin).
  if (!image && origin) image = resolveOgImage(null, origin, path);
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
    ...blogAlternates.map((a) => `<link rel="alternate" hreflang="${esc(a.hreflang)}" href="${esc(a.href)}">`),
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
  ].filter((t): t is string => typeof t === 'string' && t.length > 0);

  const cacheControl = shellCacheControl((byKeyOuter.performance || null) as { enableEdgeCaching?: boolean; edgeCacheTtlMinutes?: number } | null);
  const headers = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': cacheControl,
    // One document per URL, whoever asks — nothing varies by User-Agent any more.
    'x-flowwink-shell': 'injected',
    // The same four headers vercel.json sets on every route; the Docker nginx has
    // had them since day one, Vercel sent only HSTS (sweep 2026-10-22).
    ...SECURITY_HEADERS,
  };

  const shell = await loadShell(origin, req);
  if (shell) {
    try {
      return new Response(injectHead(shell, { tags, lang: pageLocale || null, icon: favicon || null }), { headers });
    } catch {
      // fall through to the head-only document
    }
  }

  // Last resort (shell unreachable): the head alone, as the social prerender
  // always answered. A crawler still reads the right title; a browser gets a
  // link to reload — a deploy-time blip, not the steady state.
  const html = `<!doctype html>
<html lang="${esc(pageLocale || 'en')}">
  <head>
    <meta charset="utf-8">
    ${tags.join('\n    ')}
  </head>
  <body>
    <h1>${esc(fullTitle)}</h1>
    ${description ? `<p>${esc(description)}</p>` : ''}
    <p><a href="${esc(pageUrl)}">${esc(pageUrl)}</a></p>
  </body>
</html>`;
  return new Response(html, { headers: { ...headers, 'x-flowwink-shell': 'head-only', 'cache-control': 'public, max-age=0, s-maxage=30' } });
}
