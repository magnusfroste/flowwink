import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient } from '../_shared/supabase-clients.ts';

/**
 * Web Scrape — Modular integration skill
 * 
 * Scrapes a single URL and returns its content as markdown.
 * Provider priority: Firecrawl (if key available) → Jina Reader
 * Jina: free tier first (if preferFreeTier), then API key, then keyless fallback
 * 
 * Used by: prospect-research orchestrator, FlowPilot directly, content research
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface WebScrapeInput {
  url: string;
  max_length?: number;
  formats?: string[];
  preferred_provider?: 'firecrawl' | 'jina' | 'auto';
  /** 'scrape' (default) = one page to markdown. 'map' = discover a site's URLs. */
  mode?: 'scrape' | 'map';
  /** map only: narrow the URL set (Firecrawl `search`). */
  search?: string;
  /** map only: cap the number of URLs returned. */
  limit?: number;
}

// ── map mode ────────────────────────────────────────────────────────────────
// Absorbs the deleted `firecrawl-map` function (removed in the edge-surface
// consolidation while two callers still invoked it → both 404'd: the Copilot
// "discover pages" flow and siteMigration's `discover` action).
//
// Provider chain mirrors scrape mode: Firecrawl /v1/map when a key is available,
// otherwise a keyless sitemap.xml walk — so discovery degrades instead of
// gating on a paid key (Law 4).

interface DiscoveredPage {
  url: string;
  path: string;
  slug: string;
  suggestedName: string;
  suggestedType: 'page' | 'blog' | 'kb' | 'skip';
  selected: boolean;
  source: 'firecrawl-map' | 'sitemap';
}

/** URL-path heuristics — the same buckets the migration UI offers. */
function classifyPath(path: string): 'page' | 'blog' | 'kb' | 'skip' {
  const p = path.toLowerCase();
  if (
    /\.(xml|json|pdf|jpe?g|png|gif|svg|webp|ico|css|js|zip|mp4)$/.test(p) ||
    /(^|\/)(wp-admin|wp-content|wp-json|cart|checkout|account|login|signin|signup|register|cdn-cgi)(\/|$)/.test(p) ||
    /(^|\/)(tag|tags|category|categories|author|feed|rss|search)(\/|$)/.test(p) ||
    /\/page\/\d+\/?$/.test(p)
  ) return 'skip';
  if (/(^|\/)(blog|news|nyheter|article|articles|post|posts|insights|stories)(\/|$)/.test(p)) return 'blog';
  if (/(^|\/)(help|support|docs?|kb|knowledge|knowledgebase|faq|guides?|manual)(\/|$)/.test(p)) return 'kb';
  return 'page';
}

/** "/our-team/leadership" → "Leadership"; "/" → "Home". */
function suggestName(path: string): string {
  const seg = path.split('/').filter(Boolean).pop();
  if (!seg) return 'Home';
  return seg
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Extract <loc> URLs, following one level of sitemap-index nesting. */
async function urlsFromSitemap(origin: string, limit: number): Promise<string[]> {
  const seen = new Set<string>();
  const readLocs = async (sitemapUrl: string): Promise<string[]> => {
    try {
      const res = await fetch(sitemapUrl, { headers: { 'User-Agent': 'FlowWink/1.0 (+site-discovery)' } });
      if (!res.ok) return [];
      const xml = await res.text();
      return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
    } catch {
      return [];
    }
  };

  const top = await readLocs(`${origin}/sitemap.xml`);
  const nested = top.filter((u) => /sitemap.*\.xml$/i.test(u));
  const direct = top.filter((u) => !/sitemap.*\.xml$/i.test(u));
  for (const u of direct) seen.add(u);

  // Sitemap index → walk a bounded number of child sitemaps.
  for (const child of nested.slice(0, 5)) {
    if (seen.size >= limit) break;
    for (const u of await readLocs(child)) {
      if (!/sitemap.*\.xml$/i.test(u)) seen.add(u);
      if (seen.size >= limit) break;
    }
  }
  return [...seen].slice(0, limit);
}

/** One cheap homepage fetch → site name + CMS/commerce platform signature. */
async function detectSite(origin: string): Promise<{ siteName: string; platform: string }> {
  const host = (() => { try { return new URL(origin).hostname.replace(/^www\./, ''); } catch { return origin; } })();
  try {
    const res = await fetch(origin, { headers: { 'User-Agent': 'FlowWink/1.0 (+site-discovery)' } });
    if (!res.ok) return { siteName: host, platform: 'unknown' };
    const html = (await res.text()).slice(0, 200_000);
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
    // Match ASSET/SCRIPT signatures, never the bare brand word: stripe.com names
    // "WooCommerce" in its integrations copy and was misdetected as WooCommerce —
    // which matters, because the caller AUTO-ENABLES modules from this value.
    // Order matters: WooCommerce is WordPress, so test the more specific one first.
    const platform =
      /wp-content\/plugins\/woocommerce|woocommerce\/assets|wc-ajax=/i.test(html) ? 'woocommerce'
      : /\/wp-content\/|\/wp-includes\/|\/wp-json/i.test(html) ? 'wordpress'
      : /cdn\.shopify\.com|Shopify\.theme|myshopify\.com/i.test(html) ? 'shopify'
      : /static\.wixstatic\.com|static\.parastorage\.com/i.test(html) ? 'wix'
      : /static1\.squarespace\.com|squarespace\.com\/universal/i.test(html) ? 'squarespace'
      : /assets\.website-files\.com|assets-global\.website-files\.com|webflow\.js/i.test(html) ? 'webflow'
      : /js\.hs-scripts\.com|js\.hsforms\.net|hs-analytics\.net/i.test(html) ? 'hubspot'
      : 'unknown';
    // Home titles are "Brand | tagline" (Stripe) or "tagline - Brand" (Vercel) —
    // the brand sits on either side, but is reliably the SHORTEST part once
    // generic page words are dropped. (Verified against real titles; picking the
    // longest part gets both of those wrong.)
    const GENERIC = /^(home|start|startsida|welcome|index|website|home ?page)$/i;
    // Titles arrive HTML-escaped ("WordPress News &#8211; …"): decode first, or the
    // separator hides inside an entity and the raw entity leaks into the UI.
    const decoded = (title ?? '')
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
    const parts = decoded
      .split(/\s[|—–·-]\s/)
      .map((s) => s.trim())
      .filter((s) => s && !GENERIC.test(s));
    // Nothing but generic words (a literal "Website" title) → the hostname says more.
    const siteName = parts.length
      ? parts.sort((a, b) => a.length - b.length)[0]
      : host;
    return { siteName, platform };
  } catch {
    return { siteName: host, platform: 'unknown' };
  }
}

async function mapSite(
  input: { url: string; search?: string; limit: number },
  firecrawlKey: string | undefined,
  firecrawlEnabled: boolean,
): Promise<Response> {
  const { url, search, limit } = input;
  const origin = (() => { try { return new URL(url).origin; } catch { return url.replace(/\/+$/, ''); } })();

  let links: string[] = [];
  let provider = 'none';

  if (firecrawlKey && firecrawlEnabled) {
    try {
      const res = await fetch('https://api.firecrawl.dev/v1/map', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, ...(search ? { search } : {}), limit }),
      });
      if (res.ok) {
        const data = await res.json();
        const raw = data.links ?? data.data ?? [];
        links = (Array.isArray(raw) ? raw : [])
          .map((l: unknown) => (typeof l === 'string' ? l : (l as { url?: string })?.url))
          .filter((l: unknown): l is string => typeof l === 'string' && !!l);
        if (links.length) provider = 'firecrawl';
      } else {
        console.warn('[web-scrape:map] Firecrawl map failed:', res.status);
      }
    } catch (e) {
      console.warn('[web-scrape:map] Firecrawl map error:', e);
    }
  }

  if (!links.length) {
    console.log('[web-scrape:map] Falling back to sitemap.xml for:', origin);
    links = await urlsFromSitemap(origin, limit);
    if (links.length) provider = 'sitemap';
    // `search` has no server-side equivalent in the sitemap path — filter here so
    // the caller's narrowing still applies regardless of which provider answered.
    if (search) {
      const needle = search.toLowerCase();
      links = links.filter((l) => l.toLowerCase().includes(needle));
    }
  }

  const { siteName, platform } = await detectSite(origin);

  const pages: DiscoveredPage[] = links.map((link) => {
    let path = '/';
    try { path = new URL(link).pathname || '/'; } catch { /* keep '/' */ }
    const suggestedType = classifyPath(path);
    return {
      url: link,
      path,
      slug: path.split('/').filter(Boolean).pop() || 'home',
      suggestedName: suggestName(path),
      suggestedType,
      selected: suggestedType !== 'skip',
      source: provider === 'firecrawl' ? 'firecrawl-map' : 'sitemap',
    };
  });

  const stats = {
    total: pages.length,
    pages: pages.filter((p) => p.suggestedType === 'page').length,
    blog: pages.filter((p) => p.suggestedType === 'blog').length,
    kb: pages.filter((p) => p.suggestedType === 'kb').length,
    skip: pages.filter((p) => p.suggestedType === 'skip').length,
    selected: pages.filter((p) => p.selected).length,
  };

  console.log(`[web-scrape:map] ${pages.length} URLs via ${provider} (${stats.selected} pre-selected)`);

  return new Response(JSON.stringify({
    success: pages.length > 0,
    mode: 'map',
    provider,
    baseUrl: origin,
    siteName,
    platform,
    links,   // flat URL list — siteMigration's `discover` action reads this
    pages,   // classified — the Copilot discovery UI reads this
    stats,
    ...(pages.length ? {} : { error: 'No URLs discovered (no Firecrawl key and no reachable sitemap.xml)' }),
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function getIntegrationConfig(): Promise<{
  preferFreeTier: boolean;
  firecrawlEnabled: boolean;
  /** Provider order from admin priority (firecrawl + jina only — searxng is search-only). */
  providerOrder: Array<'firecrawl' | 'jina'>;
}> {
  const DEFAULT_PRIORITY = { firecrawl: 2, jina: 3 };
  try {
    const sb = getServiceClient();
    const { data } = await sb
      .from('site_settings')
      .select('value')
      .eq('key', 'integrations')
      .maybeSingle();
    const jina = data?.value?.jina;
    const firecrawl = data?.value?.firecrawl;
    const priorities = {
      firecrawl: Number(firecrawl?.config?.priority) || DEFAULT_PRIORITY.firecrawl,
      jina: Number(jina?.config?.priority) || DEFAULT_PRIORITY.jina,
    };
    const providerOrder = (Object.keys(priorities) as Array<'firecrawl' | 'jina'>)
      .sort((a, b) => priorities[a] - priorities[b]);
    return {
      preferFreeTier: jina?.config?.preferFreeTier ?? true,
      firecrawlEnabled: firecrawl?.enabled !== false,
      providerOrder,
    };
  } catch {
    return { preferFreeTier: true, firecrawlEnabled: true, providerOrder: ['firecrawl', 'jina'] };
  }
}

async function jinaReader(url: string, maxLength: number, apiKey?: string): Promise<{ content: string, metadata: Record<string, unknown>, ok: boolean }> {
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  try {
    const res = await fetch(`https://r.jina.ai/${url}`, { headers });
    if (res.ok) {
      const data = await res.json();
      const content = (data.data?.content || '').substring(0, maxLength);
      const metadata = { title: data.data?.title, url: data.data?.url };
      return { content, metadata, ok: true };
    }
    console.warn(`[web-scrape] Jina ${apiKey ? 'authenticated' : 'keyless'} failed:`, res.status);
    return { content: '', metadata: {}, ok: false };
  } catch (e) {
    console.warn(`[web-scrape] Jina ${apiKey ? 'authenticated' : 'keyless'} error:`, e);
    return { content: '', metadata: {}, ok: false };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      url, max_length = 10000, formats = ['markdown'], preferred_provider = 'auto',
      mode = 'scrape', search, limit = 100,
    } = await req.json() as WebScrapeInput;

    if (!url) {
      return new Response(JSON.stringify({ success: false, error: 'url is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    const jinaKey = Deno.env.get('JINA_API_KEY');

    if (mode === 'map') {
      const cfg = await getIntegrationConfig();
      return await mapSite(
        { url, search, limit: Math.min(Math.max(Number(limit) || 100, 1), 1000) },
        firecrawlKey,
        cfg.firecrawlEnabled,
      );
    }
    let content = '';
    let metadata: Record<string, unknown> = {};
    let provider = 'none';

    const integrationConfig = await getIntegrationConfig();
    const firecrawlAvailable = !!firecrawlKey && integrationConfig.firecrawlEnabled;

    // Resolve provider chain: explicit preferred_provider wins; otherwise sort by
    // admin-configured priority and skip providers that aren't available.
    let chain: Array<'firecrawl' | 'jina'>;
    if (preferred_provider !== 'auto') {
      chain = [preferred_provider as 'firecrawl' | 'jina'];
    } else {
      chain = integrationConfig.providerOrder.filter((p) => {
        if (p === 'firecrawl') return firecrawlAvailable;
        return true; // jina has keyless fallback, always reachable
      });
    }

    for (const candidate of chain) {
      if (content) break;

      if (candidate === 'firecrawl' && firecrawlKey) {
        console.log('[web-scrape] Trying Firecrawl for:', url);
        try {
          const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, formats, onlyMainContent: true }),
          });
          if (res.ok) {
            const data = await res.json();
            content = (data.data?.markdown || data.markdown || '').substring(0, max_length);
            metadata = data.data?.metadata || data.metadata || {};
            if (content) provider = 'firecrawl';
          } else {
            console.warn('[web-scrape] Firecrawl failed:', res.status);
          }
        } catch (e) {
          console.warn('[web-scrape] Firecrawl error:', e);
        }
      }

      if (candidate === 'jina') {
        const { preferFreeTier } = integrationConfig;
        if (preferFreeTier) {
          console.log('[web-scrape] Trying Jina Reader (keyless) for:', url);
          const keyless = await jinaReader(url, max_length);
          if (keyless.ok && keyless.content) {
            content = keyless.content; metadata = keyless.metadata; provider = 'jina-free';
          } else if (jinaKey) {
            console.log('[web-scrape] Keyless failed, using Jina API key');
            const authed = await jinaReader(url, max_length, jinaKey);
            if (authed.ok) { content = authed.content; metadata = authed.metadata; provider = 'jina-api'; }
          }
        } else if (jinaKey) {
          console.log('[web-scrape] Trying Jina Reader (API key) for:', url);
          const authed = await jinaReader(url, max_length, jinaKey);
          if (authed.ok) { content = authed.content; metadata = authed.metadata; provider = 'jina-api'; }
        } else {
          console.log('[web-scrape] Trying Jina Reader (keyless fallback) for:', url);
          const keyless = await jinaReader(url, max_length);
          if (keyless.ok) { content = keyless.content; metadata = keyless.metadata; provider = 'jina-free'; }
        }
      }
    }


    console.log(`[web-scrape] Scraped ${content.length} chars via ${provider}`);

    return new Response(JSON.stringify({
      success: !!content,
      provider,
      content,
      metadata,
      url,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[web-scrape] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
