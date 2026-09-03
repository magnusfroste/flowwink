/**
 * Shared Gmail ingest — the single code path that turns a Gmail message into
 * a linked row in `outbound_communications` + an `email.received` platform event.
 *
 * Two callers:
 *   1. `composio-webhook`  — push delivery (fast when Composio fires, but bursty).
 *   2. `composio-proxy`    — `action: 'gmail_reconcile'` polling fallback (cron).
 *
 * Both must behave identically, so the logic lives here and nowhere else.
 * Idempotency: we dedupe on `message_id_header` and on
 * `metadata->>gmail_message_id`, so re-ingesting the same message is a no-op.
 */

import { resolveInboundEntity } from './resolve-entity.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export interface IngestInput {
  messageId: string;
  threadId?: string | null;
  connectedAccountId?: string | null;
  historyId?: string | number | null;
  /** Already-expanded Gmail message (reconcile has it from GMAIL_FETCH_EMAILS). */
  fullMessage?: any;
  /** Where the ingest came from — stored on the row for observability. */
  source: string;
}

export interface IngestResult {
  ok: boolean;
  message_id: string;
  skipped?: 'duplicate';
  logged?: boolean;
  emitted?: boolean;
  resolved_by?: string;
  error?: string;
}

function decodeBase64Url(data: string): string {
  try {
    // atob yields a byte string; reading it as text turns every UTF-8
    // multibyte character into Latin-1 debris ("nÃ¤ra" for "nära" — every
    // Swedish mail on Resta, 2026-09-03). Decode the bytes as UTF-8.
    const bin = atob(String(data).replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}

function extractPart(part: any, mimeType: string): string {
  if (!part) return '';
  if (part.mimeType === mimeType && part.body?.data) return decodeBase64Url(part.body.data);
  if (Array.isArray(part.parts)) {
    for (const p of part.parts) {
      const t = extractPart(p, mimeType);
      if (t) return t;
    }
  }
  return '';
}

function extractText(part: any): string {
  return extractPart(part, 'text/plain');
}

/**
 * The HTML alternative, when the sender included one. Stored next to the
 * text so the inbox can render a formatted message (sanitised on the way
 * out) instead of the text/plain fallback with its collapsed line breaks.
 */
function extractHtml(part: any): string {
  return extractPart(part, 'text/html');
}

async function fetchFullMessage(messageId: string, accountId?: string | null): Promise<any> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/composio-proxy`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'gmail_get',
        params: { message_id: messageId, account_id: accountId || undefined },
        entity_id: 'default',
      }),
    });
    const payload = await res.json();
    return payload?.result?.data?.response_data || payload?.result?.data || payload?.result || null;
  } catch (err) {
    console.error('[ingest-gmail] gmail_get failed:', err);
    return null;
  }
}

/** Has this Gmail message already been ingested (by either caller)? */
export async function isAlreadyIngested(
  supabase: any,
  gmailMessageId: string,
  messageIdHeader?: string | null,
): Promise<boolean> {
  const { data: byGmailId } = await supabase
    .from('outbound_communications')
    .select('id')
    .eq('metadata->>gmail_message_id', gmailMessageId)
    .limit(1)
    .maybeSingle();
  if (byGmailId) return true;

  if (messageIdHeader) {
    const { data: byHeader } = await supabase
      .from('outbound_communications')
      .select('id')
      .eq('message_id_header', messageIdHeader)
      .limit(1)
      .maybeSingle();
    if (byHeader) return true;
  }
  return false;
}

/**
 * Classify an inbound message so downstream automations know whether a human
 * is actually waiting for an answer.
 *   - `known`   — resolved to a lead/contact/company in the CRM.
 *   - `noise`   — bulk/marketing/system mail (List-Unsubscribe, Precedence: bulk,
 *                 no-reply senders, auto-submitted). Never becomes a ticket.
 *   - `unknown` — a human we don't know yet.
 */
export function classifyInbound(input: {
  headers: Record<string, string>;
  fromEmail: string;
  resolvedToCrm: boolean;
}): 'known' | 'noise' | 'unknown' {
  const { headers, fromEmail, resolvedToCrm } = input;
  const addr = (fromEmail.match(/<([^>]+)>/)?.[1] || fromEmail).trim().toLowerCase();

  const bulkHeader =
    !!headers['list-unsubscribe'] ||
    !!headers['list-id'] ||
    /bulk|list|junk/i.test(headers['precedence'] || '') ||
    (!!headers['auto-submitted'] && headers['auto-submitted'] !== 'no') ||
    !!headers['x-campaign-id'] ||
    !!headers['feedback-id'];

  const noReplySender =
    /^(no[-._]?reply|do[-._]?not[-._]?reply|noreply|donotreply|notifications?|mailer[-.]daemon|newsletter|news|marketing|postmaster|bounce)/.test(
      addr.split('@')[0] || '',
    );

  if (bulkHeader || noReplySender) return 'noise';
  return resolvedToCrm ? 'known' : 'unknown';
}

export async function ingestGmailMessage(
  supabase: any,
  input: IngestInput,
): Promise<IngestResult> {
  const { messageId, source } = input;
  if (!messageId) return { ok: false, message_id: '', error: 'missing message_id' };

  // Cheap pre-check before we spend a Composio call.
  if (await isAlreadyIngested(supabase, messageId)) {
    return { ok: true, message_id: messageId, skipped: 'duplicate' };
  }

  // Resolve the local mailbox row (planning ahead for multi-account).
  let account: any = null;
  if (input.connectedAccountId) {
    const { data: acc } = await supabase
      .from('inbound_email_accounts')
      .select('*')
      .eq('composio_account_id', input.connectedAccountId)
      .maybeSingle();
    account = acc;
  }
  if (!account) {
    const { data: acc } = await supabase
      .from('inbound_email_accounts')
      .select('*')
      .eq('enabled', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    account = acc;
  }

  const fullMessage =
    input.fullMessage ||
    (await fetchFullMessage(messageId, input.connectedAccountId || account?.composio_account_id));

  // Gmail returns payload.headers as [{name, value}, ...].
  const headers: Record<string, string> = {};
  const headerList = fullMessage?.payload?.headers || fullMessage?.headers || [];
  if (Array.isArray(headerList)) {
    for (const h of headerList) if (h?.name) headers[String(h.name).toLowerCase()] = h.value;
  } else if (headerList && typeof headerList === 'object') {
    for (const [k, v] of Object.entries(headerList)) headers[k.toLowerCase()] = String(v);
  }

  const fromEmail = headers['from'] || fullMessage?.from || fullMessage?.sender || '';
  const toEmail = headers['to'] || fullMessage?.to || account?.email_address || '';
  const subject = headers['subject'] || fullMessage?.subject || '(no subject)';
  const inReplyTo = headers['in-reply-to'] || null;
  const references = headers['references'] || null;
  const messageIdHeader = headers['message-id'] || fullMessage?.messageId || null;
  const snippet = fullMessage?.snippet || fullMessage?.preview?.body || '';
  const threadId = input.threadId || fullMessage?.threadId || fullMessage?.thread_id || null;
  const bodyText = (
    extractText(fullMessage?.payload) ||
    fullMessage?.messageText ||
    snippet ||
    ''
  ).slice(0, 50000);
  const bodyHtml = extractHtml(fullMessage?.payload).slice(0, 200000) || null;

  // Second dedupe pass now that we know the RFC Message-ID.
  if (messageIdHeader && (await isAlreadyIngested(supabase, messageId, messageIdHeader))) {
    return { ok: true, message_id: messageId, skipped: 'duplicate' };
  }

  // Watermark on the mailbox.
  if (account?.id) {
    await supabase
      .from('inbound_email_accounts')
      .update({
        last_received_at: new Date().toISOString(),
        ...(input.historyId ? { last_history_id: String(input.historyId) } : {}),
      })
      .eq('id', account.id);
  }

  const routeMode: 'crm_only' | 'crm_then_ticket' | 'ticket_only' =
    (account?.route_mode as any) || 'crm_only';

  const entity = await resolveInboundEntity(supabase, {
    sender: fromEmail,
    subject,
    threadId,
  });
  console.log(
    `[ingest-gmail:${source}] entity: ${entity.resolved_by}` +
      (entity.related_entity_id ? ` → ${entity.related_entity_type} ${entity.related_entity_id}` : ''),
  );

  const resolvedToCrm = entity.resolved_by !== 'unresolved';
  const classification = classifyInbound({ headers, fromEmail, resolvedToCrm });

  // Noise (newsletters, bulk mail, no-reply system notifications) never becomes
  // a ticket, whatever the route mode says — a ticket is a promise to answer.
  const shouldCreateTicket =
    classification !== 'noise' &&
    (routeMode === 'ticket_only' || (routeMode === 'crm_then_ticket' && !resolvedToCrm));

  const { error: logErr } = await supabase.from('outbound_communications').insert({
    direction: 'inbound',
    channel: 'email',
    status: 'received',
    provider: 'composio',
    simulated: false,
    recipient: toEmail,
    sender: fromEmail,
    subject,
    body_text: bodyText,
    body_html: bodyHtml,
    source,
    thread_id: threadId,
    message_id_header: messageIdHeader,
    in_reply_to: inReplyTo,
    related_entity_type: entity.related_entity_type,
    related_entity_id: entity.related_entity_id,
    metadata: {
      references,
      inbound_account_id: account?.id ?? null,
      snippet,
      gmail_message_id: messageId,
      resolved_by: entity.resolved_by,
      classification,
    },
    sent_at: new Date().toISOString(),
  });
  if (logErr) console.error(`[ingest-gmail:${source}] log insert failed:`, logErr);

  const { error: emitErr } = await supabase.rpc('emit_platform_event', {
    _event_name: 'email.received',
    _payload: {
      message_id: messageId,
      thread_id: threadId,
      connected_account_id: input.connectedAccountId || account?.composio_account_id || null,
      inbound_account_id: account?.id || null,
      mailbox: account?.email_address || toEmail,
      from: fromEmail,
      to: toEmail,
      subject,
      snippet,
      body_text: bodyText,
      in_reply_to: inReplyTo,
      references,
      message_id_header: messageIdHeader,
      headers,
      received_at: new Date().toISOString(),
      route_mode: routeMode,
      should_create_ticket: shouldCreateTicket,
      classification,
    },
    _source: source,
  });
  if (emitErr) console.error(`[ingest-gmail:${source}] emit_platform_event failed:`, emitErr);

  return {
    ok: true,
    message_id: messageId,
    logged: !logErr,
    emitted: !emitErr,
    resolved_by: entity.resolved_by,
    classification,
    should_create_ticket: shouldCreateTicket,
  };
}
