// Surveys — unified survey sending + CSAT cron dispatch
// Actions: send, csat-dispatch
import { getServiceClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Shared helpers ──────────────────────────────────────────────────────────
const NPS_BUTTONS = (token: string, base: string) => {
  const link = (n: number) =>
    `<a href="${base}/s/${token}?score=${n}" style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;margin:2px;border:1px solid #d1d5db;border-radius:8px;color:#0f172a;text-decoration:none;font-weight:600;font-family:system-ui,sans-serif">${n}</a>`;
  return Array.from({ length: 11 }, (_, i) => link(i)).join("");
};

const renderHtml = (args: { intro: string; campaign_name: string; token: string; base: string; kind: string; question: string }) => {
  const buttons = args.kind === "nps" ? NPS_BUTTONS(args.token, args.base)
    : `<a href="${args.base}/s/${args.token}" style="background:#0f172a;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-family:system-ui,sans-serif">Give feedback</a>`;
  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#0f172a">
    <h2 style="margin:0 0 16px;font-size:20px">${args.campaign_name}</h2>
    <p style="margin:0 0 16px;color:#475569">${args.intro}</p>
    <p style="margin:0 0 16px;font-weight:600">${args.question}</p>
    <div style="margin:16px 0;text-align:center">${buttons}</div>
    ${args.kind === "nps" ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:#94a3b8;max-width:430px;margin:0 auto"><span>Not at all likely</span><span>Extremely likely</span></div>` : ""}
    <p style="margin:32px 0 0;font-size:12px;color:#94a3b8">If you can't see the buttons, <a href="${args.base}/s/${args.token}">open the survey</a>.</p>
  </div>`;
};

// ─── Action: send ────────────────────────────────────────────────────────────
async function handleSend(req: Request): Promise<Response> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = getServiceClient();

  const body = await req.json();
  if (!body.campaign_id || !Array.isArray(body.recipients) || body.recipients.length === 0) {
    return new Response(JSON.stringify({ error: "campaign_id and recipients[] are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { data: campaign, error: cErr } = await supabase.from("survey_campaigns").select("*, survey_templates(*)").eq("id", body.campaign_id).maybeSingle();
  if (cErr || !campaign) return new Response(JSON.stringify({ error: "campaign_not_found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const template = (campaign as any).survey_templates;
  const primary = (template?.questions ?? []).find((q: any) => q.type === "nps" || q.type === "csat" || q.id === "score");
  const question = primary?.label ?? "How was your experience?";

  let base = body.public_base_url;
  if (!base) {
    const { data: ss } = await supabase.from("site_settings").select("value").eq("key", "branding").maybeSingle();
    base = (ss?.value as any)?.public_url || "";
  }
  if (!base) base = req.headers.get("origin") || "";

  const sends: any[] = [];
  const errors: any[] = [];

  for (const r of body.recipients) {
    const { data: send, error: sErr } = await supabase.from("survey_sends").insert({
      campaign_id: body.campaign_id,
      recipient_email: r.email.toLowerCase().trim(),
      recipient_name: r.name ?? null,
      related_entity_type: r.related_entity_type ?? null,
      related_entity_id: r.related_entity_id ?? null,
      lead_id: r.lead_id ?? null,
    }).select().single();

    if (sErr || !send) { errors.push({ email: r.email, error: sErr?.message ?? "insert_failed" }); continue; }

    const html = renderHtml({ intro: campaign.email_intro, campaign_name: campaign.name, token: send.token, base, kind: template?.kind ?? "nps", question });

    const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/email-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ to: r.email, subject: campaign.email_subject, html, tags: { module: "surveys", campaign_id: body.campaign_id, send_id: send.id } }),
    });

    if (!emailRes.ok) { const txt = await emailRes.text(); errors.push({ email: r.email, error: `email_send_failed: ${txt}` }); continue; }

    await supabase.from("survey_sends").update({ sent_at: new Date().toISOString() }).eq("id", send.id);
    sends.push({ id: send.id, email: r.email, token: send.token });
  }

  return new Response(JSON.stringify({ success: true, sends, errors }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ─── Action: csat-dispatch ───────────────────────────────────────────────────
async function handleCsatDispatch(req: Request): Promise<Response> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = getServiceClient();

  const { data: campaign } = await supabase.from("survey_campaigns").select("id, delay_hours").eq("trigger", "ticket_resolved").eq("is_active", true).maybeSingle();
  if (!campaign) return new Response(JSON.stringify({ ok: true, skipped: "no_active_csat_campaign" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const delayHours = campaign.delay_hours ?? 0;
  const cutoff = new Date(Date.now() - delayHours * 3600 * 1000).toISOString();
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const { data: tickets, error } = await supabase.from("tickets")
    .select("id, subject, contact_email, contact_name, lead_id, resolved_at, csat_survey_sent_at")
    .eq("status", "resolved").is("csat_survey_sent_at", null).not("contact_email", "is", null)
    .lte("resolved_at", cutoff).gte("resolved_at", since).limit(50);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const recipients = (tickets ?? []).map((t) => ({
    email: t.contact_email!, name: t.contact_name ?? undefined,
    related_entity_type: "ticket", related_entity_id: t.id, lead_id: t.lead_id ?? undefined,
  }));

  let dispatched = 0;
  if (recipients.length > 0) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/surveys?action=send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ campaign_id: campaign.id, recipients }),
    });
    if (res.ok) {
      dispatched = recipients.length;
      const ids = (tickets ?? []).map((t) => t.id);
      await supabase.from("tickets").update({ csat_survey_sent_at: new Date().toISOString() }).in("id", ids);
    } else {
      const txt = await res.text();
      return new Response(JSON.stringify({ error: "survey_send_failed", detail: txt }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  return new Response(JSON.stringify({ ok: true, dispatched, candidates: recipients.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ─── Router ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    let action = url.searchParams.get("action");
    if (!action) { try { action = (await req.json()).action; } catch { /* */ } }
    switch (action) {
      case "send": return await handleSend(req);
      case "csat-dispatch": return await handleCsatDispatch(req);
      default: return new Response(JSON.stringify({ error: "Unknown action. Use: send, csat-dispatch" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (e: unknown) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
