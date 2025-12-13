import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('Starting scheduled pages publish check...')
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Find pages that are scheduled and due for publishing
    const now = new Date().toISOString()
    
    const { data: scheduledPages, error: fetchError } = await supabase
      .from('pages')
      .select('id, title, slug, scheduled_at')
      .eq('status', 'reviewing')
      .not('scheduled_at', 'is', null)
      .lte('scheduled_at', now)
    
    if (fetchError) {
      console.error('Error fetching scheduled pages:', fetchError)
      throw fetchError
    }
    
    console.log(`Found ${scheduledPages?.length || 0} pages ready to publish`)
    
    const results = []
    
    for (const page of scheduledPages || []) {
      console.log(`Publishing page: ${page.title} (${page.id})`)
      
      // Update page status to published and clear scheduled_at
      const { error: updateError } = await supabase
        .from('pages')
        .update({ 
          status: 'published',
          scheduled_at: null,
          updated_at: now
        })
        .eq('id', page.id)
      
      if (updateError) {
        console.error(`Error publishing page ${page.id}:`, updateError)
        results.push({ id: page.id, title: page.title, success: false, error: updateError.message })
      } else {
        console.log(`Successfully published: ${page.title}`)
        
        // Log the action in audit_logs
        await supabase.from('audit_logs').insert({
          action: 'scheduled_publish',
          entity_type: 'page',
          entity_id: page.id,
          metadata: { 
            title: page.title, 
            slug: page.slug,
            scheduled_at: page.scheduled_at 
          }
        })
        
        results.push({ id: page.id, title: page.title, success: true })
      }
    }
    
    console.log('Publish check complete:', results)
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        published: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
    
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error('Error in publish-scheduled-pages:', err)
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})