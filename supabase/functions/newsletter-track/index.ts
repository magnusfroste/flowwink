import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 1x1 transparent GIF
const TRANSPARENT_GIF = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 
  0x80, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 
  0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 
  0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 
  0x01, 0x00, 0x3b
]);

serve(async (req) => {
  const url = new URL(req.url);
  const trackingId = url.searchParams.get("t");

  // Always return the tracking pixel, even if tracking fails
  const gifResponse = new Response(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });

  if (!trackingId) {
    console.log("[newsletter-track] No tracking ID provided");
    return gifResponse;
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user agent and IP for analytics
    const userAgent = req.headers.get("user-agent") || null;
    const forwardedFor = req.headers.get("x-forwarded-for");
    const ipAddress = forwardedFor ? forwardedFor.split(",")[0].trim() : null;

    console.log(`[newsletter-track] Tracking open: ${trackingId}`);

    // Check if this tracking record exists
    const { data: existing, error: fetchError } = await supabase
      .from("newsletter_email_opens")
      .select("id, newsletter_id, opens_count, opened_at")
      .eq("tracking_id", trackingId)
      .single();

    if (fetchError || !existing) {
      console.log(`[newsletter-track] Tracking ID not found: ${trackingId}`);
      return gifResponse;
    }

    const isFirstOpen = !existing.opened_at;
    const now = new Date().toISOString();

    // Update the open record
    await supabase
      .from("newsletter_email_opens")
      .update({
        opened_at: existing.opened_at || now,
        opens_count: existing.opens_count + 1,
        user_agent: userAgent,
        ip_address: ipAddress,
      })
      .eq("id", existing.id);

    // If first open, update newsletter counters
    if (isFirstOpen) {
      // Get current newsletter stats
      const { data: newsletter } = await supabase
        .from("newsletters")
        .select("unique_opens, sent_count")
        .eq("id", existing.newsletter_id)
        .single();

      if (newsletter) {
        await supabase
          .from("newsletters")
          .update({
            unique_opens: (newsletter.unique_opens || 0) + 1,
            open_count: (newsletter.unique_opens || 0) + 1,
          })
          .eq("id", existing.newsletter_id);
      }

      console.log(`[newsletter-track] First open recorded for: ${trackingId}`);
    } else {
      console.log(`[newsletter-track] Repeat open for: ${trackingId}`);
    }
  } catch (error) {
    console.error("[newsletter-track] Error:", error);
  }

  return gifResponse;
});
