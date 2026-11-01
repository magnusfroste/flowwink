/**
 * Send a reply on an email thread — the one skill that puts mail on the wire
 * from the FlowPilot-first rail, so that the trust dial governs it.
 *
 * draft_email_reply decides WHAT to say (the shared responder) and, for a
 * mailbox on reply_mode=ai_first, asks this skill to send. Whether that send
 * happens at once or waits in Approvals is the skill's trust level: 'approve'
 * by default (a proposal is safe by construction; a send is a dial), 'auto'
 * on a support mailbox the operator trusts. Approving it — in Approvals, in
 * the Skill Hub, or by pressing Send on the prefilled draft in FlowBox — runs
 * this handler with the same arguments.
 *
 * The body is delivered on the platform email rail (email-send: Composio /
 * Gmail when connected, so the reply threads), logged on the thread, and the
 * draft row it came from, when given, is marked 'used'.
 */
export async function handleReplyToEmail(
  supabase: any,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const str = (k: string): string => {
    const v = args[k];
    return typeof v === 'string' ? v.trim() : '';
  };
  const to = str('to');
  const body = str('body_text');
  const threadId = str('thread_id');
  if (!to || !body) return { success: false, error: 'to and body_text are required — the reply must have an address and a text' };

  const repliedTo = str('replied_to');
  if (repliedTo && threadId) {
    const { data: already, error: alreadyErr } = await supabase
      .from('outbound_communications')
      .select('id')
      .eq('thread_id', threadId)
      .neq('status', 'draft')
      .or(`metadata->>replied_to.eq.${repliedTo},metadata->tags->>replied_to.eq.${repliedTo}`)
      .limit(1);
    if (alreadyErr) console.warn('[reply-to-email] idempotency read failed, sending anyway:', alreadyErr.message);
    if (already?.length) return { success: true, skipped: 'already sent for this message', row_id: already[0].id, thread_id: threadId };
  }

  const subject = str('subject') || 'Re: (no subject)';
  // A person who sends a staged reply from FlowBox (`_approved`) is who sent
  // it; the evidence says so, and whether the text was changed first.
  const rawEvidence = args._evidence && typeof args._evidence === 'object' ? args._evidence as Record<string, unknown> : null;
  const evidence = rawEvidence
    ? { ...rawEvidence, decision: 'sent', sent_by: args._approved === true ? 'person' : 'flowpilot', sent_at: new Date().toISOString() }
    : null;
  const html = body.split('\n').map((l) => (l.trim() === '' ? '<br>' : `<p>${escapeHtml(l)}</p>`)).join('');
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const res = await fetch(`${supabaseUrl}/functions/v1/email-send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
    body: JSON.stringify({
      to,
      subject,
      html,
      text: body,
      expects_reply: true,
      inReplyTo: str('in_reply_to') || undefined,
      references: str('references') || undefined,
      threadId: threadId || undefined,
      source: 'flowpilot-reply',
      tags: { source: 'flowpilot-reply', replied_to: repliedTo },
      // Why this reply says what it says (draft-email-reply's evidence and
      // grounding receipt), kept on the sent row — an email gets no thumbs
      // up, so the record is how it is judged afterwards.
      ...(evidence ? { extra_metadata: { evidence, grounding: args._grounding ?? null } } : {}),
      ...(str('related_entity_type') && str('related_entity_id')
        ? { related_entity_type: str('related_entity_type'), related_entity_id: str('related_entity_id') }
        : {}),
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out?.success === false) {
    return { success: false, error: `sending failed: ${out?.error || `HTTP ${res.status}`}`, thread_id: threadId, to };
  }

  const draftId = str('draft_id');
  if (draftId) {
    const { error: usedErr } = await supabase.from('outbound_communications').update({ status: 'used' }).eq('id', draftId).eq('status', 'draft');
    if (usedErr) console.warn('[reply-to-email] could not mark the draft used:', usedErr.message);
  } else if (repliedTo && threadId) {
    // Sent from somewhere that does not know the draft's id — Approve under
    // /admin/approvals runs this skill with the staged arguments, and the
    // draft was filed after they were staged. Its draft still sat in the
    // thread offering "Approve & send", so the reply looked unsent and a
    // second click would mail the customer twice (Nordbrygg, 2026-10-30).
    // The draft for this message is spent the moment the reply leaves.
    const { error: usedErr } = await supabase.from('outbound_communications')
      .update({ status: 'used' })
      .eq('thread_id', threadId).eq('status', 'draft')
      .eq('metadata->>draft_of', repliedTo);
    if (usedErr) console.warn('[reply-to-email] could not mark the thread draft used:', usedErr.message);
  }
  return {
    success: true,
    sent: true,
    thread_id: threadId,
    to,
    provider: out?.provider ?? null,
    chars: body.length,
    note: 'Sent on the platform email rail and logged on the thread.',
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
