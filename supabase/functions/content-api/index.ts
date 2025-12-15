import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============= GraphQL Schema =============

const GRAPHQL_SCHEMA = `
type Query {
  pages(limit: Int, offset: Int): PageConnection!
  page(slug: String!): Page
  blocks(pageSlug: String!, type: String): [Block!]!
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
    
    // Query: pages
    if (normalizedQuery.includes('pages') && !normalizedQuery.includes('page(')) {
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
    const slug = pageSlugMatch?.[1] || slugVar;
    
    if (slug && normalizedQuery.includes('page(')) {
      const { data: page, error } = await supabase
        .from('pages')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle();

      if (error) throw error;
      if (!page) {
        return { data: { page: null } };
      }

      // deno-lint-ignore no-explicit-any
      const pageData = page as any;

      // Check if blocks are requested with type filter
      const typeFilterMatch = normalizedQuery.match(/blocks\s*\(\s*type:\s*["']?([^"'\s)]+)["']?\s*\)/);
      const typeFilter = typeFilterMatch?.[1] || (variables.type as string);
      
      // deno-lint-ignore no-explicit-any
      let blocks = (pageData.content_json || []).map((b: any) => ({
        id: b.id,
        type: b.type,
        data: b.data,
      }));

      if (typeFilter) {
        // deno-lint-ignore no-explicit-any
        blocks = blocks.filter((b: any) => b.type === typeFilter);
      }

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

    // Query: blocks(pageSlug: "...", type: "...")
    const blocksMatch = normalizedQuery.match(/blocks\s*\(\s*pageSlug:\s*["']?([^"'\s,)]+)["']?/);
    const blocksPageSlug = blocksMatch?.[1] || (variables.pageSlug as string);
    
    if (blocksPageSlug) {
      const { data: page, error } = await supabase
        .from('pages')
        .select('content_json')
        .eq('slug', blocksPageSlug)
        .eq('status', 'published')
        .maybeSingle();

      if (error) throw error;
      if (!page) {
        return { data: { blocks: [] } };
      }

      // deno-lint-ignore no-explicit-any
      const pageData = page as any;

      const typeFilterMatch = normalizedQuery.match(/type:\s*["']?([^"'\s)]+)["']?/);
      const typeFilter = typeFilterMatch?.[1] || (variables.type as string);
      
      // deno-lint-ignore no-explicit-any
      let blocks = (pageData.content_json || []).map((b: any) => ({
        id: b.id,
        type: b.type,
        data: b.data,
      }));

      if (typeFilter) {
        // deno-lint-ignore no-explicit-any
        blocks = blocks.filter((b: any) => b.type === typeFilter);
      }

      return { data: { blocks } };
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
  
  console.log('[Content API] Request:', req.method, url.pathname);

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

    // ============= Unknown Route =============
    return new Response(
      JSON.stringify({ 
        error: 'Not found',
        availableEndpoints: {
          rest: [
            'GET /content-api/pages',
            'GET /content-api/page/:slug',
          ],
          graphql: {
            endpoint: 'POST /content-api/graphql',
            schema: 'GET /content-api/graphql',
            examples: [
              '{ pages { nodes { slug title } totalCount } }',
              '{ page(slug: "hem") { title blocks { type data } } }',
              '{ blocks(pageSlug: "hem", type: "hero") { id data } }',
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
