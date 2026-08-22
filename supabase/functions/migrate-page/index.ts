import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.87.1';
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { BLOCK_TYPES_SCHEMA } from '../_shared/block-schema.ts';
import { generateBrandingHints, extractBranding, type FirecrawlBranding } from '../_shared/extract-branding.ts';
import { resolveAiConfig } from '../_shared/ai-config.ts';
import { isOpenAiReasoningModel } from '../_shared/ai-providers.ts';
import { logAiUsage } from '../_shared/ai-usage-logger.ts';
import {
  TIPTAP_FIELDS,
  normalizeBlockData,
  applyIconFallbacks,
  validateBlockContracts,
  stripRemovedBlocks,
} from '../_shared/normalize-blocks.ts';
import {
  detectPlatform, extractVideos, extractLottieAnimations, extractSvgAnimations,
  extractImagesFromHtml, extractNavLinks, shouldExcludeUrl, fetchSitemap, categorizeUrl,
} from '../_shared/site-scrape.ts';
import {
  assessRender, buildPageObservation, buildSiteSurvey, siteNameFrom,
  type RenderReport, type RenderStrategy,
} from '../_shared/site-sensor.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Analyze full site structure
async function analyzeSiteStructure(url: string, firecrawlKey: string): Promise<{
  siteName: string;
  platform: string;
  baseUrl: string;
  pages: { url: string; title: string; type: 'page' | 'blog' | 'kb'; source: 'nav' | 'sitemap' }[];
  navigation: { label: string; url: string }[];
  hasBlog: boolean;
  hasKnowledgeBase: boolean;
}> {
  // Get base URL
  const urlObj = new URL(url);
  const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
  
  // Fetch homepage to get navigation
  const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${firecrawlKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: baseUrl,
      formats: ['html', 'rawHtml'],
      onlyMainContent: false,
      waitFor: 1000,
    }),
    signal: AbortSignal.timeout(15000),
  });
  
  const scrapeData = await scrapeResponse.json();
  const html = scrapeData.data?.rawHtml || scrapeData.data?.html || '';
  const metadata = scrapeData.data?.metadata || {};
  
  // Detect platform
  const platform = detectPlatform(html, metadata);
  
  // Extract navigation links
  const navLinks = extractNavLinks(html, baseUrl);
  
  // Fetch sitemap
  const sitemapPages = await fetchSitemap(baseUrl);
  
  // Combine and deduplicate (normalize URLs)
  type PageEntry = { url: string; title: string; type: 'page' | 'blog' | 'kb'; source: 'nav' | 'sitemap' };
  const allPages = new Map<string, PageEntry>();
  
  // Helper to normalize URL (remove trailing slash, query params, anchors)
  const normalizeUrl = (url: string): string => {
    try {
      const u = new URL(url);
      // Remove query params and hash
      u.search = '';
      u.hash = '';
      // Normalize trailing slash
      let path = u.pathname;
      if (path.length > 1 && path.endsWith('/')) {
        path = path.slice(0, -1);
      }
      u.pathname = path;
      return u.href;
    } catch {
      return url;
    }
  };
  
  // Helper to extract slug from URL
  const getSlug = (url: string): string => {
    const normalized = normalizeUrl(url);
    const pathParts = normalized.replace(baseUrl, '').split('/').filter(Boolean);
    return pathParts[pathParts.length - 1]?.toLowerCase() || 'home';
  };
  
  // Track seen slugs to detect near-duplicates
  const seenSlugs = new Map<string, string>(); // slug -> first URL
  
  // Add navigation links first (higher priority) - use platform for categorization
  // Sort by source priority: nav > header > footer
  const sortedNavLinks = [...navLinks].sort((a, b) => {
    const priority = { nav: 0, header: 1, footer: 2 };
    return priority[a.source] - priority[b.source];
  });
  
  for (const link of sortedNavLinks) {
    // Skip if URL should be excluded
    if (shouldExcludeUrl(link.url, baseUrl)) continue;
    
    const normalizedUrl = normalizeUrl(link.url);
    const type = categorizeUrl(link.url, baseUrl, platform);
    const slug = getSlug(link.url);
    
    // Skip if we already have this exact URL or slug
    if (allPages.has(normalizedUrl) || seenSlugs.has(slug)) continue;
    
    allPages.set(normalizedUrl, { url: normalizedUrl, title: link.label, type, source: 'nav' });
    seenSlugs.set(slug, normalizedUrl);
  }
  
  // Add sitemap pages (limit to reasonable count for migration)
  const MAX_SITEMAP_PAGES = 50;
  let sitemapCount = 0;
  
  for (const page of sitemapPages) {
    if (sitemapCount >= MAX_SITEMAP_PAGES) break;
    
    // Skip if URL should be excluded
    if (shouldExcludeUrl(page.url, baseUrl)) continue;
    
    const normalizedUrl = normalizeUrl(page.url);
    const slug = getSlug(page.url);
    
    // Skip if we already have this exact URL or slug (near-duplicate)
    if (allPages.has(normalizedUrl) || seenSlugs.has(slug)) continue;
    
    const type = categorizeUrl(page.url, baseUrl, platform);
    const title = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Home';
    
    allPages.set(normalizedUrl, { url: normalizedUrl, title, type, source: 'sitemap' });
    seenSlugs.set(slug, normalizedUrl);
    sitemapCount++;
  }
  
  // Always include homepage if not present
  const normalizedBaseUrl = normalizeUrl(baseUrl);
  const homeSlug = 'home';
  if (!allPages.has(normalizedBaseUrl) && !allPages.has(normalizedBaseUrl + '/') && !seenSlugs.has(homeSlug)) {
    allPages.set(normalizedBaseUrl, { url: normalizedBaseUrl, title: 'Home', type: 'page', source: 'nav' });
    seenSlugs.set(homeSlug, normalizedBaseUrl);
  }
  
  // Sort: homepage first, then navigation order, then sitemap
  const pages = Array.from(allPages.values()).sort((a, b) => {
    const normalizedBase = normalizeUrl(baseUrl);
    const aIsHome = a.url === normalizedBase || a.url === normalizedBase + '/' || 
                    a.title.toLowerCase() === 'home' || a.title.toLowerCase() === 'hem' ||
                    a.title.toLowerCase() === 'start' || a.title.toLowerCase() === 'startsida';
    const bIsHome = b.url === normalizedBase || b.url === normalizedBase + '/' || 
                    b.title.toLowerCase() === 'home' || b.title.toLowerCase() === 'hem' ||
                    b.title.toLowerCase() === 'start' || b.title.toLowerCase() === 'startsida';
    if (aIsHome && !bIsHome) return -1;
    if (!aIsHome && bIsHome) return 1;
    if (a.source === 'nav' && b.source === 'sitemap') return -1;
    if (a.source === 'sitemap' && b.source === 'nav') return 1;
    return 0;
  });
  
  console.log(`Site analysis: Found ${navLinks.length} nav links (nav/header/footer), ${sitemapPages.length} sitemap pages, filtered to ${pages.length} unique pages`);
  console.log(`Nav sources: ${navLinks.filter(l => l.source === 'nav').length} nav, ${navLinks.filter(l => l.source === 'header').length} header, ${navLinks.filter(l => l.source === 'footer').length} footer`);
  
  const hasBlog = pages.some(p => p.type === 'blog');
  const hasKnowledgeBase = pages.some(p => p.type === 'kb');
  
  return {
    siteName: metadata.title || urlObj.host,
    platform,
    baseUrl,
    pages,
    navigation: navLinks.map(l => ({ label: l.label, url: l.url })),
    hasBlog,
    hasKnowledgeBase,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { url, action } = body;

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Backend environment is not configured (missing service credentials).' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const supabase = getServiceClient();

    // NOTE: migrate-page intentionally keeps Firecrawl-first ordering regardless
    // of the SearXNG/Firecrawl/Jina priority in site_settings. Site migration
    // requires the `branding` format + screenshots + full rawHtml, all of which
    // are Firecrawl-only capabilities. Jina is used as last-resort fallback for
    // text-only scraping when Firecrawl is unavailable or disabled.
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');

    // Check if Firecrawl is enabled in site_settings
    let firecrawlEnabled = true;
    try {
      const { data: intRow } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'integrations')
        .maybeSingle();
      if (intRow?.value?.firecrawl?.enabled === false) {
        firecrawlEnabled = false;
      }
    } catch { /* default to enabled */ }

    const useFirecrawl = !!firecrawlKey && firecrawlEnabled;

    // Jina Reader fallback for scraping
    async function jinaFallback(targetUrl: string): Promise<{ markdown: string; html: string; rawHtml: string; metadata: Record<string, unknown>; screenshot: string | null }> {
      const jinaKey = Deno.env.get('JINA_API_KEY');
      const headers: Record<string, string> = { 'Accept': 'application/json' };
      if (jinaKey) headers['Authorization'] = `Bearer ${jinaKey}`;

      console.log('[migrate-page] Using Jina Reader fallback for:', targetUrl);
      const res = await fetch(`https://r.jina.ai/${targetUrl}`, { headers });
      if (!res.ok) throw new Error(`Jina scrape failed: ${res.status}`);
      const data = await res.json();
      const content = data.data?.content || '';
      const title = data.data?.title || '';
      const pageUrl = data.data?.url || targetUrl;

      // Also fetch HTML for structure analysis
      let htmlContent = '';
      try {
        const htmlRes = await fetch(targetUrl, {
          headers: { 'User-Agent': 'FlowPilot-Bot/1.0' },
          signal: AbortSignal.timeout(10000),
        });
        if (htmlRes.ok) htmlContent = await htmlRes.text();
      } catch { /* HTML fetch optional */ }

      return {
        markdown: content,
        html: htmlContent,
        rawHtml: htmlContent,
        metadata: { title, url: pageUrl, description: '' },
        screenshot: null,
      };
    }

    // Handle site analysis action (works with Jina too — uses nav extraction from HTML)
    if (action === 'analyze-site') {
      console.log('Analyzing site structure for:', url);
      let formattedUrl = url.trim();
      if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
        formattedUrl = `https://${formattedUrl}`;
      }

      if (useFirecrawl) {
        const siteStructure = await analyzeSiteStructure(formattedUrl, firecrawlKey!);
        return new Response(JSON.stringify({ success: true, ...siteStructure }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        // Jina-based site analysis: fetch HTML directly and extract nav + sitemap
        const urlObj = new URL(formattedUrl);
        const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
        let htmlContent = '';
        let pageTitle = urlObj.host;
        try {
          const res = await fetch(baseUrl, { headers: { 'User-Agent': 'FlowPilot-Bot/1.0' }, signal: AbortSignal.timeout(10000) });
          if (res.ok) htmlContent = await res.text();
          const titleMatch = htmlContent.match(/<title[^>]*>([^<]+)<\/title>/i);
          if (titleMatch) pageTitle = titleMatch[1].trim();
        } catch { /* continue with what we have */ }

        const platform = detectPlatform(htmlContent, {});
        const navLinks = extractNavLinks(htmlContent, baseUrl);
        const sitemapPages = await fetchSitemap(baseUrl);

        // Combine and deduplicate
        const allPages = new Map<string, { url: string; title: string; type: 'page' | 'blog' | 'kb'; source: 'nav' | 'sitemap' }>();
        for (const link of navLinks) {
          if (shouldExcludeUrl(link.url, baseUrl)) continue;
          const type = categorizeUrl(link.url, baseUrl, platform);
          allPages.set(link.url, { url: link.url, title: link.label, type, source: 'nav' });
        }
        for (const page of sitemapPages.slice(0, 50)) {
          if (shouldExcludeUrl(page.url, baseUrl) || allPages.has(page.url)) continue;
          const type = categorizeUrl(page.url, baseUrl, platform);
          const slug = page.url.replace(baseUrl, '').split('/').filter(Boolean).pop() || 'home';
          allPages.set(page.url, { url: page.url, title: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), type, source: 'sitemap' });
        }

        const pages = Array.from(allPages.values());
        return new Response(JSON.stringify({
          success: true,
          siteName: pageTitle,
          platform,
          baseUrl,
          pages,
          navigation: navLinks.map(l => ({ label: l.label, url: l.url })),
          hasBlog: pages.some(p => p.type === 'blog'),
          hasKnowledgeBase: pages.some(p => p.type === 'kb'),
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // ─── SENSOR ACTIONS ────────────────────────────────────────────────────
    // survey + read report what a site CONTAINS. They run no model, write
    // nothing, and return no blocks — composition is the agent's job. See
    // _shared/site-sensor.ts for why the split exists.

    /**
     * The rendering ladder. A single Firecrawl pass with waitFor:1000 is what
     * made restagard.se's subpages come back as empty shells: the site paints
     * after load. So: try, measure, wait longer, and only then ask for a real
     * browser. Every rung is reported in render.strategy — a caller must always
     * be able to see HOW the page was read.
     */
    async function scrapeForSensor(targetUrl: string): Promise<{
      markdown: string; html: string; metadata: Record<string, unknown>;
      rawBranding: FirecrawlBranding | null; strategy: RenderStrategy; report: RenderReport;
    }> {
      const firecrawlPass = async (waitFor: number, strategy: RenderStrategy) => {
        const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${firecrawlKey!}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: targetUrl,
            formats: ['markdown', 'rawHtml', 'branding'],
            onlyMainContent: false,
            waitFor,
            excludeTags: ['script', 'noscript', 'style'],
          }),
          signal: AbortSignal.timeout(waitFor + 30000),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Firecrawl ${res.status}`);
        const d = data.data || data;
        const html = d.rawHtml || d.html || '';
        const markdown = d.markdown || '';
        return {
          markdown, html,
          metadata: (d.metadata || {}) as Record<string, unknown>,
          rawBranding: (d.branding || null) as FirecrawlBranding | null,
          strategy,
          report: assessRender(html, markdown, strategy),
        };
      };

      if (useFirecrawl) {
        try {
          const first = await firecrawlPass(1500, 'firecrawl');
          if (first.report.confidence !== 'shell') return first;
          // Rung 2: same scraper, longer paint window. Cheap, unattended, and
          // it fixes the common case (a framework that needs a second).
          console.log('[migrate-page] shell detected, retrying with a longer render wait');
          const second = await firecrawlPass(6000, 'firecrawl-retry');
          return second.report.text_chars > first.report.text_chars ? second : first;
        } catch (e) {
          console.warn('[migrate-page] Firecrawl failed, falling back to Jina:', e);
        }
      }

      let jina;
      try {
        jina = await jinaFallback(targetUrl);
      } catch (e) {
        // Name the rung that failed and what to do — a bare "429" tells an agent
        // nothing about whether to retry, slow down, or give up.
        const msg = e instanceof Error ? e.message : String(e);
        const rateLimited = /\b429\b/.test(msg);
        throw new Error(
          rateLimited
            ? `${msg}. The reader is rate-limiting this instance${useFirecrawl ? '' : ' (no FIRECRAWL_API_KEY configured, so there is no faster path)'}. Wait ~30s and read one page at a time, or supply a browser result via relay_result.`
            : `${msg}. Every server-side read strategy failed for this URL. Read it through a browser and pass the result back: migrate_url({url, action:'read', relay_result:{title, html, content}}).`,
        );
      }
      const html = jina.rawHtml || jina.html || '';
      return {
        markdown: jina.markdown, html,
        metadata: jina.metadata,
        rawBranding: null,
        strategy: 'jina',
        report: assessRender(html, jina.markdown, 'jina'),
      };
    }

    if (action === 'survey' || action === 'read') {
      let formattedUrl = url.trim();
      if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
        formattedUrl = `https://${formattedUrl}`;
      }

      // ── read: one page, observed ──
      if (action === 'read') {
        // A browser result handed back to us (the extension relay, or any agent
        // with a browser) skips the ladder entirely — it IS the top rung.
        const relay = body.relay_result;
        if (relay) {
          const html = relay.html || '';
          const markdown = relay.markdown || relay.content || '';
          return new Response(JSON.stringify({
            success: true,
            ...buildPageObservation({
              url: formattedUrl, html, markdown,
              metadata: { title: relay.title, description: relay.description },
              platform: detectPlatform(html, {}),
              strategy: 'relay',
              videos: extractVideos(html),
              siteName: body.site_name,
            }),
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const scraped = await scrapeForSensor(formattedUrl);
        const observation = buildPageObservation({
          url: formattedUrl,
          html: scraped.html,
          markdown: scraped.markdown,
          metadata: scraped.metadata,
          platform: detectPlatform(scraped.html, scraped.metadata),
          strategy: scraped.strategy,
          rawBranding: scraped.rawBranding,
          videos: extractVideos(scraped.html),
          siteName: body.site_name,
        });

        // Blind on this page. Speak the same envelope browser_fetch uses, so the
        // admin panel's extension relay picks it up without knowing what a
        // migration is — and an unattended agent still gets an honest refusal
        // plus whatever little we did see.
        if (observation.render.confidence === 'shell') {
          return new Response(JSON.stringify({
            success: false,
            action: 'relay_required',
            url: formattedUrl,
            message: observation.render.reason,
            relay_instruction: { type: 'navigate_and_scrape', url: formattedUrl },
            partial_observation: observation,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ success: true, ...observation }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ── survey: the whole site, inventoried ──
      const urlObj = new URL(formattedUrl);
      const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
      const home = await scrapeForSensor(baseUrl);
      const platform = detectPlatform(home.html, home.metadata);
      const navLinks = extractNavLinks(home.html, baseUrl);
      const sitemapPages = await fetchSitemap(baseUrl);

      const seen = new Map<string, { url: string; title: string; type: 'page' | 'blog' | 'kb'; source: 'nav' | 'sitemap' }>();
      for (const link of navLinks) {
        if (shouldExcludeUrl(link.url, baseUrl)) continue;
        seen.set(link.url, { url: link.url, title: link.label, type: categorizeUrl(link.url, baseUrl, platform), source: 'nav' });
      }
      for (const page of sitemapPages) {
        if (shouldExcludeUrl(page.url, baseUrl) || seen.has(page.url)) continue;
        const slug = page.url.replace(baseUrl, '').split('/').filter(Boolean).pop() || 'home';
        seen.set(page.url, {
          url: page.url,
          title: page.title || slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          type: categorizeUrl(page.url, baseUrl, platform),
          source: 'sitemap',
        });
      }

      const siteName = siteNameFrom(home.html, baseUrl);

      return new Response(JSON.stringify({
        success: true,
        ...buildSiteSurvey({
          baseUrl, siteName, platform,
          html: home.html, markdown: home.markdown, strategy: home.strategy,
          pages: Array.from(seen.values()),
          navigation: navLinks.map((l) => ({ label: l.label, url: l.url })),
          rawBranding: home.rawBranding,
        }),
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── COMPOSE (the original one-shot path) ──────────────────────────────
    // Resolve AI provider via unified Layer 1 config — reuse supabase client
    let aiConfig;
    try {
      aiConfig = await resolveAiConfig(supabase, 'reasoning');
    } catch {
      // Fallback: direct env resolution in case site_settings config is missing/corrupt
      const openaiKey = Deno.env.get('OPENAI_API_KEY');
      const geminiKey = Deno.env.get('GEMINI_API_KEY');
      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');

      if (openaiKey) {
        aiConfig = {
          apiKey: openaiKey,
          apiUrl: 'https://api.openai.com/v1/chat/completions',
          model: 'gpt-4.1',
        };
      } else if (geminiKey) {
        aiConfig = {
          apiKey: geminiKey,
          apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
          model: 'gemini-2.5-pro',
        };
      } else if (anthropicKey) {
        aiConfig = {
          apiKey: anthropicKey,
          apiUrl: 'https://api.anthropic.com/v1/messages',
          model: 'claude-sonnet-4-20250514',
        };
      } else {
        return new Response(
          JSON.stringify({ success: false, error: 'No AI provider configured. Add OPENAI_API_KEY, GEMINI_API_KEY, or configure AI in Settings.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('AI provider resolved:', { model: aiConfig.model, apiUrl: aiConfig.apiUrl.substring(0, 40) });

    // Format URL
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    // Step 1: Scrape URL — Firecrawl or Jina fallback
    let markdown = '';
    let html = '';
    let rawHtml = '';
    let screenshot: string | null = null;
    let metadata: Record<string, unknown> = {};
    let rawBranding: FirecrawlBranding = {};

    if (useFirecrawl) {
      console.log('Step 1: Scraping URL with Firecrawl:', formattedUrl);
      const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlKey!}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: formattedUrl,
          formats: ['markdown', 'html', 'rawHtml', 'branding'],
          onlyMainContent: false,
          waitFor: 1000,
          includeTags: ['main', 'article', 'section', 'header', 'footer', 'aside', 'figure', 'video', 'iframe'],
          excludeTags: ['script', 'noscript', 'style'],
        }),
        signal: AbortSignal.timeout(30000),
      });

      const scrapeData = await scrapeResponse.json();
      if (!scrapeResponse.ok) {
        console.warn('Firecrawl error, falling back to Jina:', scrapeData);
        // Fall through to Jina
        try {
          const jina = await jinaFallback(formattedUrl);
          markdown = jina.markdown; html = jina.html; rawHtml = jina.rawHtml;
          metadata = jina.metadata; screenshot = jina.screenshot;
        } catch (jinaErr) {
          return new Response(
            JSON.stringify({ success: false, error: `Could not scrape page: ${scrapeData.error || scrapeResponse.status}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        markdown = scrapeData.data?.markdown || scrapeData.markdown || '';
        html = scrapeData.data?.html || scrapeData.html || '';
        rawHtml = scrapeData.data?.rawHtml || scrapeData.rawHtml || html;
        screenshot = scrapeData.data?.screenshot || scrapeData.screenshot || null;
        metadata = scrapeData.data?.metadata || scrapeData.metadata || {};
        rawBranding = scrapeData.data?.branding || scrapeData.branding || {};
      }
    } else {
      console.log('Step 1: Scraping URL with Jina Reader:', formattedUrl);
      try {
        const jina = await jinaFallback(formattedUrl);
        markdown = jina.markdown; html = jina.html; rawHtml = jina.rawHtml;
        metadata = jina.metadata; screenshot = jina.screenshot;
      } catch (jinaErr) {
        return new Response(
          JSON.stringify({ success: false, error: `Could not scrape page: ${jinaErr instanceof Error ? jinaErr.message : 'Scraping failed'}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Extract branding data (rawBranding already set above — empty for Jina)
    const brandingHints = generateBrandingHints(rawBranding);
    const extractedBrand = Object.keys(rawBranding).length > 0 ? extractBranding(rawBranding) : null;

    console.log('Step 2: Scraped content - Markdown:', markdown.length, 'chars, HTML:', html.length, 'chars');
    console.log('Screenshot available:', !!screenshot);
    console.log('Branding extracted:', !!extractedBrand);
    console.log('Metadata:', JSON.stringify(metadata));

    // Detect platform
    const platform = detectPlatform(rawHtml, metadata);
    console.log('Detected platform:', platform);

    // Extract videos from HTML
    const extractedVideos = extractVideos(rawHtml);
    console.log('Extracted videos:', extractedVideos.length);

    // Extract images from HTML
    const extractedImages = extractImagesFromHtml(rawHtml);
    console.log('Extracted images:', extractedImages.length);

    // Extract Lottie animations
    const extractedLotties = extractLottieAnimations(rawHtml);
    console.log('Extracted Lottie animations:', extractedLotties.length);

    // Extract SVG animations
    const extractedSvgAnimations = extractSvgAnimations(rawHtml);
    console.log('Extracted SVG animations:', extractedSvgAnimations.length);

    // Step 2: Use AI to map content to blocks
    console.log('Step 3: Mapping content to CMS blocks with AI...');

    // Platform-specific prompts for specialized extraction
    const PLATFORM_PROMPTS: Record<string, string> = {
      wordpress: `=== WORDPRESS-SPECIFIC EXTRACTION ===
- Images in /wp-content/uploads/ - PRESERVE these URLs exactly
- Date URLs like /YYYY/MM/DD/slug/ are BLOG POSTS - not pages
- Look for content in .entry-content, .post-content, article classes
- Sidebar widgets (.widget, .sidebar) are NOT main content - IGNORE
- Cookie plugins (CookieLaw, TCKY, Complianz) - IGNORE COMPLETELY
- "Hej världen" / "Hello World" are default placeholder posts - mark as LOW_QUALITY
- "Powered by WordPress" footer - IGNORE
- Social sharing buttons and widgets - IGNORE
- Comment sections - IGNORE unless explicitly requested`,

      wix: `=== WIX-SPECIFIC EXTRACTION ===
- Content in [data-mesh-id] containers is main content
- Images often in static.wixstatic.com - PRESERVE URLs
- Sections use .section-* classes
- Strip/columns layouts are common - preserve structure
- Wix ads/branding - IGNORE
- Premium upgrade prompts - IGNORE
- Social bar widgets - typically IGNORE unless main feature`,

      squarespace: `=== SQUARESPACE-SPECIFIC EXTRACTION ===
- Sections in .page-section containers
- Images in images.squarespace-cdn.com - PRESERVE URLs  
- Block-based layouts (.sqs-block) - follow structure
- Gallery blocks have specific structure - create gallery blocks
- Squarespace badge/footer - IGNORE
- Social links bar - IGNORE unless primary content`,

      shopify: `=== SHOPIFY-SPECIFIC EXTRACTION ===
- Product pages have structured data - extract into products block
- Images in cdn.shopify.com - PRESERVE URLs
- Collection/product URLs are E-COMMERCE content
- Theme sections in .shopify-section
- Announcement bars → announcement-bar block
- Product grids → products block
- Trust badges → badge block`,

      webflow: `=== WEBFLOW-SPECIFIC EXTRACTION ===
- Elements have w-* classes - clean semantic structure
- Rich text in .w-richtext
- CMS items have w-dyn-* classes
- Interactions data in data-w-id - note for animations
- Usually well-organized sections
- High-quality images with srcset - use largest`,

      sitevision: `=== SITEVISION-SPECIFIC EXTRACTION ===
- Swedish CMS - content often in Swedish
- Portlet structure (sv-portlet) 
- Navigation patterns follow Swedish conventions
- Contact info patterns: telefon, e-post, adress
- Organization/myndighet pages common`,

      ghost: `=== GHOST-SPECIFIC EXTRACTION ===
- Blog-focused CMS - expect post structure
- Clean semantic markup
- Feature images prominent
- Author cards common`,

      unknown: `=== GENERAL EXTRACTION ===
- Look for semantic HTML: <header>, <main>, <article>, <section>
- Identify hero by position (first large section) and content (h1, tagline)
- Look for repeating patterns (cards, testimonials, features)
- Extract only meaningful content`
    };

    const platformPrompt = PLATFORM_PROMPTS[platform] || PLATFORM_PROMPTS.unknown;

    let aiResponse: Response;

    const systemPrompt = `You are an expert at analyzing web pages and mapping content to CMS blocks.
Your task is to take content from a scraped web page and transform it into structured CMS blocks.

${BLOCK_TYPES_SCHEMA}

${brandingHints ? `\n${brandingHints}\n` : ''}
${platformPrompt}

=== CONTENT QUALITY FILTER - CRITICAL ===

IGNORE COMPLETELY (do not create blocks for):
- Navigation menus (topbar, sidebar, footer links)
- Cookie consent banners and their images (CookieLaw, TCKY, Complianz, GDPR popups)
- Close/X button images
- Breadcrumbs and "Back" links
- "Powered by X" badges
- Default placeholder content ("Hej världen", "Hello World", "Sample Page")
- Plugin-generated content
- Sidebar widgets (unless explicitly main content)
- Footer links and copyright notices
- Login/signup forms (unless main feature)
- Social sharing buttons (unless prominent feature)
- Comment sections

QUALITY CHECK:
- If main content has less than 100 words of actual text: add "lowQuality": true to metadata
- If page is mostly navigation/footer: add "lowQuality": true
- Skip promotional/cookie images: look for close.svg, cookie, consent, powered, plugin in URLs

Focus ONLY on main content (typically in <main>, <article>, or primary content area).

ICONS — CRITICAL FOR FEATURES/STATS/TIMELINE:
For every feature, stat, or timeline item, you MUST include a Lucide icon name.
Use PascalCase icon names from the Lucide icon set: https://lucide.dev/icons
Common mappings:
- IoT/sensors/monitoring → "Activity", "Gauge", "Thermometer", "Wifi", "Radio", "Signal"
- Security → "Shield", "Lock", "ShieldCheck"
- Cloud/hosting → "Cloud", "Server", "Database"
- Analytics/data → "BarChart3", "LineChart", "PieChart", "TrendingUp"
- Communication → "MessageSquare", "Mail", "Phone", "Send"
- People/team → "Users", "UserCircle", "Contact"
- Location/map → "MapPin", "Navigation", "Globe"
- Time/schedule → "Clock", "Calendar", "Timer"
- Money/pricing → "DollarSign", "CreditCard", "Wallet"
- Settings/tools → "Settings", "Wrench", "Cog"
- Water → "Droplets", "Waves"
- Temperature → "Thermometer", "ThermometerSun"
- Sound/noise → "Volume2", "AudioLines"
- Building/property → "Building2", "Home", "Warehouse"
- Energy → "Zap", "BatteryCharging", "Lightbulb"
- Transport/road → "Car", "Truck", "Route"
- Weather → "CloudSun", "CloudRain", "Snowflake"
- Animals/pest → "Bug", "Rat"
- Air/ventilation → "Wind", "Fan"
- Door/access → "DoorOpen", "KeyRound"
- Industry/manufacturing → "Factory", "Hammer"
NEVER leave icon as null or empty — always pick the best matching Lucide icon.

HERO BLOCK - CRITICAL (VIDEO PRIORITY):
- If the page has a clear hero/banner section, create a "hero" block
- PRIORITY 1: If a HERO VIDEO is found (marked as isHeroCandidate: true), use video background:
  {
    "backgroundType": "video",
    "videoType": "direct",  // or "youtube" / "vimeo"
    "videoUrl": "the video URL",
    "videoPosterUrl": "poster image if available",
    "videoAutoplay": true,
    "videoLoop": true,
    "videoMuted": true
  }
- PRIORITY 2: If no hero video, use the OG image as backgroundImage:
  {
    "backgroundType": "image",
    "backgroundImage": "OG image URL"
  }
- Hero block should also have: title (main heading), subtitle (subheading if present), buttons

VIDEO CONTENT - CRITICAL:
- For hero/background videos (direct MP4/WebM): Use in HERO block with backgroundType: 'video'
- For YouTube videos: Create "youtube" blocks
- Create "embed" blocks for Vimeo and other video embeds
- Pre-extracted videos are provided below with isHeroCandidate flag

IMAGES - PRESERVE ALL:
- Extract and preserve ALL images from the page
- Use original image URLs (full http/https URLs)
- Include image alt text when available
- Create gallery blocks for image collections

TEAM/CONTACT PERSONS - CRITICAL:
Identify and include ALL contact persons on the page.
Look for patterns:
- Name + title/role + contact info (email/phone)
- Profile pictures with names
- "Contact", "Team", "About us" sections

For team members, create "team" block with members array.
For single contacts, create "two-column" block with content and imageSrc.

STATISTICS AND FACTS:
Look for sections with:
- Key facts, quick facts, highlights
- Numbers with labels

Create "stats" blocks for numerical facts:
{ value: "180", label: "Credits" }
{ value: "3", label: "Years" }

QUOTES AND TESTIMONIALS:
Look for patterns:
- Quoted text with attribution
- Customer reviews, testimonials
- Blockquotes

Create "quote" or "testimonials" blocks.

LOTTIE ANIMATIONS - CRITICAL:
- For Lottie animations (.json or .lottie files), ALWAYS create native "lottie" blocks (NOT embed blocks!)
- "lottie" block requires: { src: "animation URL", autoplay: true, loop: true }
- Optional: Add alt text, caption, size, and playOn settings based on context
- Common placements: hero decorations (playOn: 'load'), hover effects (playOn: 'hover'), scroll reveals (playOn: 'scroll')
- For SVG animations, you can include them in "image" blocks if they are decorative

=== RESPONSE FORMAT ===

CRITICAL — TIPTAP JSON FORMAT:
Any block field marked as "tiptap" in the schema MUST be a JSON object, NEVER a raw HTML string.
Correct format: { "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Your text" }] }] }
WRONG format: "<p>Your text</p>" — this will break rendering.
For multi-paragraph content, add multiple paragraph nodes inside the "content" array.
For bold text: { "type": "text", "marks": [{ "type": "bold" }], "text": "Bold text" }
For links: { "type": "text", "marks": [{ "type": "link", "attrs": { "href": "https://..." } }], "text": "Link text" }

Respond ONLY with valid JSON, no other text:
{
  "title": "Page main title",
  "blocks": [
    { 
      "id": "block-1", 
      "type": "hero", 
      "data": { 
        "title": "...", 
        "subtitle": "...", 
        "backgroundType": "video",  // or "image" if no video
        "videoType": "direct",      // only if backgroundType is video
        "videoUrl": "...",          // only if backgroundType is video
        "videoMuted": true,
        "videoAutoplay": true,
        "videoLoop": true,
        "backgroundImage": "..."    // only if backgroundType is image
      } 
    },
    { "id": "block-2", "type": "text", "data": { "content": { "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Your text here" }] }] } } },
    { "id": "block-3", "type": "lottie", "data": { "src": "https://lottie.host/...", "autoplay": true, "loop": true, "alt": "Animation description" } },
    { "id": "block-4", "type": "features", "data": { "title": "Why choose us", "features": [{ "id": "f1", "icon": "ShieldCheck", "title": "Secure", "description": "Enterprise-grade security" }, { "id": "f2", "icon": "Zap", "title": "Fast", "description": "Sub-second response times" }, { "id": "f3", "icon": "Globe", "title": "Global", "description": "Available worldwide" }], "columns": "3", "variant": "cards" } },
    { "id": "block-5", "type": "tabs", "data": { "tabs": [{ "id": "tab-1", "title": "Setup", "icon": "Settings", "content": { "type": "doc", "content": [{ "type": "heading", "attrs": { "level": 3 }, "content": [{ "type": "text", "text": "Get started" }] }, { "type": "paragraph", "content": [{ "type": "text", "text": "Connect and configure in minutes." }] }] } }, { "id": "tab-2", "title": "Monitor", "icon": "Activity", "content": { "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Track everything in real time." }] }] } }], "variant": "underline", "defaultTab": "tab-1" } },
    { "id": "block-6", "type": "accordion", "data": { "title": "FAQ", "items": [{ "question": "How does it work?", "answer": { "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Connect to your systems and get real-time insights." }] }] } }, { "question": "What does it cost?", "answer": { "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Plans start from €49/month." }] }] } }] } },
    { "id": "block-7", "type": "bento-grid", "data": { "title": "Everything you need", "items": [{ "id": "b1", "title": "Monitoring", "description": "Live sensor data", "icon": "Activity", "span": "wide" }, { "id": "b2", "title": "Alerts", "description": "Instant notifications", "icon": "Bell", "span": "normal" }, { "id": "b3", "title": "Analytics", "description": "Deep insights", "icon": "BarChart3", "span": "normal" }], "columns": 3, "variant": "default" } },
    { "id": "block-8", "type": "two-column", "data": { "content": { "type": "doc", "content": [{ "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "About us" }] }, { "type": "paragraph", "content": [{ "type": "text", "text": "We help businesses grow with smart technology." }] }] }, "imageSrc": "https://example.com/image.jpg", "imageAlt": "Team", "imagePosition": "right" } }
  ],
  "companyProfile": {
    "company_name": "Company name from the page",
    "tagline": "The one-liner under the name, if the page has one",
    "about_us": "Brief company description extracted from about/intro sections",
    "business_purpose": "Why the company says it exists, if stated",
    "services": [{ "name": "Service name", "description": "Brief description as written on the page" }],
    "value_proposition": "Main value proposition",
    "industry": "Detected industry",
    "differentiators": [{ "name": "Differentiator as a label", "description": "What the page says it means" }],
    "proof_points": [{ "value": "412 km", "label": "kanalisation byggd", "context": "since 2014" }],
    "primary_cta": { "label": "Text of the page's main button", "destination": "/its-href", "intent": "What the button leads to" },
    "target_industries": ["Target industry 1"],
    "contact_email": "info@example.com",
    "contact_phone": "+46 8 123 45 67",
    "address": "Street, City, Country",
    "clients": "Notable clients if mentioned",
    "client_testimonials": [{ "quote": "Verbatim quote", "author": "Name if the page names one", "role": "", "company": "" }]
  }
}

IMPORTANT: The "companyProfile" field is OPTIONAL. Only include it if you can extract meaningful company data from the page (typically homepage or about pages). Include only fields you can confidently extract — omit fields where data is not available.

For companyProfile specifically: copy, never compose. A differentiator's description must be words the page actually uses — omit the description rather than write one. "proof_points" are figures the page states, with the figure in "value" exactly as printed (unit included) and what it counts in "label"; never compute, round or convert one, and never turn a vague claim ("marknadsledande") into a number. Leave a testimonial's author/role/company empty when the page does not name them — an unattributed quote is correct, an invented attribution is a fabricated reference.`;

    // Identify hero video candidates
    const heroVideos = extractedVideos.filter(v => v.isHeroCandidate);
    const otherVideos = extractedVideos.filter(v => !v.isHeroCandidate);

    const MAX_MARKDOWN_FOR_AI = 22000;
    const MAX_HTML_FOR_AI = 10000;

    const userPrompt = `Analyze this web page and create CMS blocks:

URL: ${formattedUrl}
Platform: ${platform}
Title: ${metadata.title || 'Unknown'}
Description: ${metadata.description || 'None'}

=== HERO BACKGROUND VIDEO (USE THIS FOR HERO BLOCK!) ===
${heroVideos.length > 0 
  ? heroVideos.map(v => `- Type: ${v.type}, URL: ${v.url}${v.poster ? `, Poster: ${v.poster}` : ''}`).join('\n')
  : 'No hero video found - use OG image instead'}

=== OG IMAGE (FALLBACK FOR HERO IF NO VIDEO) ===
${metadata['og:image'] || metadata.ogImage || 'No OG image available'}

=== OTHER VIDEOS (CREATE YOUTUBE/EMBED BLOCKS) ===
${otherVideos.length > 0 ? otherVideos.map(v => `- ${v.type}: ${v.url}`).join('\n') : 'No other videos found'}

=== PRE-EXTRACTED IMAGES (${extractedImages.length} total) ===
${extractedImages.slice(0, 20).map(img => `- ${img.src}${img.alt ? ` (alt: ${img.alt})` : ''}`).join('\n')}
${extractedImages.length > 20 ? `\n... and ${extractedImages.length - 20} more images` : ''}

=== LOTTIE ANIMATIONS (${extractedLotties.length} found) ===
${extractedLotties.length > 0 
  ? extractedLotties.map(l => `- ${l.type}: ${l.src}`).join('\n')
  : 'No Lottie animations found'}

=== SVG ANIMATIONS (${extractedSvgAnimations.length} found) ===
${extractedSvgAnimations.length > 0 
  ? extractedSvgAnimations.map(s => s.type === 'external' ? `- External: ${s.src}` : '- Inline SVG with SMIL/CSS animation').join('\n')
  : 'No SVG animations found'}

=== MAIN CONTENT (Markdown) ===
${markdown.substring(0, MAX_MARKDOWN_FOR_AI)}
${markdown.length > MAX_MARKDOWN_FOR_AI ? '\n... (content truncated)' : ''}

=== HTML FOR STRUCTURE ANALYSIS ===
${html.substring(0, MAX_HTML_FOR_AI)}

=== INSTRUCTIONS ===
1. If HERO BACKGROUND VIDEO is found: Create HERO block with backgroundType: 'video', videoType, videoUrl
2. If NO hero video: Create HERO block with backgroundType: 'image', backgroundImage (OG image)
3. Create "youtube" or "embed" blocks for OTHER VIDEOS (not hero videos)
4. Include ALL images appropriately (gallery, two-column, article-grid, etc.)
5. Identify team members and create team block
6. Create stats blocks for numerical facts
7. Identify quotes and testimonials
8. Group related content into appropriate block types
9. If LOTTIE ANIMATIONS found: Create native "lottie" blocks (NOT embed!) with src, autoplay: true, loop: true
10. For SVG animations: Include in image blocks or as decorative elements

Respond only with JSON.`;

    // Unified AI call via OpenAI-compatible endpoint (all providers)
    const _aiStart = Date.now();
    const _aiProvider = aiConfig.apiUrl.includes('openai.com') ? 'openai'
      : aiConfig.apiUrl.includes('generativelanguage') ? 'gemini'
      : aiConfig.apiUrl.includes('anthropic') ? 'anthropic' : 'unknown';
    aiResponse = await fetch(aiConfig.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        // gpt-5-class (map-resolved 'reasoning' tier) rejects max_tokens and
        // non-default temperature on /chat/completions.
        ...(_aiProvider === 'openai' && isOpenAiReasoningModel(aiConfig.model)
          ? { max_completion_tokens: 16384 }
          : { max_tokens: 16384, temperature: 0.2 }),
      }),
    });

    if (!aiResponse.ok) {
      const aiError = await aiResponse.text();
      console.error('AI error:', aiResponse.status, aiError);
      void logAiUsage({
        supabase, source: 'migrate-page', provider: _aiProvider, model: aiConfig.model,
        promptTokens: 0, completionTokens: 0, totalTokens: 0,
        latencyMs: Date.now() - _aiStart,
        status: aiResponse.status === 429 ? 'rate_limited' : aiResponse.status === 402 ? 'payment_required' : 'error',
        error: aiError?.slice(0, 500),
        metadata: { http_status: aiResponse.status, url: formattedUrl },
      });
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: 'AI credits depleted. Check your API account.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: false, error: 'AI analysis failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    {
      const u = aiData?.usage || {};
      const p = Number(u.prompt_tokens || u.input_tokens || 0);
      const c = Number(u.completion_tokens || u.output_tokens || 0);
      void logAiUsage({
        supabase, source: 'migrate-page', provider: _aiProvider, model: aiConfig.model,
        promptTokens: p, completionTokens: c, totalTokens: Number(u.total_tokens || p + c),
        latencyMs: Date.now() - _aiStart, status: 'success',
        metadata: { url: formattedUrl },
      });
    }
    
    // Unified response parsing (OpenAI-compatible format from all providers)
    const aiContent = aiData.choices?.[0]?.message?.content || '';
    
    console.log('Step 4: AI response received, parsing...');

    // Parse AI response - extract JSON from possible markdown code blocks
    let parsedBlocks;
    try {
      // Try to extract JSON from code blocks first
      const jsonMatch = aiContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonString = jsonMatch ? jsonMatch[1].trim() : aiContent.trim();
      parsedBlocks = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiContent.substring(0, 1000));
      
      // Try to find JSON object directly
      const jsonStart = aiContent.indexOf('{');
      const jsonEnd = aiContent.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        try {
          parsedBlocks = JSON.parse(aiContent.substring(jsonStart, jsonEnd + 1));
        } catch {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'Could not parse AI response',
              rawResponse: aiContent.substring(0, 1000)
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Could not parse AI response',
            rawResponse: aiContent.substring(0, 1000)
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Ensure blocks have unique IDs and normalize field names
    const blocks = (parsedBlocks.blocks || []).map((block: Record<string, unknown>, index: number) => {
      const normalizedBlock: Record<string, unknown> = {
        ...block,
        id: block.id || `block-${Date.now()}-${index}`,
      };
      normalizeBlockData(normalizedBlock);
      return normalizedBlock;
    });

    // Step 5b–5e: Tiptap fix, icon fallbacks, contract validation
    // (hallucination/duplicate detection below is migration-specific and stays here)

    // Step 5b: Detect duplicate data across blocks (AI hallucination guard — migrate-page only)
    if (blocks.length > 2) {
      const dataFingerprints = blocks.map((b: Record<string, unknown>) => JSON.stringify(b.data));
      const uniqueFingerprints = new Set(dataFingerprints);
      if (uniqueFingerprints.size === 1 && blocks.length > 1) {
        console.error('[QUALITY] CRITICAL: All blocks have identical data — AI hallucination detected');
        const heroBlock = blocks[0];
        blocks.length = 0;
        blocks.push(heroBlock);
        console.warn('[QUALITY] Reduced to single hero block. Re-migration recommended.');
      } else if (uniqueFingerprints.size < blocks.length * 0.5) {
        console.warn(`[QUALITY] WARNING: Only ${uniqueFingerprints.size} unique data objects for ${blocks.length} blocks — possible duplication`);
        const deduped: Record<string, unknown>[] = [blocks[0]];
        for (let i = 1; i < blocks.length; i++) {
          if (dataFingerprints[i] !== dataFingerprints[i - 1]) {
            deduped.push(blocks[i]);
          } else {
            console.warn(`[QUALITY] Removed duplicate block at index ${i} (type: ${blocks[i].type})`);
          }
        }
        blocks.length = 0;
        blocks.push(...deduped);
      }
    }

    // Step 5c: Empty Tiptap paragraph detection (quality warning — logging only)
    for (const block of blocks) {
      const data = block.data as Record<string, unknown> | undefined;
      if (!data) continue;
      for (const field of TIPTAP_FIELDS) {
        const val = data[field] as Record<string, unknown> | undefined;
        if (val && typeof val === 'object' && val.type === 'doc' && Array.isArray(val.content)) {
          const allEmpty = (val.content as Array<Record<string, unknown>>).every(
            (node) => !node.content || (Array.isArray(node.content) && node.content.length === 0),
          );
          if (allEmpty && (val.content as unknown[]).length > 0) {
            console.warn(`[QUALITY] Block ${block.id} (${block.type}): TipTap field "${field}" has empty paragraphs`);
          }
        }
      }
    }

    // Step 5d–5e: shared normalizer (tiptap fields already handled above in 5a map(),
    // but applyIconFallbacks + validateBlockContracts run here)
    applyIconFallbacks(blocks);
    validateBlockContracts(blocks);
    stripRemovedBlocks(blocks);

    console.log('Step 5: Successfully mapped', blocks.length, 'blocks');
    console.log('Block types:', blocks.map((b: Record<string, unknown>) => b.type).join(', '));

    // Step 6: Save company profile to site_settings if extracted
    const companyProfile = parsedBlocks.companyProfile;
    if (companyProfile && typeof companyProfile === 'object' && Object.keys(companyProfile).length > 0) {
      try {

        // Check for existing profile and merge
        const { data: existing } = await supabase
          .from('site_settings')
          .select('value')
          .eq('key', 'company_profile')
          .maybeSingle();

        const existingProfile = (existing?.value as Record<string, unknown>) || {};
        // Merge: existing manual entries take priority over AI-extracted
        const mergedProfile: Record<string, unknown> = { ...companyProfile };
        for (const [key, val] of Object.entries(existingProfile)) {
          if (val && String(val).trim().length > 0) {
            mergedProfile[key] = val; // Keep existing non-empty values
          }
        }

        const { error: upsertError } = await supabase
          .from('site_settings')
          .upsert(
            { key: 'company_profile', value: mergedProfile, updated_at: new Date().toISOString() },
            { onConflict: 'key' }
          );

        if (upsertError) {
          console.error('Failed to save company profile:', upsertError);
        } else {
          console.log('Company profile saved to site_settings:', Object.keys(mergedProfile).join(', '));
        }

        // Also update company_name setting for backward compatibility
        if (mergedProfile.company_name) {
          await supabase
            .from('site_settings')
            .upsert(
              { key: 'company_name', value: mergedProfile.company_name, updated_at: new Date().toISOString() },
              { onConflict: 'key' }
            );
        }
      } catch (profileError) {
        console.error('Error saving company profile:', profileError);
      }
    }

    // Step 7: Discover other pages on the site for proactive migration
    let otherPages: { url: string; title: string; type: string }[] = [];
    try {
      const urlObj = new URL(formattedUrl);
      const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
      const navLinks = extractNavLinks(rawHtml, baseUrl);
      const sitemapPages = await fetchSitemap(baseUrl);
      const seenUrls = new Set<string>([formattedUrl]);
      
      for (const link of navLinks) {
        if (!seenUrls.has(link.url) && !shouldExcludeUrl(link.url, baseUrl)) {
          seenUrls.add(link.url);
          otherPages.push({ url: link.url, title: link.label, type: categorizeUrl(link.url, baseUrl, platform) });
        }
      }
      for (const page of sitemapPages.slice(0, 30)) {
        if (!seenUrls.has(page.url) && !shouldExcludeUrl(page.url, baseUrl)) {
          seenUrls.add(page.url);
          const slug = page.url.replace(baseUrl, '').split('/').filter(Boolean).pop() || '';
          otherPages.push({ url: page.url, title: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), type: categorizeUrl(page.url, baseUrl, platform) });
        }
      }
    } catch { /* site discovery is optional */ }

    console.log(`Discovered ${otherPages.length} other pages on the site`);

    const pageTitle = parsedBlocks.title || metadata.title || 'Imported page';
    const suggestedSlug = pageTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'imported-page';

    return new Response(
      JSON.stringify({
        success: true,
        sourceUrl: formattedUrl,
        title: pageTitle,
        blocks,
        companyProfile: companyProfile || null,
        branding: extractedBrand || null,
        otherPages,  // FlowPilot can use this to proactively offer migration of more pages
        metadata: {
          originalTitle: metadata.title,
          originalDescription: metadata.description,
          platform,
          videosFound: extractedVideos.length,
          heroVideosFound: heroVideos.length,
          imagesFound: extractedImages.length,
          lottieAnimationsFound: extractedLotties.length,
          svgAnimationsFound: extractedSvgAnimations.length,
          screenshotAvailable: !!screenshot,
          brandingExtracted: !!extractedBrand,
          scrapedAt: new Date().toISOString(),
        },
        // OpenClaw chaining hint — tells the reasoning loop what to do next
        _next_action: {
          tool: 'manage_page',
          args: {
            action: 'create',
            title: pageTitle,
            slug: suggestedSlug,
            blocks: '{{blocks}}',  // placeholder — AI should use the blocks array from this response
          },
          instruction: `CRITICAL: You MUST now call manage_page with action='create', title='${pageTitle}', slug='${suggestedSlug}', and the blocks array from this result. Do NOT summarize or describe — call the tool immediately.`,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Migration error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
