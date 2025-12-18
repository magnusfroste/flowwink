import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  featured_image: string | null;
  published_at: string | null;
  created_at: string;
  author: { full_name: string | null; email: string } | null;
  categories: { category: { name: string; slug: string } }[];
}

interface BlogSettings {
  rssTitle: string;
  rssDescription: string;
}

interface SeoSettings {
  siteTitle: string;
}

// Extract plain text from Tiptap JSON or HTML
function extractText(content: unknown): string {
  if (typeof content === 'string') {
    return content.replace(/<[^>]*>/g, '').trim();
  }
  
  if (typeof content === 'object' && content !== null) {
    const doc = content as { content?: unknown[] };
    if (doc.content) {
      let text = '';
      const extractFromNodes = (nodes: unknown[]) => {
        nodes.forEach((node: unknown) => {
          const n = node as { text?: string; content?: unknown[] };
          if (n.text) text += n.text + ' ';
          if (n.content) extractFromNodes(n.content);
        });
      };
      extractFromNodes(doc.content);
      return text.trim();
    }
  }
  
  return '';
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatRFC822Date(date: Date): string {
  return date.toUTCString();
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get blog and SEO settings
    const [blogSettingsResult, seoSettingsResult] = await Promise.all([
      supabase.from('site_settings').select('value').eq('key', 'blog').maybeSingle(),
      supabase.from('site_settings').select('value').eq('key', 'seo').maybeSingle(),
    ]);

    const blogSettings = (blogSettingsResult.data?.value || {}) as BlogSettings;
    const seoSettings = (seoSettingsResult.data?.value || {}) as SeoSettings;

    // Get published blog posts
    const { data: posts, error } = await supabase
      .from('blog_posts')
      .select(`
        id,
        slug,
        title,
        excerpt,
        featured_image,
        published_at,
        created_at,
        author:profiles!blog_posts_author_id_fkey(full_name, email),
        categories:blog_post_categories(category:blog_categories(name, slug))
      `)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error fetching posts:', error);
      throw error;
    }

    const siteTitle = seoSettings.siteTitle || 'Blog';
    const feedTitle = blogSettings.rssTitle || `${siteTitle} RSS Feed`;
    const feedDescription = blogSettings.rssDescription || `Latest posts from ${siteTitle}`;
    
    // Construct site URL from request
    const url = new URL(req.url);
    const siteUrl = `${url.protocol}//${url.host}`;

    // Build RSS XML
    const items = (posts || []).map((post) => {
      const pubDate = post.published_at || post.created_at;
      const postUrl = `${siteUrl}/blogg/${post.slug}`;
      const authorData = Array.isArray(post.author) ? post.author[0] : post.author;
      const authorName = authorData?.full_name || authorData?.email || 'Unknown';
      
      const categoriesData = post.categories || [];
      const categories = categoriesData
        .map((c: { category: { name: string; slug: string } | { name: string; slug: string }[] }) => {
          const cat = Array.isArray(c.category) ? c.category[0] : c.category;
          return cat?.name ? `<category>${escapeXml(cat.name)}</category>` : '';
        })
        .filter(Boolean)
        .join('\n        ');

      return `
    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${postUrl}</link>
      <guid isPermaLink="true">${postUrl}</guid>
      <pubDate>${formatRFC822Date(new Date(pubDate))}</pubDate>
      <author>${escapeXml(authorName)}</author>
      <description><![CDATA[${post.excerpt || ''}]]></description>
      ${post.featured_image ? `<enclosure url="${escapeXml(post.featured_image)}" type="image/jpeg" />` : ''}
      ${categories}
    </item>`;
    }).join('');

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(feedTitle)}</title>
    <link>${siteUrl}/blogg</link>
    <description>${escapeXml(feedDescription)}</description>
    <language>sv</language>
    <lastBuildDate>${formatRFC822Date(new Date())}</lastBuildDate>
    <atom:link href="${siteUrl}/api/blog-rss" rel="self" type="application/rss+xml" />
    ${items}
  </channel>
</rss>`;

    return new Response(rss, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error('RSS feed error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to generate RSS feed' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});