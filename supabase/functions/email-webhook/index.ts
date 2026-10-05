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

/**
 * Unsubscribe token: HMAC-SHA256(lower(email), service key), first 32 hex chars.
 * email-send computes the same when stamping List-Unsubscribe headers, so only
 * links we minted can suppress an address — an attacker cannot unsubscribe
 * arbitrary victims by guessing URLs.
 */
async function unsubscribeToken(email: string): Promise<string> {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(email.toLowerCase()));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

async function verifySvix(headers: Headers, body: string, secret: string): Promise<boolean> {
  const id = headers.get("svix-id") ?? "";
  const ts = headers.get("svix-timestamp") ?? "";
  const sigs = headers.get("svix-signature") ?? "";
  if (!id || !ts || !sigs) return false;
  // Replay window: five minutes either way.
  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(age) || age > 300) return false;
  const rawKey = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const keyBytes = Uint8Array.from(atob(rawKey), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return sigs.split(" ").some((part) => {
    const [version, value] = part.split(",", 2);
    return version === "v1" && value === expected;
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── /unsubscribe — RFC 8058 one-click + human landing ────────────────────
    // GET = a person clicked the link in their mail client: suppress and show a
    // tiny confirmation page. POST = Gmail/Yahoo's automated one-click
    // (List-Unsubscribe-Post). Both record an 'unsubscribed' event; the
    // existing auto-suppress trigger turns that into a permanent, global,
    // lowercased row in email_suppressions — the same list every send path
    // already checks. Suppression is deliberately NOT per-campaign.
    const url = new URL(req.url);
    if (url.pathname.endsWith("/unsubscribe")) {
      const email = (url.searchParams.get("e") ?? "").trim();
      const token = url.searchParams.get("t") ?? "";
      if (!email || !token || token !== (await unsubscribeToken(email))) {
        return new Response("Invalid unsubscribe link", { status: 403, headers: corsHeaders });
      }
      await supa.from("email_events").insert({
        event_type: "unsubscribed",
        recipient: email,
        payload: { via: req.method === "POST" ? "one-click" : "link" },
      });
      if (req.method === "POST") {
        return new Response("OK", { status: 200, headers: corsHeaders });
      }
      return new Response(
        `<!doctype html><meta charset="utf-8"><title>Unsubscribed</title>` +
        `<body style="font-family:system-ui;max-width:32rem;margin:4rem auto;text-align:center">` +
        `<h2>You're unsubscribed</h2><p>${email.replace(/</g, "&lt;")} will not receive further emails from us.</p></body>`,
        { status: 200, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    // ── Provider signature ──────────────────────────────────────────────────
    // Resend signs with svix: HMAC-SHA256 over "<id>.<timestamp>.<body>" with the
    // whsec_ secret (base64 after the prefix), header svix-signature "v1,<b64> …".
    // Without this, anyone who could reach the URL could post a "bounce" and the
    // auto-suppress trigger would silence a real customer. When the secret is not
    // configured the event is accepted unverified — fail forward — and says so
    // in the log, so an instance notices before it relies on the list.
    const bodyText = await req.text();
    const secret = Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "";
    if (secret) {
      const ok = await verifySvix(req.headers, bodyText, secret);
      if (!ok) {
        return new Response(JSON.stringify({ error: "invalid signature" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (req.headers.get("svix-id")) {
      console.warn("[email-webhook] svix-signed event accepted UNVERIFIED — set RESEND_WEBHOOK_SECRET");
    }
    const raw = JSON.parse(bodyText || "{}");

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
