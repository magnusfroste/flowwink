// document-share — anon-callable: resolve share token and stream (or redirect to) the file.
// GET ?token=<uuid>&mode=download|view
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { resolveDocumentObject } from "../_shared/storage/document-object.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const mode = url.searchParams.get("mode") ?? "download";
    if (!token) {
      return new Response(JSON.stringify({ error: "missing token" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const { data, error } = await supabase.rpc("resolve_document_share", { _token: token });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return new Response(JSON.stringify({ error: "invalid_or_expired" }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // One reader of where a document lives: a cowork attachment is in its own
    // bucket, an admin upload is a path inside `documents`, an external file is a URL.
    const target = resolveDocumentObject(row.file_url as string);
    if (target.kind === "url") {
      return Response.redirect(target.url, 302);
    }

    // Storage-backed: mint a short-lived signed URL and redirect
    const { data: signed, error: sErr } = await supabase.storage
      .from(target.bucket)
      .createSignedUrl(target.path, 300, {
        download: mode === "download" ? (row.file_name ?? true) : false,
      });
    if (sErr || !signed?.signedUrl) throw sErr ?? new Error("sign_failed");
    return Response.redirect(signed.signedUrl, 302);
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
