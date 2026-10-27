import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { postInLanguage, postsInLanguage, type PostRowLike } from '../_shared/i18n/post-language.ts';
import { productsInLanguage, type ProductRowLike } from '../_shared/i18n/product-language.ts';
import type { OverlayRow } from '../_shared/i18n/resolve-page.ts';
import { productPath } from '../_shared/i18n/shop-address.ts';
import { blogPostPath } from '../_shared/i18n/blog-address.ts';
import type { OverlayEntry } from '../_shared/i18n/translation-units.ts';
import { getServiceClient, getAnonClient, getUserClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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
  # lang: a site language ("sv") — the posts that exist in it, with its text
  blogPosts(limit: Int, offset: Int, category: String, tag: String, featured: Boolean, lang: String): BlogPostConnection!
  blogPost(slug: String!, lang: String): BlogPost
  blogCategories: [BlogCategory!]!
  blogTags: [BlogTag!]!

  # Products
  # lang: a site language ("sv") — every product, with its text in that language where translated (§10)
  products(limit: Int, offset: Int, active: Boolean, lang: String): ProductConnection!
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

  # Orders
  orders(limit: Int, offset: Int, status: String): OrderConnection!
  order(id: String!): Order

  # CRM
  leads(limit: Int, offset: Int, status: String): LeadConnection!
  lead(id: String!): Lead
  deals(limit: Int, offset: Int, stage: String): DealConnection!
  companies(limit: Int, offset: Int): CompanyConnection!

  # Support
  tickets(limit: Int, offset: Int, status: String): TicketConnection!

  # Invoicing
  invoices(limit: Int, offset: Int, status: String): InvoiceConnection!

  # Webinars
  webinars(limit: Int, upcoming: Boolean): [Webinar!]!

  # Consultants
  consultants(active: Boolean): [Consultant!]!

  # Media
  media(limit: Int, offset: Int): MediaConnection!
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
  content: JSON
  author: Author
  publishedAt: String
  readingTimeMinutes: Int
  isFeatured: Boolean
  categories: [BlogCategory!]!
  tags: [BlogTag!]!
  meta: PageMeta
  # The language the text is in, and the post's address in it (/blog/x, /sv/blog/x)
  language: String
  path: String
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

type OrderConnection {
  nodes: [Order!]!
  totalCount: Int!
}

type Order {
  id: String!
  customerEmail: String!
  customerName: String
  totalCents: Int!
  currency: String!
  status: String!
  items: JSON
  createdAt: String!
}

type LeadConnection {
  nodes: [Lead!]!
  totalCount: Int!
}

type Lead {
  id: String!
  name: String
  email: String!
  phone: String
  status: String!
  score: Int
  source: String
  createdAt: String!
}

type DealConnection {
  nodes: [Deal!]!
  totalCount: Int!
}

type Deal {
  id: String!
  valueCents: Int!
  currency: String!
  stage: String!
  expectedClose: String
  notes: String
  leadId: String!
  createdAt: String!
}

type CompanyConnection {
  nodes: [Company!]!
  totalCount: Int!
}

type Company {
  id: String!
  name: String!
  domain: String
  industry: String
  size: String
  website: String
  phone: String
  createdAt: String!
}

type TicketConnection {
  nodes: [Ticket!]!
  totalCount: Int!
}

type Ticket {
  id: String!
  title: String!
  description: String
  status: String!
  priority: String!
  customerEmail: String
  customerName: String
  createdAt: String!
}

type InvoiceConnection {
  nodes: [Invoice!]!
  totalCount: Int!
}

type Invoice {
  id: String!
  invoiceNumber: String!
  totalCents: Int!
  currency: String!
  status: String!
  dueDate: String
  issuedAt: String
  paidAt: String
  createdAt: String!
}

type Webinar {
  id: String!
  title: String!
  description: String
  scheduledAt: String!
  durationMinutes: Int
  status: String!
  registrationUrl: String
  maxAttendees: Int
}

type Consultant {
  id: String!
  name: String!
  title: String
  summary: String
  skills: [String!]!
  hourlyRateCents: Int
  currency: String!
  availability: String
  avatarUrl: String
  isActive: Boolean!
}

type MediaConnection {
  nodes: [MediaAsset!]!
  totalCount: Int!
}

type MediaAsset {
  id: String!
  fileName: String!
  fileUrl: String!
  mimeType: String
  fileSizeBytes: Int
  alt: String
  createdAt: String!
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
      // lang: "sv" — the posts that exist in Swedish, with Swedish text (page-translations.md §9).
      const lang = graphqlLang(normalizedQuery, 'blogPosts', variables);

      const cols = `
          id, slug, locale, title, excerpt, featured_image, featured_image_alt, 
          content_json, published_at, reading_time_minutes, is_featured, meta_json,
          author:profiles!blog_posts_author_id_fkey(id, full_name, avatar_url, bio, title)
        `;
      const build = (inLanguage: boolean) => {
        let query = (inLanguage && lang
          ? supabase.rpc('blog_posts_in_language', { p_lang: lang }, { count: 'exact' }).select(cols)
          : supabase.from('blog_posts').select(cols, { count: 'exact' }))
          .eq('status', 'published')
          .order('published_at', { ascending: false });
        if (featured !== undefined) query = query.eq('is_featured', featured);
        return query.range(offset, offset + limit - 1);
      };
      let res = await build(!!lang);
      // An instance without the language migration yet: every post, as before.
      if (res.error && lang) res = await build(false);
      const { error, count } = res;

      if (error) throw error;

      // deno-lint-ignore no-explicit-any
      let postList = ((res.data as unknown) || []) as any[];
      if (lang) {
        const defaultLang = await siteDefaultLanguage(supabase);
        const overlays = await publishedPostOverlays(supabase, postList.map((p) => p.id), lang);
        postList = postsInLanguage(postList, lang, overlays, defaultLang)
          .map((r) => ({ ...r.post, slug: r.slug, _lang: r.locale, _href: blogPostPath(r.slug, r.locale, defaultLang) }));
      }

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
              content: p.content_json || null,
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
              language: p._lang ?? p.locale ?? null,
              path: p._href ?? null,
            })),
            totalCount: count || 0,
          },
        },
      };
    }

    // Query: blogPost(slug: "...")
    const blogPostSlugMatch = normalizedQuery.match(/blogPost\s*\([^)]*slug:\s*["']?([^"'\s,)]+)/);
    const blogSlug = blogPostSlugMatch?.[1] || (variables.slug as string);
    
    if (blogSlug && normalizedQuery.includes('blogPost(')) {
      const lang = graphqlLang(normalizedQuery, 'blogPost', variables);
      const cols = `
          id, slug, locale, title, excerpt, featured_image, featured_image_alt, 
          content_json, published_at, reading_time_minutes, is_featured, meta_json,
          author:profiles!blog_posts_author_id_fkey(id, full_name, avatar_url, bio, title)
        `;
      const first = await supabase
        .from('blog_posts')
        .select(cols)
        .eq('slug', blogSlug)
        .eq('status', 'published')
        .maybeSingle();

      if (first.error) throw first.error;
      let post = first.data;
      // lang: "sv" — the post in Swedish: its own text or its published
      // overlay (whose own slug also names it); null when it has none.
      let language: { locale: string; path: string } | null = null;
      if (lang) {
        if (!post) {
          const { data: hit, error: hitErr } = await supabase.from('content_translations').select('entity_id')
            .eq('entity', 'blog_post').eq('locale', lang).eq('slug', blogSlug).eq('status', 'published').maybeSingle();
          if (hitErr && !['42P01', 'PGRST205'].includes(String(hitErr.code))) throw hitErr;
          if (hit?.entity_id) {
            const byId = await supabase.from('blog_posts').select(cols).eq('id', hit.entity_id).eq('status', 'published').maybeSingle();
            if (byId.error) throw byId.error;
            post = byId.data;
          }
        }
        if (post) {
          const defaultLang = await siteDefaultLanguage(supabase);
          const overlays = await publishedPostOverlays(supabase, [post.id], lang);
          const r = postInLanguage(post as unknown as PostRowLike & Record<string, unknown>, lang, overlays[0] ?? null, defaultLang);
          if (!r) return { data: { blogPost: null } };
          post = { ...r.post, slug: r.slug } as typeof post;
          language = { locale: r.locale, path: blogPostPath(r.slug, r.locale, defaultLang) };
        }
      }
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
            content: p.content_json || null,
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
            language: language?.locale ?? p.locale ?? null,
            path: language?.path ?? null,
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
      // lang: "sv" — the same products, Swedish text where a published overlay exists (§10).
      const productLang = graphqlLang(normalizedQuery, 'products', variables);
      const localized = await productsForLang(supabase, (products || []) as ProductApiRow[], productLang);

      return {
        data: {
          products: {
            nodes: localized.map((r) => ({
              id: r.product.id,
              name: r.product.name,
              description: r.product.description,
              priceCents: r.product.price_cents,
              currency: r.product.currency,
              imageUrl: r.product.image_url,
              type: r.product.type,
              isActive: r.product.is_active,
              stripePriceId: r.product.stripe_price_id,
              language: r.locale,
              path: r.path,
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

      const oneLang = graphqlLang(normalizedQuery, 'product', variables);
      const [one] = await productsForLang(supabase, [product as ProductApiRow], oneLang);
      const p = one.product;

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
            language: one.locale,
            path: one.path,
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

    // ============= Orders Queries =============

    if (normalizedQuery.includes('orders') && !normalizedQuery.includes('order(')) {
      const limitMatch = normalizedQuery.match(/limit:\s*(\d+)/);
      const offsetMatch = normalizedQuery.match(/offset:\s*(\d+)/);
      const statusMatch = normalizedQuery.match(/status:\s*["']?([^"'\s),]+)["']?/);
      const limit = limitMatch ? parseInt(limitMatch[1]) : (variables.limit as number) || 50;
      const offset = offsetMatch ? parseInt(offsetMatch[1]) : (variables.offset as number) || 0;
      const status = statusMatch?.[1] || (variables.status as string);

      let query = supabase
        .from('orders')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) query = query.eq('status', status);

      const { data: orders, error, count } = await query;
      if (error) throw error;

      return {
        data: {
          orders: {
            // deno-lint-ignore no-explicit-any
            nodes: (orders || []).map((o: any) => ({
              id: o.id, customerEmail: o.customer_email, customerName: o.customer_name,
              totalCents: o.total_cents, currency: o.currency, status: o.status,
              items: o.items, createdAt: o.created_at,
            })),
            totalCount: count || 0,
          },
        },
      };
    }

    // Query: order(id)
    const orderIdMatch = normalizedQuery.match(/order\s*\(\s*id:\s*["']?([^"'\s)]+)["']?\s*\)/);
    const orderId = orderIdMatch?.[1] || (variables.id as string);
    if (orderId && normalizedQuery.includes('order(')) {
      const { data: order, error } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
      if (error) throw error;
      if (!order) return { data: { order: null } };
      // deno-lint-ignore no-explicit-any
      const o = order as any;
      return { data: { order: { id: o.id, customerEmail: o.customer_email, customerName: o.customer_name, totalCents: o.total_cents, currency: o.currency, status: o.status, items: o.items, createdAt: o.created_at } } };
    }

    // ============= Leads Queries =============

    if (normalizedQuery.includes('leads') && !normalizedQuery.includes('lead(')) {
      const limitMatch = normalizedQuery.match(/limit:\s*(\d+)/);
      const offsetMatch = normalizedQuery.match(/offset:\s*(\d+)/);
      const statusMatch = normalizedQuery.match(/status:\s*["']?([^"'\s),]+)["']?/);
      const limit = limitMatch ? parseInt(limitMatch[1]) : (variables.limit as number) || 50;
      const offset = offsetMatch ? parseInt(offsetMatch[1]) : (variables.offset as number) || 0;
      const status = statusMatch?.[1] || (variables.status as string);

      let query = supabase.from('leads').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
      if (status) query = query.eq('status', status);

      const { data: leads, error, count } = await query;
      if (error) throw error;

      return {
        data: {
          leads: {
            // deno-lint-ignore no-explicit-any
            nodes: (leads || []).map((l: any) => ({
              id: l.id, name: l.name, email: l.email, phone: l.phone,
              status: l.status, score: l.score, source: l.source, createdAt: l.created_at,
            })),
            totalCount: count || 0,
          },
        },
      };
    }

    // Query: lead(id)
    const leadIdMatch = normalizedQuery.match(/lead\s*\(\s*id:\s*["']?([^"'\s)]+)["']?\s*\)/);
    const leadId = leadIdMatch?.[1] || (variables.id as string);
    if (leadId && normalizedQuery.includes('lead(')) {
      const { data: lead, error } = await supabase.from('leads').select('*').eq('id', leadId).maybeSingle();
      if (error) throw error;
      if (!lead) return { data: { lead: null } };
      // deno-lint-ignore no-explicit-any
      const l = lead as any;
      return { data: { lead: { id: l.id, name: l.name, email: l.email, phone: l.phone, status: l.status, score: l.score, source: l.source, createdAt: l.created_at } } };
    }

    // ============= Deals Queries =============

    if (normalizedQuery.includes('deals')) {
      const limitMatch = normalizedQuery.match(/limit:\s*(\d+)/);
      const offsetMatch = normalizedQuery.match(/offset:\s*(\d+)/);
      const stageMatch = normalizedQuery.match(/stage:\s*["']?([^"'\s),]+)["']?/);
      const limit = limitMatch ? parseInt(limitMatch[1]) : (variables.limit as number) || 50;
      const offset = offsetMatch ? parseInt(offsetMatch[1]) : (variables.offset as number) || 0;
      const stage = stageMatch?.[1] || (variables.stage as string);

      let query = supabase.from('deals').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
      if (stage) query = query.eq('stage', stage);

      const { data: deals, error, count } = await query;
      if (error) throw error;

      return {
        data: {
          deals: {
            // deno-lint-ignore no-explicit-any
            nodes: (deals || []).map((d: any) => ({
              id: d.id, valueCents: d.value_cents, currency: d.currency,
              stage: d.stage, expectedClose: d.expected_close, notes: d.notes,
              leadId: d.lead_id, createdAt: d.created_at,
            })),
            totalCount: count || 0,
          },
        },
      };
    }

    // ============= Companies Queries =============

    if (normalizedQuery.includes('companies')) {
      const limitMatch = normalizedQuery.match(/limit:\s*(\d+)/);
      const offsetMatch = normalizedQuery.match(/offset:\s*(\d+)/);
      const limit = limitMatch ? parseInt(limitMatch[1]) : (variables.limit as number) || 50;
      const offset = offsetMatch ? parseInt(offsetMatch[1]) : (variables.offset as number) || 0;

      const { data: companies, error, count } = await supabase.from('companies').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
      if (error) throw error;

      return {
        data: {
          companies: {
            // deno-lint-ignore no-explicit-any
            nodes: (companies || []).map((c: any) => ({
              id: c.id, name: c.name, domain: c.domain, industry: c.industry,
              size: c.size, website: c.website, phone: c.phone, createdAt: c.created_at,
            })),
            totalCount: count || 0,
          },
        },
      };
    }

    // ============= Tickets Queries =============

    if (normalizedQuery.includes('tickets')) {
      const limitMatch = normalizedQuery.match(/limit:\s*(\d+)/);
      const offsetMatch = normalizedQuery.match(/offset:\s*(\d+)/);
      const statusMatch = normalizedQuery.match(/status:\s*["']?([^"'\s),]+)["']?/);
      const limit = limitMatch ? parseInt(limitMatch[1]) : (variables.limit as number) || 50;
      const offset = offsetMatch ? parseInt(offsetMatch[1]) : (variables.offset as number) || 0;
      const status = statusMatch?.[1] || (variables.status as string);

      let query = supabase.from('support_tickets').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
      if (status) query = query.eq('status', status);

      const { data: tickets, error, count } = await query;
      if (error) throw error;

      return {
        data: {
          tickets: {
            // deno-lint-ignore no-explicit-any
            nodes: (tickets || []).map((t: any) => ({
              id: t.id, title: t.title, description: t.description,
              status: t.status, priority: t.priority,
              customerEmail: t.customer_email, customerName: t.customer_name,
              createdAt: t.created_at,
            })),
            totalCount: count || 0,
          },
        },
      };
    }

    // ============= Invoices Queries =============

    if (normalizedQuery.includes('invoices')) {
      const limitMatch = normalizedQuery.match(/limit:\s*(\d+)/);
      const offsetMatch = normalizedQuery.match(/offset:\s*(\d+)/);
      const statusMatch = normalizedQuery.match(/status:\s*["']?([^"'\s),]+)["']?/);
      const limit = limitMatch ? parseInt(limitMatch[1]) : (variables.limit as number) || 50;
      const offset = offsetMatch ? parseInt(offsetMatch[1]) : (variables.offset as number) || 0;
      const status = statusMatch?.[1] || (variables.status as string);

      let query = supabase.from('invoices').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
      if (status) query = query.eq('status', status);

      const { data: invoices, error, count } = await query;
      if (error) throw error;

      return {
        data: {
          invoices: {
            // deno-lint-ignore no-explicit-any
            nodes: (invoices || []).map((i: any) => ({
              id: i.id, invoiceNumber: i.invoice_number, totalCents: i.total_cents,
              currency: i.currency, status: i.status, dueDate: i.due_date,
              issuedAt: i.issued_at, paidAt: i.paid_at, createdAt: i.created_at,
            })),
            totalCount: count || 0,
          },
        },
      };
    }

    // ============= Webinars Queries =============

    if (normalizedQuery.includes('webinars')) {
      const limitMatch = normalizedQuery.match(/limit:\s*(\d+)/);
      const limit = limitMatch ? parseInt(limitMatch[1]) : (variables.limit as number) || 20;

      let query = supabase.from('webinars').select('*').order('scheduled_at', { ascending: true }).limit(limit);

      const upcomingMatch = normalizedQuery.match(/upcoming:\s*(true|false)/);
      const upcoming = upcomingMatch ? upcomingMatch[1] === 'true' : (variables.upcoming as boolean);
      if (upcoming) {
        query = query.gte('scheduled_at', new Date().toISOString());
      }

      const { data: webinars, error } = await query;
      if (error) throw error;

      return {
        data: {
          // deno-lint-ignore no-explicit-any
          webinars: (webinars || []).map((w: any) => ({
            id: w.id, title: w.title, description: w.description,
            scheduledAt: w.scheduled_at, durationMinutes: w.duration_minutes,
            status: w.status, registrationUrl: w.registration_url,
            maxAttendees: w.max_attendees,
          })),
        },
      };
    }

    // ============= Consultants Queries =============

    if (normalizedQuery.includes('consultants')) {
      const { data: consultants, error } = await supabase
        .from('consultant_profiles')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;

      return {
        data: {
          // deno-lint-ignore no-explicit-any
          consultants: (consultants || []).map((c: any) => ({
            id: c.id, name: c.name, title: c.title, summary: c.summary,
            skills: c.skills || [], hourlyRateCents: c.hourly_rate_cents,
            currency: c.currency, availability: c.availability,
            avatarUrl: c.avatar_url, isActive: c.is_active,
          })),
        },
      };
    }

    // ============= Media Queries =============

    if (normalizedQuery.includes('media')) {
      const limitMatch = normalizedQuery.match(/limit:\s*(\d+)/);
      const offsetMatch = normalizedQuery.match(/offset:\s*(\d+)/);
      const limit = limitMatch ? parseInt(limitMatch[1]) : (variables.limit as number) || 50;
      const offset = offsetMatch ? parseInt(offsetMatch[1]) : (variables.offset as number) || 0;

      const { data: media, error, count } = await supabase
        .from('media')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return {
        data: {
          media: {
            // deno-lint-ignore no-explicit-any
            nodes: (media || []).map((m: any) => ({
              id: m.id, fileName: m.file_name, fileUrl: m.file_url,
              mimeType: m.mime_type, fileSizeBytes: m.file_size_bytes,
              alt: m.alt, createdAt: m.created_at,
            })),
            totalCount: count || 0,
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
    const supabase = getAnonClient();

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
      // ?lang=sv: the posts that exist in Swedish, with Swedish text (§9).
      const lang = (url.searchParams.get('lang') || '').trim().toLowerCase() || null;
      const defaultLang = lang ? await siteDefaultLanguage(supabase) : 'en';

      const cols = `
          id, slug, locale, title, excerpt, featured_image, featured_image_alt, 
          published_at, reading_time_minutes, is_featured, meta_json,
          author:profiles!blog_posts_author_id_fkey(id, full_name, avatar_url)
        `;
      const build = (inLanguage: boolean) => {
        let query = (inLanguage && lang
          ? supabase.rpc('blog_posts_in_language', { p_lang: lang }, { count: 'exact' }).select(cols)
          : supabase.from('blog_posts').select(cols, { count: 'exact' }))
          .eq('status', 'published')
          .order('published_at', { ascending: false });
        if (featured === 'true') query = query.eq('is_featured', true);
        return query.range(offset, offset + limit - 1);
      };
      let res = await build(!!lang);
      if (res.error && lang) res = await build(false);
      const { error, count } = res;
      type ListRow = PostRowLike & Record<string, unknown>;
      let posts: ListRow[] = (res.data as unknown as ListRow[] | null) || [];

      if (error) throw error;
      if (lang) {
        const overlays = await publishedPostOverlays(supabase, posts.map((p) => p.id), lang);
        posts = postsInLanguage(posts, lang, overlays, defaultLang)
          .map((r) => ({ ...r.post, slug: r.slug, _lang: r.locale, _href: blogPostPath(r.slug, r.locale, defaultLang) }));
      }

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
          ...(p._lang ? { language: p._lang, path: p._href } : {}),
          _links: { self: `/content-api/blog/post/${p.slug}${lang ? `?lang=${encodeURIComponent(lang)}` : ''}` },
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
      const lang = (url.searchParams.get('lang') || '').trim().toLowerCase() || null;

      const postSelect = `
          *,
          author:profiles!blog_posts_author_id_fkey(id, full_name, avatar_url, bio, title)
        `;
      const first = await supabase
        .from('blog_posts')
        .select(postSelect)
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle();

      if (first.error) throw first.error;
      let post = first.data;

      // ?lang=sv: the post in Swedish — its own text, or its published
      // overlay (the overlay's own slug also names it). Absent in that
      // language is a 404 with the languages it does exist in.
      let served: { locale: string; path: string; coverage: number } | null = null;
      if (lang) {
        if (!post) {
          const { data: hit, error: hitErr } = await supabase.from('content_translations').select('entity_id')
            .eq('entity', 'blog_post').eq('locale', lang).eq('slug', slug).eq('status', 'published').maybeSingle();
          // An instance without the table yet has no translated slugs; anything else is a real failure.
          if (hitErr && !['42P01', 'PGRST205'].includes(String(hitErr.code))) throw hitErr;
          if (hit?.entity_id) {
            const byId = await supabase.from('blog_posts').select(postSelect).eq('id', hit.entity_id).eq('status', 'published').maybeSingle();
            if (byId.error) throw byId.error;
            post = byId.data;
          }
        }
        if (post) {
          const defaultLang = await siteDefaultLanguage(supabase);
          const overlays = await publishedPostOverlays(supabase, [post.id], null);
          const r = postInLanguage(post as unknown as PostRowLike & Record<string, unknown>, lang, overlays.find((o) => o.locale === lang) ?? null, defaultLang);
          if (!r) {
            return new Response(
              JSON.stringify({ error: 'Blog post not published in this language', slug, lang, available: [String(post.locale ?? defaultLang), ...overlays.map((o) => o.locale)] }),
              { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          post = { ...r.post, slug: r.slug };
          served = { locale: r.locale, path: blogPostPath(r.slug, r.locale, defaultLang), coverage: r.coverage };
        }
      }

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
        content: p.content_json || null,
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
        ...(served ? { language: served.locale, path: served.path, coverage: served.coverage } : {}),
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
      // ?lang=sv: every product, Swedish text where translated (§10).
      const restLang = (url.searchParams.get('lang') || '').trim().toLowerCase() || null;
      const localized = await productsForLang(supabase, (products || []) as ProductApiRow[], restLang);

      return new Response(JSON.stringify({
        products: localized.map((r) => ({
          id: r.product.id,
          name: r.product.name,
          description: r.product.description,
          priceCents: r.product.price_cents,
          currency: r.product.currency,
          imageUrl: r.product.image_url,
          type: r.product.type,
          language: r.locale,
          path: r.path,
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

    // ============= REST: the feedback board (feedback module) =============
    // GET /feedback/posts, GET /feedback/post/:id — the public board.
    // POST /feedback (a post), /feedback/vote, /feedback/comment — the board's
    // own writes; POST /feedback/ping — another instance's daily ping. Writes go
    // through the service client after validation; a honeypot field ("website")
    // filled in means a bot, answered 201 and dropped.
    const FEEDBACK_BOARDS = new Set(['bug', 'feature', 'template', 'question']);
    const FEEDBACK_STATUSES = new Set(['open', 'planned', 'in_progress', 'done', 'declined']);
    const feedbackJson = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    if (pathParts[0] === 'feedback') {
      if (req.method === 'GET' && pathParts.length === 2 && pathParts[1] === 'posts') {
        const board = url.searchParams.get('board') || '';
        const status = url.searchParams.get('status') || '';
        const qText = (url.searchParams.get('q') || '').replace(/[%_]/g, '').trim();
        const sort = url.searchParams.get('sort') === 'top' ? 'top' : 'newest';
        const lim = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200);
        let q = supabase.from('feedback_posts')
          .select('id, board, title, body, status, author_name, votes_count, comments_count, created_at, updated_at')
          .limit(lim);
        if (FEEDBACK_BOARDS.has(board)) q = q.eq('board', board);
        if (FEEDBACK_STATUSES.has(status)) q = q.eq('status', status);
        if (qText) q = q.ilike('title', `%${qText}%`);
        q = sort === 'top' ? q.order('votes_count', { ascending: false }).order('created_at', { ascending: false }) : q.order('created_at', { ascending: false });
        const { data, error } = await q;
        if (error) throw error;
        return feedbackJson({ posts: data ?? [], count: (data ?? []).length });
      }
      if (req.method === 'GET' && pathParts.length === 3 && pathParts[1] === 'post') {
        const { data: post, error } = await supabase.from('feedback_posts')
          .select('id, board, title, body, status, author_name, votes_count, comments_count, created_at, updated_at')
          .eq('id', pathParts[2]).maybeSingle();
        if (error) throw error;
        if (!post) return feedbackJson({ error: 'Not found' }, 404);
        const { data: comments, error: cErr } = await supabase.from('feedback_comments')
          .select('id, author_name, body, is_staff, created_at').eq('post_id', pathParts[2]).order('created_at');
        if (cErr) throw cErr;
        return feedbackJson({ post, comments: comments ?? [] });
      }
      if (req.method === 'POST') {
        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        // The anon client throughout: the board's writes are RLS policies (a
        // post is born open, a comment is never staff, a vote is one row per
        // voter) and the ping is one definer RPC. No service key in here.
        const admin = supabase;
        const sub = pathParts[1] ?? '';
        if (typeof body.website === 'string' && body.website.trim()) return feedbackJson({ success: true, id: null }, 201);
        if (sub === '') {
          const board = FEEDBACK_BOARDS.has(String(body.board ?? '')) ? String(body.board) : 'feature';
          const title = String(body.title ?? '').trim();
          if (title.length < 3 || title.length > 200) return feedbackJson({ error: 'title: 3–200 characters' }, 400);
          const text = String(body.body ?? '').slice(0, 10000);
          const originUrl = typeof body.origin_site_url === 'string' && /^https?:\/\//.test(body.origin_site_url) ? body.origin_site_url.slice(0, 300) : null;
          const origin = body.origin && typeof body.origin === 'object' ? body.origin : {};
          const { data, error } = await admin.from('feedback_posts').insert({
            board, title, body: text,
            author_name: typeof body.author_name === 'string' ? body.author_name.slice(0, 120) : null,
            author_email: typeof body.author_email === 'string' ? body.author_email.slice(0, 200) : null,
            origin_site_url: originUrl, origin, source: originUrl ? 'instance' : 'board',
          }).select('id, status').single();
          if (error) throw error;
          return feedbackJson({ success: true, id: data.id, status: data.status }, 201);
        }
        if (sub === 'ping') {
          const instance_id = String(body.instance_id ?? '');
          if (!/^[0-9a-f-]{36}$/i.test(instance_id)) return feedbackJson({ error: 'instance_id must be a uuid' }, 400);
          const modules = Array.isArray(body.modules_enabled) ? body.modules_enabled.filter((m) => typeof m === 'string').slice(0, 200) : [];
          const { data: pinged, error } = await admin.rpc('feedback_record_ping', {
            p_instance_id: instance_id,
            p_site_url: typeof body.site_url === 'string' && /^https?:\/\//.test(body.site_url) ? body.site_url.slice(0, 300) : null,
            p_app: typeof body.app === 'string' ? body.app.slice(0, 40) : 'flowwink',
            p_skills_sha: typeof body.skills_sha === 'string' ? body.skills_sha.slice(0, 64) : null,
            p_migration_head: typeof body.migration_head === 'string' ? body.migration_head.slice(0, 32) : null,
            p_modules_enabled: modules,
          });
          if (error) throw error;
          return feedbackJson({ success: true, instance_id, counted: true, ping_count: (pinged as { ping_count?: number } | null)?.ping_count ?? null });
        }
        if (sub === 'vote') {
          const post_id = String(body.post_id ?? ''); const voter_key = String(body.voter_key ?? '').slice(0, 200);
          if (!post_id || !voter_key) return feedbackJson({ error: 'post_id and voter_key are required' }, 400);
          if (body.remove === true) {
            const { error } = await admin.from('feedback_votes').delete().eq('post_id', post_id).eq('voter_key', voter_key);
            if (error) throw error;
          } else {
            const { error } = await admin.from('feedback_votes').upsert({ post_id, voter_key }, { onConflict: 'post_id,voter_key', ignoreDuplicates: true });
            if (error) throw error;
          }
          const { data: post, error: pErr } = await admin.from('feedback_posts').select('votes_count').eq('id', post_id).maybeSingle();
          if (pErr) throw pErr;
          return feedbackJson({ success: true, post_id, votes_count: post?.votes_count ?? 0, voted: body.remove !== true });
        }
        if (sub === 'comment') {
          const post_id = String(body.post_id ?? ''); const text = String(body.body ?? '').trim().slice(0, 5000);
          if (!post_id || !text) return feedbackJson({ error: 'post_id and body are required' }, 400);
          const { data, error } = await admin.from('feedback_comments').insert({
            post_id, body: text, author_name: typeof body.author_name === 'string' ? body.author_name.slice(0, 120) : null, is_staff: false,
          }).select('id, created_at').single();
          if (error) throw error;
          return feedbackJson({ success: true, id: data.id, created_at: data.created_at }, 201);
        }
        return feedbackJson({ error: 'Unknown feedback route' }, 404);
      }
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
        if (existing.status === 'confirmed') {
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
            status: 'confirmed', 
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
          status: 'confirmed',
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

    // ============= REST: GET /orders =============
    if (pathParts.length === 1 && pathParts[0] === 'orders') {
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      const status = url.searchParams.get('status');
      let query = supabase.from('orders').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
      if (status) query = query.eq('status', status);
      const { data, error, count } = await query;
      if (error) throw error;
      // deno-lint-ignore no-explicit-any
      return new Response(JSON.stringify({ orders: (data || []).map((o: any) => ({ id: o.id, customerEmail: o.customer_email, customerName: o.customer_name, totalCents: o.total_cents, currency: o.currency, status: o.status, items: o.items, createdAt: o.created_at })), total: count || 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ============= REST: GET /order/:id =============
    if (pathParts.length === 2 && pathParts[0] === 'order') {
      const { data, error } = await supabase.from('orders').select('*').eq('id', pathParts[1]).maybeSingle();
      if (error) throw error;
      if (!data) return new Response(JSON.stringify({ error: 'Order not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      // deno-lint-ignore no-explicit-any
      const o = data as any;
      return new Response(JSON.stringify({ id: o.id, customerEmail: o.customer_email, customerName: o.customer_name, totalCents: o.total_cents, currency: o.currency, status: o.status, items: o.items, createdAt: o.created_at }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ============= REST: GET /leads =============
    if (pathParts.length === 1 && pathParts[0] === 'leads') {
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      const status = url.searchParams.get('status');
      let query = supabase.from('leads').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
      if (status) query = query.eq('status', status);
      const { data, error, count } = await query;
      if (error) throw error;
      // deno-lint-ignore no-explicit-any
      return new Response(JSON.stringify({ leads: (data || []).map((l: any) => ({ id: l.id, name: l.name, email: l.email, phone: l.phone, status: l.status, score: l.score, source: l.source, createdAt: l.created_at })), total: count || 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ============= REST: GET /lead/:id =============
    if (pathParts.length === 2 && pathParts[0] === 'lead') {
      const { data, error } = await supabase.from('leads').select('*').eq('id', pathParts[1]).maybeSingle();
      if (error) throw error;
      if (!data) return new Response(JSON.stringify({ error: 'Lead not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      // deno-lint-ignore no-explicit-any
      const l = data as any;
      return new Response(JSON.stringify({ id: l.id, name: l.name, email: l.email, phone: l.phone, status: l.status, score: l.score, source: l.source, createdAt: l.created_at }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ============= REST: GET /deals =============
    if (pathParts.length === 1 && pathParts[0] === 'deals') {
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      const stage = url.searchParams.get('stage');
      let query = supabase.from('deals').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
      if (stage) query = query.eq('stage', stage);
      const { data, error, count } = await query;
      if (error) throw error;
      // deno-lint-ignore no-explicit-any
      return new Response(JSON.stringify({ deals: (data || []).map((d: any) => ({ id: d.id, valueCents: d.value_cents, currency: d.currency, stage: d.stage, expectedClose: d.expected_close, notes: d.notes, leadId: d.lead_id, createdAt: d.created_at })), total: count || 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ============= REST: GET /companies =============
    if (pathParts.length === 1 && pathParts[0] === 'companies') {
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      const { data, error, count } = await supabase.from('companies').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
      if (error) throw error;
      // deno-lint-ignore no-explicit-any
      return new Response(JSON.stringify({ companies: (data || []).map((c: any) => ({ id: c.id, name: c.name, domain: c.domain, industry: c.industry, size: c.size, website: c.website, phone: c.phone, createdAt: c.created_at })), total: count || 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ============= REST: GET /tickets =============
    if (pathParts.length === 1 && pathParts[0] === 'tickets') {
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      const status = url.searchParams.get('status');
      let query = supabase.from('support_tickets').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
      if (status) query = query.eq('status', status);
      const { data, error, count } = await query;
      if (error) throw error;
      // deno-lint-ignore no-explicit-any
      return new Response(JSON.stringify({ tickets: (data || []).map((t: any) => ({ id: t.id, title: t.title, description: t.description, status: t.status, priority: t.priority, customerEmail: t.customer_email, customerName: t.customer_name, createdAt: t.created_at })), total: count || 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ============= REST: GET /invoices =============
    if (pathParts.length === 1 && pathParts[0] === 'invoices') {
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      const status = url.searchParams.get('status');
      let query = supabase.from('invoices').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
      if (status) query = query.eq('status', status);
      const { data, error, count } = await query;
      if (error) throw error;
      // deno-lint-ignore no-explicit-any
      return new Response(JSON.stringify({ invoices: (data || []).map((i: any) => ({ id: i.id, invoiceNumber: i.invoice_number, totalCents: i.total_cents, currency: i.currency, status: i.status, dueDate: i.due_date, issuedAt: i.issued_at, paidAt: i.paid_at, createdAt: i.created_at })), total: count || 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ============= REST: GET /webinars =============
    if (pathParts.length === 1 && pathParts[0] === 'webinars') {
      const limit = parseInt(url.searchParams.get('limit') || '20');
      let query = supabase.from('webinars').select('*').order('scheduled_at', { ascending: true }).limit(limit);
      if (url.searchParams.get('upcoming') === 'true') {
        query = query.gte('scheduled_at', new Date().toISOString());
      }
      const { data, error } = await query;
      if (error) throw error;
      // deno-lint-ignore no-explicit-any
      return new Response(JSON.stringify({ webinars: (data || []).map((w: any) => ({ id: w.id, title: w.title, description: w.description, scheduledAt: w.scheduled_at, durationMinutes: w.duration_minutes, status: w.status, registrationUrl: w.registration_url, maxAttendees: w.max_attendees })) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ============= REST: GET /consultants =============
    if (pathParts.length === 1 && pathParts[0] === 'consultants') {
      const { data, error } = await supabase.from('consultant_profiles').select('*').eq('is_active', true).order('name', { ascending: true });
      if (error) throw error;
      // deno-lint-ignore no-explicit-any
      return new Response(JSON.stringify({ consultants: (data || []).map((c: any) => ({ id: c.id, name: c.name, title: c.title, summary: c.summary, skills: c.skills || [], hourlyRateCents: c.hourly_rate_cents, currency: c.currency, availability: c.availability, avatarUrl: c.avatar_url })) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ============= REST: GET /media =============
    if (pathParts.length === 1 && pathParts[0] === 'media') {
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      const { data, error, count } = await supabase.from('media').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
      if (error) throw error;
      // deno-lint-ignore no-explicit-any
      return new Response(JSON.stringify({ media: (data || []).map((m: any) => ({ id: m.id, fileName: m.file_name, fileUrl: m.file_url, mimeType: m.mime_type, fileSizeBytes: m.file_size_bytes, alt: m.alt, createdAt: m.created_at })), total: count || 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
            'GET /content-api/orders',
            'GET /content-api/order/:id',
            'GET /content-api/leads',
            'GET /content-api/lead/:id',
            'GET /content-api/deals',
            'GET /content-api/companies',
            'GET /content-api/tickets',
            'GET /content-api/invoices',
            'GET /content-api/webinars',
            'GET /content-api/consultants',
            'GET /content-api/media',
          ],
          graphql: {
            endpoint: 'POST /content-api/graphql',
            schema: 'GET /content-api/graphql',
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


/** The site's declared language — where /blog/<slug> lives. */
async function siteDefaultLanguage(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.from('site_settings').select('value').eq('key', 'site_languages').maybeSingle();
  if (error) console.warn('[Content API] site_languages unreadable, assuming en:', error.message);
  const d = (data?.value as { default?: string } | null)?.default;
  return typeof d === 'string' && d.trim() ? d.trim().toLowerCase() : 'en';
}

/** Published blog-post overlays (content_translations), optionally in one language. */
async function publishedPostOverlays(supabase: SupabaseClient, ids: string[], lang: string | null) {
  if (!ids.length) return [];
  let q = supabase.from('content_translations').select('entity_id, locale, status, slug, strings')
    .eq('entity', 'blog_post').eq('status', 'published').in('entity_id', ids);
  if (lang) q = q.eq('locale', lang);
  const { data, error } = await q;
  if (error) return []; // an instance without the table yet has no overlays
  return (data ?? []) as Array<{ entity_id: string; locale: string; status: string; slug: string | null; strings: Record<string, OverlayEntry> | null }>;
}

/** `lang: "sv"` on the named field, or `$lang` / variables.lang. Lower-cased; null when absent. */
/**
 * Products in a language: every product kept, each with the published
 * overlay's text where one exists, the source text otherwise (§10). No lang:
 * as written, with the site language and the plain /shop address.
 */
/** A product row as the API serves it — the text fields the overlay can replace plus the facts it never touches. */
type ProductApiRow = ProductRowLike & {
  price_cents: number; currency: string; image_url: string | null; type: string; is_active: boolean; stripe_price_id: string | null;
};

async function productsForLang<T extends ProductRowLike>(supabase: SupabaseClient, products: T[], lang: string | null) {
  const defaultLang = await siteDefaultLanguage(supabase);
  let overlays: Array<OverlayRow & { entity_id: string }> = [];
  if (lang && products.length) {
    const { data, error } = await supabase
      .from('content_translations')
      .select('entity_id, locale, status, slug, strings')
      .eq('entity', 'product').eq('status', 'published').eq('locale', lang)
      .in('entity_id', products.map((p) => p.id));
    // An instance without the table (or the product entity) yet serves the source text.
    if (error && !['42P01', 'PGRST205', '23514'].includes(String(error.code))) throw error;
    overlays = (data ?? []) as unknown as Array<OverlayRow & { entity_id: string }>;
  }
  return productsInLanguage(products, lang, overlays, defaultLang).map((r) => ({
    ...r, path: productPath(r.product.id, lang ?? defaultLang, defaultLang),
  }));
}

function graphqlLang(query: string, field: string, variables: Record<string, unknown>): string | null {
  const args = query.match(new RegExp(`${field}\\s*\\(([^)]*)\\)`))?.[1] ?? '';
  const literal = args.match(/lang:\s*["']([A-Za-z]{2}(?:-[A-Za-z0-9]{2,8})?)["']/)?.[1];
  const fromVar = typeof variables.lang === 'string' ? variables.lang : null;
  const lang = (literal ?? fromVar ?? '').trim().toLowerCase();
  return lang || null;
}
