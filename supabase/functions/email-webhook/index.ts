// email-webhook — receive delivery/bounce/complaint events from ESPs (Resend/Mailgun-shaped)
// and record them in email_events. The auto-suppress trigger handles the suppression list.
// Body: { message_id?, event_type: 'delivered'|'bounced'|'complained'|..., recipient?, hard_bounce?, payload? }
// Or a Resend-shaped webhook: { type: 'email.bounced' | 'email.complained' | 'email.delivered', data: {...} }
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_TO_INTERNAL: Record<string, { type: string; hard?: boolean }> = {
  "email.delivered": { type: "delivered" },
  "email.opened": { type: "opened" },
  "email.clicked": { type: "clicked" },
  "email.bounced": { type: "bounced", hard: true },
  "email.complained": { type: "complained" },
  "email.delivery_delayed": { type: "deferred" },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const raw = await req.json();

    // Normalize into { event_type, recipient, message_id, hard_bounce, payload }
    let event_type: string | undefined = raw?.event_type;
    let recipient: string | undefined = raw?.recipient;
    let message_id: string | undefined = raw?.message_id;
    let hard_bounce: boolean = !!raw?.hard_bounce;
    let payload: unknown = raw?.payload ?? raw;

    if (!event_type && typeof raw?.type === "string" && RESEND_TO_INTERNAL[raw.type]) {
      const m = RESEND_TO_INTERNAL[raw.type];
      event_type = m.type;
      hard_bounce = m.hard === true || raw?.data?.bounce?.type === "hard";
      recipient = raw?.data?.to?.[0] ?? raw?.data?.email ?? recipient;
      message_id = raw?.data?.email_id ?? raw?.data?.id ?? message_id;
      payload = raw.data ?? raw;
    }

    if (!event_type) {
      return new Response(JSON.stringify({ error: "event_type required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supa.rpc("record_email_event", {
      p_message_id: message_id ?? null,
      p_event_type: event_type,
      p_recipient: recipient ?? null,
      p_hard_bounce: hard_bounce,
      p_payload: payload as any,
      p_communication_id: null,
    });
    if (error) throw new Error(error.message);

    return new Response(JSON.stringify({ success: true, event: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
