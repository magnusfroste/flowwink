// media-optimize — server-side image resize.
// Generates thumbnail (256px) + web (1280px) WebP variants for a given
// storage object in the `cms-images` bucket, uploads them as sibling files
// under `<folder>/variants/`, and records them on `media_assets.variants`.

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { decode, Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

interface Body {
  storage_path?: string;
  bucket?: string;
  alt_text?: string;
}

const THUMB = 256;
const WEB = 1280;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const bucket = body.bucket || "cms-images";
    const storagePath = body.storage_path;

    if (!storagePath || typeof storagePath !== "string") {
      return json({ ok: false, error: "storage_path required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Download original.
    const { data: dl, error: dlErr } = await supabase.storage.from(bucket).download(storagePath);
    if (dlErr || !dl) return json({ ok: false, error: dlErr?.message || "download failed" }, 404);
    const bytes = new Uint8Array(await dl.arrayBuffer());

    // Decode + resize with ImageScript (pure Deno, supports PNG/JPEG/WebP-decode).
    let img: Image;
    try {
      const decoded = await decode(bytes);
      // Animated GIF returns Frame[]; simplify by rejecting.
      if (!(decoded instanceof Image)) {
        return json({ ok: false, error: "unsupported image type (animated?)" }, 415);
      }
      img = decoded;
    } catch (e) {
      return json({ ok: false, error: `decode failed: ${(e as Error).message}` }, 415);
    }

    const origW = img.width;
    const origH = img.height;

    const folder = storagePath.split("/").slice(0, -1).join("/") || "pages";
    const baseName = storagePath.split("/").pop()!.replace(/\.[^./]+$/, "");

    const variants: Array<Record<string, unknown>> = [];

    for (const [label, targetW] of [["thumb", THUMB], ["web", WEB]] as const) {
      if (origW <= targetW && label === "web") continue; // no upscale for web
      const w = Math.min(targetW, origW);
      const h = Math.round((w / origW) * origH);
      // clone to avoid mutating original
      const clone = img.clone().resize(w, h);
      // ImageScript's encode() is PNG; encodeJPEG for smaller output.
      const out = await clone.encodeJPEG(82);
      const outPath = `${folder}/variants/${baseName}-${label}.jpg`;
      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(outPath, out, {
          contentType: "image/jpeg",
          cacheControl: "31536000",
          upsert: true,
        });
      if (upErr) {
        return json({ ok: false, error: `upload variant ${label} failed: ${upErr.message}` }, 500);
      }
      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(outPath);
      variants.push({
        label,
        width: w,
        height: h,
        storage_path: outPath,
        url: pub.publicUrl,
        size_bytes: out.byteLength,
      });
    }

    // Upsert metadata.
    const { data: meta, error: metaErr } = await supabase.rpc("upsert_media_asset", {
      p_storage_path: storagePath,
      p_folder: folder.split("/")[0],
      p_filename: storagePath.split("/").pop(),
      p_mime_type: dl.type || null,
      p_size_bytes: bytes.byteLength,
      p_width: origW,
      p_height: origH,
      p_alt_text: body.alt_text ?? null,
      p_variants: variants,
      p_bucket: bucket,
    });
    if (metaErr) return json({ ok: false, error: `metadata upsert failed: ${metaErr.message}` }, 500);

    return json({ ok: true, asset: meta, variants });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
