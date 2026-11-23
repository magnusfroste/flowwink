import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { requireServiceOrRole, unauthorized } from '../_shared/edge-auth.ts';
import { PLATFORM_RAISED_EVENTS } from '../_shared/events/platform-raised.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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

// Retry configuration
const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000 // 1 second
const MAX_FAILURES_BEFORE_DISABLE = 5 // Auto-disable after this many consecutive failures

// Calculate delay with exponential backoff: 1s, 2s, 4s
function getRetryDelay(attempt: number): number {
  return BASE_DELAY_MS * Math.pow(2, attempt)
}

// Sleep utility
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Send webhook with retry logic
async function sendWebhookWithRetry(
  webhook: Webhook, 
  payload: WebhookPayload,
  supabase: any
): Promise<{ success: boolean; status?: number; error?: string; duration: number; attempts: number; disabled?: boolean }> {
  const payloadString = JSON.stringify(payload)
  let lastError: string | undefined
  let lastStatus: number | undefined
  let totalDuration = 0
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const startTime = Date.now()
    
    // Wait before retry (not on first attempt)
    if (attempt > 0) {
      const delay = getRetryDelay(attempt - 1)
      console.log(`[send-webhook] Retry ${attempt}/${MAX_RETRIES} for ${webhook.name} after ${delay}ms`)
      await sleep(delay)
    }
    
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'FlowWink-Webhook/1.0',
        'X-Webhook-Event': payload.event,
        'X-Webhook-Timestamp': payload.timestamp,
        'X-Webhook-Attempt': String(attempt + 1),
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
      totalDuration += duration
      
      // Success - log and return
      if (response.ok) {
        const responseBody = await response.text().catch(() => '')
        
        await supabase.from('webhook_logs').insert({
          webhook_id: webhook.id,
          event: payload.event,
          payload,
          response_status: response.status,
          response_body: responseBody.substring(0, 1000),
          success: true,
          duration_ms: totalDuration,
          error_message: attempt > 0 ? `Succeeded after ${attempt + 1} attempts` : null
        })
        
        await supabase.from('webhooks').update({ 
          last_triggered_at: new Date().toISOString(),
          failure_count: 0
        }).eq('id', webhook.id)
        
        return { success: true, status: response.status, duration: totalDuration, attempts: attempt + 1 }
      }
      
      // Failed - store for potential retry
      lastStatus = response.status
      lastError = `HTTP ${response.status}`
      
      // Don't retry on client errors (4xx) except 429 (rate limit)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        console.log(`[send-webhook] Client error ${response.status}, not retrying`)
        break
      }
      
    } catch (error) {
      const duration = Date.now() - startTime
      totalDuration += duration
      lastError = error instanceof Error ? error.message : 'Unknown error'
      console.log(`[send-webhook] Attempt ${attempt + 1} failed: ${lastError}`)
    }
  }
  
  // All retries exhausted - log failure
  const newFailureCount = (webhook.failure_count || 0) + 1
  const shouldDisable = newFailureCount >= MAX_FAILURES_BEFORE_DISABLE
  
  await supabase.from('webhook_logs').insert({
    webhook_id: webhook.id,
    event: payload.event,
    payload,
    response_status: lastStatus || null,
    success: false,
    error_message: shouldDisable 
      ? `Failed after ${MAX_RETRIES + 1} attempts: ${lastError}. Webhook auto-disabled after ${newFailureCount} consecutive failures.`
      : `Failed after ${MAX_RETRIES + 1} attempts: ${lastError}`,
    duration_ms: totalDuration
  })
  
  // Update failure count and potentially disable the webhook
  const updateData: Record<string, unknown> = { 
    last_triggered_at: new Date().toISOString(),
    failure_count: newFailureCount
  }
  
  if (shouldDisable) {
    updateData.is_active = false
    console.log(`[send-webhook] Auto-disabling webhook "${webhook.name}" after ${newFailureCount} consecutive failures`)
  }
  
  await supabase.from('webhooks').update(updateData).eq('id', webhook.id)
  
  return { 
    success: false, 
    status: lastStatus, 
    error: shouldDisable ? `${lastError} (webhook disabled)` : lastError, 
    duration: totalDuration, 
    attempts: MAX_RETRIES + 1,
    disabled: shouldDisable
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = getServiceClient()

    // Every legitimate caller holds the service key (agent-execute, the
    // newsletter function, the pg_net cron via the vault). Without this gate
    // anyone could POST an event and have it fanned out to every customer
    // webhook with a valid platform signature, and run the matching automations.
    const auth = await requireServiceOrRole(req, supabase, 'admin')
    if (!auth.authorized) return unauthorized(corsHeaders)

    const body = await req.json()
    const { event, data } = body as { event?: string; data?: Record<string, unknown>; via?: string }

    if (!event || !data) {
      return new Response(
        JSON.stringify({ error: 'Missing event or data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // One bus (2026-11-22). A webhook used to go out only when the BROWSER
    // called this function, and this function ran the event's automations
    // itself, with untemplated arguments. Events raised by the database (an
    // order paid through Stripe, a booking an agent made, an invoice sent)
    // never reached a webhook, and an event both raised and called ran its
    // automations twice. Now:
    //   • via 'bus' — event-dispatcher hands over an event it has processed:
    //     deliver it to the subscribed webhooks, nothing else;
    //   • otherwise — a direct call (the browser, an edge function): an event
    //     the platform raises itself is left to the bus (delivered once from
    //     there); any other is put ON the bus, where the dispatcher runs its
    //     automations and delivers its webhooks.
    if (body.via !== 'bus') {
      if (PLATFORM_RAISED_EVENTS.has(event)) {
        return new Response(
          JSON.stringify({ event, queued: false, note: 'The platform raises this event itself; it is delivered from the event bus.' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const { data: eventId, error: emitErr } = await supabase.rpc('emit_platform_event', {
        _event_name: event, _payload: data, _source: 'direct',
      })
      if (emitErr) {
        return new Response(
          JSON.stringify({ error: `Could not put ${event} on the event bus: ${emitErr.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      // Signal automations read their own lane.
      try {
        await fetch(`${supabaseUrl}/functions/v1/signal-dispatcher`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({ signal: event, data, context: { entity_type: event.split('.')[0] } }),
        })
      } catch (signalErr) {
        console.error('[send-webhook] Signal dispatch error (non-blocking):', signalErr)
      }
      return new Response(
        JSON.stringify({ event, queued: true, event_id: eventId }),
        { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: webhooks, error: webhooksError } = await supabase
      .from('webhooks')
      .select('id, name, url, secret, headers, failure_count')
      .eq('is_active', true)
      .contains('events', [event])

    if (webhooksError) {
      return new Response(
        JSON.stringify({ error: `Webhooks lookup failed for ${event}: ${webhooksError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (!webhooks || webhooks.length === 0) {
      return new Response(
        JSON.stringify({ event, webhooks_triggered: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const payload: WebhookPayload = { event, data, timestamp: new Date().toISOString() }
    const results = await Promise.all(
      webhooks.map((webhook: Webhook) => sendWebhookWithRetry(webhook, payload, supabase))
    )
    const successful = results.filter((r: { success: boolean }) => r.success).length
    const failed = results.length - successful
    console.log(`[send-webhook] ${event}: ${successful} delivered, ${failed} failed`)

    return new Response(
      JSON.stringify({
        event,
        webhooks_triggered: webhooks.length,
        successful,
        failed,
        results: results.map((r: { success: boolean; status?: number; error?: string; duration: number; attempts: number }, i: number) => ({
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
