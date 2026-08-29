import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { loadEmailShell } from '../_shared/email-shell.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-chat-session, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SubscribeRequest {
  email: string;
  name?: string;
}

export async function handle(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    const supabase = getServiceClient();

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Handle confirmation
    if (action === "confirm") {
      const token = url.searchParams.get("token");

      if (!token) {
        return new Response(JSON.stringify({ error: "Missing confirmation token" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await supabase
        .from("newsletter_subscribers")
        .update({
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
          confirmation_token: null,
        })
        .eq("confirmation_token", token)
        .eq("status", "pending")
        .select()
        .single();

      if (error || !data) {
        console.error("[newsletter-subscribe] Confirmation error:", error);
        return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[newsletter-subscribe] Email confirmed: ${data.email}`);

      // Create or update lead from newsletter subscription
      try {
        const { data: existingLead } = await supabase.from("leads").select("id").eq("email", data.email).maybeSingle();

        if (existingLead) {
          // Add activity to existing lead
          await supabase.from("lead_activities").insert({
            lead_id: existingLead.id,
            type: "newsletter_subscribe",
            points: 8,
            metadata: { name: data.name },
          });

          // Update score
          const { data: activities } = await supabase
            .from("lead_activities")
            .select("points")
            .eq("lead_id", existingLead.id);

          if (activities) {
            const totalScore = activities.reduce((sum, a) => sum + (a.points || 0), 0);
            await supabase.from("leads").update({ score: totalScore }).eq("id", existingLead.id);
          }
        } else {
          // Create new lead
          const { data: newLead, error: leadErr } = await supabase
            .from("leads")
            .insert({
              email: data.email,
              name: data.name || null,
              source: "newsletter",
              status: "lead",
              score: 8,
              needs_review: false,
            })
            .select()
            .single();
          if (leadErr) throw new Error(`newsletter lead insert failed: ${leadErr.message}`);

          if (newLead) {
            await supabase.from("lead_activities").insert({
              lead_id: newLead.id,
              type: "newsletter_subscribe",
              points: 8,
              metadata: { is_initial: true },
            });

            // Trigger AI qualification for new newsletter lead (fire-and-forget)
            supabase.functions.invoke("agent-execute", { body: { skill_name: "qualify_lead", arguments: { leadId: newLead.id }, agent_type: "system" } })
              .catch((err: unknown) => console.warn("[newsletter-subscribe] Lead qualification error:", err));
          }
        }

        // Trigger AI qualification for existing leads too (fire-and-forget)
        if (existingLead) {
          supabase.functions.invoke("agent-execute", { body: { skill_name: "qualify_lead", arguments: { leadId: existingLead.id }, agent_type: "system" } })
            .catch((err: unknown) => console.warn("[newsletter-subscribe] Lead qualification error:", err));
        }
        console.log(`[newsletter-subscribe] Lead created/updated for: ${data.email}`);
      } catch (leadError) {
        console.warn("[newsletter-subscribe] Lead creation error:", leadError);
      }

      // Trigger webhook for newsletter subscribed
      try {
        await supabase.functions.invoke("send-webhook", {
          body: {
            event: "newsletter.subscribed",
            data: {
              email: data.email,
              name: data.name,
              subscribed_at: new Date().toISOString(),
            },
          },
        });
      } catch (webhookError) {
        console.warn("[newsletter-subscribe] Webhook error:", webhookError);
      }

      // Get site URL for redirect
      const { data: siteSettings } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "general")
        .maybeSingle();

      const siteUrl = (siteSettings?.value as any)?.siteUrl || req.headers.get("origin") || "";
      const redirectUrl = siteUrl ? `${siteUrl}/newsletter/confirmed` : null;

      if (redirectUrl) {
        return new Response(null, {
          status: 302,
          headers: { ...corsHeaders, "Location": redirectUrl },
        });
      }

      return new Response(JSON.stringify({ success: true, message: "Subscription confirmed" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle unsubscribe
    if (action === "unsubscribe") {
      const email = url.searchParams.get("email");

      if (!email) {
        return new Response(JSON.stringify({ error: "Missing email" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabase
        .from("newsletter_subscribers")
        .update({
          status: "unsubscribed",
          unsubscribed_at: new Date().toISOString(),
        })
        .eq("email", email);

      if (error) {
        console.error("[newsletter-subscribe] Unsubscribe error:", error);
      }

      console.log(`[newsletter-subscribe] Unsubscribed: ${email}`);

      // Trigger webhook for newsletter unsubscribed
      try {
        await supabase.functions.invoke("send-webhook", {
          body: {
            event: "newsletter.unsubscribed",
            data: {
              email,
              unsubscribed_at: new Date().toISOString(),
            },
          },
        });
      } catch (webhookError) {
        console.warn("[newsletter-subscribe] Webhook error:", webhookError);
      }

      return new Response(JSON.stringify({ success: true, message: "Unsubscribed successfully" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle new subscription
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, name }: SubscribeRequest = await req.json();

    if (!email || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Valid email required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if already subscribed
    const { data: existing } = await supabase
      .from("newsletter_subscribers")
      .select("id, status")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (existing) {
      if (existing.status === "confirmed") {
        return new Response(JSON.stringify({ success: true, message: "Already subscribed" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Still pending: refresh the token so this attempt re-sends the
      // confirmation email — "I never got the email" must be fixable by
      // subscribing again.
      if (existing.status === "pending") {
        await supabase
          .from("newsletter_subscribers")
          .update({ confirmation_token: crypto.randomUUID() })
          .eq("id", existing.id);
      }

      // Re-activate if unsubscribed
      if (existing.status === "unsubscribed") {
        const { error: updateError } = await supabase
          .from("newsletter_subscribers")
          .update({
            status: "pending",
            unsubscribed_at: null,
            confirmation_token: crypto.randomUUID(),
          })
          .eq("id", existing.id);

        if (updateError) {
          console.error("[newsletter-subscribe] Re-subscribe error:", updateError);
        }
      }
    } else {
      // Create new subscription
      const { error: insertError } = await supabase.from("newsletter_subscribers").insert({
        email: email.toLowerCase(),
        name: name || null,
        status: "pending",
        // The confirmation-send below gates on this token. Without it a new
        // subscriber was born pending with nothing to confirm and no email —
        // double opt-in with no opt-in, so newsletters had zero recipients.
        confirmation_token: crypto.randomUUID(),
      });

      if (insertError) {
        console.error("[newsletter-subscribe] Insert error:", insertError);
        return new Response(JSON.stringify({ error: "Failed to subscribe" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Get the subscriber with confirmation token
    const { data: subscriber } = await supabase
      .from("newsletter_subscribers")
      .select("confirmation_token")
      .eq("email", email.toLowerCase())
      .single();

    // Confirmation mail goes through `email-send`, the platform's router —
    // NOT a direct Resend client, which is what this did before. Talking to
    // one provider directly meant the confirmation mail skipped the branded
    // shell and the suppression list, and — the real defect — could not be
    // sent at all by a self-hosted operator running SMTP: the old
    // `if (resendApiKey && …)` guard silently fell through to auto-confirm,
    // so double opt-in was quietly not double opt-in.
    // What we tell the visitor must follow what actually happened, not what
    // was configured: "check your email" printed because an API key exists is
    // the same lie in a friendlier voice.
    let confirmationSent = false;

    const autoConfirm = async (reason: string) => {
      await supabase
        .from("newsletter_subscribers")
        .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
        .eq("email", email.toLowerCase());
      console.log(`[newsletter-subscribe] Auto-confirmed (${reason}): ${email}`);
    };

    if (!subscriber?.confirmation_token) {
      // No token means nothing to confirm against; confirming here is the only
      // outcome that does not strand the subscriber in `pending` forever.
      await autoConfirm("no confirmation token");
    } else {
      const confirmUrl = `${supabaseUrl}/functions/v1/newsletter/subscribe?action=confirm&token=${subscriber.confirmation_token}`;

      // A fragment, not a document — email-send wraps it in the operator's
      // branded shell. The button borrows the brand colour from the same
      // settings the shell reads, so it cannot drift from the frame around it.
      const shell = await loadEmailShell(supabase);
      const html = `
        <h2 style="margin:0 0 12px;font-size:20px;">Confirm your subscription</h2>
        <p>Please confirm your newsletter subscription by clicking the button below.</p>
        <p style="margin:24px 0;">
          <a href="${confirmUrl}" style="display:inline-block;padding:12px 24px;background-color:${shell.primaryHex};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Confirm subscription</a>
        </p>
        <p style="color:#666666;font-size:13px;">If you didn't subscribe, you can safely ignore this email.</p>
      `;

      const { data: sendData, error: sendErr } = await supabase.functions.invoke("email-send", {
        body: {
          to: email,
          subject: "Confirm your subscription",
          html,
          source: "newsletter-confirm",
          tags: { source: "newsletter-confirm" },
        },
      });

      if (sendErr || !(sendData as any)?.success) {
        // Stay `pending`. An unsent confirmation is not consent — confirming
        // anyway would manufacture an opt-in that the subscriber never gave.
        console.error(
          `[newsletter-subscribe] Confirmation mail failed for ${email}:`,
          sendErr ?? (sendData as any)?.error,
        );
      } else if ((sendData as any).simulated) {
        // The router reports success with simulated=true when NO provider is
        // configured — nothing actually left the building. Treating that as a
        // sent mail is how subscribers ended up pending forever with the
        // newsletter reporting "No subscribers to send to".
        await autoConfirm("no email provider configured");
      } else {
        confirmationSent = true;
        console.log(`[newsletter-subscribe] Confirmation email sent to: ${email}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: confirmationSent
          ? "Please check your email to confirm"
          : "Subscribed successfully",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    console.error("[newsletter-subscribe] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
