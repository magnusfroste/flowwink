import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient } from '../_shared/supabase-clients.ts';

serve(async (req) => {
  const url = new URL(req.url);
  const linkId = url.searchParams.get("l");

  if (!linkId) {
    console.log("[newsletter-link] No link ID provided");
    return new Response("Missing link parameter", { status: 400 });
  }

  try {
            const supabase = getServiceClient();

    // Get user agent and IP for analytics
    const userAgent = req.headers.get("user-agent") || null;
    const forwardedFor = req.headers.get("x-forwarded-for");
    const ipAddress = forwardedFor ? forwardedFor.split(",")[0].trim() : null;

    console.log(`[newsletter-link] Tracking click: ${linkId}`);

    // Check if this link record exists
    const { data: existing, error: fetchError } = await supabase
      .from("newsletter_link_clicks")
      .select("id, newsletter_id, original_url, click_count, clicked_at")
      .eq("link_id", linkId)
      .single();

    if (fetchError || !existing) {
      console.log(`[newsletter-link] Link ID not found: ${linkId}`);
      return new Response("Link not found", { status: 404 });
    }

    const isFirstClick = !existing.clicked_at;
    const now = new Date().toISOString();

    // Update the click record
    await supabase
      .from("newsletter_link_clicks")
      .update({
        clicked_at: existing.clicked_at || now,
        click_count: existing.click_count + 1,
        user_agent: userAgent,
        ip_address: ipAddress,
      })
      .eq("id", existing.id);

    // If first click, update newsletter counters
    if (isFirstClick) {
      // Get current newsletter stats
      const { data: newsletter } = await supabase
        .from("newsletters")
        .select("unique_clicks, click_count")
        .eq("id", existing.newsletter_id)
        .single();

      if (newsletter) {
        await supabase
          .from("newsletters")
          .update({
            unique_clicks: (newsletter.unique_clicks || 0) + 1,
            click_count: (newsletter.click_count || 0) + 1,
          })
          .eq("id", existing.newsletter_id);
      }

      console.log(`[newsletter-link] First click recorded for: ${linkId}`);
    } else {
      // Just increment total click count
      const { data: newsletter } = await supabase
        .from("newsletters")
        .select("click_count")
        .eq("id", existing.newsletter_id)
        .single();

      if (newsletter) {
        await supabase
          .from("newsletters")
          .update({
            click_count: (newsletter.click_count || 0) + 1,
          })
          .eq("id", existing.newsletter_id);
      }

      console.log(`[newsletter-link] Repeat click for: ${linkId}`);
    }

    // Track lead activity for link click
    const { data: clickRecord } = await supabase
      .from("newsletter_link_clicks")
      .select("recipient_email, newsletter_id, original_url")
      .eq("link_id", linkId)
      .single();

    if (clickRecord?.recipient_email) {
      // Find lead by email
      const { data: lead } = await supabase
        .from("leads")
        .select("id")
        .eq("email", clickRecord.recipient_email)
        .maybeSingle();

      if (lead) {
        await supabase.from("lead_activities").insert({
          lead_id: lead.id,
          type: "link_click",
          points: 5,
          metadata: {
            newsletter_id: clickRecord.newsletter_id,
            link_id: linkId,
            url: clickRecord.original_url,
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

        console.log(`[newsletter-link] Lead activity tracked for: ${clickRecord.recipient_email}`);
      }
    }

    // Redirect to original URL
    return new Response(null, {
      status: 302,
      headers: {
        "Location": existing.original_url,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[newsletter-link] Error:", error);
    return new Response("Internal error", { status: 500 });
  }
});
