import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient } from '../_shared/supabase-clients.ts';

// 1x1 transparent GIF
const TRANSPARENT_GIF = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00,
  0x80, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21,
  0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00,
  0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44,
  0x01, 0x00, 0x3b
]);

export async function handle(req: Request): Promise<Response> {
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
            const supabase = getServiceClient();

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

    // Track lead activity for email open
    const { data: openRecord } = await supabase
      .from("newsletter_email_opens")
      .select("recipient_email, newsletter_id")
      .eq("tracking_id", trackingId)
      .single();

    if (openRecord?.recipient_email) {
      // Find lead by email
      const { data: lead } = await supabase
        .from("leads")
        .select("id")
        .eq("email", openRecord.recipient_email)
        .maybeSingle();

      if (lead) {
        await supabase.from("lead_activities").insert({
          lead_id: lead.id,
          type: "email_open",
          points: 3,
          metadata: {
            newsletter_id: openRecord.newsletter_id,
            tracking_id: trackingId,
          },
        });

        // Update lead score
        const { data: activities } = await supabase
          .from("lead_activities")
          .select("points")
          .eq("lead_id", lead.id);

        if (activities) {
          const totalScore = activities.reduce((sum, a) => sum + (a.points || 0), 0);
          await supabase
            .from("leads")
            .update({ score: totalScore })
            .eq("id", lead.id);
        }

        console.log(`[newsletter-track] Lead activity tracked for: ${openRecord.recipient_email}`);
      }
    }
  } catch (error) {
    console.error("[newsletter-track] Error:", error);
  }

  return gifResponse;
}
