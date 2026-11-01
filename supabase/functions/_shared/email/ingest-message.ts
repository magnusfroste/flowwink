/**
 * Inbound mail → a linked row in `outbound_communications` + `email.received`.
 * ONE path for every way mail arrives.
 *
 * Callers:
 *   - `ingest-gmail.ts` (Composio push and the reconcile cron) — after it has
 *     fetched and decoded the Gmail message.
 *   - `email-webhook` `/inbound` — Cloudflare Email Routing (a Worker parses the
 *     MIME message and posts the fields), or any relay that posts the same shape.
 *
 * Both used to be one Gmail-only function. A mail that arrives through DNS
 * instead of OAuth must be filed exactly like one that arrives through Gmail —
 * the same entity resolution, the same noise classification, the same event the
 * responder and the ticket automation listen to — so the logic lives here and
 * the callers only say where the fields came from.
 *
 * Idempotent on the RFC Message-ID (`message_id_header`): a redelivered message
 * is a no-op. A caller with its own id (Gmail) also dedupes on that first.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveInboundEntity } from './resolve-entity.ts';
import { classifyInbound } from './classify-inbound.ts';

export interface InboundMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string | null;
  /** RFC 5322 Message-ID, angle brackets included as received. */
  messageIdHeader?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  threadId?: string | null;
  /** Lower-cased header map — classification reads list/bulk/auto-submitted headers. */
  headers: Record<string, string>;
  snippet?: string;
}

export interface InboundAccount {
  id?: string | null;
  email_address?: string | null;
  route_mode?: string | null;
  composio_account_id?: string | null;
}

export interface IngestMessageOptions {
  /** outbound_communications.provider — 'composio', 'cloudflare', … */
  provider: string;
  /** Where the ingest ran — stored on the row and the event for observability. */
  source: string;
  account?: InboundAccount | null;
  /** Provider-specific ids kept on the row (e.g. gmail_message_id). */
  extraMetadata?: Record<string, unknown>;
  /** Extra fields on the email.received payload (e.g. connected_account_id). */
  extraEvent?: Record<string, unknown>;
  /** The id the result reports; defaults to the Message-ID. */
  resultId?: string;
  historyId?: string | number | null;
}

export interface IngestMessageResult {
  ok: boolean;
  message_id: string;
  skipped?: 'duplicate';
  logged?: boolean;
  emitted?: boolean;
  resolved_by?: string;
  classification?: 'known' | 'noise' | 'unknown';
  should_create_ticket?: boolean;
  error?: string;
}

export async function hasMessageIdHeader(supabase: SupabaseClient, messageIdHeader: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('outbound_communications')
    .select('id')
    .eq('message_id_header', messageIdHeader)
    .limit(1)
    .maybeSingle();
  if (error) console.error('[ingest-message] dedupe read failed:', error.message);
  return !!data;
}

export async function ingestInboundMessage(
  supabase: SupabaseClient,
  msg: InboundMessage,
  opts: IngestMessageOptions,
): Promise<IngestMessageResult> {
  const { provider, source, account } = opts;
  const resultId = opts.resultId || msg.messageIdHeader || '';
  const subject = msg.subject || '(no subject)';
  const bodyText = (msg.text || msg.snippet || '').slice(0, 50000);
  const bodyHtml = (msg.html || '').slice(0, 200000) || null;
  const snippet = msg.snippet ?? bodyText.replace(/\s+/g, ' ').trim().slice(0, 200);

  if (msg.messageIdHeader && (await hasMessageIdHeader(supabase, msg.messageIdHeader))) {
    return { ok: true, message_id: resultId, skipped: 'duplicate' };
  }

  // Watermark on the mailbox.
  if (account?.id) {
    const { error } = await supabase
      .from('inbound_email_accounts')
      .update({
        last_received_at: new Date().toISOString(),
        ...(opts.historyId ? { last_history_id: String(opts.historyId) } : {}),
      })
      .eq('id', account.id);
    if (error) console.error(`[ingest-message:${source}] watermark failed:`, error.message);
  }

  const routeMode: 'crm_only' | 'crm_then_ticket' | 'ticket_only' =
    (account?.route_mode as 'crm_only' | 'crm_then_ticket' | 'ticket_only' | undefined) || 'crm_only';

  const entity = await resolveInboundEntity(supabase, {
    sender: msg.from,
    subject,
    threadId: msg.threadId ?? null,
  });
  console.log(
    `[ingest-message:${source}] entity: ${entity.resolved_by}` +
      (entity.related_entity_id ? ` → ${entity.related_entity_type} ${entity.related_entity_id}` : ''),
  );

  const resolvedToCrm = entity.resolved_by !== 'unresolved';
  const classification = classifyInbound({ headers: msg.headers, fromEmail: msg.from, resolvedToCrm });

  // Noise (newsletters, bulk mail, no-reply system notifications) never becomes
  // a ticket, whatever the route mode says — a ticket is a promise to answer.
  const shouldCreateTicket =
    classification !== 'noise' &&
    (routeMode === 'ticket_only' || (routeMode === 'crm_then_ticket' && !resolvedToCrm));

  const { data: stored, error: logErr } = await supabase.from('outbound_communications').insert({
    direction: 'inbound',
    channel: 'email',
    status: 'received',
    provider,
    simulated: false,
    recipient: msg.to || account?.email_address || '',
    sender: msg.from,
    subject,
    body_text: bodyText,
    body_html: bodyHtml,
    source,
    thread_id: msg.threadId ?? null,
    message_id_header: msg.messageIdHeader ?? null,
    in_reply_to: msg.inReplyTo ?? null,
    related_entity_type: entity.related_entity_type,
    related_entity_id: entity.related_entity_id,
    metadata: {
      references: msg.references ?? null,
      inbound_account_id: account?.id ?? null,
      snippet,
      resolved_by: entity.resolved_by,
      classification,
      ...(opts.extraMetadata ?? {}),
    },
    sent_at: new Date().toISOString(),
  }).select('thread_id').maybeSingle();
  if (logErr) console.error(`[ingest-message:${source}] log insert failed:`, logErr);
  // The thread the row was filed on. A relay has no provider thread id, so
  // trg_touch_email_thread derives one from the subject on insert; the event
  // must carry THAT key, or draft_email_reply refuses ("thread_id required")
  // and FlowPilot never sees the mail (Nordbrygg, 2026-10-29).
  const threadId = (stored as { thread_id?: string | null } | null)?.thread_id ?? msg.threadId ?? null;

  const { error: emitErr } = await supabase.rpc('emit_platform_event', {
    _event_name: 'email.received',
    _payload: {
      message_id: resultId,
      thread_id: threadId,
      // Gmail's Composio account; null for a relay. Every key the ticket
      // automation maps is always present, whichever provider delivered.
      connected_account_id: account?.composio_account_id ?? null,
      inbound_account_id: account?.id || null,
      mailbox: account?.email_address || msg.to,
      from: msg.from,
      to: msg.to,
      subject,
      snippet,
      body_text: bodyText,
      in_reply_to: msg.inReplyTo ?? null,
      references: msg.references ?? null,
      message_id_header: msg.messageIdHeader ?? null,
      headers: msg.headers,
      received_at: new Date().toISOString(),
      route_mode: routeMode,
      should_create_ticket: shouldCreateTicket,
      classification,
      provider,
      ...(opts.extraEvent ?? {}),
    },
    _source: source,
  });
  if (emitErr) console.error(`[ingest-message:${source}] emit_platform_event failed:`, emitErr);

  return {
    ok: !logErr,
    message_id: resultId,
    logged: !logErr,
    emitted: !emitErr,
    resolved_by: entity.resolved_by,
    classification,
    should_create_ticket: shouldCreateTicket,
    ...(logErr ? { error: logErr.message } : {}),
  };
}
