import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to escape HTML entities
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Generate minimal HTML for social crawlers with OG tags
function generateHtml(
  title: string,
  description: string,
  ogImage: string,
  canonicalUrl: string,
  twitterHandle?: string
): string {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeOgImage = escapeHtml(ogImage);
  const safeUrl = escapeHtml(canonicalUrl);
  const safeTwitterHandle = twitterHandle ? escapeHtml(twitterHandle) : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDescription}">
  
  <!-- Open Graph -->
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDescription}">
  <meta property="og:type" content="website">
  ${safeOgImage ? `<meta property="og:image" content="${safeOgImage}">` : ''}
  ${safeUrl ? `<meta property="og:url" content="${safeUrl}">` : ''}
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDescription}">
  ${safeOgImage ? `<meta name="twitter:image" content="${safeOgImage}">` : ''}
  ${safeTwitterHandle ? `<meta name="twitter:site" content="${safeTwitterHandle}">` : ''}
  
  ${safeUrl ? `<link rel="canonical" href="${safeUrl}">` : ''}
</head>
<body>
  <h1>${safeTitle}</h1>
  <p>${safeDescription}</p>
</body>
</html>`;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.searchParams.get('path') || '/';
    
    // Extract slug from path
    // Remove leading slash and handle special cases
    let slug = path.replace(/^\//, '') || 'hem';
    
    // Handle blog post paths
    let isBlogPost = false;
    if (slug.startsWith('blogg/')) {
      slug = slug.replace('blogg/', '');
      isBlogPost = true;
    }
    
    // Handle KB article paths
    let isKbArticle = false;
    if (slug.startsWith('kunskapsbas/') || slug.startsWith('kb/')) {
      slug = slug.replace(/^(kunskapsbas|kb)\//, '');
      isKbArticle = true;
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch global SEO settings
    const { data: seoSettingsData } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'seo')
      .maybeSingle();

    const seoSettings = seoSettingsData?.value as {
      siteTitle?: string;
      defaultDescription?: string;
      ogImage?: string;
      twitterHandle?: string;
      titleTemplate?: string;
    } || {};

    // Fetch branding settings for organization name fallback
    const { data: brandingData } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'branding')
      .maybeSingle();

    const brandingSettings = brandingData?.value as {
      organizationName?: string;
    } || {};

    // Fetch general settings for homepage slug
    const { data: generalData } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'general')
      .maybeSingle();

    const generalSettings = generalData?.value as {
      homepageSlug?: string;
    } || {};

    const homepageSlug = generalSettings.homepageSlug || 'hem';
    
    // Determine actual slug to fetch
    const fetchSlug = slug === '' ? homepageSlug : slug;

    // Initialize meta values with global defaults
    let title = seoSettings.siteTitle || brandingSettings.organizationName || '';
    let description = seoSettings.defaultDescription || '';
    let ogImage = seoSettings.ogImage || '';
    let canonicalUrl = '';

    // Fetch page/post-specific meta
    if (isBlogPost) {
      // Fetch blog post
      const { data: post } = await supabase
        .from('blog_posts')
        .select('title, excerpt, featured_image, slug, meta_json')
        .eq('slug', fetchSlug)
        .eq('status', 'published')
        .maybeSingle();

      if (post) {
        const metaJson = post.meta_json as { title?: string; description?: string } | null;
        title = metaJson?.title || post.title || title;
        description = metaJson?.description || post.excerpt || description;
        ogImage = post.featured_image || ogImage;
        canonicalUrl = `/blogg/${post.slug}`;
      }
    } else if (isKbArticle) {
      // Fetch KB article
      const { data: article } = await supabase
        .from('kb_articles')
        .select('title, question, slug, meta_json')
        .eq('slug', fetchSlug)
        .eq('is_published', true)
        .maybeSingle();

      if (article) {
        const metaJson = article.meta_json as { title?: string; description?: string } | null;
        title = metaJson?.title || article.title || title;
        description = metaJson?.description || article.question || description;
        canonicalUrl = `/kunskapsbas/${article.slug}`;
      }
    } else {
      // Fetch regular page
      const { data: page } = await supabase
        .from('pages')
        .select('title, meta_json, slug')
        .eq('slug', fetchSlug)
        .eq('status', 'published')
        .maybeSingle();

      if (page) {
        const metaJson = page.meta_json as { 
          title?: string; 
          description?: string;
          ogImage?: string;
        } | null;
        
        title = metaJson?.title || page.title || title;
        description = metaJson?.description || description;
        ogImage = metaJson?.ogImage || ogImage;
        canonicalUrl = page.slug === homepageSlug ? '/' : `/${page.slug}`;
      }
    }

    // Apply title template
    const titleTemplate = seoSettings.titleTemplate || '%s';
    const finalTitle = title 
      ? titleTemplate.replace('%s', title)
      : seoSettings.siteTitle || brandingSettings.organizationName || 'Website';

    // Generate HTML response
    const html = generateHtml(
      finalTitle,
      description,
      ogImage,
      canonicalUrl,
      seoSettings.twitterHandle
    );

    console.log(`[render-page] Rendered meta for path: ${path}, slug: ${fetchSlug}, title: ${finalTitle}`);

    return new Response(html, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      },
    });
  } catch (error) {
    console.error('[render-page] Error:', error);
    
    // Return basic HTML on error
    const html = generateHtml(
      'Website',
      '',
      '',
      ''
    );

    return new Response(html, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  }
});
