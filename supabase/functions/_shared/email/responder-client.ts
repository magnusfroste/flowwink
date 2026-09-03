/**
 * The one visitor-facing brain, reached from a server-side channel.
 *
 * chat-completion is FlowPilot's grounded responder: identity read whole,
 * public knowledge top-k, the chat's own tools. The website widget and
 * Telegram already answer through it; email does too, so that the same
 * question gets the same answer whichever door it came through. This client
 * is the server-side way in — it speaks the responder's SSE and hands back
 * plain text — and the small protocol the email register adds on top.
 */

export interface ResponderMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ResponderCall {
  supabaseUrl: string;
  serviceKey: string;
  messages: ResponderMessage[];
  channel: 'email';
  sessionId: string;
  emailContext?: { subject?: string; from?: string; mailbox?: string };
}

export interface ResponderAnswer {
  text: string;
  skipped: boolean;
  reason?: string;
  error?: string;
}

/** The marker the email register asks the responder to open with when the sources do not cover the question. */
export const NEEDS_PERSON_MARKER = '[NEEDS A PERSON]';

export async function askResponder(call: ResponderCall): Promise<ResponderAnswer> {
  const res = await fetch(`${call.supabaseUrl}/functions/v1/chat-completion`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${call.serviceKey}`,
      apikey: call.serviceKey,
    },
    body: JSON.stringify({
      messages: call.messages,
      sessionId: call.sessionId,
      channel: call.channel,
      emailContext: call.emailContext,
    }),
  });
  const contentType = res.headers.get('content-type') || '';
  const raw = await res.text();
  if (!res.ok) {
    let msg = raw.slice(0, 300);
    try { msg = JSON.parse(raw)?.error || msg; } catch { /* keep raw */ }
    return { text: '', skipped: false, error: `responder ${res.status}: ${msg}` };
  }
  if (contentType.includes('text/event-stream')) {
    return { text: parseSse(raw), skipped: false };
  }
  let json: any = {};
  try { json = JSON.parse(raw); } catch { /* not json */ }
  if (json?.skipped) return { text: '', skipped: true, reason: json.reason };
  if (json?.error) return { text: '', skipped: false, error: String(json.error) };
  const text = json?.message ?? json?.content ?? json?.reply ?? '';
  return { text: String(text).trim(), skipped: false };
}

/** OpenAI-style SSE → the concatenated assistant text. Pure, so it can be tested. */
export function parseSse(raw: string): string {
  let acc = '';
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('data:')) continue;
    const payload = t.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const obj = JSON.parse(payload);
      const delta = obj?.choices?.[0]?.delta?.content ?? obj?.choices?.[0]?.message?.content ?? '';
      if (typeof delta === 'string') acc += delta;
    } catch { /* keepalives, non-JSON frames */ }
  }
  return acc.trim();
}

/**
 * Split the marker off a reply. The register tells the responder to begin
 * with the marker when it could not answer from the sources and wrote a
 * holding reply instead; the caller then never sends on its own, whatever the
 * mailbox's reply mode says. Tolerant of the marker anywhere in the first
 * line and of a trailing colon or dash after it.
 */
export function splitNeedsPerson(text: string): { needsPerson: boolean; body: string } {
  const trimmed = text.trim();
  const idx = trimmed.indexOf(NEEDS_PERSON_MARKER);
  if (idx === -1 || idx > 40) return { needsPerson: false, body: trimmed };
  const after = trimmed.slice(idx + NEEDS_PERSON_MARKER.length).replace(/^[\s:—-]+/, '');
  const before = trimmed.slice(0, idx).trim();
  return { needsPerson: true, body: [before, after].filter(Boolean).join('\n').trim() };
}
