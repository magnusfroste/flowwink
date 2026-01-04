import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============= Markdown Rendering Utilities =============

interface TiptapNode {
  type: string;
  content?: TiptapNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  attrs?: Record<string, unknown>;
}

interface TiptapDocument {
  type: 'doc';
  content: TiptapNode[];
}

/**
 * Render a TiptapDocument to Markdown
 */
function renderTiptapToMarkdown(doc: TiptapDocument | null | undefined): string {
  if (!doc?.content) return '';
  return doc.content.map(node => renderNodeToMarkdown(node)).join('\n\n');
}

function renderNodeToMarkdown(node: TiptapNode): string {
  switch (node.type) {
    case 'paragraph':
      return renderInlineContent(node.content || []);
    case 'heading': {
      const level = (node.attrs?.level as number) || 1;
      const prefix = '#'.repeat(level);
      return `${prefix} ${renderInlineContent(node.content || [])}`;
    }
    case 'bulletList':
      return (node.content || []).map(item => `- ${renderNodeToMarkdown(item)}`).join('\n');
    case 'orderedList':
      return (node.content || []).map((item, i) => `${i + 1}. ${renderNodeToMarkdown(item)}`).join('\n');
    case 'listItem':
      return (node.content || []).map(n => renderNodeToMarkdown(n)).join('\n');
    case 'blockquote':
      return (node.content || []).map(n => `> ${renderNodeToMarkdown(n)}`).join('\n');
    case 'codeBlock': {
      const lang = (node.attrs?.language as string) || '';
      const code = (node.content || []).map(n => n.text || '').join('');
      return `\`\`\`${lang}\n${code}\n\`\`\``;
    }
    case 'horizontalRule':
      return '---';
    case 'image': {
      const src = node.attrs?.src as string || '';
      const alt = node.attrs?.alt as string || '';
      return `![${alt}](${src})`;
    }
    case 'hardBreak':
      return '\n';
    default:
      if (node.content) {
        return node.content.map(n => renderNodeToMarkdown(n)).join('');
      }
      return node.text || '';
  }
}

function renderInlineContent(nodes: TiptapNode[]): string {
  return nodes.map(node => {
    let text = node.text || '';
    if (node.content) {
      text = renderInlineContent(node.content);
    }
    if (node.marks) {
      for (const mark of node.marks) {
        switch (mark.type) {
          case 'bold':
          case 'strong':
            text = `**${text}**`;
            break;
          case 'italic':
          case 'em':
            text = `*${text}*`;
            break;
          case 'code':
            text = `\`${text}\``;
            break;
          case 'strike':
            text = `~~${text}~~`;
            break;
          case 'link': {
            const href = mark.attrs?.href as string || '';
            text = `[${text}](${href})`;
            break;
          }
        }
      }
    }
    return text;
  }).join('');
}

/**
 * Render a content block to Markdown
 */
// deno-lint-ignore no-explicit-any
function renderBlockToMarkdown(block: any): string {
  const type = block.type;
  const data = block.data || {};

  switch (type) {
    case 'hero': {
      const lines: string[] = [];
      if (data.title) lines.push(`# ${data.title}`);
      if (data.subtitle) lines.push(data.subtitle);
      if (data.buttonText && data.buttonLink) {
        lines.push(`\n[${data.buttonText}](${data.buttonLink})`);
      }
      return lines.join('\n\n');
    }
    case 'text': {
      if (data.content?.type === 'doc') {
        return renderTiptapToMarkdown(data.content);
      }
      return typeof data.content === 'string' ? data.content : '';
    }
    case 'image': {
      const alt = data.alt || '';
      const src = data.src || '';
      const caption = data.caption ? `\n*${data.caption}*` : '';
      return `![${alt}](${src})${caption}`;
    }
    case 'features': {
      const lines: string[] = [];
      if (data.title) lines.push(`## ${data.title}`);
      if (data.subtitle) lines.push(data.subtitle);
      if (data.features?.length) {
        lines.push('');
        // deno-lint-ignore no-explicit-any
        for (const feature of data.features as any[]) {
          lines.push(`### ${feature.title || ''}`);
          if (feature.description) lines.push(feature.description);
        }
      }
      return lines.join('\n\n');
    }
    case 'cta': {
      const lines: string[] = [];
      if (data.title) lines.push(`## ${data.title}`);
      if (data.description) lines.push(data.description);
      if (data.buttonText && data.buttonLink) {
        lines.push(`\n[${data.buttonText}](${data.buttonLink})`);
      }
      return lines.join('\n\n');
    }
    case 'quote': {
      const lines: string[] = [];
      if (data.quote) lines.push(`> ${data.quote}`);
      if (data.author) lines.push(`> — ${data.author}`);
      return lines.join('\n');
    }
    case 'accordion': {
      const lines: string[] = [];
      if (data.title) lines.push(`## ${data.title}`);
      if (data.items?.length) {
        // deno-lint-ignore no-explicit-any
        for (const item of data.items as any[]) {
          lines.push(`### ${item.question || ''}`);
          if (item.answer?.type === 'doc') {
            lines.push(renderTiptapToMarkdown(item.answer));
          } else if (typeof item.answer === 'string') {
            lines.push(item.answer);
          }
        }
      }
      return lines.join('\n\n');
    }
    case 'testimonials': {
      const lines: string[] = [];
      if (data.title) lines.push(`## ${data.title}`);
      if (data.items?.length) {
        // deno-lint-ignore no-explicit-any
        for (const item of data.items as any[]) {
          lines.push(`> ${item.quote || ''}`);
          lines.push(`> — ${item.author || ''}${item.role ? `, ${item.role}` : ''}`);
          lines.push('');
        }
      }
      return lines.join('\n');
    }
    case 'twoColumn': {
      const lines: string[] = [];
      if (data.leftContent?.type === 'doc') {
        lines.push(renderTiptapToMarkdown(data.leftContent));
      }
      if (data.rightContent?.type === 'doc') {
        lines.push(renderTiptapToMarkdown(data.rightContent));
      }
      return lines.join('\n\n---\n\n');
    }
    case 'stats': {
      const lines: string[] = [];
      if (data.title) lines.push(`## ${data.title}`);
      if (data.stats?.length) {
        // deno-lint-ignore no-explicit-any
        for (const stat of data.stats as any[]) {
          lines.push(`- **${stat.value || ''}** ${stat.label || ''}`);
        }
      }
      return lines.join('\n');
    }
    case 'contact': {
      const lines: string[] = [];
      if (data.title) lines.push(`## ${data.title}`);
      if (data.subtitle) lines.push(data.subtitle);
      if (data.email) lines.push(`📧 ${data.email}`);
      if (data.phone) lines.push(`📞 ${data.phone}`);
      if (data.address) lines.push(`📍 ${data.address}`);
      return lines.join('\n\n');
    }
    default:
      // Fallback: output data as YAML-like format
      return `<!-- Block: ${type} -->\n`;
  }
}

/**
 * Render a full page to Markdown
 */
// deno-lint-ignore no-explicit-any
function renderPageToMarkdown(page: any): string {
  const lines: string[] = [];
  
  // YAML frontmatter
  lines.push('---');
  lines.push(`title: "${page.title || ''}"`);
  lines.push(`slug: "${page.slug || ''}"`);
  if (page.meta_json?.description) {
    lines.push(`description: "${page.meta_json.description}"`);
  }
  if (page.meta_json?.seoTitle) {
    lines.push(`seoTitle: "${page.meta_json.seoTitle}"`);
  }
  lines.push(`updatedAt: "${page.updated_at || ''}"`);
  lines.push('---');
  lines.push('');

  // Render each block
  const blocks = page.content_json || [];
  // deno-lint-ignore no-explicit-any
  for (const block of blocks as any[]) {
    const md = renderBlockToMarkdown(block);
    if (md) {
      lines.push(md);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ============= GraphQL Schema =============

const GRAPHQL_SCHEMA = `
type Query {
  # Pages
  pages(limit: Int, offset: Int): PageConnection!
  page(slug: String!): Page

  # Blog
  blogPosts(limit: Int, offset: Int, category: String, tag: String, featured: Boolean): BlogPostConnection!
  blogPost(slug: String!): BlogPost
  blogCategories: [BlogCategory!]!
  blogTags: [BlogTag!]!

  # Products
  products(limit: Int, offset: Int, active: Boolean): ProductConnection!
  product(id: String!): Product

  # Booking
  bookingServices(active: Boolean): [BookingService!]!
  
  # Knowledge Base
  kbCategories(active: Boolean): [KbCategory!]!
  kbArticles(categorySlug: String, featured: Boolean, limit: Int): [KbArticle!]!
  kbArticle(slug: String!): KbArticle

  # Global Blocks
  globalBlocks(slot: String): [GlobalBlock!]!

  # Site Settings
  siteSettings: SiteSettings
}

type PageConnection {
  nodes: [PageSummary!]!
  totalCount: Int!
}

type PageSummary {
  slug: String!
  title: String!
  status: String!
  meta: PageMeta
  updatedAt: String!
}

type Page {
  slug: String!
  title: String!
  status: String!
  blocks: [Block!]!
  meta: PageMeta
  updatedAt: String!
}

type Block {
  id: String!
  type: String!
  data: JSON!
}

type PageMeta {
  description: String
  keywords: [String!]
  ogImage: String
  seoTitle: String
}

type BlogPostConnection {
  nodes: [BlogPost!]!
  totalCount: Int!
}

type BlogPost {
  id: String!
  slug: String!
  title: String!
  excerpt: String
  featuredImage: String
  featuredImageAlt: String
  content: [Block!]!
  author: Author
  publishedAt: String
  readingTimeMinutes: Int
  isFeatured: Boolean
  categories: [BlogCategory!]!
  tags: [BlogTag!]!
  meta: PageMeta
}

type Author {
  id: String!
  fullName: String
  avatarUrl: String
  bio: String
  title: String
}

type BlogCategory {
  id: String!
  name: String!
  slug: String!
  description: String
  parentId: String
}

type BlogTag {
  id: String!
  name: String!
  slug: String!
}

type ProductConnection {
  nodes: [Product!]!
  totalCount: Int!
}

type Product {
  id: String!
  name: String!
  description: String
  priceCents: Int!
  currency: String!
  imageUrl: String
  type: String!
  isActive: Boolean!
  stripePriceId: String
}

type BookingService {
  id: String!
  name: String!
  description: String
  durationMinutes: Int!
  priceCents: Int
  currency: String!
  color: String
  isActive: Boolean!
}

type KbCategory {
  id: String!
  name: String!
  slug: String!
  description: String
  icon: String
  parentId: String
  isActive: Boolean!
}

type KbArticle {
  id: String!
  title: String!
  slug: String!
  question: String!
  answerText: String
  answerJson: JSON
  categoryId: String!
  category: KbCategory
  isFeatured: Boolean
  isPublished: Boolean
  includeInChat: Boolean
  viewsCount: Int
  helpfulCount: Int
  notHelpfulCount: Int
}

type GlobalBlock {
  id: String!
  slot: String!
  type: String!
  data: JSON!
  isActive: Boolean!
}

type SiteSettings {
  branding: JSON
  seo: JSON
  chat: JSON
  footer: JSON
  cookieBanner: JSON
  kb: JSON
}

scalar JSON
`;

interface GraphQLRequest {
  query: string;
  variables?: Record<string, unknown>;
  operationName?: string;
}

// Simple GraphQL parser and executor
async function executeGraphQL(
  query: string,
  variables: Record<string, unknown> = {},
  supabase: SupabaseClient
): Promise<{ data?: unknown; errors?: Array<{ message: string }> }> {
  console.log('[GraphQL] Executing query:', query.substring(0, 100));
  
  try {
    const normalizedQuery = query.replace(/\s+/g, ' ').trim();
    
    // ============= Pages Queries =============
    
    // Query: pages
    if (normalizedQuery.includes('pages') && !normalizedQuery.includes('page(') && !normalizedQuery.includes('blogPost')) {
      const limitMatch = normalizedQuery.match(/limit:\s*(\d+)/);
      const offsetMatch = normalizedQuery.match(/offset:\s*(\d+)/);
      const limit = limitMatch ? parseInt(limitMatch[1]) : (variables.limit as number) || 100;
      const offset = offsetMatch ? parseInt(offsetMatch[1]) : (variables.offset as number) || 0;
      
      const { data: pages, error, count } = await supabase
        .from('pages')
        .select('slug, title, status, meta_json, updated_at', { count: 'exact' })
        .eq('status', 'published')
        .order('menu_order', { ascending: true })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      // deno-lint-ignore no-explicit-any
      const pageList = (pages || []) as any[];
      
      return {
        data: {
          pages: {
            nodes: pageList.map((p) => ({
              slug: p.slug,
              title: p.title,
              status: p.status,
              meta: p.meta_json ? {
                description: p.meta_json.description,
                seoTitle: p.meta_json.seoTitle,
              } : null,
              updatedAt: p.updated_at,
            })),
            totalCount: count || 0,
          },
        },
      };
    }

    // Query: page(slug: "...")
    const pageSlugMatch = normalizedQuery.match(/page\s*\(\s*slug:\s*["']?([^"'\s)]+)["']?\s*\)/);
    const slugVar = variables.slug as string;
    const pageSlug = pageSlugMatch?.[1] || slugVar;
    
    if (pageSlug && normalizedQuery.includes('page(') && !normalizedQuery.includes('blogPost')) {
      const { data: page, error } = await supabase
        .from('pages')
        .select('*')
        .eq('slug', pageSlug)
        .eq('status', 'published')
        .maybeSingle();

      if (error) throw error;
      if (!page) {
        return { data: { page: null } };
      }

      // deno-lint-ignore no-explicit-any
      const pageData = page as any;

      // deno-lint-ignore no-explicit-any
      const blocks = (pageData.content_json || []).map((b: any) => ({
        id: b.id,
        type: b.type,
        data: b.data,
      }));

      return {
        data: {
          page: {
            slug: pageData.slug,
            title: pageData.title,
            status: pageData.status,
            blocks,
            meta: pageData.meta_json ? {
              description: pageData.meta_json.description,
              keywords: pageData.meta_json.keywords,
              ogImage: pageData.meta_json.og_image,
              seoTitle: pageData.meta_json.seoTitle,
            } : null,
            updatedAt: pageData.updated_at,
          },
        },
      };
    }

    // ============= Blog Queries =============

    // Query: blogPosts
    if (normalizedQuery.includes('blogPosts')) {
      const limitMatch = normalizedQuery.match(/limit:\s*(\d+)/);
      const offsetMatch = normalizedQuery.match(/offset:\s*(\d+)/);
      const featuredMatch = normalizedQuery.match(/featured:\s*(true|false)/);
      const limit = limitMatch ? parseInt(limitMatch[1]) : (variables.limit as number) || 20;
      const offset = offsetMatch ? parseInt(offsetMatch[1]) : (variables.offset as number) || 0;
      const featured = featuredMatch ? featuredMatch[1] === 'true' : (variables.featured as boolean);

      let query = supabase
        .from('blog_posts')
        .select(`
          id, slug, title, excerpt, featured_image, featured_image_alt, 
          content_json, published_at, reading_time_minutes, is_featured, meta_json,
          author:profiles!blog_posts_author_id_fkey(id, full_name, avatar_url, bio, title)
        `, { count: 'exact' })
        .eq('status', 'published')
        .order('published_at', { ascending: false });

      if (featured !== undefined) {
        query = query.eq('is_featured', featured);
      }

      const { data: posts, error, count } = await query.range(offset, offset + limit - 1);

      if (error) throw error;

      // deno-lint-ignore no-explicit-any
      const postList = (posts || []) as any[];

      return {
        data: {
          blogPosts: {
            nodes: postList.map((p) => ({
              id: p.id,
              slug: p.slug,
              title: p.title,
              excerpt: p.excerpt,
              featuredImage: p.featured_image,
              featuredImageAlt: p.featured_image_alt,
              // deno-lint-ignore no-explicit-any
              content: (p.content_json || []).map((b: any) => ({ id: b.id, type: b.type, data: b.data })),
              author: p.author ? {
                id: p.author.id,
                fullName: p.author.full_name,
                avatarUrl: p.author.avatar_url,
                bio: p.author.bio,
                title: p.author.title,
              } : null,
              publishedAt: p.published_at,
              readingTimeMinutes: p.reading_time_minutes,
              isFeatured: p.is_featured,
              meta: p.meta_json ? {
                description: p.meta_json.description,
                seoTitle: p.meta_json.seoTitle,
              } : null,
              categories: [],
              tags: [],
            })),
            totalCount: count || 0,
          },
        },
      };
    }

    // Query: blogPost(slug: "...")
    const blogPostSlugMatch = normalizedQuery.match(/blogPost\s*\(\s*slug:\s*["']?([^"'\s)]+)["']?\s*\)/);
    const blogSlug = blogPostSlugMatch?.[1] || (variables.slug as string);
    
    if (blogSlug && normalizedQuery.includes('blogPost(')) {
      const { data: post, error } = await supabase
        .from('blog_posts')
        .select(`
          id, slug, title, excerpt, featured_image, featured_image_alt, 
          content_json, published_at, reading_time_minutes, is_featured, meta_json,
          author:profiles!blog_posts_author_id_fkey(id, full_name, avatar_url, bio, title)
        `)
        .eq('slug', blogSlug)
        .eq('status', 'published')
        .maybeSingle();

      if (error) throw error;
      if (!post) {
        return { data: { blogPost: null } };
      }

      // deno-lint-ignore no-explicit-any
      const p = post as any;

      return {
        data: {
          blogPost: {
            id: p.id,
            slug: p.slug,
            title: p.title,
            excerpt: p.excerpt,
            featuredImage: p.featured_image,
            featuredImageAlt: p.featured_image_alt,
            // deno-lint-ignore no-explicit-any
            content: (p.content_json || []).map((b: any) => ({ id: b.id, type: b.type, data: b.data })),
            author: p.author ? {
              id: p.author.id,
              fullName: p.author.full_name,
              avatarUrl: p.author.avatar_url,
              bio: p.author.bio,
              title: p.author.title,
            } : null,
            publishedAt: p.published_at,
            readingTimeMinutes: p.reading_time_minutes,
            isFeatured: p.is_featured,
            meta: p.meta_json ? {
              description: p.meta_json.description,
              seoTitle: p.meta_json.seoTitle,
            } : null,
            categories: [],
            tags: [],
          },
        },
      };
    }

    // Query: blogCategories
    if (normalizedQuery.includes('blogCategories')) {
      const { data: categories, error } = await supabase
        .from('blog_categories')
        .select('id, name, slug, description, parent_id')
        .order('sort_order', { ascending: true });

      if (error) throw error;

      return {
        data: {
          // deno-lint-ignore no-explicit-any
          blogCategories: (categories || []).map((c: any) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            description: c.description,
            parentId: c.parent_id,
          })),
        },
      };
    }

    // Query: blogTags
    if (normalizedQuery.includes('blogTags')) {
      const { data: tags, error } = await supabase
        .from('blog_tags')
        .select('id, name, slug')
        .order('name', { ascending: true });

      if (error) throw error;

      return {
        data: {
          // deno-lint-ignore no-explicit-any
          blogTags: (tags || []).map((t: any) => ({
            id: t.id,
            name: t.name,
            slug: t.slug,
          })),
        },
      };
    }

    // ============= Products Queries =============

    // Query: products
    if (normalizedQuery.includes('products') && !normalizedQuery.includes('product(')) {
      const limitMatch = normalizedQuery.match(/limit:\s*(\d+)/);
      const offsetMatch = normalizedQuery.match(/offset:\s*(\d+)/);
      const limit = limitMatch ? parseInt(limitMatch[1]) : (variables.limit as number) || 50;
      const offset = offsetMatch ? parseInt(offsetMatch[1]) : (variables.offset as number) || 0;

      const { data: products, error, count } = await supabase
        .from('products')
        .select('*', { count: 'exact' })
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return {
        data: {
          products: {
            // deno-lint-ignore no-explicit-any
            nodes: (products || []).map((p: any) => ({
              id: p.id,
              name: p.name,
              description: p.description,
              priceCents: p.price_cents,
              currency: p.currency,
              imageUrl: p.image_url,
              type: p.type,
              isActive: p.is_active,
              stripePriceId: p.stripe_price_id,
            })),
            totalCount: count || 0,
          },
        },
      };
    }

    // Query: product(id: "...")
    const productIdMatch = normalizedQuery.match(/product\s*\(\s*id:\s*["']?([^"'\s)]+)["']?\s*\)/);
    const productId = productIdMatch?.[1] || (variables.id as string);

    if (productId && normalizedQuery.includes('product(')) {
      const { data: product, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;
      if (!product) {
        return { data: { product: null } };
      }

      // deno-lint-ignore no-explicit-any
      const p = product as any;

      return {
        data: {
          product: {
            id: p.id,
            name: p.name,
            description: p.description,
            priceCents: p.price_cents,
            currency: p.currency,
            imageUrl: p.image_url,
            type: p.type,
            isActive: p.is_active,
            stripePriceId: p.stripe_price_id,
          },
        },
      };
    }

    // ============= Booking Services =============

    if (normalizedQuery.includes('bookingServices')) {
      const { data: services, error } = await supabase
        .from('booking_services')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;

      return {
        data: {
          // deno-lint-ignore no-explicit-any
          bookingServices: (services || []).map((s: any) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            durationMinutes: s.duration_minutes,
            priceCents: s.price_cents,
            currency: s.currency,
            color: s.color,
            isActive: s.is_active,
          })),
        },
      };
    }

    // ============= Knowledge Base Queries =============

    // Query: kbCategories
    if (normalizedQuery.includes('kbCategories')) {
      const { data: categories, error } = await supabase
        .from('kb_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;

      return {
        data: {
          // deno-lint-ignore no-explicit-any
          kbCategories: (categories || []).map((c: any) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            description: c.description,
            icon: c.icon,
            parentId: c.parent_id,
            isActive: c.is_active,
          })),
        },
      };
    }

    // Query: kbArticles
    if (normalizedQuery.includes('kbArticles') && !normalizedQuery.includes('kbArticle(')) {
      const limitMatch = normalizedQuery.match(/limit:\s*(\d+)/);
      const featuredMatch = normalizedQuery.match(/featured:\s*(true|false)/);
      const categorySlugMatch = normalizedQuery.match(/categorySlug:\s*["']?([^"'\s)]+)["']?/);
      
      const limit = limitMatch ? parseInt(limitMatch[1]) : (variables.limit as number) || 50;
      const featured = featuredMatch ? featuredMatch[1] === 'true' : (variables.featured as boolean);
      const categorySlug = categorySlugMatch?.[1] || (variables.categorySlug as string);

      let query = supabase
        .from('kb_articles')
        .select(`
          *,
          category:kb_categories(id, name, slug, description, icon)
        `)
        .eq('is_published', true)
        .order('sort_order', { ascending: true })
        .limit(limit);

      if (featured !== undefined) {
        query = query.eq('is_featured', featured);
      }

      const { data: articles, error } = await query;

      if (error) throw error;

      // Filter by category slug if provided
      // deno-lint-ignore no-explicit-any
      let filteredArticles = (articles || []) as any[];
      if (categorySlug) {
        // deno-lint-ignore no-explicit-any
        filteredArticles = filteredArticles.filter((a: any) => a.category?.slug === categorySlug);
      }

      return {
        data: {
          // deno-lint-ignore no-explicit-any
          kbArticles: filteredArticles.map((a: any) => ({
            id: a.id,
            title: a.title,
            slug: a.slug,
            question: a.question,
            answerText: a.answer_text,
            answerJson: a.answer_json,
            categoryId: a.category_id,
            category: a.category ? {
              id: a.category.id,
              name: a.category.name,
              slug: a.category.slug,
              description: a.category.description,
              icon: a.category.icon,
            } : null,
            isFeatured: a.is_featured,
            isPublished: a.is_published,
            includeInChat: a.include_in_chat,
            viewsCount: a.views_count,
            helpfulCount: a.helpful_count,
            notHelpfulCount: a.not_helpful_count,
          })),
        },
      };
    }

    // Query: kbArticle(slug: "...")
    const kbArticleSlugMatch = normalizedQuery.match(/kbArticle\s*\(\s*slug:\s*["']?([^"'\s)]+)["']?\s*\)/);
    const kbSlug = kbArticleSlugMatch?.[1] || (variables.slug as string);

    if (kbSlug && normalizedQuery.includes('kbArticle(')) {
      const { data: article, error } = await supabase
        .from('kb_articles')
        .select(`
          *,
          category:kb_categories(id, name, slug, description, icon)
        `)
        .eq('slug', kbSlug)
        .eq('is_published', true)
        .maybeSingle();

      if (error) throw error;
      if (!article) {
        return { data: { kbArticle: null } };
      }

      // deno-lint-ignore no-explicit-any
      const a = article as any;

      return {
        data: {
          kbArticle: {
            id: a.id,
            title: a.title,
            slug: a.slug,
            question: a.question,
            answerText: a.answer_text,
            answerJson: a.answer_json,
            categoryId: a.category_id,
            category: a.category ? {
              id: a.category.id,
              name: a.category.name,
              slug: a.category.slug,
              description: a.category.description,
              icon: a.category.icon,
            } : null,
            isFeatured: a.is_featured,
            isPublished: a.is_published,
            includeInChat: a.include_in_chat,
            viewsCount: a.views_count,
            helpfulCount: a.helpful_count,
            notHelpfulCount: a.not_helpful_count,
          },
        },
      };
    }

    // ============= Global Blocks =============

    if (normalizedQuery.includes('globalBlocks')) {
      const slotMatch = normalizedQuery.match(/slot:\s*["']?([^"'\s)]+)["']?/);
      const slot = slotMatch?.[1] || (variables.slot as string);

      let query = supabase
        .from('global_blocks')
        .select('*')
        .eq('is_active', true);

      if (slot) {
        query = query.eq('slot', slot);
      }

      const { data: blocks, error } = await query;

      if (error) throw error;

      return {
        data: {
          // deno-lint-ignore no-explicit-any
          globalBlocks: (blocks || []).map((b: any) => ({
            id: b.id,
            slot: b.slot,
            type: b.type,
            data: b.data,
            isActive: b.is_active,
          })),
        },
      };
    }

    // ============= Site Settings =============

    if (normalizedQuery.includes('siteSettings')) {
      const { data: settings, error } = await supabase
        .from('site_settings')
        .select('key, value');

      if (error) throw error;

      // deno-lint-ignore no-explicit-any
      const settingsMap: Record<string, any> = {};
      // deno-lint-ignore no-explicit-any
      (settings || []).forEach((s: any) => {
        settingsMap[s.key] = s.value;
      });

      return {
        data: {
          siteSettings: {
            branding: settingsMap.branding || null,
            seo: settingsMap.seo || null,
            chat: settingsMap.chat || null,
            footer: settingsMap.footer || null,
            cookieBanner: settingsMap.cookie_banner || null,
            kb: settingsMap.kb || null,
          },
        },
      };
    }

    return { errors: [{ message: 'Unknown query' }] };
  } catch (error) {
    console.error('[GraphQL] Error:', error);
    return { errors: [{ message: error instanceof Error ? error.message : 'Unknown error' }] };
  }
}

// ============= Main Handler =============

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  
  // Remove 'content-api' from path if present
  if (pathParts[0] === 'content-api') {
    pathParts.shift();
  }
  
  console.log('[Content API] Request:', req.method, url.pathname, 'Parts:', pathParts);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    // ============= GraphQL Endpoint =============
    if (pathParts[0] === 'graphql' || url.pathname.endsWith('/graphql')) {
      if (req.method === 'GET') {
        return new Response(JSON.stringify({ schema: GRAPHQL_SCHEMA }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (req.method === 'POST') {
        const body: GraphQLRequest = await req.json();
        const result = await executeGraphQL(body.query, body.variables, supabase);
        
        return new Response(JSON.stringify(result), {
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=60',
          },
        });
      }
    }

    // ============= REST: GET /pages =============
    if (pathParts.length === 1 && pathParts[0] === 'pages') {
      console.log('[Content API] REST: Fetching all published pages');
      
      const { data: pages, error } = await supabase
        .from('pages')
        .select('slug, title, status, meta_json, updated_at')
        .eq('status', 'published')
        .order('menu_order', { ascending: true });

      if (error) throw error;

      // deno-lint-ignore no-explicit-any
      const pageList = (pages || []) as any[];

      return new Response(JSON.stringify({
        pages: pageList.map((page) => ({
          slug: page.slug,
          title: page.title,
          status: page.status,
          meta: {
            description: page.meta_json?.description,
            seoTitle: page.meta_json?.seoTitle,
          },
          updatedAt: page.updated_at,
          _links: { self: `/content-api/page/${page.slug}` },
        })),
        total: pageList.length,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= REST: GET /page/:slug.md (Markdown export) =============
    if (pathParts.length === 2 && pathParts[0] === 'page' && pathParts[1].endsWith('.md')) {
      const slug = pathParts[1].replace(/\.md$/, '');
      console.log('[Content API] REST: Fetching page as Markdown:', slug);

      const { data: page, error } = await supabase
        .from('pages')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle();

      if (error) throw error;

      if (!page) {
        return new Response(
          `# 404 - Page Not Found\n\nThe page "${slug}" could not be found.`,
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'text/markdown; charset=utf-8' } }
        );
      }

      // deno-lint-ignore no-explicit-any
      const pageData = page as any;
      const markdown = renderPageToMarkdown(pageData);

      return new Response(markdown, {
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `inline; filename="${slug}.md"`,
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        },
      });
    }

    // ============= REST: GET /page/:slug =============
    if (pathParts.length === 2 && pathParts[0] === 'page') {
      const slug = pathParts[1];
      console.log('[Content API] REST: Fetching page:', slug);

      const { data: page, error } = await supabase
        .from('pages')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle();

      if (error) throw error;

      if (!page) {
        return new Response(
          JSON.stringify({ error: 'Page not found', slug }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // deno-lint-ignore no-explicit-any
      const pageData = page as any;

      return new Response(JSON.stringify({
        slug: pageData.slug,
        title: pageData.title,
        status: pageData.status,
        // deno-lint-ignore no-explicit-any
        blocks: (pageData.content_json || []).map((block: any) => ({
          id: block.id,
          type: block.type,
          data: block.data,
        })),
        meta: {
          description: pageData.meta_json?.description,
          keywords: pageData.meta_json?.keywords,
          ogImage: pageData.meta_json?.og_image,
          seoTitle: pageData.meta_json?.seoTitle,
        },
        updatedAt: pageData.updated_at,
        _links: { self: `/content-api/page/${pageData.slug}` },
      }), {
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        },
      });
    }

    // ============= REST: GET /blog/posts =============
    if (pathParts.length === 2 && pathParts[0] === 'blog' && pathParts[1] === 'posts') {
      console.log('[Content API] REST: Fetching blog posts');
      
      const limit = parseInt(url.searchParams.get('limit') || '20');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      const featured = url.searchParams.get('featured');

      let query = supabase
        .from('blog_posts')
        .select(`
          id, slug, title, excerpt, featured_image, featured_image_alt, 
          published_at, reading_time_minutes, is_featured, meta_json,
          author:profiles!blog_posts_author_id_fkey(id, full_name, avatar_url)
        `, { count: 'exact' })
        .eq('status', 'published')
        .order('published_at', { ascending: false });

      if (featured === 'true') {
        query = query.eq('is_featured', true);
      }

      const { data: posts, error, count } = await query.range(offset, offset + limit - 1);

      if (error) throw error;

      return new Response(JSON.stringify({
        // deno-lint-ignore no-explicit-any
        posts: (posts || []).map((p: any) => ({
          id: p.id,
          slug: p.slug,
          title: p.title,
          excerpt: p.excerpt,
          featuredImage: p.featured_image,
          featuredImageAlt: p.featured_image_alt,
          author: p.author ? {
            id: p.author.id,
            fullName: p.author.full_name,
            avatarUrl: p.author.avatar_url,
          } : null,
          publishedAt: p.published_at,
          readingTimeMinutes: p.reading_time_minutes,
          isFeatured: p.is_featured,
          _links: { self: `/content-api/blog/post/${p.slug}` },
        })),
        total: count || 0,
        limit,
        offset,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= REST: GET /blog/post/:slug =============
    if (pathParts.length === 3 && pathParts[0] === 'blog' && pathParts[1] === 'post') {
      const slug = pathParts[2];
      console.log('[Content API] REST: Fetching blog post:', slug);

      const { data: post, error } = await supabase
        .from('blog_posts')
        .select(`
          *,
          author:profiles!blog_posts_author_id_fkey(id, full_name, avatar_url, bio, title)
        `)
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle();

      if (error) throw error;

      if (!post) {
        return new Response(
          JSON.stringify({ error: 'Blog post not found', slug }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // deno-lint-ignore no-explicit-any
      const p = post as any;

      return new Response(JSON.stringify({
        id: p.id,
        slug: p.slug,
        title: p.title,
        excerpt: p.excerpt,
        featuredImage: p.featured_image,
        featuredImageAlt: p.featured_image_alt,
        // deno-lint-ignore no-explicit-any
        content: (p.content_json || []).map((b: any) => ({
          id: b.id,
          type: b.type,
          data: b.data,
        })),
        author: p.author ? {
          id: p.author.id,
          fullName: p.author.full_name,
          avatarUrl: p.author.avatar_url,
          bio: p.author.bio,
          title: p.author.title,
        } : null,
        publishedAt: p.published_at,
        readingTimeMinutes: p.reading_time_minutes,
        isFeatured: p.is_featured,
        meta: {
          description: p.meta_json?.description,
          seoTitle: p.meta_json?.seoTitle,
        },
      }), {
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        },
      });
    }

    // ============= REST: GET /blog/categories =============
    if (pathParts.length === 2 && pathParts[0] === 'blog' && pathParts[1] === 'categories') {
      const { data: categories, error } = await supabase
        .from('blog_categories')
        .select('id, name, slug, description, parent_id')
        .order('sort_order', { ascending: true });

      if (error) throw error;

      return new Response(JSON.stringify({
        // deno-lint-ignore no-explicit-any
        categories: (categories || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          description: c.description,
          parentId: c.parent_id,
        })),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= REST: GET /products =============
    if (pathParts.length === 1 && pathParts[0] === 'products') {
      console.log('[Content API] REST: Fetching products');

      const { data: products, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;

      return new Response(JSON.stringify({
        // deno-lint-ignore no-explicit-any
        products: (products || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          priceCents: p.price_cents,
          currency: p.currency,
          imageUrl: p.image_url,
          type: p.type,
        })),
        total: (products || []).length,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= REST: GET /booking/services =============
    if (pathParts.length === 2 && pathParts[0] === 'booking' && pathParts[1] === 'services') {
      console.log('[Content API] REST: Fetching booking services');

      const { data: services, error } = await supabase
        .from('booking_services')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;

      return new Response(JSON.stringify({
        // deno-lint-ignore no-explicit-any
        services: (services || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          durationMinutes: s.duration_minutes,
          priceCents: s.price_cents,
          currency: s.currency,
          color: s.color,
        })),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= REST: GET /kb/categories =============
    if (pathParts.length === 2 && pathParts[0] === 'kb' && pathParts[1] === 'categories') {
      console.log('[Content API] REST: Fetching KB categories');

      const { data: categories, error } = await supabase
        .from('kb_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;

      return new Response(JSON.stringify({
        // deno-lint-ignore no-explicit-any
        categories: (categories || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          description: c.description,
          icon: c.icon,
          parentId: c.parent_id,
        })),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= REST: GET /kb/articles =============
    if (pathParts.length === 2 && pathParts[0] === 'kb' && pathParts[1] === 'articles') {
      console.log('[Content API] REST: Fetching KB articles');

      const categorySlug = url.searchParams.get('category');
      const featured = url.searchParams.get('featured');

      let query = supabase
        .from('kb_articles')
        .select(`
          *,
          category:kb_categories(id, name, slug, icon)
        `)
        .eq('is_published', true)
        .order('sort_order', { ascending: true });

      if (featured === 'true') {
        query = query.eq('is_featured', true);
      }

      const { data: articles, error } = await query;

      if (error) throw error;

      // deno-lint-ignore no-explicit-any
      let filteredArticles = (articles || []) as any[];
      if (categorySlug) {
        // deno-lint-ignore no-explicit-any
        filteredArticles = filteredArticles.filter((a: any) => a.category?.slug === categorySlug);
      }

      return new Response(JSON.stringify({
        // deno-lint-ignore no-explicit-any
        articles: filteredArticles.map((a: any) => ({
          id: a.id,
          title: a.title,
          slug: a.slug,
          question: a.question,
          answerText: a.answer_text,
          category: a.category ? {
            id: a.category.id,
            name: a.category.name,
            slug: a.category.slug,
            icon: a.category.icon,
          } : null,
          isFeatured: a.is_featured,
          viewsCount: a.views_count,
          _links: { self: `/content-api/kb/article/${a.slug}` },
        })),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= REST: GET /kb/article/:slug =============
    if (pathParts.length === 3 && pathParts[0] === 'kb' && pathParts[1] === 'article') {
      const slug = pathParts[2];
      console.log('[Content API] REST: Fetching KB article:', slug);

      const { data: article, error } = await supabase
        .from('kb_articles')
        .select(`
          *,
          category:kb_categories(id, name, slug, description, icon)
        `)
        .eq('slug', slug)
        .eq('is_published', true)
        .maybeSingle();

      if (error) throw error;

      if (!article) {
        return new Response(
          JSON.stringify({ error: 'Article not found', slug }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // deno-lint-ignore no-explicit-any
      const a = article as any;

      return new Response(JSON.stringify({
        id: a.id,
        title: a.title,
        slug: a.slug,
        question: a.question,
        answerText: a.answer_text,
        answerJson: a.answer_json,
        category: a.category ? {
          id: a.category.id,
          name: a.category.name,
          slug: a.category.slug,
          description: a.category.description,
          icon: a.category.icon,
        } : null,
        isFeatured: a.is_featured,
        viewsCount: a.views_count,
        helpfulCount: a.helpful_count,
        notHelpfulCount: a.not_helpful_count,
      }), {
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        },
      });
    }

    // ============= REST: GET /global-blocks =============
    if (pathParts.length === 1 && pathParts[0] === 'global-blocks') {
      console.log('[Content API] REST: Fetching global blocks');

      const slot = url.searchParams.get('slot');

      let query = supabase
        .from('global_blocks')
        .select('*')
        .eq('is_active', true);

      if (slot) {
        query = query.eq('slot', slot);
      }

      const { data: blocks, error } = await query;

      if (error) throw error;

      return new Response(JSON.stringify({
        // deno-lint-ignore no-explicit-any
        blocks: (blocks || []).map((b: any) => ({
          id: b.id,
          slot: b.slot,
          type: b.type,
          data: b.data,
        })),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= REST: GET /settings =============
    if (pathParts.length === 1 && pathParts[0] === 'settings') {
      console.log('[Content API] REST: Fetching site settings');

      const { data: settings, error } = await supabase
        .from('site_settings')
        .select('key, value');

      if (error) throw error;

      // deno-lint-ignore no-explicit-any
      const settingsMap: Record<string, any> = {};
      // deno-lint-ignore no-explicit-any
      (settings || []).forEach((s: any) => {
        settingsMap[s.key] = s.value;
      });

      return new Response(JSON.stringify({
        branding: settingsMap.branding || null,
        seo: settingsMap.seo || null,
        chat: settingsMap.chat || null,
        footer: settingsMap.footer || null,
        cookieBanner: settingsMap.cookie_banner || null,
        kb: settingsMap.kb || null,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= REST: POST /form/submit =============
    if (pathParts.length === 2 && pathParts[0] === 'form' && pathParts[1] === 'submit' && req.method === 'POST') {
      console.log('[Content API] REST: Submitting form');
      
      const body = await req.json();
      const { block_id, page_id, form_name, data, metadata } = body;

      if (!block_id || !data) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: block_id, data' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: submission, error } = await supabase
        .from('form_submissions')
        .insert({
          block_id,
          page_id: page_id || null,
          form_name: form_name || 'Contact Form',
          data,
          metadata: metadata || null,
        })
        .select()
        .single();

      if (error) throw error;

      console.log('[Content API] Form submission created:', submission.id);

      return new Response(JSON.stringify({
        success: true,
        id: submission.id,
        message: 'Form submitted successfully',
      }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= REST: POST /newsletter/subscribe =============
    if (pathParts.length === 2 && pathParts[0] === 'newsletter' && pathParts[1] === 'subscribe' && req.method === 'POST') {
      console.log('[Content API] REST: Newsletter subscription');
      
      const body = await req.json();
      const { email, name, preferences, metadata } = body;

      if (!email) {
        return new Response(
          JSON.stringify({ error: 'Email is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if already subscribed
      const { data: existing } = await supabase
        .from('newsletter_subscribers')
        .select('id, status')
        .eq('email', email.toLowerCase().trim())
        .maybeSingle();

      if (existing) {
        if (existing.status === 'active') {
          return new Response(JSON.stringify({
            success: true,
            message: 'Already subscribed',
            alreadySubscribed: true,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        // Reactivate unsubscribed user
        const { error: updateError } = await supabase
          .from('newsletter_subscribers')
          .update({ 
            status: 'active', 
            name: name || null,
            preferences: preferences || null,
            unsubscribed_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (updateError) throw updateError;

        return new Response(JSON.stringify({
          success: true,
          message: 'Successfully resubscribed',
          resubscribed: true,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create new subscription
      const { data: subscription, error } = await supabase
        .from('newsletter_subscribers')
        .insert({
          email: email.toLowerCase().trim(),
          name: name || null,
          preferences: preferences || null,
          metadata: metadata || null,
          status: 'active',
        })
        .select()
        .single();

      if (error) throw error;

      console.log('[Content API] Newsletter subscription created:', subscription.id);

      return new Response(JSON.stringify({
        success: true,
        message: 'Successfully subscribed',
        id: subscription.id,
      }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= REST: POST /booking/create =============
    if (pathParts.length === 2 && pathParts[0] === 'booking' && pathParts[1] === 'create' && req.method === 'POST') {
      console.log('[Content API] REST: Creating booking');
      
      const body = await req.json();
      const { service_id, customer_name, customer_email, customer_phone, start_time, notes, metadata } = body;

      if (!customer_name || !customer_email || !start_time) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: customer_name, customer_email, start_time' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get service duration if service_id provided
      let durationMinutes = 60;
      if (service_id) {
        const { data: service } = await supabase
          .from('booking_services')
          .select('duration_minutes')
          .eq('id', service_id)
          .maybeSingle();
        
        if (service) {
          durationMinutes = service.duration_minutes;
        }
      }

      const startDate = new Date(start_time);
      const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

      const { data: booking, error } = await supabase
        .from('bookings')
        .insert({
          service_id: service_id || null,
          customer_name,
          customer_email: customer_email.toLowerCase().trim(),
          customer_phone: customer_phone || null,
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
          notes: notes || null,
          metadata: metadata || null,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      console.log('[Content API] Booking created:', booking.id);

      return new Response(JSON.stringify({
        success: true,
        id: booking.id,
        message: 'Booking created successfully',
        booking: {
          id: booking.id,
          startTime: booking.start_time,
          endTime: booking.end_time,
          status: booking.status,
        },
      }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= Unknown Route =============
    return new Response(
      JSON.stringify({ 
        error: 'Not found',
        availableEndpoints: {
          rest: [
            'GET /content-api/pages',
            'GET /content-api/page/:slug',
            'GET /content-api/blog/posts',
            'GET /content-api/blog/post/:slug',
            'GET /content-api/blog/categories',
            'GET /content-api/products',
            'GET /content-api/booking/services',
            'POST /content-api/booking/create',
            'GET /content-api/kb/categories',
            'GET /content-api/kb/articles',
            'GET /content-api/kb/article/:slug',
            'GET /content-api/global-blocks',
            'GET /content-api/settings',
            'POST /content-api/form/submit',
            'POST /content-api/newsletter/subscribe',
          ],
          graphql: {
            endpoint: 'POST /content-api/graphql',
            schema: 'GET /content-api/graphql',
            examples: [
              '{ pages { nodes { slug title } totalCount } }',
              '{ page(slug: "hem") { title blocks { type data } } }',
              '{ blogPosts(limit: 10, featured: true) { nodes { slug title excerpt } } }',
              '{ products { nodes { name priceCents currency } } }',
              '{ bookingServices { name durationMinutes priceCents } }',
              '{ kbCategories { name slug icon } }',
              '{ kbArticles(categorySlug: "getting-started") { title question answerText } }',
              '{ globalBlocks(slot: "header") { type data } }',
              '{ siteSettings { branding seo } }',
            ],
          },
        },
      }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Content API] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
