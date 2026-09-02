import { resolveAiConfig } from '../ai-config.ts';
import { callAiCompletion } from '../ai-usage-logger.ts';
import { loadBusinessIdentityBlock } from '../domains/business-identity-block.ts';
import { retrieve, renderContext } from '../retrieval/index.ts';

/**
 * FlowPilot goes first on email.
 *
 * On every inbound message the operator writes a proposed reply and files it
 * as a DRAFT row on the thread in outbound_communications (status 'draft',
 * provider 'flowpilot'). Nothing is sent: the row is what the FlowBox queue
 * and the thread show as "FlowPilot drafted a reply", prefilled in the reply
 * box for a person to edit, send or discard. Sending stays a human act on
 * the existing email-send rail; the draft row is marked 'used' or
 * 'discarded' by the person, so the message log keeps the whole story.
 *
 * Grounded the way the rest of the platform writes (two retrieval shapes):
 * Business Identity read whole, published knowledge top-k through the
 * Knowledge Index, and the thread's own history. An empty index is not an
 * error — the draft is then grounded in identity and the thread alone, and
 * the prompt forbids inventing what the sources do not say.
 *
 * Idempotent on the inbound message id (metadata.draft_of), so a replayed
 * event never files a second draft.
 */
export async function handleDraftEmailReply(
  supabase: any,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  // Flat args or a nested `event` (manual replay may pass the whole payload).
  const evt = (args.event as Record<string, unknown> | undefined) || args;
  const str = (k: string): string => {
    const v = evt[k];
    return typeof v === 'string' ? v.trim() : '';
  };

  const threadId = str('thread_id');
  if (!threadId) return { success: false, error: 'thread_id required — the draft lives on the thread' };
  const messageId = str('message_id');
  const force = args.force === true || evt.force === true;

  // Same gate as the ticket rail: noise (newsletters, bounces, auto-replies)
  // gets no draft. Everything else — a customer, a lead answering a seller,
  // an unknown sender — gets one; the person decides what to do with it.
  const classification = str('classification');
  if (!force && classification === 'noise') {
    return { success: true, skipped: 'noise', thread_id: threadId };
  }

  const from = str('from');
  const fromAddr = addressOf(from);
  if (!fromAddr) return { success: false, error: 'from required — a draft needs someone to answer' };
  const mailbox = str('mailbox');
  if (mailbox && fromAddr.toLowerCase() === mailbox.toLowerCase()) {
    return { success: true, skipped: 'own mailbox — not a message to answer', thread_id: threadId };
  }

  try {
    if (messageId) {
      const { data: existing, error: existErr } = await supabase
        .from('outbound_communications')
        .select('id')
        .eq('thread_id', threadId)
        .eq('status', 'draft')
        .contains('metadata', { draft_of: messageId })
        .limit(1);
      if (existErr) console.warn('[draft-email-reply] idempotency read failed, drafting anyway:', existErr.message);
      if (existing?.length) {
        return { success: true, skipped: 'already drafted', draft_id: existing[0].id, thread_id: threadId };
      }
    }

    const subject = str('subject');
    const bodyText = str('body_text') || str('snippet');
    if (!bodyText) return { success: true, skipped: 'empty message', thread_id: threadId };

    // The thread so far (sent and received, never earlier drafts), oldest
    // first, so the model answers the conversation and not just the last mail.
    const { data: historyRows, error: histErr } = await supabase
      .from('outbound_communications')
      .select('direction, sender, recipient, body_text, created_at, status')
      .eq('channel', 'email')
      .eq('thread_id', threadId)
      .not('status', 'in', '("draft","used","discarded")')
      .order('created_at', { ascending: false })
      .limit(6);
    if (histErr) console.warn('[draft-email-reply] thread history unavailable:', histErr.message);
    const history = ((historyRows ?? []) as Array<{ direction: string | null; sender: string | null; recipient: string | null; body_text: string | null; created_at: string }>)
      .reverse()
      .map((m) => `${m.direction === 'inbound' ? `FROM ${m.sender ?? 'them'}` : `TO ${m.recipient ?? 'them'} (us)`} · ${m.created_at.slice(0, 10)}\n${(m.body_text ?? '').replace(/\s+/g, ' ').slice(0, 900)}`)
      .join('\n\n');

    const { data: thread, error: threadErr } = await supabase
      .from('email_threads')
      .select('related_entity_type, related_entity_id')
      .eq('thread_key', threadId)
      .maybeSingle();
    if (threadErr) console.warn('[draft-email-reply] thread row unavailable:', threadErr.message);

    const identity = await loadBusinessIdentityBlock(supabase, 'core').catch((e: unknown) => {
      console.warn('[draft-email-reply] identity unavailable:', e);
      return '';
    });

    let context = '';
    let groundedOn: string[] = [];
    try {
      const chunks = await retrieve(supabase, { query: `${subject}\n${bodyText}`.slice(0, 1200), k: 6, tokenBudget: 2500 });
      context = renderContext(chunks);
      groundedOn = chunks.map((c) => c.title);
    } catch (e) {
      console.warn('[draft-email-reply] retrieval unavailable, drafting on identity + thread only:', e);
    }

    const ai = await resolveAiConfig(supabase, 'fast');
    const result = await callAiCompletion({
      supabase,
      source: 'draft-email-reply',
      provider: ai.provider, model: ai.model, apiUrl: ai.apiUrl, apiKey: ai.apiKey,
      metadata: { thread_id: threadId, message_id: messageId || null },
      body: {
        messages: [
          {
            role: 'system',
            content:
              'You draft a reply to an inbound email on behalf of the company described below. ' +
              'A person will read, edit and send it — you propose, you never send.\n' +
              'Rules:\n' +
              '- Write in the language the sender wrote in.\n' +
              '- Plain text only: no subject line, no markdown, no placeholders like [name].\n' +
              '- Greet the sender by first name when the message shows one; otherwise a plain greeting.\n' +
              '- Answer what they asked using ONLY the identity, the knowledge sources and the thread below. ' +
              'Never invent prices, dates, availability, names or commitments. When the sources do not ' +
              'cover a question, say that a colleague will come back on that point — do not guess.\n' +
              '- Under 180 words. Short paragraphs. End with a plain sign-off in the company\'s name; no personal name.' +
              (identity ? `\n\n${identity}` : '') +
              (context ? `\n\nKnowledge sources (cite nothing, just use them):\n${context}` : ''),
          },
          {
            role: 'user',
            content:
              (history ? `Thread so far:\n${history}\n\n` : '') +
              `New inbound message\nFrom: ${from}\nSubject: ${subject || '(no subject)'}\n\n${bodyText.slice(0, 6000)}\n\nDraft the reply.`,
          },
        ],
        temperature: 0.3,
        max_tokens: 700,
      },
    });

    const text = extractText(result);
    if (!text) return { success: false, error: 'the model returned nothing — no draft filed', thread_id: threadId };

    const baseSubject = (subject || '').replace(/^\s*(re|sv|aw|fwd?)\s*:\s*/i, '');
    const { data: inserted, error: insErr } = await supabase
      .from('outbound_communications')
      .insert({
        channel: 'email',
        direction: 'outbound',
        status: 'draft',
        provider: 'flowpilot',
        source: 'flowpilot-draft',
        sender: mailbox || null,
        recipient: fromAddr,
        subject: `Re: ${baseSubject || '(no subject)'}`,
        body_text: text,
        thread_id: threadId,
        in_reply_to: str('message_id_header') || null,
        related_entity_type: thread?.related_entity_type ?? null,
        related_entity_id: thread?.related_entity_id ?? null,
        metadata: {
          draft_of: messageId || null,
          references: str('references') || null,
          grounded_on: groundedOn,
          model: ai.model,
          provider: ai.provider,
        },
      })
      .select('id')
      .single();
    if (insErr) return { success: false, error: `could not file the draft: ${insErr.message}`, thread_id: threadId };

    return {
      success: true,
      draft_id: inserted.id,
      thread_id: threadId,
      to: fromAddr,
      chars: text.length,
      grounded_on: groundedOn,
      note: 'Draft filed on the thread — a person edits and sends it from FlowBox or the Email page. Nothing was sent.',
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e), thread_id: threadId };
  }
}

/** "Anna <anna@x.se>" → "anna@x.se"; a bare address passes through. */
function addressOf(raw: string): string {
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim();
}

/** The text of a completion across the provider shapes callAiCompletion hands back. */
function extractText(r: any): string {
  const c = r?.choices?.[0]?.message?.content;
  if (typeof c === 'string') return c.trim();
  if (Array.isArray(c)) return c.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('').trim();
  const a = r?.content?.[0]?.text;
  if (typeof a === 'string') return a.trim();
  const g = r?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof g === 'string') return g.trim();
  return '';
}
