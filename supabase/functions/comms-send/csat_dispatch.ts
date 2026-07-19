// csat-dispatch — finds tickets resolved in the last 7 days without a CSAT
// survey sent yet, and dispatches the active campaign with trigger='ticket_resolved'.
// Run on cron every 5-15 min.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Moved VERBATIM from supabase/functions/csat-dispatch/index.ts (edge-surface B2).
export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = getServiceClient();

  const { data: campaign } = await supabase
    .from("survey_campaigns")
    .select("id, delay_hours")
    .eq("trigger", "ticket_resolved")
    .eq("is_active", true)
    .maybeSingle();

  if (!campaign) {
    return new Response(JSON.stringify({ ok: true, skipped: "no_active_csat_campaign" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const delayHours = campaign.delay_hours ?? 0;
  const cutoff = new Date(Date.now() - delayHours * 3600 * 1000).toISOString();
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const { data: tickets, error } = await supabase
    .from("tickets")
    .select("id, subject, contact_email, contact_name, lead_id, resolved_at, csat_survey_sent_at")
    .eq("status", "resolved")
    .is("csat_survey_sent_at", null)
    .not("contact_email", "is", null)
    .lte("resolved_at", cutoff)
    .gte("resolved_at", since)
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const recipients = (tickets ?? []).map((t) => ({
    email: t.contact_email!,
    name: t.contact_name ?? undefined,
    related_entity_type: "ticket",
    related_entity_id: t.id,
    lead_id: t.lead_id ?? undefined,
  }));

  let dispatched = 0;
  if (recipients.length > 0) {
    // B2: survey_send lives in the same function now — direct handler call
    // instead of an internal HTTP hop. Same service-key auth, same body.
    const { handler: surveySendHandler } = await import('./survey_send.ts');
    const res = await surveySendHandler(new Request(`${SUPABASE_URL}/functions/v1/comms-send?kind=survey_send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ campaign_id: campaign.id, recipients }),
    }));
    if (res.ok) {
      dispatched = recipients.length;
      const ids = (tickets ?? []).map((t) => t.id);
      await supabase
        .from("tickets")
        .update({ csat_survey_sent_at: new Date().toISOString() })
        .in("id", ids);
    } else {
      const txt = await res.text();
      return new Response(JSON.stringify({ error: "survey_send_failed", detail: txt }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ ok: true, dispatched, candidates: recipients.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
