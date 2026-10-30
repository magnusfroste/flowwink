// Webinar reminder sweep — cron-invoked (see agent_automations "Webinar
// Reminders", migration 20260705160000). The operational delivery path for
// webinars#reminders: queries the same four windows as webinar_reminder_tick()
// (confirm / T-24h / T-1h / post), but actually SENDS the emails via the
// email-send pipeline and stamps the per-registration marker columns so no
// reminder is ever sent twice. webinar_reminder_tick() remains as the
// event-emitting alternative for FlowPilot-driven flows — both paths dedupe on
// the same reminder_*_sent_at markers, so they can coexist without double
// sends. Mirrors send-booking-reminders' settings lookup + email-send dispatch.
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { homeFormat, type HomeFormat } from '../_shared/locale/home.ts';
import { loadHome } from '../_shared/locale/load-home.ts';
import { cleanLanguageTag, renderMailTemplate } from '../_shared/email/mail-template.ts';
import { loadOrgName } from '../_shared/org-name.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Kind = 'confirm' | 't24' | 't1' | 'post';

interface Row {
  id: string;
  webinar_id: string;
  email: string;
  name: string | null;
  attended?: boolean | null;
  /** The registrant's language, when the registration carries one. */
  lang?: string | null;
  webinars: {
    title: string;
    date: string;
    duration_minutes: number | null;
    meeting_url: string | null;
    recording_url: string | null;
  };
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

// The host's clock, named — attendees may sit elsewhere, so the zone is
// printed ("10:00 CEST"), as UTC was before.
function webinarWhen(date: string, fmt: HomeFormat): string {
  return fmt.dateTime(date, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });
}

/**
 * The data for the 'webinar_reminder' template (20261026090000). One template
 * covers all four mails: the kind arrives as a flag, and the template keeps
 * one {{#is_…}}…{{/is_…}} section per kind — so every word, subject included,
 * is template text an operator can translate.
 */
function templateVars(kind: Kind, r: Row, siteName: string, fmt: HomeFormat): Record<string, string> {
  const w = r.webinars;
  const flag = (on: boolean) => (on ? '1' : '');
  return {
    name: r.name ?? '',
    title: w.title ?? '',
    when: webinarWhen(w.date, fmt),
    join_url: kind === 'post' ? '' : (w.meeting_url ?? ''),
    recording_url: kind === 'post' ? (w.recording_url ?? '') : '',
    site_name: siteName,
    is_confirm: flag(kind === 'confirm'),
    is_t24: flag(kind === 't24'),
    is_t1: flag(kind === 't1'),
    is_attended: flag(kind === 'post' && !!r.attended),
    is_missed: flag(kind === 'post' && !r.attended),
  };
}

function template(kind: Kind, r: Row, siteName: string, fmt: HomeFormat): { subject: string; html: string } {
  const w = r.webinars;
  const when = webinarWhen(w.date, fmt);
  const hi = `<p style="margin:0 0 16px;color:#4b5563">Hi ${esc(r.name || 'there')},</p>`;
  const join = w.meeting_url
    ? `<p style="margin:16px 0"><a href="${esc(w.meeting_url)}" style="background:#111;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Join the webinar</a></p>`
    : '';
  const wrap = (title: string, body: string) =>
    `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;margin:0;padding:24px;color:#111">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
<h2 style="margin:0 0 12px">${esc(title)}</h2>${body}
<p style="margin:24px 0 0;color:#9ca3af;font-size:12px">${esc(siteName)}</p></div></body></html>`;

  switch (kind) {
    case 'confirm':
      return {
        subject: `You're registered: ${w.title}`,
        html: wrap(`You're registered!`, `${hi}<p style="margin:0 0 8px;color:#4b5563">Your spot for <strong>${esc(w.title)}</strong> is confirmed.</p><p style="margin:0;color:#4b5563">📅 ${esc(when)}</p>${join}`),
      };
    case 't24':
      return {
        subject: `Tomorrow: ${w.title}`,
        html: wrap('Starting in 24 hours', `${hi}<p style="margin:0 0 8px;color:#4b5563"><strong>${esc(w.title)}</strong> starts tomorrow.</p><p style="margin:0;color:#4b5563">📅 ${esc(when)}</p>${join}`),
      };
    case 't1':
      return {
        subject: `Starting soon: ${w.title}`,
        html: wrap('Starting within the hour', `${hi}<p style="margin:0 0 8px;color:#4b5563"><strong>${esc(w.title)}</strong> is about to begin.</p>${join}`),
      };
    case 'post': {
      const attended = !!r.attended;
      const rec = w.recording_url
        ? `<p style="margin:16px 0"><a href="${esc(w.recording_url)}" style="background:#111;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Watch the recording</a></p>`
        : '';
      return attended
        ? { subject: `Thanks for joining ${w.title}`, html: wrap('Thanks for joining!', `${hi}<p style="margin:0;color:#4b5563">Great to have you at <strong>${esc(w.title)}</strong>.</p>${rec}`) }
        : { subject: `We missed you at ${w.title}`, html: wrap('We missed you', `${hi}<p style="margin:0;color:#4b5563">Sorry we didn't see you at <strong>${esc(w.title)}</strong>.</p>${rec}`) };
    }
  }
}

const MARKER: Record<Kind, string> = {
  confirm: 'reminder_confirm_sent_at',
  t24: 'reminder_t24_sent_at',
  t1: 'reminder_t1_sent_at',
  post: 'reminder_post_sent_at',
};

// Moved VERBATIM from supabase/functions/send-webinar-reminders/index.ts (edge-surface B2).
export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const supabase = getServiceClient();
    // The business's clock, not the runtime's UTC. `fmt` is the built-in
    // (English) mail's; a template formats in its own language.
    const home = await loadHome(supabase);
    const fmt = homeFormat(home, 'en');

    const siteName = await loadOrgName(supabase, 'Our Website');

    // `*` rather than a column list on the registration: it carries the
    // registrant's `lang` where that column exists, and naming a column an
    // instance does not have yet would fail the whole sweep.
    const SELECT = '*, webinars(title, date, duration_minutes, meeting_url, recording_url)';
    const nowIso = new Date().toISOString();
    const plus = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
    const minus = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
    // Backstop windows: a sweep must never mail historical registrations that
    // simply have NULL markers (e.g. the first run after this path was wired,
    // or a webinar that was never marked completed). Confirmations only make
    // sense for a recent signup to an upcoming webinar; post-webinar follow-ups
    // only for webinars that ended within the last week.
    const CONFIRM_MAX_AGE_MIN = 24 * 60;
    const POST_MAX_AGE_MIN = 7 * 24 * 60;

    // Same four windows as webinar_reminder_tick() — keep in sync.
    const batches: Array<{ kind: Kind; rows: Row[] }> = [];

    const { data: confirmRows } = await supabase.from('webinar_registrations')
      .select(SELECT).is(MARKER.confirm, null)
      .in('webinars.status', ['draft', 'published', 'live'])
      .gte('registered_at', minus(CONFIRM_MAX_AGE_MIN))
      .gte('webinars.date', nowIso)
      .not('webinars', 'is', null)
      .limit(200);
    batches.push({ kind: 'confirm', rows: (confirmRows as unknown as Row[]) ?? [] });

    const { data: t24Rows } = await supabase.from('webinar_registrations')
      .select(SELECT).is(MARKER.t24, null)
      .in('webinars.status', ['published', 'live'])
      .gte('webinars.date', plus(23 * 60)).lte('webinars.date', plus(25 * 60))
      .not('webinars', 'is', null)
      .limit(500);
    batches.push({ kind: 't24', rows: (t24Rows as unknown as Row[]) ?? [] });

    const { data: t1Rows } = await supabase.from('webinar_registrations')
      .select(SELECT).is(MARKER.t1, null)
      .in('webinars.status', ['published', 'live'])
      .gte('webinars.date', plus(40)).lte('webinars.date', plus(90))
      .not('webinars', 'is', null)
      .limit(500);
    batches.push({ kind: 't1', rows: (t1Rows as unknown as Row[]) ?? [] });

    const { data: postRows } = await supabase.from('webinar_registrations')
      .select(SELECT).is(MARKER.post, null)
      .eq('webinars.status', 'completed')
      .gte('webinars.date', minus(POST_MAX_AGE_MIN))
      .lte('webinars.date', nowIso)
      .not('webinars', 'is', null)
      .limit(500);

    batches.push({
      kind: 'post',
      // The tick adds a 30-min-after-end grace; the join filter above can't
      // express date+duration arithmetic, so apply it here.
      rows: ((postRows as unknown as Row[]) ?? []).filter((r) => {
        const w = r.webinars;
        const endMs = new Date(w.date).getTime() + (w.duration_minutes ?? 60) * 60_000;
        return endMs + 30 * 60_000 < Date.now();
      }),
    });

    const counts: Record<Kind, { sent: number; skipped: number }> = {
      confirm: { sent: 0, skipped: 0 }, t24: { sent: 0, skipped: 0 },
      t1: { sent: 0, skipped: 0 }, post: { sent: 0, skipped: 0 },
    };
    const errors: Array<{ registration_id: string; kind: Kind; error: string }> = [];

    for (const { kind, rows } of batches) {
      for (const r of rows) {
        if (!r.email || !r.webinars) { counts[kind].skipped++; continue; }
        try {
          // 'webinar_reminder' on the registrant's language (null → the site's
          // default). No template → the built-in English mail (Law 4).
          const builtIn = template(kind, r, siteName, fmt);
          const fromTemplate = await renderMailTemplate(
            supabase, 'webinar_reminder', cleanLanguageTag(r.lang),
            (lang) => templateVars(kind, r, siteName, homeFormat(home, lang)),
            'send-webinar-reminders',
          );
          const subject = fromTemplate?.subject ?? builtIn.subject;
          const html = fromTemplate?.html ?? builtIn.html;
          const { data: sendData, error: sendErr } = await supabase.functions.invoke('email-send', {
            body: { to: [r.email], subject, html },
          });
          if (sendErr) throw new Error(sendErr.message);
          if (sendData && sendData.success === false) throw new Error(sendData.error || 'email-send returned failure');

          // The post email IS the follow-up (webinars#followup) — stamp both
          // the dedupe marker and the follow_up_sent flag the admin UI shows.
          const stamp: Record<string, unknown> = { [MARKER[kind]]: new Date().toISOString() };
          if (kind === 'post') stamp.follow_up_sent = true;
          await supabase.from('webinar_registrations')
            .update(stamp)
            .eq('id', r.id);
          counts[kind].sent++;
        } catch (e) {
          errors.push({ registration_id: r.id, kind, error: e instanceof Error ? e.message : String(e) });
        }
      }
    }

    // work_done — the work-done contract (_shared/activity/work-done.ts).
    // Emails actually sent, plus registrations that failed to send: both are
    // outcomes worth a journal row. A sweep over a site with no upcoming
    // webinars sends nothing, reports 0, and leaves no row behind.
    const workDone =
      Object.values(counts).reduce((n, c) => n + c.sent, 0) + errors.length;

    return new Response(
      JSON.stringify({ success: true, work_done: workDone, counts, errors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[send-webinar-reminders]', msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
