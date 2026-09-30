// Meeting poll confirmation — the decision back to everyone who can make it.
//
// Body: { poll_id, public_url }
// Sent after resolve_meeting_poll picked a slot: one mail per respondent whose
// answer includes the chosen slot, plus the organizer. Respondents who cannot
// make the chosen time are not mailed a meeting they are not in — the poll
// page shows them the outcome.
//
// Gated in index.ts to the booking module, like meeting_poll_invite.
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { renderTemplate } from '../_shared/template-render.ts';
import { escapeHtml, fmtSlot } from './meeting_poll_invite.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Body { poll_id: string; public_url: string }

function buildHtml(opts: { title: string; organizer: string; when: string; attendees: string[]; url: string; siteName: string }) {
  const { title, organizer, when, attendees, url, siteName } = opts;
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;margin:0;padding:24px;color:#111">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e6e8ec">
    <h1 style="margin:0 0 8px;font-size:20px">${escapeHtml(title)} — it's set</h1>
    <p style="margin:0 0 16px;color:#4b5563">${escapeHtml(organizer)} proposed a few times, everyone answered, and the first time that works for all of you is:</p>
    <div style="background:#f9fafb;border:1px solid #e6e8ec;border-radius:8px;padding:16px;margin:16px 0;font-size:16px;font-weight:600">${escapeHtml(when)}</div>
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280">Attending: ${attendees.map(escapeHtml).join(', ')}</p>
    <div style="text-align:center;margin:24px 0">
      <a href="${url}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">View the poll</a>
    </div>
    <p style="margin:0;color:#6b7280;font-size:12px">Sent by ${escapeHtml(siteName)}.</p>
  </div></body></html>`;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  try {
    const body: Body = await req.json();
    if (!body.poll_id || !body.public_url) return json({ error: 'poll_id and public_url are required' }, 400);

    const supabase = getServiceClient();
    const { data: poll, error: pErr } = await supabase.from('meeting_polls').select('*').eq('id', body.poll_id).maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!poll) return json({ error: 'Poll not found' }, 404);
    if (poll.status !== 'resolved' || !poll.resolved_slot_id) {
      return json({ error: 'Poll is not decided yet — resolve_meeting_poll first' }, 409);
    }

    const [{ data: slot }, { data: responses }, { data: general }] = await Promise.all([
      supabase.from('meeting_poll_slots').select('starts_at, duration_min').eq('id', poll.resolved_slot_id).maybeSingle(),
      supabase.from('meeting_poll_responses').select('email, name, slot_ids').eq('poll_id', poll.id),
      supabase.from('site_settings').select('value').eq('key', 'general').maybeSingle(),
    ]);
    if (!slot) return json({ error: 'The decided slot no longer exists' }, 409);
    const siteName = (general?.value as { site_name?: string } | null)?.site_name || 'FlowWink';

    const attending = (responses ?? []).filter((r) => (r.slot_ids as string[]).includes(poll.resolved_slot_id));
    const recipients = new Map<string, string>();
    for (const r of attending) recipients.set(String(r.email).toLowerCase(), r.name);
    recipients.set(String(poll.organizer_email).toLowerCase(), poll.organizer_name);

    const when = fmtSlot(slot, poll.timezone);
    const names = attending.map((r) => r.name);

    const { data: tplRow, error: tplErr } = await supabase.rpc('resolve_email_template', { p_name: 'meeting_poll_confirmation', p_locale: null });
    if (tplErr) console.warn('[meeting_poll_confirmation] template lookup failed — using built-in:', tplErr.message);
    const tpl = tplRow as { ok?: boolean; html?: string; subject?: string } | null;
    const vars = {
      title: escapeHtml(poll.title),
      organizer_name: escapeHtml(poll.organizer_name),
      when: escapeHtml(when),
      attendees: names.map(escapeHtml).join(', '),
      poll_url: body.public_url,
      site_name: escapeHtml(siteName),
    };
    const html = tpl?.ok && tpl.html
      ? renderTemplate(tpl.html, vars)
      : buildHtml({ title: poll.title, organizer: poll.organizer_name, when, attendees: names, url: body.public_url, siteName });
    const subject = tpl?.ok && tpl.subject ? renderTemplate(tpl.subject, vars) : `Confirmed: ${poll.title} — ${when}`;

    let sent = 0;
    // email-send with no provider answers success:true + simulated:true and logs
    // the mail as simulated. That is not a send — the caller must hear it.
    let simulated = 0;
    const failed: Array<{ to: string; error: string }> = [];
    let skipped: string | undefined;
    for (const [to] of recipients) {
      const { data: sendData, error: sendErr } = await supabase.functions.invoke('email-send', {
        body: { to, subject, html, replyTo: poll.organizer_email, tags: { kind: 'meeting_poll_confirmation', poll_id: poll.id } },
      });
      if (sendErr || !sendData?.success) {
        const reason = sendErr?.message || sendData?.error || 'email-send returned failure';
        if (/no email provider|not configured/i.test(reason)) { skipped = reason; break; }
        failed.push({ to, error: reason });
      } else if (sendData?.simulated) {
        simulated++;
      } else {
        sent++;
      }
    }

    await supabase.from('audit_logs').insert({
      action: 'meeting_poll.confirmation_sent',
      entity_type: 'meeting_poll',
      entity_id: poll.id,
      metadata: { sent, simulated, failed: failed.length, skipped: skipped ?? null, recipients: recipients.size },
    });

    if (simulated > 0 && sent === 0 && !skipped) skipped = 'No email provider is configured — the mail was logged as simulated, nothing reached an inbox.';
    return json({ success: sent > 0, sent, simulated, failed, ...(skipped ? { skipped } : {}) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[meeting_poll_confirmation]', msg);
    return json({ error: msg }, 500);
  }
}
