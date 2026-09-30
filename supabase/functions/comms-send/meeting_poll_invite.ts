// Meeting poll invitation — the share link out, one mail per recipient.
//
// Body: { poll_id, emails: string[], public_url, custom_message? }
// public_url is the /poll/<token> link as the ORGANIZER's browser sees it (same
// idiom as quote_email): the server does not guess a site URL.
//
// Gated in index.ts to the booking module (service key, admin, or a role
// granted `bookings`) — the same wall the poll tables and list_meeting_polls
// have. Anon never reaches this kind.
//
// Language: an e-mail template named meeting_poll_invite in the site's default
// locale wins when one exists (resolve_email_template); otherwise the built-in
// English below. The mail never fails for want of a template (Law 4).
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { renderTemplate } from '../_shared/template-render.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Body {
  poll_id: string;
  emails: string[];
  public_url: string;
  custom_message?: string;
}

interface Slot { starts_at: string; duration_min: number }

export function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function fmtSlot(slot: Slot, timeZone: string): string {
  const start = new Date(slot.starts_at);
  const end = new Date(start.getTime() + slot.duration_min * 60_000);
  let zone = timeZone;
  try { new Intl.DateTimeFormat('en', { timeZone }); } catch { zone = 'UTC'; }
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(start);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit' });
  return `${day}, ${time.format(start)}–${time.format(end)} (${zone})`;
}

function buildHtml(opts: { title: string; organizer: string; description: string | null; slots: Slot[]; timezone: string; url: string; custom: string; siteName: string }) {
  const { title, organizer, description, slots, timezone, url, custom, siteName } = opts;
  const rows = slots.map((s) => `<li style="padding:6px 0;border-bottom:1px solid #eef0f3;font-size:14px">${escapeHtml(fmtSlot(s, timezone))}</li>`).join('');
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;margin:0;padding:24px;color:#111">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e6e8ec">
    <h1 style="margin:0 0 8px;font-size:20px">${escapeHtml(title)}</h1>
    <p style="margin:0 0 16px;color:#4b5563">${escapeHtml(organizer)} is looking for a time that works for everyone. Tick the times you can make — no account needed.</p>
    ${custom ? `<p style="margin:0 0 16px;white-space:pre-wrap">${escapeHtml(custom)}</p>` : ''}
    ${description ? `<p style="margin:0 0 16px;color:#4b5563;white-space:pre-wrap">${escapeHtml(description)}</p>` : ''}
    <div style="background:#f9fafb;border:1px solid #e6e8ec;border-radius:8px;padding:12px 16px;margin:16px 0">
      <div style="font-size:11px;text-transform:uppercase;color:#6b7280;margin-bottom:4px">Proposed times</div>
      <ul style="list-style:none;margin:0;padding:0">${rows}</ul>
    </div>
    <div style="text-align:center;margin:24px 0">
      <a href="${url}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">Pick your times</a>
    </div>
    <p style="margin:0;color:#6b7280;font-size:12px">Sent by ${escapeHtml(siteName)}. The first time everyone can make wins; you will hear back once it is decided.</p>
  </div></body></html>`;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  try {
    const body: Body = await req.json();
    const emails = Array.from(new Set((body.emails ?? []).map((e) => String(e).trim().toLowerCase()).filter((e) => /.+@.+\..+/.test(e))));
    if (!body.poll_id || !body.public_url || emails.length === 0) {
      return json({ error: 'poll_id, public_url and at least one valid e-mail in emails are required' }, 400);
    }
    if (emails.length > 100) return json({ error: 'At most 100 recipients per send' }, 400);

    const supabase = getServiceClient();
    const { data: poll, error: pErr } = await supabase.from('meeting_polls').select('*').eq('id', body.poll_id).maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!poll) return json({ error: 'Poll not found' }, 404);
    if (poll.status !== 'open') return json({ error: `Poll is ${poll.status} — only an open poll is sent out` }, 409);

    const { data: slots } = await supabase.from('meeting_poll_slots').select('starts_at, duration_min').eq('poll_id', poll.id).order('starts_at');

    const { data: general } = await supabase.from('site_settings').select('value').eq('key', 'general').maybeSingle();
    const siteName = (general?.value as { site_name?: string } | null)?.site_name || 'FlowWink';

    const { data: tplRow, error: tplErr } = await supabase.rpc('resolve_email_template', { p_name: 'meeting_poll_invite', p_locale: null });
    if (tplErr) console.warn('[meeting_poll_invite] template lookup failed — using built-in:', tplErr.message);
    const tpl = tplRow as { ok?: boolean; html?: string; subject?: string } | null;

    const vars = {
      title: escapeHtml(poll.title),
      organizer_name: escapeHtml(poll.organizer_name),
      description: escapeHtml(poll.description ?? ''),
      custom_message: escapeHtml(body.custom_message ?? ''),
      slots_html: (slots ?? []).map((s) => `<li>${escapeHtml(fmtSlot(s as Slot, poll.timezone))}</li>`).join(''),
      poll_url: body.public_url,
      site_name: escapeHtml(siteName),
    };
    const html = tpl?.ok && tpl.html
      ? renderTemplate(tpl.html, vars)
      : buildHtml({ title: poll.title, organizer: poll.organizer_name, description: poll.description, slots: (slots ?? []) as Slot[], timezone: poll.timezone, url: body.public_url, custom: body.custom_message ?? '', siteName });
    const subject = tpl?.ok && tpl.subject ? renderTemplate(tpl.subject, vars) : `When can we meet? — ${poll.title}`;

    let sent = 0;
    // email-send with no provider answers success:true + simulated:true and logs
    // the mail as simulated. That is not a send — the caller must hear it.
    let simulated = 0;
    const failed: Array<{ to: string; error: string }> = [];
    let skipped: string | undefined;
    for (const to of emails) {
      const { data: sendData, error: sendErr } = await supabase.functions.invoke('email-send', {
        body: { to, subject, html, expects_reply: true, replyTo: poll.organizer_email, tags: { kind: 'meeting_poll_invite', poll_id: poll.id } },
      });
      if (sendErr || !sendData?.success) {
        const reason = sendErr?.message || sendData?.error || 'email-send returned failure';
        // "No provider configured" is one answer for the whole batch, not a failure per address.
        if (/no email provider|not configured/i.test(reason)) { skipped = reason; break; }
        failed.push({ to, error: reason });
      } else if (sendData?.simulated) {
        simulated++;
      } else {
        sent++;
      }
    }

    await supabase.from('audit_logs').insert({
      action: 'meeting_poll.invite_sent',
      entity_type: 'meeting_poll',
      entity_id: poll.id,
      metadata: { sent, simulated, failed: failed.length, skipped: skipped ?? null, recipients: emails.length },
    });

    if (simulated > 0 && sent === 0 && !skipped) skipped = 'No email provider is configured — the mail was logged as simulated, nothing reached an inbox.';
    return json({ success: sent > 0, sent, simulated, failed, ...(skipped ? { skipped } : {}) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[meeting_poll_invite]', msg);
    return json({ error: msg }, 500);
  }
}
