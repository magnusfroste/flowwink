import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getServiceClient, getAnonClient, getUserClient } from '../_shared/supabase-clients.ts';
import { blogIndexPath, blogPostPath } from '../_shared/i18n/blog-address.ts';
import { postsInLanguage } from '../_shared/i18n/post-language.ts';
import type { OverlayEntry } from '../_shared/i18n/translation-units.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface BlogPost {
  id: string;
  slug: string;
  locale?: string | null;
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
    const supabase = getAnonClient();

    // Get blog and SEO settings
    const [blogSettingsResult, seoSettingsResult, langResult] = await Promise.all([
      supabase.from('site_settings').select('value').eq('key', 'blog').maybeSingle(),
      supabase.from('site_settings').select('value').eq('key', 'seo').maybeSingle(),
      supabase.from('site_settings').select('value').eq('key', 'site_languages').maybeSingle(),
    ]);
    // One feed per language (page-translations.md §9): ?lang=sv lists the
    // posts that exist in Swedish, with Swedish titles and /sv/blog links.
    const langValue = (langResult.data?.value || {}) as { default?: string; enabled?: string[] };
    const defaultLang = String(langValue.default || 'en').toLowerCase();
    const enabled = (Array.isArray(langValue.enabled) ? langValue.enabled : [defaultLang]).map((l) => String(l).toLowerCase());
    const wanted = (new URL(req.url).searchParams.get('lang') || '').trim().toLowerCase();
    const lang = wanted && enabled.includes(wanted) ? wanted : defaultLang;
    const multilingual = enabled.length > 1;

    const blogSettings = (blogSettingsResult.data?.value || {}) as BlogSettings;
    const seoSettings = (seoSettingsResult.data?.value || {}) as SeoSettings;

    // Get published blog posts — in the feed's language when the site has several.
    const select = `
        id,
        slug,
        locale,
        title,
        excerpt,
        featured_image,
        published_at,
        created_at,
        author:profiles!blog_posts_author_id_fkey(full_name, email),
        categories:blog_post_categories(category:blog_categories(name, slug))
      `;
    let localized: Awaited<ReturnType<typeof loadInLanguage>> = null;
    async function loadInLanguage() {
      if (!multilingual) return null;
      const { data, error: e } = await supabase.rpc('blog_posts_in_language', { p_lang: lang })
        .select(select).eq('status', 'published').order('published_at', { ascending: false }).limit(20);
      if (e) return null; // an instance without the language migration yet: every post, as before
      const rows = (data ?? []) as unknown as BlogPost[];
      const { data: ov, error: ovErr } = await supabase.from('content_translations')
        .select('entity_id, locale, status, slug, strings')
        .eq('entity', 'blog_post').eq('locale', lang).eq('status', 'published')
        .in('entity_id', rows.length ? rows.map((r) => r.id) : ['00000000-0000-0000-0000-000000000000']);
      if (ovErr) console.warn('[blog-rss] overlays unreadable, listing source text:', ovErr.message);
      const overlays = ((ov ?? []) as Array<{ entity_id: string; locale: string; status: string; slug: string | null; strings: Record<string, OverlayEntry> | null }>);
      return postsInLanguage(rows, lang, overlays, defaultLang).map((r) => ({ ...r.post, slug: r.slug, href: blogPostPath(r.slug, r.locale, defaultLang) }));
    }
    localized = await loadInLanguage();

    const { data: allPosts, error } = localized ? { data: null, error: null } : await supabase
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
    const posts = (localized ?? allPosts ?? []) as Array<BlogPost & { href?: string }>;

    const siteTitle = seoSettings.siteTitle || 'Blog';
    const feedTitle = blogSettings.rssTitle || `${siteTitle} RSS Feed`;
    const feedDescription = blogSettings.rssDescription || `Latest posts from ${siteTitle}`;
    
    // Construct site URL from request
    const url = new URL(req.url);
    const siteUrl = `${url.protocol}//${url.host}`;

    // Build RSS XML
    const items = posts.map((post) => {
      const pubDate = post.published_at || post.created_at;
      const postUrl = `${siteUrl}${post.href ?? `/blog/${post.slug}`}`;
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
    <link>${siteUrl}${blogIndexPath(lang, defaultLang)}</link>
    <description>${escapeXml(feedDescription)}</description>
    <language>${escapeXml(lang)}</language>
    <lastBuildDate>${formatRFC822Date(new Date())}</lastBuildDate>
    <atom:link href="${siteUrl}/api/blog-rss${lang === defaultLang ? '' : `?lang=${encodeURIComponent(lang)}`}" rel="self" type="application/rss+xml" />
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