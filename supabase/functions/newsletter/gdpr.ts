import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { loadEmailShell } from '../_shared/email-shell.ts';
import { cleanLanguageTag } from '../_shared/email/mail-template.ts';
import { resolveUiText } from '../_shared/locale/ui-text.ts';
import { loadUiText } from '../_shared/locale/load-ui-text.ts';
import { addressToken, addressTokenMatches } from '../_shared/email/address-token.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-chat-session, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GdprRequest {
  action: "request" | "verify" | "export" | "delete";
  email?: string;
  token?: string;
  /** The visitor's language — the verification mail is written in it. */
  lang?: string;
}

export async function handle(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabase = getServiceClient();

    const { action, email, token, lang }: GdprRequest = await req.json();

    console.log(`[newsletter-gdpr] Action: ${action}`);

    // Action: Request verification — the link is MAILED to the address. It
    // used to come back in this answer ("for development"), so anyone who
    // knew an address could read and delete that subscriber's data.
    if (action === "request" && email) {
      const address = email.toLowerCase().trim();
      const sameAnswer = () => new Response(JSON.stringify({
        success: true,
        message: "If this email is registered, you will receive a verification link.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const { data: subscriber, error: subError } = await supabase
        .from("newsletter_subscribers")
        .select("id")
        .eq("email", address)
        .maybeSingle();
      if (subError) console.error("[newsletter-gdpr] could not read the subscriber:", subError.message);
      // The same answer whether or not the address is on the list.
      if (!subscriber) return sameAnswer();

      let siteOrigin = Deno.env.get("PUBLIC_SITE_URL") || "";
      if (!siteOrigin) {
        const { data: gs, error: gsError } = await supabase.from("site_settings")
          .select("value").eq("key", "general").maybeSingle();
        if (gsError) console.error("[newsletter-gdpr] could not read the site address:", gsError.message);
        const v = (gs?.value ?? {}) as Record<string, string | undefined>;
        siteOrigin = v.siteUrl || v.site_url || v.public_url || v.publicUrl || "";
      }
      siteOrigin = siteOrigin.replace(/\/+$/, "");
      if (!siteOrigin) {
        // No address for the site: there is no page to link to. Say nothing
        // different to the visitor; the log tells the operator.
        console.error("[newsletter-gdpr] no site URL (general.siteUrl) — the verification link was not sent");
        return sameAnswer();
      }
      const verificationUrl = `${siteOrigin}/newsletter/manage?token=${await addressToken(address)}&email=${encodeURIComponent(address)}`;

      const texts = await loadUiText(supabase);
      const t = resolveUiText(texts.map, cleanLanguageTag(lang) ?? texts.siteLang, texts.siteLang);
      const shell = await loadEmailShell(supabase);
      const subject = t('newsletter.manage.mail.subject', 'Your link to manage your subscription');
      const lead = t('newsletter.manage.mail.lead', 'You asked to see or remove the data we hold about your newsletter subscription. Open the link below to continue.');
      const button = t('newsletter.manage.mail.button', 'Manage my subscription');
      const ignore = t('newsletter.manage.mail.ignore', 'If you did not ask for this, you can ignore this email. Nothing happens unless the link is opened.');
      const { data: sendData, error: sendErr } = await supabase.functions.invoke("email-send", {
        body: {
          to: address,
          subject,
          html: `
            <p>${lead}</p>
            <p style="margin:24px 0;">
              <a href="${verificationUrl}" style="display:inline-block;padding:12px 24px;background-color:${shell.primaryHex};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">${button}</a>
            </p>
            <p style="color:#666666;font-size:13px;">${ignore}</p>`,
          text: `${lead}\n\n${verificationUrl}\n\n${ignore}`,
          source: "newsletter-manage",
          tags: { source: "newsletter-manage" },
        },
      });
      if (sendErr || !(sendData as { success?: boolean } | null)?.success) {
        console.error("[newsletter-gdpr] verification mail failed:", sendErr ?? (sendData as { error?: string } | null)?.error);
      }
      return sameAnswer();
    }

    // Every other action proves the address with the key from that mail.
    if ((action === "verify" || action === "export" || action === "delete") && email
        && !(await addressTokenMatches(email, token))) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: Verify token and return subscriber info
    if (action === "verify" && token && email) {
      const { data: subscriber, error: subError } = await supabase
        .from("newsletter_subscribers")
        .select("id, email, name, status, created_at, confirmed_at, unsubscribed_at")
        .eq("email", email.toLowerCase().trim())
        .single();

      if (subError || !subscriber) {
        return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        verified: true,
        subscriber: {
          email: subscriber.email,
          name: subscriber.name,
          status: subscriber.status,
          created_at: subscriber.created_at,
          confirmed_at: subscriber.confirmed_at,
          unsubscribed_at: subscriber.unsubscribed_at,
        }
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: Export data
    if (action === "export" && token && email) {
      // Verify token first
      const { data: subscriber, error: subError } = await supabase
        .from("newsletter_subscribers")
        .select("*")
        .eq("email", email.toLowerCase().trim())
        .single();

      if (subError || !subscriber) {
        return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get related email opens
      const { data: opens } = await supabase
        .from("newsletter_email_opens")
        .select("newsletter_id, opened_at, opens_count")
        .eq("recipient_email", email.toLowerCase().trim());

      // Get related link clicks
      const { data: clicks } = await supabase
        .from("newsletter_link_clicks")
        .select("newsletter_id, original_url, clicked_at, click_count")
        .eq("recipient_email", email.toLowerCase().trim());

      const exportData = {
        exported_at: new Date().toISOString(),
        subscriber: {
          email: subscriber.email,
          name: subscriber.name,
          status: subscriber.status,
          created_at: subscriber.created_at,
          confirmed_at: subscriber.confirmed_at,
          unsubscribed_at: subscriber.unsubscribed_at,
          preferences: subscriber.preferences,
        },
        activity: {
          email_opens: opens || [],
          link_clicks: clicks || [],
        },
      };

      console.log(`[newsletter-gdpr] Data exported for: ${email}`);

      return new Response(JSON.stringify(exportData), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: Delete data
    if (action === "delete" && token && email) {
      // Verify token first
      const { data: subscriber, error: subError } = await supabase
        .from("newsletter_subscribers")
        .select("id")
        .eq("email", email.toLowerCase().trim())
        .single();

      if (subError || !subscriber) {
        return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Delete related data first
      await supabase
        .from("newsletter_email_opens")
        .delete()
        .eq("recipient_email", email.toLowerCase().trim());

      await supabase
        .from("newsletter_link_clicks")
        .delete()
        .eq("recipient_email", email.toLowerCase().trim());

      // Delete subscriber
      const { error: deleteError } = await supabase
        .from("newsletter_subscribers")
        .delete()
        .eq("id", subscriber.id);

      if (deleteError) {
        console.error("[newsletter-gdpr] Delete error:", deleteError);
        return new Response(JSON.stringify({ error: "Failed to delete data" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[newsletter-gdpr] Data deleted for: ${email}`);

      return new Response(JSON.stringify({
        success: true,
        message: "All your data has been permanently deleted."
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[newsletter-gdpr] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
