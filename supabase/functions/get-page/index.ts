import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// In-memory cache (per isolate instance)
const pageCache = new Map<string, { data: unknown; expires: number }>()

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const slug = url.searchParams.get('slug')
    
    if (!slug) {
      return new Response(
        JSON.stringify({ error: 'Missing slug parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[get-page] Fetching page: ${slug}`)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch performance settings to check if caching is enabled
    const { data: performanceSettingsRow } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'performance')
      .maybeSingle()

    const performanceSettings = performanceSettingsRow?.value as {
      enableEdgeCaching?: boolean
      edgeCacheTtlMinutes?: number
    } | null

    const cachingEnabled = performanceSettings?.enableEdgeCaching ?? false
    const ttlMinutes = performanceSettings?.edgeCacheTtlMinutes ?? 5
    const ttlMs = ttlMinutes * 60 * 1000

    console.log(`[get-page] Caching enabled: ${cachingEnabled}, TTL: ${ttlMinutes} min`)

    // Check cache if enabled
    if (cachingEnabled) {
      const cached = pageCache.get(slug)
      if (cached && cached.expires > Date.now()) {
        console.log(`[get-page] Cache HIT for: ${slug}`)
        return new Response(
          JSON.stringify(cached.data),
          {
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
              'X-Cache': 'HIT',
              'Cache-Control': `public, max-age=${ttlMinutes * 60}`,
            },
          }
        )
      }
    }

    // Fetch from database
    console.log(`[get-page] Cache MISS, fetching from DB: ${slug}`)
    
    const { data: page, error } = await supabase
      .from('pages')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .is('deleted_at', null)
      .maybeSingle()

    if (error) {
      console.error('[get-page] Database error:', error)
      throw error
    }

    if (!page) {
      console.log(`[get-page] Page not found: ${slug}`)
      return new Response(
        JSON.stringify({ error: 'Page not found' }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=60', // Short cache for 404s
          },
        }
      )
    }

    // Update cache if enabled
    if (cachingEnabled) {
      pageCache.set(slug, {
        data: page,
        expires: Date.now() + ttlMs,
      })
      console.log(`[get-page] Cached page: ${slug} (expires in ${ttlMinutes} min)`)
    }

    return new Response(
      JSON.stringify(page),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'X-Cache': 'MISS',
          'Cache-Control': cachingEnabled ? `public, max-age=${ttlMinutes * 60}` : 'no-cache',
        },
      }
    )

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error('[get-page] Error:', err)
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
