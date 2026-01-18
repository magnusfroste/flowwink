import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Firecrawl Map endpoint - discovers all URLs on a website
 * Returns full list without automatic filtering - user selects which to migrate
 */

// Suggest page type based on URL patterns
function suggestPageType(url: string, baseUrl: string): 'page' | 'blog' | 'kb' | 'skip' {
  const path = url.replace(baseUrl, '').toLowerCase();
  
  // Skip patterns - suggest but don't auto-exclude
  if (/\/page\/\d+\/?$/.test(path)) return 'skip'; // Pagination
  if (/^\/\d{4}\/?$/.test(path)) return 'skip'; // Year archives /2023/
  if (/^\/\d{4}\/\d{2}\/?$/.test(path)) return 'skip'; // Month archives /2023/05/
  if (/\/(feed|rss|atom)\/?/.test(path)) return 'skip';
  if (/\/attachment\//.test(path)) return 'skip';
  if (/\/(wp-admin|wp-login|admin|login|logout|dashboard|cart|checkout|account)\/?/.test(path)) return 'skip';
  if (/\/search\//.test(path) || /[\?&]s=/.test(path)) return 'skip';
  if (/\/print\/?$/.test(path)) return 'skip';
  if (/\/(privacy|cookie|gdpr|terms|legal)\/?/.test(path)) return 'skip';
  
  // Blog patterns
  if (/^\/(blog|news|articles|aktuellt|nyheter|insights|journal|posts?)(?:\/|$)/i.test(path)) {
    return 'blog';
  }
  // WordPress date-based blog posts
  if (/^\/\d{4}\/\d{2}\/\d{2}\//.test(path)) return 'blog';
  if (/^\/(category|tag|author|arkiv)\//.test(path)) return 'blog';
  
  // Knowledge base patterns  
  if (/^\/(help|faq|support|knowledge|kb|docs|documentation|hjalp|vanliga-fragor)(?:\/|$)/i.test(path)) {
    return 'kb';
  }
  
  return 'page';
}

// Generate suggested name from URL path
function generateNameFromPath(url: string, baseUrl: string): string {
  try {
    const path = new URL(url).pathname;
    const segments = path.split('/').filter(Boolean);
    const lastSegment = segments[segments.length - 1] || 'home';
    
    // Clean up the segment
    return lastSegment
      .replace(/\.(html|php|aspx?)$/i, '')
      .replace(/-/g, ' ')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
      .trim() || 'Home';
  } catch {
    return 'Page';
  }
}

// Generate slug from URL path
function generateSlugFromPath(url: string): string {
  try {
    const path = new URL(url).pathname;
    const segments = path.split('/').filter(Boolean);
    const lastSegment = segments[segments.length - 1] || 'home';
    
    return lastSegment
      .replace(/\.(html|php|aspx?)$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  } catch {
    return 'page';
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, options } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl API key not configured. Add FIRECRAWL_API_KEY in Settings.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format URL
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    // Get base URL
    const urlObj = new URL(formattedUrl);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;

    console.log('Mapping site URLs:', formattedUrl);

    // Call Firecrawl Map API
    const response = await fetch('https://api.firecrawl.dev/v1/map', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        limit: options?.limit || 100,
        includeSubdomains: options?.includeSubdomains ?? false,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Firecrawl Map API error:', data);
      return new Response(
        JSON.stringify({ success: false, error: data.error || `Request failed with status ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const allLinks: string[] = data.links || [];
    console.log(`Firecrawl Map found ${allLinks.length} URLs`);

    // Process all URLs - NO FILTERING, just categorize
    const seenSlugs = new Set<string>();
    const pages = allLinks
      .filter(link => {
        // Only include same-domain URLs
        try {
          const linkUrl = new URL(link);
          return linkUrl.host === urlObj.host;
        } catch {
          return false;
        }
      })
      .map(link => {
        // Normalize URL
        try {
          const u = new URL(link);
          u.search = '';
          u.hash = '';
          let path = u.pathname;
          if (path.length > 1 && path.endsWith('/')) {
            path = path.slice(0, -1);
          }
          u.pathname = path;
          return u.href;
        } catch {
          return link;
        }
      })
      .filter((link, index, self) => self.indexOf(link) === index) // Dedupe
      .map(link => {
        const suggestedType = suggestPageType(link, baseUrl);
        const suggestedName = generateNameFromPath(link, baseUrl);
        const slug = generateSlugFromPath(link);
        const path = new URL(link).pathname;
        
        // Track duplicate slugs
        const isDuplicate = seenSlugs.has(slug);
        seenSlugs.add(slug);
        
        return {
          url: link,
          path,
          slug,
          suggestedName,
          suggestedType,
          selected: suggestedType !== 'skip', // Pre-select non-skip pages
          isDuplicate,
        };
      })
      // Sort: homepage first, then by path
      .sort((a, b) => {
        const aIsHome = a.path === '/' || a.path === '';
        const bIsHome = b.path === '/' || b.path === '';
        if (aIsHome && !bIsHome) return -1;
        if (!aIsHome && bIsHome) return 1;
        // Then by suggested type priority: page > blog > kb > skip
        const typePriority = { page: 0, blog: 1, kb: 2, skip: 3 };
        const typeOrder = typePriority[a.suggestedType] - typePriority[b.suggestedType];
        if (typeOrder !== 0) return typeOrder;
        return a.path.localeCompare(b.path);
      });

    // Also scrape homepage to get site metadata
    let siteName = urlObj.host;
    let platform = 'unknown';
    
    try {
      const homeScrape = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: baseUrl,
          formats: ['html'],
          onlyMainContent: false,
          waitFor: 2000,
        }),
      });
      
      if (homeScrape.ok) {
        const homeData = await homeScrape.json();
        const metadata = homeData.data?.metadata || {};
        const html = (homeData.data?.html || '').toLowerCase();
        
        siteName = metadata.title?.split(' - ')[0]?.split(' | ')[0] || siteName;
        
        // Detect platform
        if (html.includes('wp-content') || html.includes('wp-includes')) {
          platform = 'wordpress';
        } else if (html.includes('wix.com') || html.includes('_wix')) {
          platform = 'wix';
        } else if (html.includes('squarespace') || html.includes('sqsp')) {
          platform = 'squarespace';
        } else if (html.includes('shopify') || html.includes('cdn.shopify')) {
          platform = 'shopify';
        } else if (html.includes('webflow.com')) {
          platform = 'webflow';
        }
      }
    } catch (e) {
      console.log('Could not fetch homepage metadata:', e);
    }

    const stats = {
      total: pages.length,
      pages: pages.filter(p => p.suggestedType === 'page').length,
      blog: pages.filter(p => p.suggestedType === 'blog').length,
      kb: pages.filter(p => p.suggestedType === 'kb').length,
      skip: pages.filter(p => p.suggestedType === 'skip').length,
      selected: pages.filter(p => p.selected).length,
    };

    console.log(`Site map complete: ${JSON.stringify(stats)}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        baseUrl,
        siteName,
        platform,
        pages,
        stats,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error mapping site:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to map site';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
