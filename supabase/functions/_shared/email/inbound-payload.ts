/**
 * The body a mail relay posts to `email-webhook/inbound`, read into an
 * InboundMessage. Pure: no Deno, no fetch — vitest reads it directly.
 *
 * The shape is what the Cloudflare Email Routing Worker in
 * `deploy/cloudflare/email-inbound/` sends after parsing the MIME message with
 * postal-mime, and is deliberately plain so any relay (a Postfix pipe, an SES
 * Lambda) can post it too:
 *
 *   { from, to, subject, text?, html?, message_id?, in_reply_to?,
 *     references?, headers?: { name: value } | [{ key|name, value }] }
 *
 * `from`/`to` are the SMTP envelope as the relay saw it; a display-name form
 * ("Elin <elin@x.se>") is kept as is — resolve-entity reads the bare address.
 */
import type { InboundMessage } from './ingest-message.ts';

export const MAX_TEXT = 50_000;
export const MAX_HTML = 200_000;
/** Cloudflare Email Routing accepts up to 25 MiB inbound. */
export const MAX_RAW_MIME = 25 * 1024 * 1024;

export type InboundPayloadResult =
  | { ok: true; message: InboundMessage }
  | { ok: false; error: string };

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function headerMap(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(raw)) {
    for (const h of raw) {
      const entry = (h ?? {}) as { key?: unknown; name?: unknown; value?: unknown };
      const name = str(entry.key ?? entry.name).toLowerCase();
      if (name) out[name] = str(entry.value);
    }
  } else if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) out[k.toLowerCase()] = str(v);
  }
  return out;
}

const ADDRESS = /[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+/;

export function readInboundPayload(body: unknown): InboundPayloadResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'body must be a JSON object' };
  const b = body as Record<string, unknown>;
  const headers = headerMap(b.headers);
  const from = str(b.from || headers['from']).trim();
  const to = str(b.to || headers['to']).trim();
  if (!ADDRESS.test(from)) return { ok: false, error: 'from must contain an email address' };
  if (!ADDRESS.test(to)) return { ok: false, error: 'to must contain an email address' };
  const text = str(b.text).slice(0, MAX_TEXT);
  const html = str(b.html).slice(0, MAX_HTML) || null;
  const subject = str(b.subject || headers['subject']).slice(0, 998);
  if (!text && !html && !subject) return { ok: false, error: 'empty message: no subject, text or html' };
  return {
    ok: true,
    message: {
      from,
      to,
      subject: subject || '(no subject)',
      text,
      html,
      messageIdHeader: str(b.message_id || headers['message-id']).trim() || null,
      inReplyTo: str(b.in_reply_to || headers['in-reply-to']).trim() || null,
      references: str(b.references || headers['references']).trim() || null,
      headers,
    },
  };
}

/** The subset of postal-mime's parse result the router reads. */
export interface ParsedMimeLike {
  subject?: string;
  text?: string;
  html?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  from?: { address?: string; name?: string } | null;
  to?: Array<{ address?: string; name?: string }> | null;
  headers?: Array<{ key?: string; value?: string }>;
}

/**
 * A raw MIME message parsed by postal-mime, as the JSON shape readInboundPayload
 * takes. The SMTP envelope (who Cloudflare received it from and for) wins over
 * the headers: a catch-all routes by envelope recipient, and a Bcc'd or
 * list-expanded mail does not name the routed address in its To header.
 */
export function payloadFromParsedMime(
  mail: ParsedMimeLike,
  envelope: { from?: string | null; to?: string | null },
): Record<string, unknown> {
  return {
    from: envelope.from || mail.from?.address || '',
    to: envelope.to || mail.to?.[0]?.address || '',
    subject: mail.subject ?? '',
    text: mail.text ?? '',
    html: mail.html ?? '',
    message_id: mail.messageId ?? '',
    in_reply_to: mail.inReplyTo ?? '',
    references: mail.references ?? '',
    headers: mail.headers ?? [],
  };
}
