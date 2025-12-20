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

interface SubscribeRequest {
  email: string;
  name?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
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
          confirmation_token: null 
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
      
      // Trigger webhook for newsletter subscribed
      try {
        await supabase.functions.invoke('send-webhook', {
          body: { 
            event: 'newsletter.subscribed', 
            data: { 
              email: data.email, 
              name: data.name,
              subscribed_at: new Date().toISOString(),
            } 
          },
        });
      } catch (webhookError) {
        console.warn('[newsletter-subscribe] Webhook error:', webhookError);
      }
      
      // Redirect to success page or return success
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
          unsubscribed_at: new Date().toISOString() 
        })
        .eq("email", email);

      if (error) {
        console.error("[newsletter-subscribe] Unsubscribe error:", error);
      }

      console.log(`[newsletter-subscribe] Unsubscribed: ${email}`);
      
      // Trigger webhook for newsletter unsubscribed
      try {
        await supabase.functions.invoke('send-webhook', {
          body: { 
            event: 'newsletter.unsubscribed', 
            data: { 
              email,
              unsubscribed_at: new Date().toISOString(),
            } 
          },
        });
      } catch (webhookError) {
        console.warn('[newsletter-subscribe] Webhook error:', webhookError);
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
      
      // Re-activate if unsubscribed
      if (existing.status === "unsubscribed") {
        const { error: updateError } = await supabase
          .from("newsletter_subscribers")
          .update({ 
            status: "pending", 
            unsubscribed_at: null,
            confirmation_token: crypto.randomUUID()
          })
          .eq("id", existing.id);
          
        if (updateError) {
          console.error("[newsletter-subscribe] Re-subscribe error:", updateError);
        }
      }
    } else {
      // Create new subscription
      const { error: insertError } = await supabase
        .from("newsletter_subscribers")
        .insert({
          email: email.toLowerCase(),
          name: name || null,
          status: "pending",
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

    // Send confirmation email if Resend is configured
    if (resendApiKey && subscriber?.confirmation_token) {
      try {
        const ResendClass = await getResend();
        const resendClient = new ResendClass(resendApiKey);
        const confirmUrl = `${supabaseUrl}/functions/v1/newsletter-subscribe?action=confirm&token=${subscriber.confirmation_token}`;
        
        await resendClient.emails.send({
          from: "Newsletter <onboarding@resend.dev>",
          to: [email],
          subject: "Confirm your subscription",
          html: `
            <h2>Welcome!</h2>
            <p>Please confirm your newsletter subscription by clicking the link below:</p>
            <p><a href="${confirmUrl}" style="display: inline-block; padding: 12px 24px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 6px;">Confirm Subscription</a></p>
            <p>If you didn't subscribe, you can safely ignore this email.</p>
          `,
        });
        
        console.log(`[newsletter-subscribe] Confirmation email sent to: ${email}`);
      } catch (emailError) {
        console.error("[newsletter-subscribe] Email send error:", emailError);
        // Continue anyway - subscription is created
      }
    } else {
      // Auto-confirm if no email service
      await supabase
        .from("newsletter_subscribers")
        .update({ 
          status: "confirmed", 
          confirmed_at: new Date().toISOString() 
        })
        .eq("email", email.toLowerCase());
        
      console.log(`[newsletter-subscribe] Auto-confirmed (no email service): ${email}`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: resendApiKey ? "Please check your email to confirm" : "Subscribed successfully" 
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[newsletter-subscribe] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
