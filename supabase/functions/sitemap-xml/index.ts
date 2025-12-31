import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[sitemap-xml] Generating sitemap.xml');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the base URL from request headers or settings
    const requestUrl = new URL(req.url);
    const forwardedHost = req.headers.get('x-forwarded-host');
    const forwardedProto = req.headers.get('x-forwarded-proto') || 'https';
    
    // Try to get base URL from general settings or construct from request
    const { data: generalSettingsRow } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'general')
      .maybeSingle();
    
    const generalSettings = generalSettingsRow?.value as Record<string, unknown> || {};
    const homepageSlug = (generalSettings.homepageSlug as string) || 'hem';
    
    // Construct base URL
    let baseUrl = forwardedHost 
      ? `${forwardedProto}://${forwardedHost}`
      : requestUrl.origin.replace('/functions/v1/sitemap-xml', '');
    
    // Remove edge function path if present
    baseUrl = baseUrl.replace(/\/functions\/v1.*$/, '');

    // Fetch AEO settings
    const { data: aeoSettingsRow } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'aeo')
      .maybeSingle();

    const aeoSettings = aeoSettingsRow?.value as Record<string, unknown> || {};
    
    if (!aeoSettings.enabled || !aeoSettings.sitemapEnabled) {
      return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<!-- Sitemap is not enabled -->', {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/xml; charset=utf-8' },
      });
    }

    const changefreq = (aeoSettings.sitemapChangefreq as string) || 'weekly';
    const defaultPriority = (aeoSettings.sitemapPriority as number) || 0.5;

    // Fetch published pages
    const { data: pages, error: pagesError } = await supabase
      .from('pages')
      .select('slug, updated_at, menu_order')
      .eq('status', 'published')
      .order('menu_order', { ascending: true });

    if (pagesError) {
      console.error('[sitemap-xml] Error fetching pages:', pagesError);
      throw pagesError;
    }

    // Fetch blog settings
    const { data: blogSettingsRow } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'blog')
      .maybeSingle();

    const blogSettings = blogSettingsRow?.value as Record<string, unknown> || {};
    const blogEnabled = blogSettings.enabled !== false;
    const blogArchiveSlug = (blogSettings.archiveSlug as string) || 'blogg';

    // Fetch published blog posts
    let posts: { slug: string; updated_at: string }[] = [];
    if (blogEnabled) {
      const { data: blogPosts, error: postsError } = await supabase
        .from('blog_posts')
        .select('slug, updated_at')
        .eq('status', 'published')
        .order('published_at', { ascending: false });

      if (postsError) {
        console.error('[sitemap-xml] Error fetching posts:', postsError);
      } else {
        posts = blogPosts || [];
      }
    }

    // Fetch KB settings and articles
    const { data: kbSettingsRow } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'kb')
      .maybeSingle();

    const kbSettings = kbSettingsRow?.value as Record<string, unknown> || {};
    const kbEnabled = kbSettings.enabled !== false;
    const kbSlug = (kbSettings.menuSlug as string) || 'hjalp';

    let kbArticles: { slug: string; updated_at: string }[] = [];
    if (kbEnabled) {
      const { data: articles } = await supabase
        .from('kb_articles')
        .select('slug, updated_at')
        .eq('is_published', true)
        .order('sort_order', { ascending: true });

      kbArticles = articles || [];
    }

    // Build sitemap XML
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    // Add pages
    for (const page of pages || []) {
      const isHomepage = page.slug === homepageSlug;
      const loc = isHomepage ? baseUrl : `${baseUrl}/${page.slug}`;
      const lastmod = new Date(page.updated_at).toISOString().split('T')[0];
      const priority = isHomepage ? '1.0' : defaultPriority.toFixed(1);

      xml += '  <url>\n';
      xml += `    <loc>${loc}</loc>\n`;
      xml += `    <lastmod>${lastmod}</lastmod>\n`;
      xml += `    <changefreq>${changefreq}</changefreq>\n`;
      xml += `    <priority>${priority}</priority>\n`;
      xml += '  </url>\n';
    }

    // Add blog archive if enabled
    if (blogEnabled && posts.length > 0) {
      const latestPostDate = posts[0]?.updated_at 
        ? new Date(posts[0].updated_at).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      xml += '  <url>\n';
      xml += `    <loc>${baseUrl}/${blogArchiveSlug}</loc>\n`;
      xml += `    <lastmod>${latestPostDate}</lastmod>\n`;
      xml += `    <changefreq>daily</changefreq>\n`;
      xml += `    <priority>0.8</priority>\n`;
      xml += '  </url>\n';

      // Add individual blog posts
      for (const post of posts) {
        const lastmod = new Date(post.updated_at).toISOString().split('T')[0];

        xml += '  <url>\n';
        xml += `    <loc>${baseUrl}/${blogArchiveSlug}/${post.slug}</loc>\n`;
        xml += `    <lastmod>${lastmod}</lastmod>\n`;
        xml += `    <changefreq>monthly</changefreq>\n`;
        xml += `    <priority>0.6</priority>\n`;
        xml += '  </url>\n';
      }
    }

    // Add KB articles if enabled
    if (kbEnabled && kbArticles.length > 0) {
      // Add KB main page
      xml += '  <url>\n';
      xml += `    <loc>${baseUrl}/${kbSlug}</loc>\n`;
      xml += `    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.7</priority>\n`;
      xml += '  </url>\n';

      // Add individual KB articles
      for (const article of kbArticles) {
        const lastmod = new Date(article.updated_at).toISOString().split('T')[0];

        xml += '  <url>\n';
        xml += `    <loc>${baseUrl}/${kbSlug}/${article.slug}</loc>\n`;
        xml += `    <lastmod>${lastmod}</lastmod>\n`;
        xml += `    <changefreq>monthly</changefreq>\n`;
        xml += `    <priority>0.5</priority>\n`;
        xml += '  </url>\n';
      }
    }

    xml += '</urlset>';

    console.log(`[sitemap-xml] Generated sitemap with ${(pages?.length || 0) + posts.length + kbArticles.length} URLs`);

    return new Response(xml, {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });

  } catch (error) {
    console.error('[sitemap-xml] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<!-- Error: ${message} -->`, {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/xml; charset=utf-8' },
    });
  }
});
