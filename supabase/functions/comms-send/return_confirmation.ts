// send-return-confirmation — emails customer return instructions + label link
// Body: { return_id: string, override_email?: string, custom_instructions?: string }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Moved VERBATIM from supabase/functions/send-return-confirmation/index.ts (edge-surface B2).
export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const returnId = body?.return_id;
    if (!returnId) {
      return new Response(JSON.stringify({ error: "return_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: ret, error: retErr } = await supa
      .from("returns")
      .select("id, rma_number, order_id, return_label_url, return_tracking_number, return_carrier_code")
      .eq("id", returnId)
      .maybeSingle();
    if (retErr || !ret) throw new Error(retErr?.message ?? "Return not found");

    let email = body?.override_email as string | undefined;
    let customerName: string | undefined;
    if (!email) {
      const { data: order } = await supa
        .from("orders")
        .select("customer_email, customer_name")
        .eq("id", ret.order_id)
        .maybeSingle();
      email = order?.customer_email ?? undefined;
      customerName = order?.customer_name ?? undefined;
    }
    if (!email) throw new Error("No customer email on order — pass override_email");

    const instructions = body?.custom_instructions ??
      "Please pack the item(s) securely in the original packaging when possible. Attach the return label to the outside of the package and drop it off at your nearest carrier location.";

    const labelBlock = ret.return_label_url
      ? `<p><strong>Return label:</strong> <a href="${ret.return_label_url}">Download label (PDF)</a></p>`
      : `<p><em>A return label will be sent separately.</em></p>`;
    const trackingBlock = ret.return_tracking_number
      ? `<p><strong>Tracking:</strong> ${ret.return_tracking_number}${ret.return_carrier_code ? ` (${ret.return_carrier_code})` : ""}</p>`
      : "";

    const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2>Your return has been approved</h2>
        <p>Hi${customerName ? ` ${customerName}` : ""},</p>
        <p>We've approved your return request <strong>${ret.rma_number}</strong>.</p>
        ${labelBlock}
        ${trackingBlock}
        <h3>Return instructions</h3>
        <p>${instructions}</p>
        <p style="color:#666;font-size:12px;margin-top:32px">Reference this RMA number on any correspondence: ${ret.rma_number}</p>
      </div>
    `;

    const { data: sendRes, error: sendErr } = await supa.functions.invoke("email-send", {
      body: {
        to: email,
        subject: `Return approved — ${ret.rma_number}`,
        html,
        source: "returns",
        related_entity_type: "return",
        related_entity_id: ret.id,
      },
    });
    if (sendErr) throw new Error(sendErr.message);

    return new Response(JSON.stringify({ success: true, sent_to: email, result: sendRes }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
