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
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-composio-signature, x-signature, webhook-signature, webhook-id, webhook-timestamp',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('COMPOSIO_WEBHOOK_SECRET') || '';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const left = enc.encode(a);
  const right = enc.encode(b);
  if (left.length !== right.length) return false;

  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

function toBase64(bytes: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function signHmac(value: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', key, enc.encode(value));
}

async function verifySignature(req: Request, rawBody: string): Promise<boolean> {
  if (!WEBHOOK_SECRET) return true; // Soft mode until secret is set.

  // Composio V3 signs `{webhook-id}.{webhook-timestamp}.{rawBody}` and sends
  // base64 HMAC in `webhook-signature`. Keep the older x-* path as a fallback
  // for already configured legacy webhooks.
  const webhookSignature = req.headers.get('webhook-signature');
  const webhookId = req.headers.get('webhook-id');
  const webhookTimestamp = req.headers.get('webhook-timestamp');

  if (webhookSignature && webhookId && webhookTimestamp) {
    const numericTimestamp = Number(webhookTimestamp);
    const timestampMs = Number.isFinite(numericTimestamp)
      ? numericTimestamp * 1000
      : Date.parse(webhookTimestamp);
    if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 300_000) {
      console.warn('[composio-webhook] signature timestamp outside tolerance');
      return false;
    }

    const mac = await signHmac(`${webhookId}.${webhookTimestamp}.${rawBody}`);
    const expected = toBase64(mac);
    const received = webhookSignature.split(',', 2)[1] ?? webhookSignature;
    return constantTimeEqual(expected, received);
  }

  const legacySignature = req.headers.get('x-composio-signature') || req.headers.get('x-signature');
  if (!legacySignature) return false;
  const legacyMac = await signHmac(rawBody);
  const legacyHex = toHex(legacyMac);
  return constantTimeEqual(legacyHex, legacySignature.replace(/^sha256=/, ''));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const rawBody = await req.text();
  const sigOk = await verifySignature(req, rawBody);
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
  const triggerSlug = body?.metadata?.trigger_slug || body?.triggerSlug || body?.trigger_slug || body?.type;
  if (triggerSlug && !String(triggerSlug).toLowerCase().includes('gmail')) {
    return json({ ok: true, ignored: `unsupported trigger ${triggerSlug}` });
  }

  const data = body?.data || body?.payload || body;
  const messageId = data?.message_id || data?.messageId || data?.id || data?.message?.id || data?.email?.id;
  const threadId = data?.thread_id || data?.threadId || data?.thread?.id || data?.message?.threadId || data?.email?.threadId;
  const connectedAccountId =
    body?.metadata?.connected_account_id ||
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
  let logErr: any = null;
  const dedupeMessageId = messageIdHeader || messageId;
  if (dedupeMessageId) {
    const { data: existing, error: existingErr } = await supabase
      .from('outbound_communications')
      .select('id')
      .eq('message_id_header', dedupeMessageId)
      .maybeSingle();
    logErr = existingErr;
    if (!existing && !existingErr) {
      const { error } = await supabase.from('outbound_communications').insert({
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
        thread_id: threadId || fullMessage?.threadId || null,
        message_id_header: dedupeMessageId,
        in_reply_to: inReplyTo,
        metadata: { references, inbound_account_id: account?.id ?? null, snippet, gmail_message_id: messageId },
        sent_at: new Date().toISOString(),
      });
      logErr = error;
    }
  } else {
    const { error } = await supabase.from('outbound_communications').insert({
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
      thread_id: threadId || fullMessage?.threadId || null,
      message_id_header: null,
      in_reply_to: inReplyTo,
      metadata: { references, inbound_account_id: account?.id ?? null, snippet, gmail_message_id: messageId },
      sent_at: new Date().toISOString(),
    });
    logErr = error;
  }
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
