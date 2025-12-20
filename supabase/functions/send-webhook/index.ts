import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WebhookPayload {
  event: string
  data: Record<string, unknown>
  timestamp: string
}

interface Webhook {
  id: string
  name: string
  url: string
  secret: string | null
  headers: Record<string, string>
  failure_count?: number
}

// Generate HMAC signature for webhook verification
async function generateSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Send webhook to a single endpoint
async function sendWebhook(
  webhook: Webhook, 
  payload: WebhookPayload,
  supabase: any
): Promise<{ success: boolean; status?: number; error?: string; duration: number }> {
  const startTime = Date.now()
  const payloadString = JSON.stringify(payload)
  
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'PezCMS-Webhook/1.0',
      'X-Webhook-Event': payload.event,
      'X-Webhook-Timestamp': payload.timestamp,
      ...webhook.headers
    }
    
    // Add signature if secret is configured
    if (webhook.secret) {
      const signature = await generateSignature(payloadString, webhook.secret)
      headers['X-Webhook-Signature'] = `sha256=${signature}`
    }
    
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body: payloadString,
    })
    
    const duration = Date.now() - startTime
    const responseBody = await response.text().catch(() => '')
    
    // Log the delivery
    await supabase.from('webhook_logs').insert({
      webhook_id: webhook.id,
      event: payload.event,
      payload,
      response_status: response.status,
      response_body: responseBody.substring(0, 1000),
      success: response.ok,
      duration_ms: duration,
      error_message: response.ok ? null : `HTTP ${response.status}`
    })
    
    // Update webhook last_triggered_at and reset/increment failure count
    if (response.ok) {
      await supabase.from('webhooks').update({ 
        last_triggered_at: new Date().toISOString(),
        failure_count: 0
      }).eq('id', webhook.id)
    } else {
      await supabase.from('webhooks').update({ 
        last_triggered_at: new Date().toISOString(),
        failure_count: (webhook.failure_count || 0) + 1
      }).eq('id', webhook.id)
    }
    
    return { success: response.ok, status: response.status, duration }
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    // Log the failed delivery
    await supabase.from('webhook_logs').insert({
      webhook_id: webhook.id,
      event: payload.event,
      payload,
      success: false,
      error_message: errorMessage,
      duration_ms: duration
    })
    
    return { success: false, error: errorMessage, duration }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { event, data } = await req.json()
    
    if (!event || !data) {
      return new Response(
        JSON.stringify({ error: 'Missing event or data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[send-webhook] Processing event: ${event}`)

    // Find all active webhooks subscribed to this event
    const { data: webhooks, error: webhooksError } = await supabase
      .from('webhooks')
      .select('id, name, url, secret, headers, failure_count')
      .eq('is_active', true)
      .contains('events', [event])

    if (webhooksError) {
      console.error('[send-webhook] Error fetching webhooks:', webhooksError)
      throw webhooksError
    }

    if (!webhooks || webhooks.length === 0) {
      console.log(`[send-webhook] No webhooks registered for event: ${event}`)
      return new Response(
        JSON.stringify({ message: 'No webhooks registered for this event', event }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[send-webhook] Found ${webhooks.length} webhook(s) for event: ${event}`)

    const payload: WebhookPayload = {
      event,
      data,
      timestamp: new Date().toISOString()
    }

    // Send to all webhooks in parallel
    const results = await Promise.all(
      webhooks.map((webhook: Webhook) => sendWebhook(webhook, payload, supabase))
    )

    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    console.log(`[send-webhook] Completed: ${successful} successful, ${failed} failed`)

    return new Response(
      JSON.stringify({ 
        event,
        webhooks_triggered: webhooks.length,
        successful,
        failed,
        results: results.map((r, i) => ({
          webhook: webhooks[i].name,
          ...r
        }))
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[send-webhook] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
