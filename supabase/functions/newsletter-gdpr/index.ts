import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GdprRequest {
  action: "request" | "verify" | "export" | "delete";
  email?: string;
  token?: string;
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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, email, token }: GdprRequest = await req.json();

    console.log(`[newsletter-gdpr] Action: ${action}`);

    // Action: Request verification (sends email with token)
    if (action === "request" && email) {
      // Find subscriber
      const { data: subscriber, error: subError } = await supabase
        .from("newsletter_subscribers")
        .select("id, email, confirmation_token")
        .eq("email", email.toLowerCase().trim())
        .single();

      if (subError || !subscriber) {
        // Don't reveal if email exists or not for security
        return new Response(JSON.stringify({ 
          success: true, 
          message: "If this email is registered, you will receive a verification link." 
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Use existing confirmation_token for verification
      const verificationUrl = `${supabaseUrl.replace('.supabase.co', '.lovable.app')}/newsletter/manage?token=${subscriber.confirmation_token}&email=${encodeURIComponent(email)}`;

      console.log(`[newsletter-gdpr] Verification URL generated for: ${email}`);

      // In production, send email here. For now, return success message
      return new Response(JSON.stringify({ 
        success: true, 
        message: "If this email is registered, you will receive a verification link.",
        // For development, include token (remove in production)
        _dev_token: subscriber.confirmation_token,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: Verify token and return subscriber info
    if (action === "verify" && token && email) {
      const { data: subscriber, error: subError } = await supabase
        .from("newsletter_subscribers")
        .select("id, email, name, status, created_at, confirmed_at, unsubscribed_at")
        .eq("email", email.toLowerCase().trim())
        .eq("confirmation_token", token)
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
        .eq("confirmation_token", token)
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
        .eq("confirmation_token", token)
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
});
