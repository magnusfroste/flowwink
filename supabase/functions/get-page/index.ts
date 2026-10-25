import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getServiceClient, getAnonClient, getUserClient } from '../_shared/supabase-clients.ts';
import { resolvePageInLocale } from '../_shared/i18n/resolve-page.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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
    // ?lang=<locale>: the page in another language — its published overlay
    // (content_translations, entity 'page') applied to the page's own structure. Without it, or
    // with the page's own language, the response is exactly what it always was.
    // docs/architecture/page-translations.md §2.3.
    const lang = (url.searchParams.get('lang') ?? '').trim().toLowerCase() || null
    
    if (!slug) {
      return new Response(
        JSON.stringify({ error: 'Missing slug parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const cacheKey = lang ? `${slug}@${lang}` : slug
    console.log(`[get-page] Fetching page: ${cacheKey}`)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    
    const supabase = getAnonClient()

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
      const cached = pageCache.get(cacheKey)
      if (cached && cached.expires > Date.now()) {
        console.log(`[get-page] Cache HIT for: ${cacheKey}`)
        return new Response(
          JSON.stringify(cached.data),
          {
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
              'X-Cache': 'HIT',
              'Cache-Control': `public, max-age=${ttlMinutes * 60}, s-maxage=${ttlMinutes * 60}, stale-while-revalidate=60`,
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
      // Return 200 with found:false so browser devtools / runtime-error monitors
      // don't flag a normal "no page yet" state (e.g. fresh install or post-reset).
      // Frontend treats `error` field as not-found and renders Coming Soon.
      return new Response(
        JSON.stringify({ found: false, error: 'Page not found' }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=60',
          },
        }
      )
    }


    // Another language than the page's own: apply the published overlay. A
    // missing unit keeps the source text (visible, counted in fallback_units);
    // no published overlay is an honest absence the caller decides about.
    let body: unknown = page
    if (lang && lang !== String(page.locale ?? '').toLowerCase()) {
      const { data: overlays, error: overlayErr } = await supabase
        .from('content_translations')
        .select('locale, status, slug, strings')
        .eq('entity', 'page')
        .eq('entity_id', page.id)
        .eq('status', 'published')
      if (overlayErr) {
        // An instance that has not applied the content_translations migration yet
        // (the fleet runs several schema versions at once) has no overlays.
        console.warn(`[get-page] overlay read failed (${overlayErr.code ?? '?'}): ${overlayErr.message}`)
      }
      const list = (overlays ?? []) as Array<{ locale: string; status: string; slug: string | null; strings: Record<string, { text?: string; doc?: unknown; source_hash: string }> | null }>
      const overlay = list.find((o) => o.locale === lang)
        ?? list.find((o) => o.locale.split('-')[0] === lang.split('-')[0])
      if (!overlay) {
        return new Response(
          JSON.stringify({ found: false, error: 'No published translation', requested_lang: lang, page_lang: page.locale ?? null, available: list.map((o) => o.locale) }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' } }
        )
      }
      const resolved = resolvePageInLocale(page, overlay)
      body = {
        ...resolved.page,
        language: {
          requested: lang,
          served: resolved.locale,
          slug: resolved.slug,
          coverage: resolved.coverage,
          fallback_units: resolved.fallback_units,
          stale_units: resolved.stale_units,
        },
      }
    }

    // Update cache if enabled
    if (cachingEnabled) {
      pageCache.set(cacheKey, {
        data: body,
        expires: Date.now() + ttlMs,
      })
      console.log(`[get-page] Cached page: ${cacheKey} (expires in ${ttlMinutes} min)`)
    }

    return new Response(
      JSON.stringify(body),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'X-Cache': 'MISS',
          'Cache-Control': cachingEnabled
            ? `public, max-age=${ttlMinutes * 60}, s-maxage=${ttlMinutes * 60}, stale-while-revalidate=60`
            : 'no-cache',
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
