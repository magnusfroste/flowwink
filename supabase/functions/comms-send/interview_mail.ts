// Interview mail — the candidate's half of the interview, three kinds:
//
//   interview_invitation  (recruitment module / service / agent)
//     Body: { invitation_id } — or { application_id, slots[], duration_minutes?,
//     kind?, interviewer_id?, message?, expires_in_days? }, which creates the
//     invitation first (invite_to_interview) so the admin and an agent
//     (invite_candidate_to_interview) make ONE call. Mails the candidate the
//     /interview/<token> link where they pick a time.
//   interview_confirmation (recruitment module / service / agent)
//     Body: { interview_id } — the booked time and the WebMeet link, for an
//     interview the recruiter scheduled directly.
//   interview_booked       (public: the link's holder)
//     Body: { token } — after the candidate booked on /interview/<token>. The
//     recipient is read from the application, never from the request, and the
//     mail goes once (confirmation_sent_at), so the link can trigger nothing else.
//
// Words: templates interview_invitation / interview_confirmed in the
// candidate's language (applications.meta.lang, else the site's); times on
// the business's clock in that language. Built-in English if no template
// resolves (Law 4). Links are absolute: the site's address (resolveSiteUrl),
// else the public_url the admin's browser sends.
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { renderMailTemplate, escapeHtml, cleanLanguageTag } from '../_shared/email/mail-template.ts';
import { homeFormat } from '../_shared/locale/home.ts';
import { loadHomeCached } from '../_shared/locale/load-home.ts';
import { loadOrgName } from '../_shared/org-name.ts';
import { resolveSiteUrl } from '../_shared/site-url.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

type Db = ReturnType<typeof getServiceClient>;

interface Candidate { id: string; candidate_name: string; candidate_email: string; meta: { lang?: string } | null; job_title: string }

async function candidateOf(db: Db, applicationId: string): Promise<Candidate | null> {
  const { data, error } = await db.from('applications')
    .select('id, candidate_name, candidate_email, meta, job_postings(title)').eq('id', applicationId).maybeSingle();
  if (error) throw new Error(`Application lookup failed: ${error.message}`);
  if (!data) return null;
  const jp = (data as { job_postings?: { title?: string } | null }).job_postings;
  return { ...(data as unknown as Candidate), job_title: jp?.title ?? '' };
}

async function absolute(db: Db, path: string, publicUrl?: unknown): Promise<string> {
  const base = (await resolveSiteUrl(db)) ?? (typeof publicUrl === 'string' && /^https?:\/\//.test(publicUrl) ? new URL(publicUrl).origin : '');
  return base ? `${base}${path}` : path;
}

async function send(db: Db, to: string, subject: string, html: string, tags: Record<string, string>) {
  const { data, error } = await db.functions.invoke('email-send', { body: { to, subject, html, expects_reply: true, tags } });
  if (error || data?.success === false) return { sent: false, error: error?.message ?? data?.error ?? 'email-send failed' };
  return { sent: true, simulated: !!data?.simulated };
}

async function confirm(db: Db, interviewId: string, publicUrl?: unknown) {
  const { data: iv, error } = await db.from('interviews')
    .select('id, application_id, scheduled_start, scheduled_end, meeting_url, location, status, confirmation_sent_at').eq('id', interviewId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!iv) return json({ error: 'Interview not found' }, 404);
  if (iv.status !== 'scheduled') return json({ error: `Interview is ${iv.status}` }, 409);
  if (iv.confirmation_sent_at) return json({ success: true, already_sent: true });
  const cand = await candidateOf(db, iv.application_id);
  if (!cand?.candidate_email) return json({ error: 'The candidate has no e-mail address' }, 422);

  const lang = cleanLanguageTag(cand.meta?.lang);
  const home = await loadHomeCached(db);
  const siteName = await loadOrgName(db, '');
  const meetingUrl = iv.meeting_url ? (iv.meeting_url.startsWith('/') ? await absolute(db, iv.meeting_url, publicUrl) : iv.meeting_url) : '';
  const mail = await renderMailTemplate(db, 'interview_confirmed', lang, (tplLang) => {
    const f = homeFormat(home, tplLang);
    return {
      candidate_name: cand.candidate_name.split(/\s+/)[0] ?? '',
      job_title: cand.job_title,
      when: `${f.dateTime(iv.scheduled_start, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}–${f.time(iv.scheduled_end, { hour: '2-digit', minute: '2-digit' })}`,
      meeting_url: meetingUrl,
      location: iv.location ?? '',
      site_name: siteName,
    };
  }, 'interview_confirmation');
  const f = homeFormat(home, 'en');
  const when = `${f.dateTime(iv.scheduled_start, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`;
  const res = await send(db, cand.candidate_email,
    mail?.subject ?? `Your interview — ${when}`,
    mail?.html ?? `<p>Hi ${escapeHtml(cand.candidate_name.split(/\s+/)[0] ?? '')},</p><p>Your interview about <strong>${escapeHtml(cand.job_title)}</strong> is booked for <strong>${escapeHtml(when)}</strong>.</p>${meetingUrl ? `<p><a href="${escapeHtml(meetingUrl)}">Join the interview</a> — a video call in your browser.</p>` : ''}<p>${escapeHtml(siteName)}</p>`,
    { kind: 'interview_confirmation', interview_id: iv.id });
  if (res.sent) {
    const { error: stampErr } = await db.from('interviews').update({ confirmation_sent_at: new Date().toISOString() }).eq('id', iv.id);
    if (stampErr) console.warn('[interview_confirmation] sent but not stamped:', stampErr.message);
  }
  return json({ success: res.sent, ...res, to: cand.candidate_email });
}

export async function invitationHandler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const db = getServiceClient();
    let invitationId: string | undefined = body.invitation_id;

    if (!invitationId) {
      if (!body.application_id || !Array.isArray(body.slots) || body.slots.length === 0) {
        return json({ error: 'invitation_id, or application_id with slots (ISO timestamps), is required' }, 400);
      }
      const { data: inv, error } = await db.rpc('invite_to_interview', {
        p_application_id: body.application_id,
        p_slots: body.slots,
        p_duration_minutes: Number(body.duration_minutes) || 45,
        p_kind: body.kind ?? 'interview',
        p_interviewer_id: body.interviewer_id ?? null,
        p_message: body.message ?? null,
        p_expires_in_days: Number(body.expires_in_days) || 7,
      });
      if (error) return json({ error: error.message }, 400);
      invitationId = (inv as { invitation_id?: string }).invitation_id;
    }

    const { data: inv, error: invErr } = await db.from('interview_invitations')
      .select('id, token, application_id, duration_minutes, message, status').eq('id', invitationId).maybeSingle();
    if (invErr) throw new Error(invErr.message);
    if (!inv) return json({ error: 'Invitation not found' }, 404);
    if (inv.status !== 'open') return json({ error: `Invitation is ${inv.status}` }, 409);
    const cand = await candidateOf(db, inv.application_id);
    if (!cand?.candidate_email) return json({ error: 'The candidate has no e-mail address' }, 422);

    const inviteUrl = await absolute(db, `/interview/${inv.token}`, body.public_url);
    const siteName = await loadOrgName(db, '');
    const mail = await renderMailTemplate(db, 'interview_invitation', cleanLanguageTag(cand.meta?.lang), () => ({
      candidate_name: cand.candidate_name.split(/\s+/)[0] ?? '',
      job_title: cand.job_title,
      duration: String(inv.duration_minutes),
      message: inv.message ?? '',
      invite_url: inviteUrl,
      site_name: siteName,
    }), 'interview_invitation');
    const res = await send(db, cand.candidate_email,
      mail?.subject ?? `Pick a time for your interview — ${cand.job_title}`,
      mail?.html ?? `<p>Hi ${escapeHtml(cand.candidate_name.split(/\s+/)[0] ?? '')},</p><p>We would like to meet you about <strong>${escapeHtml(cand.job_title)}</strong>. <a href="${escapeHtml(inviteUrl)}">Choose a time</a> — you get the meeting link right away.</p><p>${escapeHtml(siteName)}</p>`,
      { kind: 'interview_invitation', invitation_id: inv.id });
    if (res.sent) {
      const { error: stampErr } = await db.from('interview_invitations').update({ sent_at: new Date().toISOString() }).eq('id', inv.id);
      if (stampErr) console.warn('[interview_invitation] sent but not stamped:', stampErr.message);
    }
    return json({ success: res.sent, ...res, invitation_id: inv.id, invite_url: inviteUrl, to: cand.candidate_email });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}

export async function confirmationHandler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    if (!body.interview_id) return json({ error: 'interview_id is required' }, 400);
    return await confirm(getServiceClient(), body.interview_id, body.public_url);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}

/** Public: the holder of /interview/<token> asks for the confirmation of what they booked. */
export async function bookedHandler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const token = typeof body.token === 'string' && /^[0-9a-f-]{36}$/i.test(body.token) ? body.token : null;
    if (!token) return json({ error: 'token is required' }, 400);
    const db = getServiceClient();
    const { data: inv, error } = await db.from('interview_invitations')
      .select('id, status, interview_id, confirmation_sent_at').eq('token', token).maybeSingle();
    if (error) throw new Error(error.message);
    if (!inv || inv.status !== 'booked' || !inv.interview_id) return json({ error: 'Nothing booked on this link' }, 404);
    if (inv.confirmation_sent_at) return json({ success: true, already_sent: true });
    const res = await confirm(db, inv.interview_id, body.public_url);
    // Stamp the link only once the interview's own confirmation went out.
    const { data: iv, error: ivErr } = await db.from('interviews').select('confirmation_sent_at').eq('id', inv.interview_id).maybeSingle();
    if (ivErr) console.warn('[interview_booked] could not re-read the interview:', ivErr.message);
    if (iv?.confirmation_sent_at) {
      const { error: stampErr } = await db.from('interview_invitations').update({ confirmation_sent_at: new Date().toISOString() }).eq('id', inv.id);
      if (stampErr) console.warn('[interview_booked] not stamped:', stampErr.message);
    }
    return res;
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}
