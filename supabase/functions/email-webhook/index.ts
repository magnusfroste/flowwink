// email-webhook — the email router's inbound door. Three routes:
//   /unsubscribe — RFC 8058 one-click + the human landing page
//   /inbound     — a received MAIL from a relay (Cloudflare Email Routing via the
//                  Worker in deploy/cloudflare/email-inbound/, or any relay that
//                  posts the same JSON) → filed by _shared/email/ingest-message.ts,
//                  the same path a Gmail message takes through Composio
//   (default)    — delivery/bounce/complaint events from ESPs (Resend/Mailgun-shaped)
//                  recorded in email_events; the auto-suppress trigger handles the list.
// Body: { message_id?, event_type: 'delivered'|'bounced'|'complained'|..., recipient?, hard_bounce?, payload? }
// Or a Resend-shaped webhook: { type: 'email.bounced' | 'email.complained' | 'email.delivered', data: {...} }
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ingestInboundMessage } from "../_shared/email/ingest-message.ts";
import { readInboundPayload, payloadFromParsedMime, MAX_RAW_MIME } from "../_shared/email/inbound-payload.ts";
import PostalMime from "npm:postal-mime@2.4.4";
import { bareEmail } from "../_shared/email/resolve-entity.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
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

function constantTimeEqual(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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

    // ── /inbound — a received mail, from a relay ────────────────────────────
    // Fail CLOSED, unlike the ESP events below: an unauthenticated door that
    // files mail on a customer and wakes the responder would let anyone write
    // into the CRM and make the instance answer. There is no working setup
    // without the secret anyway — the relay is configured with the same value.
    // EMAIL_INBOUND_SECRET is the one secret; everything else is settings.
    if (url.pathname.endsWith("/inbound")) {
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (req.method !== "POST") return json({ error: "POST only" }, 405);
      const expected = (Deno.env.get("EMAIL_INBOUND_SECRET") ?? "").trim();
      if (!expected) {
        console.warn("[email-webhook] /inbound refused: EMAIL_INBOUND_SECRET is not set");
        return json({ error: "inbound mail is not configured", hint: "set the EMAIL_INBOUND_SECRET secret and give the relay the same value" }, 503);
      }
      const got = (req.headers.get("x-webhook-secret") ?? "").trim();
      if (!constantTimeEqual(got, expected)) return json({ error: "invalid secret" }, 401);

      // Two shapes. The raw MIME message (content-type message/rfc822, envelope
      // in x-envelope-from / x-envelope-to) is what the paste-in Cloudflare
      // Worker sends — it has no dependencies, so the parsing happens here.
      // JSON is for a relay that has already parsed the mail.
      let body: unknown = null;
      if ((req.headers.get("content-type") ?? "").toLowerCase().startsWith("message/rfc822")) {
        const raw = await req.arrayBuffer();
        if (raw.byteLength > MAX_RAW_MIME) return json({ error: "message too large" }, 413);
        try {
          const mail = await PostalMime.parse(raw);
          body = payloadFromParsedMime(mail, {
            from: req.headers.get("x-envelope-from"),
            to: req.headers.get("x-envelope-to"),
          });
        } catch (e) {
          return json({ error: `could not parse the message: ${e instanceof Error ? e.message : String(e)}` }, 400);
        }
      } else {
        try { body = JSON.parse(await req.text()); } catch { /* readInboundPayload refuses null */ }
      }
      const parsed = readInboundPayload(body);
      if (!parsed.ok) return json({ error: parsed.error }, 400);
      const msg = parsed.message;

      // The mailbox the mail was addressed to, when it is registered — its
      // route_mode decides CRM-only vs ticket. Unregistered addresses are still
      // filed (crm_only): a catch-all must not drop a customer's mail.
      const { data: account, error: accErr } = await supa
        .from("inbound_email_accounts")
        .select("id, email_address, route_mode, enabled")
        // ilike for case, with its wildcards escaped: "_" is common in addresses.
        .ilike("email_address", (bareEmail(msg.to) ?? "").replace(/[\\%_]/g, (c) => `\\${c}`))
        .maybeSingle();
      if (accErr) console.error("[email-webhook] mailbox lookup failed:", accErr.message);
      if (account && account.enabled === false) return json({ success: true, skipped: "mailbox disabled" });

      const provider = (req.headers.get("x-inbound-provider") ?? "relay").replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "relay";
      const result = await ingestInboundMessage(supa, msg, { provider, source: `email-webhook:${provider}`, account });
      // 500 when the row could not be written, so the relay retries instead of
      // reporting a delivered mail that nobody will ever see.
      return json({ success: result.ok, ...result }, result.ok ? 200 : 500);
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
