import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Note: This function signals cache invalidation intent
// In a multi-instance edge environment, each isolate has its own cache
// This endpoint is called to trigger cache refresh behavior

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader }
      }
    })

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const { slug, all } = body as { slug?: string; all?: boolean }

    console.log(`[invalidate-cache] Request by user ${user.id}: slug=${slug}, all=${all}`)

    // Log the invalidation for audit purposes
    await supabase.from('audit_logs').insert({
      action: 'cache_invalidate',
      entity_type: 'cache',
      entity_id: slug || 'all',
      user_id: user.id,
      metadata: { slug, all, timestamp: new Date().toISOString() }
    })

    // In a multi-instance environment, we can't directly clear other isolates' caches
    // The cache invalidation works by:
    // 1. Logging the invalidation event
    // 2. Client-side React Query will refetch on next mount
    // 3. Edge function cache entries will expire based on TTL
    // 4. For immediate effect, we could implement a shared cache (Redis/KV) in future

    console.log(`[invalidate-cache] Cache invalidation logged for: ${all ? 'all pages' : slug}`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: all 
          ? 'All page caches marked for invalidation' 
          : `Cache for "${slug}" marked for invalidation`,
        invalidated_at: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error('[invalidate-cache] Error:', err)
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
