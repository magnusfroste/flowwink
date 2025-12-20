import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Dynamic import of Resend
const getResend = async () => {
  const { Resend } = await import("https://esm.sh/resend@2.0.0");
  return Resend;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendNewsletterRequest {
  newsletter_id: string;
}

serve(async (req) => {
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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const ResendClass = await getResend();
    const resend = new ResendClass(resendApiKey);

    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (roleData?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { newsletter_id }: SendNewsletterRequest = await req.json();

    // Get newsletter
    const { data: newsletter, error: newsletterError } = await supabase
      .from("newsletters")
      .select("*")
      .eq("id", newsletter_id)
      .single();

    if (newsletterError || !newsletter) {
      return new Response(JSON.stringify({ error: "Newsletter not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (newsletter.status === "sent") {
      return new Response(JSON.stringify({ error: "Newsletter already sent" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update status to sending
    await supabase
      .from("newsletters")
      .update({ status: "sending" })
      .eq("id", newsletter_id);

    // Get confirmed subscribers
    const { data: subscribers, error: subError } = await supabase
      .from("newsletter_subscribers")
      .select("email, name")
      .eq("status", "confirmed");

    if (subError) {
      console.error("[newsletter-send] Error fetching subscribers:", subError);
      await supabase
        .from("newsletters")
        .update({ status: "failed" })
        .eq("id", newsletter_id);
      
      return new Response(JSON.stringify({ error: "Failed to fetch subscribers" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!subscribers || subscribers.length === 0) {
      await supabase
        .from("newsletters")
        .update({ status: "draft" })
        .eq("id", newsletter_id);

      return new Response(JSON.stringify({ error: "No subscribers to send to" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[newsletter-send] Sending to ${subscribers.length} subscribers`);

    let sentCount = 0;
    const unsubscribeUrl = `${supabaseUrl}/functions/v1/newsletter-subscribe?action=unsubscribe`;
    const trackingBaseUrl = `${supabaseUrl}/functions/v1/newsletter-track`;

    // Send emails in batches
    for (const subscriber of subscribers) {
      try {
        // Create tracking record for this subscriber
        const { data: trackingRecord, error: trackingError } = await supabase
          .from("newsletter_email_opens")
          .insert({
            newsletter_id: newsletter_id,
            recipient_email: subscriber.email,
          })
          .select("tracking_id")
          .single();

        if (trackingError) {
          console.error(`[newsletter-send] Failed to create tracking for ${subscriber.email}:`, trackingError);
        }

        const personalUnsubscribe = `${unsubscribeUrl}&email=${encodeURIComponent(subscriber.email)}`;
        
        // Build tracking pixel HTML
        const trackingPixel = trackingRecord 
          ? `<img src="${trackingBaseUrl}?t=${trackingRecord.tracking_id}" width="1" height="1" alt="" style="display:none;" />`
          : "";
        
        await resend.emails.send({
          from: "Newsletter <onboarding@resend.dev>",
          to: [subscriber.email],
          subject: newsletter.subject,
          html: `
            ${newsletter.content_html || "<p>No content</p>"}
            <hr style="margin-top: 40px; border: none; border-top: 1px solid #eee;" />
            <p style="font-size: 12px; color: #666; text-align: center;">
              <a href="${personalUnsubscribe}" style="color: #666;">Unsubscribe</a>
            </p>
            ${trackingPixel}
          `,
        });
        
        sentCount++;
        console.log(`[newsletter-send] Sent to: ${subscriber.email}`);
      } catch (emailError) {
        console.error(`[newsletter-send] Failed to send to ${subscriber.email}:`, emailError);
      }
    }

    // Update newsletter status
    await supabase
      .from("newsletters")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        sent_count: sentCount,
        unique_opens: 0,
        open_count: 0,
      })
      .eq("id", newsletter_id);

    console.log(`[newsletter-send] Complete. Sent: ${sentCount}/${subscribers.length}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent_count: sentCount,
        total_subscribers: subscribers.length 
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[newsletter-send] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
