// newsletter send — sends a newsletter to all confirmed subscribers via the
// provider-agnostic `email-send` router. Provider selection (SMTP / Resend)
// lives in `email-send` — this handler only handles list expansion,
// per-recipient tracking pixel rewriting, link click rewriting, and status.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-chat-session, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SendNewsletterRequest {
  newsletter_id: string;
}

interface NewsletterTrackingConfig {
  enableOpenTracking: boolean;
  enableClickTracking: boolean;
}

/**
 * Core send routine — reusable from both the interactive `send` route (admin JWT)
 * and the cron-triggered `dispatch-scheduled` route (service/anon bearer).
 * No auth checks here; the caller is responsible for gating access.
 */
export async function sendNewsletterCore(
  supabase: ReturnType<typeof createClient>,
  newsletter_id: string,
): Promise<{ ok: true; sent_count: number; total_subscribers: number }
       | { ok: false; status: number; error: string }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  const { data: integrationSettings } = await supabase
    .from("site_settings").select("value").eq("key", "integrations").maybeSingle();
  const resendSettings = (integrationSettings?.value as any)?.resend;
  const trackingConfig: NewsletterTrackingConfig =
    resendSettings?.config?.newsletterTracking || {
      enableOpenTracking: false,
      enableClickTracking: false,
    };

  const { data: newsletter, error: newsletterError } = await supabase
    .from("newsletters").select("*").eq("id", newsletter_id).single();
  if (newsletterError || !newsletter) {
    return { ok: false, status: 404, error: "Newsletter not found" };
  }
  if (newsletter.status === "sent") {
    return { ok: false, status: 400, error: "Newsletter already sent" };
  }

  await supabase.from("newsletters").update({ status: "sending" }).eq("id", newsletter_id);

  const { data: subscribers, error: subError } = await supabase
    .from("newsletter_subscribers").select("email, name").eq("status", "confirmed");
  if (subError) {
    await supabase.from("newsletters").update({ status: "failed" }).eq("id", newsletter_id);
    return { ok: false, status: 500, error: "Failed to fetch subscribers" };
  }
  if (!subscribers || subscribers.length === 0) {
    await supabase.from("newsletters").update({ status: "draft" }).eq("id", newsletter_id);
    return { ok: false, status: 400, error: "No subscribers to send to" };
  }

  const { data: siteUrlSetting } = await supabase
    .from("site_settings").select("value").eq("key", "siteUrl").maybeSingle();
  const siteUrl = (siteUrlSetting?.value as string) || "";
  const trackingBaseUrl = `${supabaseUrl}/functions/v1/newsletter/track`;
  const linkTrackingBaseUrl = `${supabaseUrl}/functions/v1/newsletter/link`;

  const rewriteLinksForTracking = async (
    html: string, newsletterId: string, recipientEmail: string,
  ): Promise<string> => {
    if (!trackingConfig.enableClickTracking) return html;
    const linkRegex = /href=["'](https?:\/\/[^"']+)["']/gi;
    const matches = [...html.matchAll(linkRegex)];
    let processedHtml = html;
    for (const match of matches) {
      const originalUrl = match[1];
      if (originalUrl.includes("newsletter/subscribe") || originalUrl.includes("newsletter/manage")) continue;
      const { data: linkRecord, error: linkError } = await supabase
        .from("newsletter_link_clicks")
        .insert({ newsletter_id: newsletterId, recipient_email: recipientEmail, original_url: originalUrl })
        .select("link_id").single();
      if (linkError || !linkRecord) continue;
      const trackingUrl = `${linkTrackingBaseUrl}?l=${linkRecord.link_id}`;
      processedHtml = processedHtml.replaceAll(`href="${originalUrl}"`, `href="${trackingUrl}"`);
      processedHtml = processedHtml.replaceAll(`href='${originalUrl}'`, `href='${trackingUrl}'`);
    }
    return processedHtml;
  };

  let sentCount = 0;
  for (const subscriber of subscribers as any[]) {
    try {
      let trackingPixel = "";
      if (trackingConfig.enableOpenTracking) {
        const { data: trackingRecord } = await supabase
          .from("newsletter_email_opens")
          .insert({ newsletter_id, recipient_email: subscriber.email })
          .select("tracking_id").single();
        if (trackingRecord) {
          trackingPixel = `<img src="${trackingBaseUrl}?t=${trackingRecord.tracking_id}" width="1" height="1" alt="" style="display:none;" />`;
        }
      }
      const personalUnsubscribe = siteUrl
        ? `${siteUrl}/newsletter/manage?action=unsubscribe&email=${encodeURIComponent(subscriber.email)}`
        : `${supabaseUrl}/functions/v1/newsletter/subscribe?action=unsubscribe&email=${encodeURIComponent(subscriber.email)}`;

      const contentHtml = (newsletter as any).content_html || "<p>No content</p>";
      const processedContent = await rewriteLinksForTracking(contentHtml, newsletter_id, subscriber.email);

      const html = `
        ${processedContent}
        <hr style="margin-top: 40px; border: none; border-top: 1px solid #eee;" />
        <p style="font-size: 12px; color: #666; text-align: center;">
          <a href="${personalUnsubscribe}" style="color: #666;">Unsubscribe</a>
        </p>
        ${trackingPixel}
      `;

      const { data: sendData, error: sendErr } = await supabase.functions.invoke("email-send", {
        body: {
          to: subscriber.email,
          subject: (newsletter as any).subject,
          html,
          tags: { source: "newsletter-send", newsletter_id },
        },
      });
      if (sendErr || !(sendData as any)?.success) {
        console.error(`[newsletter-send] failed for ${subscriber.email}:`, sendErr ?? (sendData as any)?.error);
        continue;
      }
      sentCount++;
    } catch (emailError) {
      console.error(`[newsletter-send] Failed to send to ${subscriber.email}:`, emailError);
    }
  }

  await supabase.from("newsletters").update({
    status: "sent",
    sent_at: new Date().toISOString(),
    sent_count: sentCount,
    scheduled_at: null,
    unique_opens: 0, open_count: 0, unique_clicks: 0, click_count: 0,
  }).eq("id", newsletter_id);

  return { ok: true, sent_count: sentCount, total_subscribers: (subscribers as any[]).length };
}

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = getServiceClient();

    // Auth: admin only. This function is deployed --no-verify-jwt, so the
    // admin check MUST be enforced here.
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const bearer = authHeader.replace("Bearer ", "").trim();
    // service_role escape: the FlowWink gateway / agent-execute invokes edge: skills
    // with `Bearer ${SERVICE_ROLE_KEY}` (no end-user JWT), so execute_newsletter_send
    // over the operator surface must accept the service key or it 401s ("Unauthorized").
    // The service key is already an admin-equivalent trust boundary.
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!(serviceKey && bearer === serviceKey)) {
      const { data: userData, error: authError } = await supabase.auth.getUser(bearer);
      if (authError || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: hasAdmin } = await supabase.rpc("has_role", {
        _user_id: userData.user.id, _role: "admin",
      });
      if (!hasAdmin) {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { newsletter_id }: SendNewsletterRequest = await req.json();
    const result = await sendNewsletterCore(supabase as any, newsletter_id);
    if (!result.ok) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: result.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({ success: true, sent_count: result.sent_count, total_subscribers: result.total_subscribers }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[newsletter-send] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

