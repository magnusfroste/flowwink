// document-sign-request — send a signing request email with a tokenized link.
// POST { request_id }
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { escapeHtml } from "../_shared/email/mail-template.ts";
import { loadUiText } from "../_shared/locale/load-ui-text.ts";
import { resolveUiText } from "../_shared/locale/ui-text.ts";
import { loadOrgName } from "../_shared/org-name.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resolveOrigin = async (supabase: any): Promise<string> => {
  const env = Deno.env.get("PUBLIC_SITE_URL");
  if (env) return env.replace(/\/$/, "");
  const { data } = await supabase.from("site_settings").select("value").eq("key", "general").maybeSingle();
  const url = (data?.value as any)?.siteUrl;
  // No guessed fallback: a link to another site is worse than none.
  return String(url ?? "").replace(/\/$/, "");
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
    // The signer is mailed in the site's language (it was English for everyone),
    // and every value they did not write is escaped: the title and the message
    // came into the HTML as typed.
    const texts = await loadUiText(supabase);
    const t = resolveUiText(texts.map, texts.siteLang, texts.siteLang);
    const business = await loadOrgName(supabase, "");
    const docTitle = String((rq as any).documents?.title ?? t("docsign.mail.untitled", "Document"));
    const subject = t("docsign.mail.subject", "Please sign: {title}").replace("{title}", docTitle);
    const greeting = rq.signer_name
      ? t("docsign.mail.greetingNamed", "Hello {name},").replace("{name}", String(rq.signer_name))
      : t("docsign.mail.greeting", "Hello,");
    const lead = (business
      ? t("docsign.mail.leadFrom", "{business} asks you to sign the document \"{title}\".")
      : t("docsign.mail.lead", "You are asked to sign the document \"{title}\".")
    ).replace("{business}", business).replace("{title}", docTitle);

    const html = `
<!doctype html><html><body style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
  <h2 style="margin:0 0 12px">${escapeHtml(subject)}</h2>
  <p>${escapeHtml(greeting)}</p>
  <p>${escapeHtml(lead)}</p>
  ${rq.message ? `<p style="border-left:3px solid #ddd;padding-left:12px;color:#555">${escapeHtml(rq.message)}</p>` : ""}
  <p style="margin:24px 0">
    <a href="${escapeHtml(signUrl)}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">${escapeHtml(t("docsign.mail.button", "Read and sign"))}</a>
  </p>
  <p style="font-size:12px;color:#888">${escapeHtml(t("docsign.mail.pasteLink", "Or paste this link into your browser:"))} ${escapeHtml(signUrl)}</p>
</body></html>`.trim();

    // Without the site's own address the link in the mail would lead nowhere
    // (it used to lead to another site): say so, send nothing.
    if (!origin) {
      return new Response(
        JSON.stringify({ ok: false, email: "not_sent", error: "The site's address is not set (Site settings → General → Site URL), so the signing link cannot be mailed." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Best-effort send via router
    const sendRes = await supabase.functions.invoke("email-send", {
      body: {
        to: rq.signer_email,
        subject,
        html,
        source: "document-sign-request",
        related_entity_type: "document",
        related_entity_id: rq.document_id,
      },
    });

    // Only stamp "sent" when something was actually sent. The row was updated
    // unconditionally before, so a request the allowlist withheld — or one the
    // provider refused — showed staff a signer who had been asked and was not
    // replying, when nothing had left the building. The signing link is still
    // returned either way, so the request stays usable out-of-band.
    const emailFailed = Boolean(sendRes?.error);
    if (!emailFailed) {
      await supabase
        .from("document_signature_requests")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", request_id);
    }

    return new Response(
      JSON.stringify({ ok: true, sign_url: signUrl, email: emailFailed ? "failed" : "sent" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
