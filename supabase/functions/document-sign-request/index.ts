// document-sign-request — send a signing request email with a tokenized link.
// POST { request_id }
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resolveOrigin = async (supabase: any): Promise<string> => {
  const env = Deno.env.get("PUBLIC_SITE_URL");
  if (env) return env.replace(/\/$/, "");
  const { data } = await supabase.from("site_settings").select("value").eq("key", "general").maybeSingle();
  const url = (data?.value as any)?.siteUrl;
  return (url ?? "https://flowwink.lovable.app").replace(/\/$/, "");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { request_id } = await req.json();
    if (!request_id) throw new Error("request_id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const { data: rq, error } = await supabase
      .from("document_signature_requests")
      .select("*, documents(title)")
      .eq("id", request_id)
      .single();
    if (error || !rq) throw error ?? new Error("request not found");

    const origin = await resolveOrigin(supabase);
    const signUrl = `${origin}/sign/document/${rq.token}`;
    const docTitle = (rq as any).documents?.title ?? "Document";

    const html = `
<!doctype html><html><body style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
  <h2 style="margin:0 0 12px">Signature requested — ${docTitle}</h2>
  <p>Hi${rq.signer_name ? ` ${rq.signer_name}` : ""},</p>
  <p>You've been asked to sign the document "<strong>${docTitle}</strong>".</p>
  ${rq.message ? `<p style="border-left:3px solid #ddd;padding-left:12px;color:#555">${rq.message}</p>` : ""}
  <p style="margin:24px 0">
    <a href="${signUrl}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">Review &amp; sign</a>
  </p>
  <p style="font-size:12px;color:#888">Or paste this link into your browser: ${signUrl}</p>
</body></html>`.trim();

    // Best-effort send via router
    const sendRes = await supabase.functions.invoke("email-send", {
      body: {
        to: rq.signer_email,
        subject: `Signature requested — ${docTitle}`,
        html,
        source: "document-sign-request",
        related_entity_type: "document",
        related_entity_id: rq.document_id,
      },
    });

    await supabase
      .from("document_signature_requests")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", request_id);

    return new Response(
      JSON.stringify({ ok: true, sign_url: signUrl, email: sendRes?.error ? "failed" : "sent" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
