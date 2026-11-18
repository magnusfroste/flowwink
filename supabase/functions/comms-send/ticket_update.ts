// The customer hears about their case: "we have received it" when it is
// opened, and the staff's reply when one is written (2026-11-18).
//
// Until then a case told its customer nothing. The reply was written to
// ticket_comments "for the portal" — where a customer who wrote in through a
// form, or was entered by hand, has no account — and only a reply sent through
// a connected Gmail, on a case that came in by mail, reached anyone.
//
// One mail per fact, claimed before the send and released when nothing went
// out: tickets.ack_sent_at for the receipt, ticket_comments.emailed_at for a
// reply. The words are visitor texts (ticket.mail.*) in the customer's
// language — translated once under Visitor texts, like the invoice's.
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { loadOrgName } from '../_shared/org-name.ts';
import { resolveUiText } from '../_shared/locale/ui-text.ts';
import { customerLanguage, loadUiText } from '../_shared/locale/load-ui-text.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Body { ticket_id?: string; comment_id?: string; resend?: boolean }

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/** A case that came in days ago and is only now being looked at is not "just received". */
const RECEIPT_WINDOW_MS = 24 * 3600 * 1000;

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const supabase = getServiceClient();
  // What this call has claimed — given back if nothing was sent, so a later call still can.
  let release: (() => Promise<void>) | null = null;
  try {
    const body: Body = await req.json();
    const commentId = body.comment_id ? String(body.comment_id) : null;
    let ticketId = body.ticket_id ? String(body.ticket_id) : null;

    let comment: { id: string; ticket_id: string; content: string; is_internal: boolean | null; author_type: string | null; author_name: string | null; emailed_at: string | null } | null = null;
    if (commentId) {
      const { data, error } = await supabase.from('ticket_comments')
        .select('id, ticket_id, content, is_internal, author_type, author_name, emailed_at').eq('id', commentId).maybeSingle();
      if (error) throw new Error(`Could not read the reply: ${error.message}`);
      if (!data) return json({ error: `No ticket comment with id ${commentId}`, code: 'NOT_FOUND' }, 404);
      comment = data;
      ticketId = data.ticket_id;
    }
    if (!ticketId) return json({ error: 'ticket_id (the receipt) or comment_id (a reply) is required', code: 'MISSING_REQUIRED_PARAMETER' }, 400);

    const { data: ticket, error: tErr } = await supabase.from('tickets')
      .select('id, ticket_number, subject, status, source, contact_email, contact_name, partner_id, ack_sent_at, created_at').eq('id', ticketId).maybeSingle();
    if (tErr) throw new Error(`Could not read the case: ${tErr.message}`);
    if (!ticket) return json({ error: `No ticket with id ${ticketId}`, code: 'NOT_FOUND' }, 404);

    const skipped = (reason: string) => json({ success: true, skipped: reason, ticket_id: ticket.id, ticket_number: ticket.ticket_number });
    if (!ticket.contact_email) return skipped('no_contact_email');

    const { data: settingRow, error: sErr } = await supabase.from('site_settings').select('value').eq('key', 'tickets').maybeSingle();
    if (sErr) console.warn('[ticket-update] could not read the tickets setting, mailing as by default:', sErr.message);
    if ((settingRow?.value as { customerEmailEnabled?: boolean } | null)?.customerEmailEnabled === false) return skipped('customer_email_disabled');

    if (comment) {
      if (comment.is_internal) return skipped('internal_note');
      if (comment.author_type !== 'agent') return skipped('not_a_staff_reply');
      if (comment.emailed_at && !body.resend) return skipped('already_mailed');
      // Claim the reply: of two calls for the same comment, one sends.
      const claim = supabase.from('ticket_comments').update({ emailed_at: new Date().toISOString() }).eq('id', comment.id);
      const { data: won, error: cErr } = await (body.resend ? claim : claim.is('emailed_at', null)).select('id');
      if (cErr) throw new Error(`Could not claim the reply: ${cErr.message}`);
      if (!won?.length) return skipped('already_mailed');
      const previous = comment.emailed_at;
      release = async () => {
        const { error } = await supabase.from('ticket_comments').update({ emailed_at: previous }).eq('id', comment!.id);
        if (error) console.error('[ticket-update] could not release the reply:', error.message);
      };
    } else {
      // A case that came in by mail is answered by a person, not by a robot:
      // an automatic receipt to a mailbox is how two autoresponders meet.
      if (ticket.source === 'email') return skipped('came_in_by_email');
      if (['resolved', 'closed'].includes(String(ticket.status))) return skipped('case_already_settled');
      if (!body.resend && Date.now() - new Date(ticket.created_at).getTime() > RECEIPT_WINDOW_MS) return skipped('not_a_new_case');
      if (ticket.ack_sent_at && !body.resend) return skipped('already_acknowledged');
      const claim = supabase.from('tickets').update({ ack_sent_at: new Date().toISOString() }).eq('id', ticket.id);
      const { data: won, error: cErr } = await (body.resend ? claim : claim.is('ack_sent_at', null)).select('id');
      if (cErr) throw new Error(`Could not claim the receipt: ${cErr.message}`);
      if (!won?.length) return skipped('already_acknowledged');
      const previous = ticket.ack_sent_at;
      release = async () => {
        const { error } = await supabase.from('tickets').update({ ack_sent_at: previous }).eq('id', ticket.id);
        if (error) console.error('[ticket-update] could not release the receipt:', error.message);
      };
    }

    const texts = await loadUiText(supabase);
    const lang = (await customerLanguage(supabase, { partnerId: ticket.partner_id })) || texts.siteLang;
    const t = resolveUiText(texts.map, lang, texts.siteLang);
    const orgName = await loadOrgName(supabase, 'our team');
    const number = String(ticket.ticket_number ?? '');
    const caseSubject = String(ticket.subject ?? '');
    const fill = (s: string) => s.replace('{number}', number).replace('{subject}', caseSubject).replace('{business}', orgName).replace('{name}', String(ticket.contact_name ?? '').trim());
    const greeting = String(ticket.contact_name ?? '').trim()
      ? fill(t('ticket.mail.greetingNamed', 'Hello {name},'))
      : t('ticket.mail.greeting', 'Hello,');
    const reference = fill(t('ticket.mail.reference', 'Your case number is {number}. Mention it if you contact us about this.'));

    const subject = comment
      ? fill(t('ticket.mail.replySubject', 'Re: {subject} [{number}]'))
      : fill(t('ticket.mail.receivedSubject', 'We have received your request [{number}]'));
    const lead = comment
      ? fill(t('ticket.mail.replyLead', 'We have answered your case "{subject}":'))
      : fill(t('ticket.mail.receivedLead', 'Thank you for contacting {business}. We have received your request "{subject}" and will get back to you.'));
    const quoted = comment
      ? `<div style="margin:16px 0;padding:12px 16px;border-left:3px solid #d1d5db;background:#f9fafb;white-space:pre-wrap">${escapeHtml(comment.content)}</div>`
      : '';
    const html = `
      <p style="margin:0 0 12px">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 12px">${escapeHtml(lead)}</p>
      ${quoted}
      <p style="margin:16px 0 0;color:#6b7280;font-size:13px">${escapeHtml(reference)}</p>
      <p style="margin:16px 0 0">${escapeHtml(orgName)}</p>`;

    const { data: sendData, error: sendErr } = await supabase.functions.invoke('email-send', {
      body: {
        to: ticket.contact_email,
        subject,
        html,
        expects_reply: true,
        source: 'ticket_update',
        tags: { kind: comment ? 'ticket_reply' : 'ticket_received', ticket_id: ticket.id, ...(comment ? { comment_id: comment.id } : {}) },
      },
    });
    if (sendErr) throw new Error(sendErr.message || 'email-send failed');
    if (!sendData?.success) throw new Error(sendData?.error || 'email-send returned failure');
    release = null;

    return json({
      success: true, sent: comment ? 'reply' : 'received', emailed_to: ticket.contact_email,
      ticket_id: ticket.id, ticket_number: ticket.ticket_number, provider: sendData.provider,
    });
  } catch (error) {
    if (release) await release();
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ticket-update]', message);
    return json({ error: message }, 500);
  }
};
