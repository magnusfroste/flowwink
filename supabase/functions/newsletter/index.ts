// Newsletter — unified newsletter management
// Actions: send, subscribe, confirm, unsubscribe, track, click, gdpr-export, gdpr-delete, export
import { getServiceClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// 1x1 transparent GIF for tracking pixel
const PIXEL_GIF = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const PIXEL_BYTES = Uint8Array.from(atob(PIXEL_GIF), c => c.charCodeAt(0));

// ─── Action: send ────────────────────────────────────────────────────────────
async function handleSend(body: any): Promise<any> {
  const supabase = getServiceClient();
  const { newsletter_id } = body;
  if (!newsletter_id) throw new Error("newsletter_id required");

  const { data: newsletter } = await supabase.from("newsletters").select("*").eq("id", newsletter_id).single();
  if (!newsletter) throw new Error("Newsletter not found");
  if (newsletter.status === "sent") throw new Error("Newsletter already sent");

  await supabase.from("newsletters").update({ status: "sending" }).eq("id", newsletter_id);

  const { data: subscribers } = await supabase.from("newsletter_subscribers").select("email, name").eq("status", "confirmed");
  if (!subscribers?.length) {
    await supabase.from("newsletters").update({ status: "draft" }).eq("id", newsletter_id);
    throw new Error("No subscribers to send to");
  }

  const trackingBaseUrl = `${SUPABASE_URL}/functions/v1/newsletter?action=track`;
  const linkTrackingBaseUrl = `${SUPABASE_URL}/functions/v1/newsletter?action=click`;

  const rewriteLinks = async (html: string, nid: string, email: string): Promise<string> => {
    let processed = html;
    const linkRegex = /href=["'](https?:\/\/[^"']+)["']/gi;
    for (const m of [...processed.matchAll(linkRegex)]) {
      const origUrl = m[1];
      if (origUrl.includes("newsletter-subscribe") || origUrl.includes("newsletter/manage")) continue;
      const { data: lr } = await supabase.from("newsletter_link_clicks").insert({ newsletter_id: nid, recipient_email: email, original_url: origUrl }).select("link_id").single();
      if (lr?.link_id) {
        const trackingUrl = `${linkTrackingBaseUrl}&l=${lr.link_id}`;
        processed = processed.replaceAll(`href="${origUrl}"`, `href="${trackingUrl}"`).replaceAll(`href='${origUrl}'`, `href='${trackingUrl}'`);
      }
    }
    return processed;
  };

  let sentCount = 0;
  for (const sub of subscribers) {
    try {
      let trackingPixel = "";
      const { data: tr } = await supabase.from("newsletter_email_opens").insert({ newsletter_id, recipient_email: sub.email }).select("tracking_id").single();
      if (tr?.tracking_id) trackingPixel = `<img src="${trackingBaseUrl}&t=${tr.tracking_id}" width="1" height="1" alt="" style="display:none;" />`;

      const unsubscribeUrl = `${SUPABASE_URL}/functions/v1/newsletter?action=unsubscribe&email=${encodeURIComponent(sub.email)}`;
      const processedContent = await rewriteLinks(newsletter.content_html || "<p>No content</p>", newsletter_id, sub.email);

      const html = `${processedContent}<hr style="margin-top:40px;border:none;border-top:1px solid #eee;"><p style="font-size:12px;color:#666;text-align:center;"><a href="${unsubscribeUrl}" style="color:#666;">Unsubscribe</a></p>${trackingPixel}`;

      const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/email-send`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ to: sub.email, subject: newsletter.subject, html, tags: { source: "newsletter-send", newsletter_id } }),
      });
      if (!emailRes.ok) continue;
      const emailData = await emailRes.json();
      if (!emailData?.success) continue;
      sentCount++;
    } catch { /* continue */ }
  }

  await supabase.from("newsletters").update({ status: "sent", sent_at: new Date().toISOString(), sent_count: sentCount, unique_opens: 0, open_count: 0, unique_clicks: 0, click_count: 0 }).eq("id", newsletter_id);
  return { success: true, sent_count: sentCount, total_subscribers: subscribers.length };
}

// ─── Action: subscribe ──────────────────────────────────────────────────────
async function handleSubscribe(body: any): Promise<any> {
  const supabase = getServiceClient();
  const { email, name, list } = body;
  if (!email) throw new Error("email required");

  const { data: existing } = await supabase.from("newsletter_subscribers").select("*").eq("email", email).maybeSingle();
  if (existing) return { success: false, message: "Already subscribed" };

  const { data } = await supabase.from("newsletter_subscribers").insert({ email, name: name || null, list: list || "default", status: "pending", token: crypto.randomUUID() }).select().single();
  return { success: true, subscriber: data, message: "Check your email to confirm" };
}

// ─── Action: confirm ────────────────────────────────────────────────────────
async function handleConfirm(body: any): Promise<any> {
  const supabase = getServiceClient();
  const { token } = body;
  if (!token) throw new Error("token required");

  const { data, error } = await supabase.from("newsletter_subscribers").update({ status: "confirmed", confirmed_at: new Date().toISOString() }).eq("token", token).select().single();
  if (error || !data) throw new Error("Invalid confirmation token");
  return { success: true, subscriber: data };
}

// ─── Action: unsubscribe ────────────────────────────────────────────────────
async function handleUnsubscribe(body: any): Promise<any> {
  const supabase = getServiceClient();
  const { email } = body;
  if (!email) throw new Error("email required");

  const { data, error } = await supabase.from("newsletter_subscribers").update({ status: "unsubscribed", unsubscribed_at: new Date().toISOString() }).eq("email", email).select().single();
  if (error || !data) throw new Error("Subscriber not found");
  return { success: true, message: "Unsubscribed successfully" };
}

// ─── Action: track (tracking pixel) ─────────────────────────────────────────
async function handleTrack(url: URL): Promise<Response> {
  const trackingId = url.searchParams.get("t");
  if (trackingId) {
    const supabase = getServiceClient();
    await supabase.from("newsletter_email_opens").update({ opened_at: new Date().toISOString() }).eq("tracking_id", trackingId);
  }
  return new Response(PIXEL_BYTES, { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" } });
}

// ─── Action: click (link redirect) ──────────────────────────────────────────
async function handleClick(url: URL): Promise<Response> {
  const linkId = url.searchParams.get("l");
  if (!linkId) return new Response("Missing link_id", { status: 400 });

  const supabase = getServiceClient();
  const { data } = await supabase.from("newsletter_link_clicks").select("*").eq("link_id", linkId).single();
  if (!data) return new Response("Link not found", { status: 404 });

  await supabase.from("newsletter_link_clicks").update({ clicked_at: new Date().toISOString() }).eq("link_id", linkId);
  return new Response(null, { status: 302, headers: { "Location": data.original_url } });
}

// ─── Action: gdpr-verify ────────────────────────────────────────────────────
async function handleGdprVerify(body: any): Promise<any> {
  const supabase = getServiceClient();
  const { email, token } = body;
  if (!email || !token) throw new Error("email and token required");

  const { data } = await supabase.from("newsletter_subscribers").select("*").eq("email", email).eq("token", token).maybeSingle();
  if (!data) throw new Error("Invalid token");
  return { success: true, verified: true, subscriber: data };
}

// ─── Action: gdpr-request ───────────────────────────────────────────────────
async function handleGdprRequest(body: any): Promise<any> {
  const supabase = getServiceClient();
  const { email } = body;
  if (!email) throw new Error("email required");

  const { data } = await supabase.from("newsletter_subscribers").select("token").eq("email", email).maybeSingle();
  if (!data) throw new Error("Email not found in subscribers");
  return { success: true, _dev_token: data.token, message: "Verification code sent" };
}

// ─── Action: gdpr-export ────────────────────────────────────────────────────
async function handleGdprExport(body: any): Promise<any> {
  const supabase = getServiceClient();
  const { email } = body;
  if (!email) throw new Error("email required");

  const { data: subscriber } = await supabase.from("newsletter_subscribers").select("*").eq("email", email).maybeSingle();
  const { data: opens } = await supabase.from("newsletter_email_opens").select("*").eq("recipient_email", email);
  const { data: clicks } = await supabase.from("newsletter_link_clicks").select("*").eq("recipient_email", email);

  return { success: true, data: { subscriber, opens: opens || [], clicks: clicks || [] } };
}

// ─── Action: gdpr-delete ────────────────────────────────────────────────────
async function handleGdprDelete(body: any): Promise<any> {
  const supabase = getServiceClient();
  const { email } = body;
  if (!email) throw new Error("email required");

  await supabase.from("newsletter_email_opens").delete().eq("recipient_email", email);
  await supabase.from("newsletter_link_clicks").delete().eq("recipient_email", email);
  await supabase.from("newsletter_subscribers").delete().eq("email", email);
  return { success: true, message: "Data deleted" };
}

// ─── Action: export ─────────────────────────────────────────────────────────
async function handleExport(body: any): Promise<any> {
  const supabase = getServiceClient();
  const { data: subscribers } = await supabase.from("newsletter_subscribers").select("*").eq("status", "confirmed");
  if (!subscribers?.length) return { success: true, subscribers: [], csv: "" };

  const headers = "email,name,subscribed_at,confirmed_at\n";
  const rows = subscribers.map(s => `"${s.email}","${s.name || ''}","${s.subscribed_at}","${s.confirmed_at || ''}"`).join("\n");
  return { success: true, subscribers, csv: headers + rows };
}

// ─── Router ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    let action = url.searchParams.get("action");
    if (!action) { try { action = (await req.json()).action; } catch { /* */ } }
    const body = await req.json().catch(() => ({}));

    // GET handlers (tracking pixel, link redirect)
    if (req.method === "GET") {
      switch (action) {
        case "track": return await handleTrack(url);
        case "click": return await handleClick(url);
        default: return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    let result: any;
    switch (action) {
      case "send": result = await handleSend(body); break;
      case "subscribe": result = await handleSubscribe(body); break;
      case "confirm": result = await handleConfirm(body); break;
      case "unsubscribe": result = await handleUnsubscribe(body); break;
      case "gdpr-export": result = await handleGdprExport(body); break;
      case "gdpr-delete": result = await handleGdprDelete(body); break;
      case "export": result = await handleExport(body); break;
      default: return new Response(JSON.stringify({ error: "Unknown action. Use: send, subscribe, confirm, unsubscribe, track, click, gdpr-export, gdpr-delete, export" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) { return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
});
