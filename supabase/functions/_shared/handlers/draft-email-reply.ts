import { askResponder, splitNeedsPerson, type ResponderMessage } from '../email/responder-client.ts';

/**
 * FlowPilot goes first on email — with the same brain as the chat.
 *
 * On every inbound message the responder (chat-completion: identity read
 * whole, public knowledge top-k, the same rules the website widget answers
 * under) writes a reply to the thread. What happens to it is the mailbox's
 * decision, `inbound_email_accounts.reply_mode` — the same dial shape the
 * chat has:
 *
 *   human_first  (default) the reply is filed as a DRAFT on the thread;
 *                a person edits, sends or discards it from FlowBox.
 *   ai_first     the reply is SENT on the platform email rail — unless the
 *                responder said it could not answer from the sources
 *                ([NEEDS A PERSON]); then it is filed as a draft flagged
 *                needs_person, and the row waits for someone.
 *   human_only   FlowPilot writes nothing; the thread waits for a person.
 *
 * Nothing here has its own prompt: the register that turns a chat answer
 * into an email lives in chat-completion, keyed on channel 'email', so a
 * question gets the same answer whichever door it came through (Law 3).
 *
 * Idempotent on the inbound message id (metadata.draft_of / replied_to).
 */
export async function handleDraftEmailReply(
  supabase: any,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const evt = (args.event as Record<string, unknown> | undefined) || args;
  const str = (k: string): string => {
    const v = evt[k];
    return typeof v === 'string' ? v.trim() : '';
  };

  const threadId = str('thread_id');
  if (!threadId) return { success: false, error: 'thread_id required — the reply lives on the thread' };
  const messageId = str('message_id');
  const force = args.force === true || evt.force === true;

  const classification = str('classification');
  if (!force && classification === 'noise') {
    return { success: true, skipped: 'noise', thread_id: threadId };
  }

  const from = str('from');
  const fromAddr = addressOf(from);
  if (!fromAddr) return { success: false, error: 'from required — a reply needs someone to answer' };
  const mailbox = str('mailbox');
  if (mailbox && fromAddr.toLowerCase() === mailbox.toLowerCase()) {
    return { success: true, skipped: 'own mailbox — not a message to answer', thread_id: threadId };
  }

  try {
    // The mailbox's dial. Looked up by id when the event carries it, by
    // address otherwise; a mailbox we do not know answers as human_first.
    const accountId = str('inbound_account_id');
    let replyMode: 'ai_first' | 'human_first' | 'human_only' = 'human_first';
    if (accountId || mailbox) {
      const q = supabase.from('inbound_email_accounts').select('id, reply_mode');
      const { data: acc, error: accErr } = await (accountId ? q.eq('id', accountId) : q.eq('email_address', mailbox)).limit(1).maybeSingle();
      if (accErr) console.warn('[draft-email-reply] mailbox lookup failed, answering as human_first:', accErr.message);
      const m = acc?.reply_mode;
      if (m === 'ai_first' || m === 'human_first' || m === 'human_only') replyMode = m;
    }
    const explicit = args.reply_mode;
    if (explicit === 'ai_first' || explicit === 'human_first' || explicit === 'human_only') replyMode = explicit;
    if (replyMode === 'human_only') {
      return { success: true, skipped: 'reply_mode=human_only — the thread waits for a person', thread_id: threadId, reply_mode: replyMode };
    }

    if (messageId) {
      const { data: existing, error: existErr } = await supabase
        .from('outbound_communications')
        .select('id, status')
        .eq('thread_id', threadId)
        .or(`metadata->>draft_of.eq.${messageId},metadata->>replied_to.eq.${messageId}`)
        .limit(1);
      if (existErr) console.warn('[draft-email-reply] idempotency read failed, answering anyway:', existErr.message);
      if (existing?.length) {
        return { success: true, skipped: 'already answered', row_id: existing[0].id, status: existing[0].status, thread_id: threadId };
      }
    }

    const subject = str('subject');
    const bodyText = str('body_text') || str('snippet');
    if (!bodyText) return { success: true, skipped: 'empty message', thread_id: threadId };

    // The thread so far as turns: what they wrote is the user, what we sent
    // is the assistant. Drafts and spent drafts are not part of the conversation.
    const { data: historyRows, error: histErr } = await supabase
      .from('outbound_communications')
      .select('direction, body_text, created_at, status')
      .eq('channel', 'email')
      .eq('thread_id', threadId)
      .not('status', 'in', '("draft","used","discarded")')
      .order('created_at', { ascending: false })
      .limit(8);
    if (histErr) console.warn('[draft-email-reply] thread history unavailable:', histErr.message);
    const turns: ResponderMessage[] = ((historyRows ?? []) as Array<{ direction: string | null; body_text: string | null }>)
      .reverse()
      .filter((m) => (m.body_text ?? '').trim())
      .map((m) => ({ role: m.direction === 'inbound' ? 'user' : 'assistant', content: (m.body_text ?? '').slice(0, 4000) }));
    // The message that triggered us is usually already logged as the newest
    // inbound row; do not repeat it.
    const last = turns[turns.length - 1];
    if (!(last && last.role === 'user' && last.content.slice(0, 200) === bodyText.slice(0, 200))) {
      turns.push({ role: 'user', content: bodyText.slice(0, 6000) });
    }

    const { data: thread, error: threadErr } = await supabase
      .from('email_threads')
      .select('related_entity_type, related_entity_id')
      .eq('thread_key', threadId)
      .maybeSingle();
    if (threadErr) console.warn('[draft-email-reply] thread row unavailable:', threadErr.message);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const answer = await askResponder({
      supabaseUrl, serviceKey,
      messages: turns,
      channel: 'email',
      sessionId: `email:${threadId}`,
      emailContext: { subject, from, mailbox },
    });
    if (answer.error) return { success: false, error: `the responder failed: ${answer.error}`, thread_id: threadId };
    if (answer.skipped) return { success: true, skipped: `responder skipped: ${answer.reason ?? 'unknown'}`, thread_id: threadId };
    const { needsPerson, body } = splitNeedsPerson(answer.text);
    if (!body) return { success: false, error: 'the responder returned nothing — no reply filed', thread_id: threadId };

    const baseSubject = (subject || '').replace(/^\s*(re|sv|aw|fwd?)\s*:\s*/i, '');
    const replySubject = `Re: ${baseSubject || '(no subject)'}`;
    const related = thread?.related_entity_type && thread?.related_entity_id
      ? { related_entity_type: thread.related_entity_type, related_entity_id: thread.related_entity_id }
      : {};

    // ai_first and the responder answered from the sources: send it.
    if (replyMode === 'ai_first' && !needsPerson) {
      const html = body.split('\n').map((l) => (l.trim() === '' ? '<br>' : `<p>${escapeHtml(l)}</p>`)).join('');
      const res = await fetch(`${supabaseUrl}/functions/v1/email-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
        body: JSON.stringify({
          to: fromAddr,
          subject: replySubject,
          html,
          text: body,
          expects_reply: true,
          inReplyTo: str('message_id_header') || undefined,
          references: str('references') || undefined,
          threadId,
          source: 'flowpilot-reply',
          tags: { source: 'flowpilot-reply', replied_to: messageId || '' },
          ...related,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || out?.success === false) {
        // The rail refused (no provider, allowlist, …): keep the answer as a
        // draft so nothing is lost, and say why it was not sent.
        const { data: d } = await fileDraft(supabase, { threadId, mailbox, fromAddr, replySubject, body, messageId, evt: str, related, needsPerson: false, extra: { send_error: out?.error || `HTTP ${res.status}` } });
        return { success: false, error: `reply_mode=ai_first but sending failed: ${out?.error || res.status} — filed as a draft instead`, draft_id: d?.id ?? null, thread_id: threadId };
      }
      return {
        success: true,
        sent: true,
        reply_mode: replyMode,
        thread_id: threadId,
        to: fromAddr,
        chars: body.length,
        note: 'Answered by FlowPilot on the platform email rail, same responder as the chat. Logged on the thread.',
      };
    }

    const { data: inserted, error: insErr } = await fileDraft(supabase, { threadId, mailbox, fromAddr, replySubject, body, messageId, evt: str, related, needsPerson, extra: {} });
    if (insErr) return { success: false, error: `could not file the draft: ${insErr.message}`, thread_id: threadId };
    return {
      success: true,
      sent: false,
      draft_id: inserted?.id ?? null,
      reply_mode: replyMode,
      needs_person: needsPerson,
      thread_id: threadId,
      to: fromAddr,
      chars: body.length,
      note: needsPerson
        ? 'The responder could not answer from the sources; a holding draft is filed and the thread waits for a person.'
        : 'Draft filed on the thread — a person edits and sends it from FlowBox or the Email page. Nothing was sent.',
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e), thread_id: threadId };
  }
}

async function fileDraft(supabase: any, p: {
  threadId: string; mailbox: string; fromAddr: string; replySubject: string; body: string; messageId: string;
  evt: (k: string) => string; related: Record<string, unknown>; needsPerson: boolean; extra: Record<string, unknown>;
}): Promise<{ data: { id: string } | null; error: { message: string } | null }> {
  return await supabase
    .from('outbound_communications')
    .insert({
      channel: 'email',
      direction: 'outbound',
      status: 'draft',
      provider: 'flowpilot',
      source: 'flowpilot-draft',
      sender: p.mailbox || null,
      recipient: p.fromAddr,
      subject: p.replySubject,
      body_text: p.body,
      thread_id: p.threadId,
      in_reply_to: p.evt('message_id_header') || null,
      ...p.related,
      metadata: {
        draft_of: p.messageId || null,
        references: p.evt('references') || null,
        needs_person: p.needsPerson,
        responder: 'chat-completion',
        ...p.extra,
      },
    })
    .select('id')
    .single();
}

/** "Anna <anna@x.se>" → "anna@x.se"; a bare address passes through. */
function addressOf(raw: string): string {
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
