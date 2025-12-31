import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to strip HTML tags and convert to plain text
function htmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// Convert Tiptap JSON to plain text
function tiptapToText(doc: unknown): string {
  if (!doc || typeof doc !== 'object') return '';
  
  const node = doc as Record<string, unknown>;
  let text = '';
  
  if (node.text && typeof node.text === 'string') {
    text += node.text;
  }
  
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      text += tiptapToText(child) + ' ';
    }
  }
  
  return text.trim();
}

// Extract text content from a block
function extractBlockContent(block: Record<string, unknown>): string {
  const type = block.type as string;
  const data = block.data as Record<string, unknown> || {};
  
  const parts: string[] = [];
  
  switch (type) {
    case 'hero':
      if (data.title) parts.push(data.title as string);
      if (data.subtitle) parts.push(data.subtitle as string);
      break;
    case 'text':
      if (data.content) {
        if (typeof data.content === 'string') {
          parts.push(htmlToText(data.content));
        } else {
          parts.push(tiptapToText(data.content));
        }
      }
      break;
    case 'cta':
      if (data.title) parts.push(data.title as string);
      if (data.subtitle) parts.push(data.subtitle as string);
      break;
    case 'accordion':
      if (data.title) parts.push(data.title as string);
      if (Array.isArray(data.items)) {
        for (const item of data.items) {
          if (item.question) parts.push(item.question);
          if (item.answer) {
            if (typeof item.answer === 'string') {
              parts.push(htmlToText(item.answer));
            } else {
              parts.push(tiptapToText(item.answer));
            }
          }
        }
      }
      break;
    case 'features':
      if (data.title) parts.push(data.title as string);
      if (Array.isArray(data.features)) {
        for (const f of data.features) {
          if (f.title) parts.push(f.title);
          if (f.description) parts.push(f.description);
        }
      }
      break;
    case 'pricing':
      if (data.title) parts.push(data.title as string);
      if (Array.isArray(data.tiers)) {
        for (const t of data.tiers) {
          if (t.name) parts.push(t.name);
          if (t.description) parts.push(t.description);
        }
      }
      break;
    case 'quote':
      if (data.text) parts.push(data.text as string);
      if (data.author) parts.push(`— ${data.author}`);
      break;
    case 'stats':
      if (data.title) parts.push(data.title as string);
      if (Array.isArray(data.stats)) {
        for (const s of data.stats) {
          if (s.label && s.value) parts.push(`${s.label}: ${s.value}`);
        }
      }
      break;
    case 'contact':
      if (data.title) parts.push(data.title as string);
      break;
    case 'two-column':
      if (data.content) {
        if (typeof data.content === 'string') {
          parts.push(htmlToText(data.content));
        } else {
          parts.push(tiptapToText(data.content));
        }
      }
      break;
    case 'info-box':
      if (data.title) parts.push(data.title as string);
      if (data.content) {
        if (typeof data.content === 'string') {
          parts.push(htmlToText(data.content));
        } else {
          parts.push(tiptapToText(data.content));
        }
      }
      break;
  }
  
  return parts.join(' ').trim();
}

// Truncate text to max words
function truncateWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + '...';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const isFull = url.pathname.includes('llms-full');
    
    console.log(`[llms-txt] Generating ${isFull ? 'llms-full.txt' : 'llms.txt'}`);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch AEO settings
    const { data: aeoSettingsRow } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'aeo')
      .maybeSingle();

    const aeoSettings = aeoSettingsRow?.value as Record<string, unknown> || {};
    
    if (!aeoSettings.enabled) {
      return new Response('# AEO is not enabled\n\nPlease enable AEO in site settings.', {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    // Fetch SEO settings for site info
    const { data: seoSettingsRow } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'seo')
      .maybeSingle();

    const seoSettings = seoSettingsRow?.value as Record<string, unknown> || {};

    // Fetch published pages
    const { data: pages, error: pagesError } = await supabase
      .from('pages')
      .select('slug, title, content_json, meta_json, updated_at')
      .eq('status', 'published')
      .order('menu_order', { ascending: true });

    if (pagesError) {
      console.error('[llms-txt] Error fetching pages:', pagesError);
      throw pagesError;
    }

    // Fetch published blog posts
    const { data: posts, error: postsError } = await supabase
      .from('blog_posts')
      .select('slug, title, excerpt, content_json, updated_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false });

    if (postsError) {
      console.error('[llms-txt] Error fetching posts:', postsError);
    }

    // Get excluded slugs
    const excludedSlugs = (aeoSettings.llmsTxtExcludedSlugs as string[]) || [];
    const filteredPages = (pages || []).filter(p => !excludedSlugs.includes(p.slug));
    const filteredPosts = (posts || []).filter(p => !excludedSlugs.includes(p.slug));

    const orgName = (aeoSettings.organizationName as string) || (seoSettings.siteTitle as string) || 'Website';
    const shortDesc = (aeoSettings.shortDescription as string) || (seoSettings.defaultDescription as string) || '';
    const contactEmail = (aeoSettings.contactEmail as string) || '';
    const maxWords = (aeoSettings.maxWordsPerPage as number) || 2000;

    let output = '';

    if (isFull) {
      // Generate llms-full.txt with complete content
      output += `# ${orgName}\n\n`;
      if (shortDesc) output += `> ${shortDesc}\n\n`;
      
      output += `---\n\n`;
      
      // Pages section
      if (filteredPages.length > 0) {
        output += `## Pages\n\n`;
        
        for (const page of filteredPages) {
          output += `### ${page.title}\n\n`;
          output += `URL: /${page.slug}\n`;
          output += `Last updated: ${new Date(page.updated_at).toISOString().split('T')[0]}\n\n`;
          
          const blocks = (page.content_json as Record<string, unknown>[]) || [];
          const contentParts: string[] = [];
          
          for (const block of blocks) {
            const text = extractBlockContent(block);
            if (text) contentParts.push(text);
          }
          
          const fullContent = contentParts.join('\n\n');
          const truncated = truncateWords(fullContent, maxWords);
          
          if (truncated) {
            output += truncated + '\n\n';
          }
          
          output += `---\n\n`;
        }
      }
      
      // Blog posts section
      if (filteredPosts.length > 0) {
        output += `## Blog Posts\n\n`;
        
        for (const post of filteredPosts) {
          output += `### ${post.title}\n\n`;
          output += `URL: /blogg/${post.slug}\n`;
          output += `Last updated: ${new Date(post.updated_at).toISOString().split('T')[0]}\n\n`;
          
          if (post.excerpt) {
            output += post.excerpt + '\n\n';
          }
          
          output += `---\n\n`;
        }
      }
      
      // Footer
      if (contactEmail) {
        output += `## Contact\n\n`;
        output += `Email: ${contactEmail}\n`;
      }
      
    } else {
      // Generate llms.txt (concise version)
      output += `# ${orgName}\n\n`;
      if (shortDesc) output += `> ${shortDesc}\n\n`;
      
      // Pages section
      if (filteredPages.length > 0) {
        output += `## Pages\n\n`;
        for (const page of filteredPages) {
          const meta = page.meta_json as Record<string, unknown> || {};
          const desc = (meta.description as string) || '';
          output += `- /${page.slug}: ${page.title}`;
          if (desc) output += ` - ${desc}`;
          output += `\n`;
        }
        output += `\n`;
      }
      
      // Blog posts section (limited)
      if (filteredPosts.length > 0) {
        output += `## Recent Blog Posts\n\n`;
        const recentPosts = filteredPosts.slice(0, 10);
        for (const post of recentPosts) {
          output += `- /blogg/${post.slug}: ${post.title}\n`;
        }
        output += `\n`;
      }
      
      // Contact section
      if (contactEmail) {
        output += `## Contact\n\n`;
        output += `Email: ${contactEmail}\n`;
      }
    }

    console.log(`[llms-txt] Generated ${isFull ? 'llms-full.txt' : 'llms.txt'} (${output.length} chars)`);

    return new Response(output, {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });

  } catch (error) {
    console.error('[llms-txt] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(`Error generating llms.txt: ${message}`, {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
});
