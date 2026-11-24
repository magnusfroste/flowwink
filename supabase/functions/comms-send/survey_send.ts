// survey-send — sends a survey to one or more recipients via email-send.
// Creates survey_sends rows + dispatches branded email with one-click answer link.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { requireServiceOrModule, unauthorized } from '../_shared/edge-auth.ts';
import { resolveUiText } from '../_shared/locale/ui-text.ts';
import { loadUiText } from '../_shared/locale/load-ui-text.ts';

/** The mail's own words, in the site's language (visitor texts survey.*). */
type Words = (key: string, english: string) => string;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Recipient {
  email: string;
  name?: string;
  related_entity_type?: string;
  related_entity_id?: string;
  lead_id?: string;
}

interface Body {
  campaign_id: string;
  recipients: Recipient[];
  public_base_url?: string; // optional override (e.g. https://demo.flowwink.com)
  /** send_due_surveys: mail the queued sends whose time has come (queue_event_surveys). */
  due?: boolean;
  limit?: number;
}

// Color ramp for NPS 0–10 (detractor red → passive amber → promoter green)
const NPS_COLORS = [
  "#dc2626", "#dc2626", "#ea580c", "#ea580c", "#f59e0b",
  "#f59e0b", "#eab308", "#84cc16", "#22c55e", "#16a34a", "#15803d",
];

const NPS_TABLE = (token: string, base: string) => {
  const cell = (n: number) => {
    const bg = NPS_COLORS[n];
    return `<td align="center" style="padding:2px"><a href="${base}/s/${token}?score=${n}" style="display:block;width:38px;height:38px;line-height:38px;text-align:center;background:${bg};border-radius:8px;color:#ffffff;text-decoration:none;font-weight:700;font-family:system-ui,-apple-system,sans-serif;font-size:14px">${n}</a></td>`;
  };
  const cells = Array.from({ length: 11 }, (_, i) => cell(i)).join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto"><tr>${cells}</tr></table>`;
};

const renderHtml = (args: {
  intro: string;
  campaign_name: string;
  token: string;
  base: string;
  kind: string;
  question: string;
  t: Words;
}) => {
  const t = args.t;
  const buttons =
    args.kind === "nps"
      ? NPS_TABLE(args.token, args.base)
      : `<a href="${args.base}/s/${args.token}" style="background:#0f172a;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-family:system-ui,sans-serif">${t("survey.mail.giveFeedback", "Give feedback")}</a>`;

  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#0f172a">
    <h2 style="margin:0 0 16px;font-size:20px">${args.campaign_name}</h2>
    <p style="margin:0 0 16px;color:#475569">${args.intro}</p>
    <p style="margin:0 0 20px;font-weight:600">${args.question}</p>
    <div style="margin:16px 0;text-align:center">${buttons}</div>
    ${
      args.kind === "nps"
        ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:8px auto 0;width:100%;max-width:460px"><tr>
            <td align="left" style="font-size:12px;color:#94a3b8;font-family:system-ui,sans-serif">${t("survey.notLikely", "Not at all likely")}</td>
            <td align="right" style="font-size:12px;color:#94a3b8;font-family:system-ui,sans-serif">${t("survey.veryLikely", "Extremely likely")}</td>
          </tr></table>`
        : ""
    }
    <p style="margin:32px 0 0;font-size:12px;color:#94a3b8;text-align:center">${t("survey.mail.tapToSubmit", "Tap a number to submit. Or")} <a href="${args.base}/s/${args.token}" style="color:#475569">${t("survey.mail.openSurvey", "open the survey")}</a>.</p>
  </div>`;
};

/**
 * The site's own address for the answer link. It read branding.public_url — a
 * field nothing writes — and fell back to the caller's Origin header, which a
 * sweep has none of: every link was relative. general.siteUrl is the site's
 * address (the settings catalogue), PUBLIC_SITE_URL the deploy's.
 */
async function siteBase(
  supabase: ReturnType<typeof getServiceClient>, override: string | undefined, req: Request,
): Promise<string> {
  if (override) return override.replace(/\/+$/, "");
  // A missing row and an unreadable one both fall back to the deploy's address.
  const { data } = await supabase.from("site_settings").select("value").eq("key", "general").maybeSingle();
  const fromSettings = String((data?.value as { siteUrl?: string } | null)?.siteUrl ?? "").trim();
  const candidate = fromSettings || Deno.env.get("PUBLIC_SITE_URL") || req.headers.get("origin") || "";
  return candidate.replace(/\/+$/, "");
}

// Moved VERBATIM from supabase/functions/survey-send/index.ts (edge-surface B2).
export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = getServiceClient();

    // Privileged: sends branded email to arbitrary recipients from your domain.
    // Callers: send_survey skill (service key), csat-dispatch (service key),
    // admin UI (session JWT). Gate to stop anonymous mail/spam abuse.
    const auth = await requireServiceOrModule(req, supabase, 'surveys');
    if (!auth.authorized) return unauthorized(corsHeaders);

    const body: Body = await req.json();
    const base0 = await siteBase(supabase, body.public_base_url, req);
    // The words around the question are the platform's, in the site's language
    // (they were English on every Swedish site); the question, intro and
    // subject are the campaign's own.
    const texts = await loadUiText(supabase);
    const t: Words = resolveUiText(texts.map, texts.siteLang, texts.siteLang);
    const defaultQuestion = t("survey.mail.defaultQuestion", "How was your experience?");

    // The sweep: a queued send (an event asked for it) is mailed once its
    // send_after has passed. The row already exists — it is claimed by setting
    // sent_at first, so two sweeps never mail the same survey.
    if (body.due === true || (body as unknown as { _skill?: string })._skill === 'send_due_surveys') {
      const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 100);
      type DueRow = {
        id: string; token: string; recipient_email: string; campaign_id: string;
        survey_campaigns: {
          name: string; email_subject: string; email_intro: string; is_active: boolean;
          survey_templates: { kind?: string; questions?: Array<{ id?: string; type?: string; label?: string }> } | null;
        } | null;
      };
      const { data: due, error: dueErr } = await supabase
        .from("survey_sends")
        .select("id, token, recipient_email, campaign_id, survey_campaigns(name, email_subject, email_intro, is_active, survey_templates(kind, questions))")
        .is("sent_at", null)
        .not("send_after", "is", null)
        .lte("send_after", new Date().toISOString())
        .order("send_after", { ascending: true })
        .limit(limit);
      if (dueErr) {
        return new Response(JSON.stringify({ error: `Could not read the queued surveys: ${dueErr.message}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      let mailed = 0;
      const failed: Array<{ id: string; error: string }> = [];
      for (const row of (due ?? []) as unknown as DueRow[]) {
        const campaign = row.survey_campaigns;
        const { data: claimed, error: claimErr } = await supabase.from("survey_sends")
          .update({ sent_at: new Date().toISOString() }).eq("id", row.id).is("sent_at", null).select("id").maybeSingle();
        if (claimErr) { failed.push({ id: row.id, error: claimErr.message }); continue; }
        if (!claimed) continue;
        if (!campaign?.is_active) continue;
        const template = campaign.survey_templates;
        const primary = (template?.questions ?? []).find((q) => q.type === "nps" || q.type === "csat" || q.id === "score");
        const html = renderHtml({
          intro: campaign.email_intro, campaign_name: campaign.name, token: row.token, base: base0,
          kind: template?.kind ?? "nps", question: primary?.label ?? defaultQuestion, t,
        });
        const res = await fetch(`${SUPABASE_URL}/functions/v1/email-send`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ to: row.recipient_email, subject: campaign.email_subject, html,
            tags: { module: "surveys", campaign_id: row.campaign_id, send_id: row.id } }),
        });
        if (res.ok) mailed += 1;
        else {
          // Nothing went out: give the send back to the next sweep.
          const { error: backErr } = await supabase.from("survey_sends").update({ sent_at: null }).eq("id", row.id);
          failed.push({ id: row.id, error: (await res.text()).slice(0, 200) + (backErr ? ` (and it could not be given back: ${backErr.message})` : '') });
        }
      }
      return new Response(JSON.stringify({ success: true, due: (due ?? []).length, mailed, failed, work_done: mailed }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!body.campaign_id || !Array.isArray(body.recipients) || body.recipients.length === 0) {
      return new Response(JSON.stringify({ error: "campaign_id and recipients[] are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load campaign + template
    const { data: campaign, error: cErr } = await supabase
      .from("survey_campaigns")
      .select("*, survey_templates(*)")
      .eq("id", body.campaign_id)
      .maybeSingle();
    if (cErr || !campaign) {
      return new Response(JSON.stringify({ error: "campaign_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const template = (campaign as any).survey_templates;
    const primary = (template?.questions ?? []).find((q: any) =>
      q.type === "nps" || q.type === "csat" || q.id === "score"
    );
    const question = primary?.label ?? defaultQuestion;

    const base = base0;

    const sends: any[] = [];
    const errors: any[] = [];

    for (const r of body.recipients) {
      // 1) create send row (token auto-generated by default)
      const { data: send, error: sErr } = await supabase
        .from("survey_sends")
        .insert({
          campaign_id: body.campaign_id,
          recipient_email: r.email.toLowerCase().trim(),
          recipient_name: r.name ?? null,
          related_entity_type: r.related_entity_type ?? null,
          related_entity_id: r.related_entity_id ?? null,
          lead_id: r.lead_id ?? null,
        })
        .select()
        .single();

      if (sErr || !send) {
        errors.push({ email: r.email, error: sErr?.message ?? "insert_failed" });
        continue;
      }

      // 2) send email via unified email-send
      const html = renderHtml({
        intro: campaign.email_intro,
        campaign_name: campaign.name,
        token: send.token,
        base,
        kind: template?.kind ?? "nps",
        question,
        t,
      });

      const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/email-send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({
          to: r.email,
          subject: campaign.email_subject,
          html,
          tags: { module: "surveys", campaign_id: body.campaign_id, send_id: send.id },
        }),
      });

      if (!emailRes.ok) {
        const txt = await emailRes.text();
        errors.push({ email: r.email, error: `email_send_failed: ${txt}` });
        continue;
      }

      await supabase.from("survey_sends").update({ sent_at: new Date().toISOString() }).eq("id", send.id);
      sends.push({ id: send.id, email: r.email, token: send.token });
    }

    return new Response(JSON.stringify({ success: true, sends, errors }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
