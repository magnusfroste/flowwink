/**
 * composio-webhook — public endpoint Composio calls when a watched Gmail mailbox
 * receives a new message (Pub/Sub push, wrapped by Composio).
 *
 * Flow:
 *   1. Verify Composio signature (if COMPOSIO_WEBHOOK_SECRET set).
 *   2. Extract message_id + connected_account_id from payload.
 *   3. Look up our inbound_email_accounts row → email_address.
 *   4. Call composio-proxy { action: 'gmail_get' } to expand the message.
 *   5. Update last_received_at / last_history_id on the account.
 *   6. emit_platform_event('email.received', { ... }) — event-dispatcher
 *      then fans out to whatever automations the operator has enabled.
 *
 * No JWT verification — Composio is the caller. Idempotency happens downstream
 * (email_to_ticket dedupes on tickets.source_id).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-composio-signature',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('COMPOSIO_WEBHOOK_SECRET') || '';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

async function verifySignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!WEBHOOK_SECRET) return true; // Soft mode until secret is set.
  if (!signature) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex === signature.replace(/^sha256=/, '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const rawBody = await req.text();
  const signature = req.headers.get('x-composio-signature') || req.headers.get('x-signature');
  const sigOk = await verifySignature(rawBody, signature);
  if (!sigOk) {
    console.warn('[composio-webhook] signature mismatch');
    return json({ error: 'invalid signature' }, 401);
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }

  console.log('[composio-webhook] payload:', JSON.stringify(body).slice(0, 800));

  // Composio Gmail webhook payload shape (best-effort across formats):
  //   { type: 'GMAIL_NEW_MESSAGE', data: { message_id, thread_id, connected_account_id, ... } }
  // We accept several aliases since Composio renames fields between versions.
  const data = body?.data || body?.payload || body;
  const messageId = data?.message_id || data?.messageId || data?.message?.id;
  const threadId = data?.thread_id || data?.threadId || data?.message?.threadId;
  const connectedAccountId =
    data?.connected_account_id ||
    data?.connectedAccountId ||
    body?.connected_account_id ||
    body?.connectedAccountId;
  const historyId = data?.history_id || data?.historyId || null;

  if (!messageId) {
    // Some Pub/Sub deliveries are heartbeat-style (no message_id). ACK so Composio
    // doesn't retry; nothing to do.
    return json({ ok: true, ignored: 'no message_id in payload' });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Resolve our local account row (planning ahead for multi-account).
  let account: any = null;
  if (connectedAccountId) {
    const { data: acc } = await supabase
      .from('inbound_email_accounts')
      .select('*')
      .eq('composio_account_id', connectedAccountId)
      .maybeSingle();
    account = acc;
  }
  if (!account) {
    // Fallback: first enabled shared mailbox.
    const { data: acc } = await supabase
      .from('inbound_email_accounts')
      .select('*')
      .eq('enabled', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    account = acc;
  }

  // Fetch full message via composio-proxy (service-role auth).
  let fullMessage: any = null;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/composio-proxy`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'gmail_get',
        params: { message_id: messageId, account_id: connectedAccountId || account?.composio_account_id },
        entity_id: 'default',
      }),
    });
    const payload = await res.json();
    fullMessage = payload?.result?.data?.response_data || payload?.result?.data || payload?.result;
  } catch (err) {
    console.error('[composio-webhook] gmail_get failed:', err);
  }

  // Extract headers + body. Gmail returns payload.headers as [{name, value}, ...].
  const headers: Record<string, string> = {};
  const headerList = fullMessage?.payload?.headers || fullMessage?.headers || [];
  for (const h of headerList) {
    if (h?.name) headers[h.name.toLowerCase()] = h.value;
  }
  const fromEmail = headers['from'] || fullMessage?.from || '';
  const toEmail = headers['to'] || fullMessage?.to || account?.email_address || '';
  const subject = headers['subject'] || fullMessage?.subject || '(no subject)';
  const inReplyTo = headers['in-reply-to'] || null;
  const references = headers['references'] || null;
  const messageIdHeader = headers['message-id'] || null;
  const snippet = fullMessage?.snippet || '';

  // Best-effort plain-text body extraction.
  let bodyText = '';
  const extractText = (part: any): string => {
    if (!part) return '';
    if (part.mimeType === 'text/plain' && part.body?.data) {
      try {
        return atob(String(part.body.data).replace(/-/g, '+').replace(/_/g, '/'));
      } catch {
        return '';
      }
    }
    if (Array.isArray(part.parts)) {
      for (const p of part.parts) {
        const t = extractText(p);
        if (t) return t;
      }
    }
    return '';
  };
  bodyText = extractText(fullMessage?.payload) || snippet;

  // Update account watermark.
  if (account?.id) {
    await supabase
      .from('inbound_email_accounts')
      .update({
        last_received_at: new Date().toISOString(),
        ...(historyId ? { last_history_id: String(historyId) } : {}),
      })
      .eq('id', account.id);
  }

  // Emit platform event — event-dispatcher fans out to automations.
  const eventPayload = {
    message_id: messageId,
    thread_id: threadId || fullMessage?.threadId || null,
    connected_account_id: connectedAccountId || account?.composio_account_id || null,
    inbound_account_id: account?.id || null,
    mailbox: account?.email_address || toEmail,
    from: fromEmail,
    to: toEmail,
    subject,
    snippet,
    body_text: bodyText.slice(0, 50000), // sanity cap
    in_reply_to: inReplyTo,
    references,
    message_id_header: messageIdHeader,
    headers,
    received_at: new Date().toISOString(),
  };

  // Log inbound row to the unified communications log so it shows up in
  // /admin/communications alongside outbound mail. Dedupe on message_id_header.
  const { error: logErr } = await supabase
    .from('outbound_communications')
    .upsert(
      {
        direction: 'inbound',
        channel: 'email',
        status: 'sent',
        provider: 'composio',
        simulated: false,
        recipient: toEmail,
        sender: fromEmail,
        subject,
        body_text: bodyText.slice(0, 50000),
        source: 'composio-webhook',
        thread_id: threadId || null,
        message_id_header: messageIdHeader,
        in_reply_to: inReplyTo,
        metadata: { references, inbound_account_id: account?.id ?? null, snippet },
        sent_at: new Date().toISOString(),
      },
      { onConflict: 'message_id_header', ignoreDuplicates: true },
    );
  if (logErr) console.error('[composio-webhook] log insert failed:', logErr);

  const { error: emitErr } = await supabase.rpc('emit_platform_event', {
    _event_name: 'email.received',
    _payload: eventPayload,
    _source: 'composio-webhook',
  });
  if (emitErr) {
    console.error('[composio-webhook] emit_platform_event failed:', emitErr);
  }

  return json({ ok: true, message_id: messageId, emitted: !emitErr, logged: !logErr });
});
