// email-send — provider-agnostic email router for FlowWink
//
// Reads `site_settings.integrations.email.provider` and dispatches to:
//   - "smtp"   → denomailer SMTP (self-host friendly: Postfix, Mailgun SMTP, SES SMTP, Gmail SMTP)
//   - "resend" → Resend API
//
// Used by every system-generated email: dunning, newsletter, booking confirms,
// order receipts, etc. Modules NEVER call Resend/SMTP directly — they call this.
//
// Body: { to, subject, html, text?, fromOverride?, tags? }
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { filterRecipients, blockedResponse } from '../_shared/email-allowlist.ts';
import { renderTemplate } from '../_shared/template-render.ts';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { isFullDocument, loadEmailShell, wrapInShell } from "../_shared/email-shell.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Provider = "smtp" | "resend" | "composio";

interface SendBody {
  to: string | string[];
  subject?: string;
  html?: string;
  text?: string;
  // Template send: if template_name (or template_id) is set, subject/html are loaded from email_templates
  // and {{variable}} tokens are substituted from `variables`. Body-level subject/html override the template.
  template_name?: string;
  template_id?: string;
  variables?: Record<string, string>;
  fromOverride?: string;     // "Name <addr@example.com>" — explicit per-call override (highest priority)
  sender_user_id?: string;   // Per-user override: look up profile.email_from_address and use it as From
  replyTo?: string;
  tags?: Record<string, string>;
  provider?: Provider;       // Per-call provider preference (e.g. send_email_to_lead asks for 'composio')
  expects_reply?: boolean;   // Hint: prefer reply-friendly channels (Composio → SMTP → Resend) on fallback
  skip_signature?: boolean;  // Explicit opt-out of appending stored signature
  skip_branding?: boolean;   // Explicit opt-out of the branded shell (fragments are wrapped by default)
  // logging hints
  source?: string;
  related_entity_type?: string;
  related_entity_id?: string;
  extra_metadata?: Record<string, unknown>;
}



interface EmailSettings {
  provider?: Provider;
  fromEmail?: string;
  fromName?: string;
  // SMTP
  smtp?: {
    host?: string;
    port?: number;
    secure?: boolean;        // true = TLS, false = STARTTLS
    user?: string;
    // password lives in SMTP_PASS secret
  };
}


/**
 * RFC 8058 one-click unsubscribe headers. Gmail/Yahoo require these on
 * commercial mail, and the 2026 enforcement is permanent 5.7.x rejection, not
 * deferral. The token is HMAC-SHA256(lower(email), service key) truncated —
 * email-webhook's /unsubscribe route validates the same, so only links we
 * minted can suppress an address. The click records an 'unsubscribed'
 * email_event; the auto-suppress trigger makes it a permanent, global row in
 * email_suppressions — the list this very function already skips.
 */
async function unsubscribeHeaders(recipient: string): Promise<Record<string, string>> {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(recipient.toLowerCase()));
  const token = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  const base = Deno.env.get("SUPABASE_URL") ?? "";
  const url = `${base}/functions/v1/email-webhook/unsubscribe?e=${encodeURIComponent(recipient)}&t=${token}`;
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

async function sendViaResend(args: {
  apiKey: string;
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: Record<string, string>;
}) {
  const unsubHeaders = args.to.length === 1 ? await unsubscribeHeaders(args.to[0]) : undefined;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      from: args.from,
      to: args.to,
      subject: args.subject,
      headers: unsubHeaders,
      html: args.html,
      text: args.text,
      reply_to: args.replyTo,
      tags: args.tags
        ? Object.entries(args.tags)
            .map(([name, value]) => ({
              name: String(name).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256),
              value: String(value ?? "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256),
            }))
            .filter((t) => t.name.length > 0)
        : undefined,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body}`);
  }
  return await res.json();
}

async function sendViaSMTP(args: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}) {
  const client = new SMTPClient({
    connection: {
      hostname: args.host,
      port: args.port,
      tls: args.secure,
      auth: { username: args.user, password: args.pass },
    },
  });
  try {
    const unsubHeaders = args.to.length === 1 ? await unsubscribeHeaders(args.to[0]) : {};
    await client.send({
      from: args.from,
      to: args.to,
      subject: args.subject,
      content: args.text ?? "Please view this email in an HTML-capable client.",
      html: args.html,
      replyTo: args.replyTo,
      headers: unsubHeaders,
    });
    return { provider: "smtp", to: args.to };
  } finally {
    await client.close();
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = getServiceClient();
  let recipients: string[] = [];
  let body: SendBody | null = null;

  async function logComm(row: {
    status: string;
    provider: string | null;
    simulated: boolean;
    error_message?: string | null;
    sent_at?: string | null;
  }) {
    try {
      await supabase.from("outbound_communications").insert({
        channel: "email",
        status: row.status,
        provider: row.provider,
        simulated: row.simulated,
        recipient: recipients.join(", ") || "unknown",
        subject: body?.subject ?? null,
        body_html: body?.html ?? null,
        body_text: body?.text ?? null,
        // Top-level logging hints (declared in SendBody) win over legacy tags.*
        source: body?.source ?? body?.tags?.source ?? null,
        related_entity_type: body?.related_entity_type ?? body?.tags?.entity_type ?? null,
        related_entity_id: body?.related_entity_id ?? body?.tags?.entity_id ?? null,
        error_message: row.error_message ?? null,
        metadata: { ...(body?.extra_metadata ?? {}), tags: body?.tags ?? {}, from_override: body?.fromOverride ?? null, sender_user_id: body?.sender_user_id ?? null },
        sent_at: row.sent_at ?? null,
      });
    } catch (e) {
      console.error("[email-send] failed to log outbound_communications:", e);
    }
  }

  try {
    body = (await req.json()) as SendBody;
    if (!body?.to) {
      return new Response(
        JSON.stringify({ error: "to is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Load template if requested (subject/html not required when template resolves)
    if (body.template_name || body.template_id) {
      const q = supabase.from("email_templates").select("subject, html, text, active");
      const { data: tpl, error: tplErr } = body.template_id
        ? await q.eq("id", body.template_id).maybeSingle()
        : await q.eq("name", body.template_name!).maybeSingle();
      if (tplErr || !tpl) {
        return new Response(JSON.stringify({ error: `Template not found: ${body.template_name ?? body.template_id}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (tpl.active === false) {
        return new Response(JSON.stringify({ error: `Template is inactive: ${body.template_name ?? body.template_id}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const vars = body.variables ?? {};
      body.subject = body.subject || renderTemplate(tpl.subject, vars);
      body.html = body.html || renderTemplate(tpl.html, vars);
      if (!body.text && tpl.text) body.text = renderTemplate(tpl.text, vars);
    }

    if (!body.subject || !body.html) {
      return new Response(
        JSON.stringify({ error: "subject and html (or a template_name) are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    // Normalize recipients: callers (and prefilled composers) often pass
    // "Name <addr@example.com>". Composio's Gmail action rejects that outright
    // ("Invalid email format passed"), and the suppression check would miss it.
    // Strip to the bare address here so every downstream rail gets a clean one.
    const bareAddress = (value: string): string => {
      const raw = String(value ?? "").trim();
      const angle = raw.match(/<([^>]+)>/);
      return (angle ? angle[1] : raw).trim();
    };
    recipients = (Array.isArray(body.to) ? body.to : [body.to])
      .map(bareAddress)
      .filter((r) => r.length > 0);

    // ── Allowlist gate — BEFORE suppressions, because it is the harder rule ──
    // Suppressions are a deny list: everything sends unless named. The allowlist
    // is the inverse, and while a live company runs FlowWink in development it
    // is the only shape that is safe. See _shared/email-allowlist.ts.
    // The source travels with the decision: the risk this guard exists for is
    // mailing a real CUSTOMER, and a colleague invitation is not that.
    const gate = await filterRecipients(supabase, recipients,
      body?.source ?? body?.tags?.source ?? null);
    if (gate.blocked.length) {
      console.warn(`[email-send] allowlist withheld ${gate.blocked.length} recipient(s)`);
    }
    if (gate.allowed.length === 0) {
      await logComm({
        status: "blocked", provider: null, simulated: false,
        error_message: gate.error ?? `Blocked by email allowlist: ${gate.blocked.map((b) => b.address).join(", ")}`,
      });
      // 422, not 200. `supabase.functions.invoke` only populates `error` on a
      // non-2xx response, so a blocked send returned as 200 reads as delivered
      // to every caller that checks the transport error and not `data.success`
      // — and three of them do exactly that: dunning-processor records a
      // dunning action, document-sign-request stamps the request "sent", and
      // contract-billing-cron counts the reminder as gone out. Withholding the
      // mail and then letting the caller write "sent" is the same envelope lie
      // this guard exists to prevent, one layer up.
      //
      // The body is unchanged, so `blocked_by_allowlist` and the reason remain
      // readable via the FunctionsHttpError's response for callers that want to
      // distinguish "withheld" from "provider down".
      return new Response(JSON.stringify(blockedResponse(gate)),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    recipients = gate.allowed;

    // Suppression list check — skip suppressed recipients
    const lowered = recipients.map((r) => r.toLowerCase());
    const { data: suppRows } = await supabase
      .from("email_suppressions")
      .select("email, reason")
      .in("email", lowered);
    const suppressedSet = new Set((suppRows ?? []).map((r: any) => r.email));
    const allowed = recipients.filter((r) => !suppressedSet.has(r.toLowerCase()));
    if (allowed.length === 0) {
      const reasons = (suppRows ?? []).map((r: any) => `${r.email}:${r.reason}`).join(", ");
      await logComm({ status: "skipped", provider: null, simulated: false, error_message: `All recipients suppressed (${reasons})` });
      return new Response(JSON.stringify({ success: false, skipped: true, suppressed: Array.from(suppressedSet) }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    recipients = allowed;

    // Load email settings + integration toggles
    const { data: integ } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "integrations")
      .maybeSingle();

    const integrations = (integ?.value as any) ?? {};
    const resendCfg = integrations.resend ?? {};
    const smtpCfg = integrations.smtp ?? {};
    const composioCfg = integrations.composio ?? {};
    const resendEmailCfg = resendCfg.config?.emailConfig ?? {};
    const smtpEmailCfg = smtpCfg.config ?? {};
    const composioEmailCfg = composioCfg.config?.emailConfig ?? {};

    // explicit provider: per-call body.provider wins over the settings default
    const explicit: Provider | undefined =
      body.provider ||
      composioEmailCfg.provider ||
      resendEmailCfg.provider ||
      smtpEmailCfg.provider;
    const resendEnabled = resendCfg.enabled !== false && !!Deno.env.get("RESEND_API_KEY");
    // Host resolves env-then-config, exactly like port/secure/user below. It used to
    // be env-only, which made the one field that MUST differ per install the one the
    // admin card could not set — so a fully filled-in card still sent via Resend.
    // The password stays secret-only (SMTP_PASS); it is the only real secret here.
    const smtpHost = Deno.env.get("SMTP_HOST") || smtpEmailCfg.host || "";
    const smtpEnabled = smtpCfg.enabled === true && !!smtpHost;
    const composioEnabled = composioCfg.enabled === true && !!Deno.env.get("COMPOSIO_API_KEY");

    // Fallback order:
    //   reply-friendly (expects_reply or explicit=composio): Composio → SMTP → Resend
    //   default (transactional): Resend → SMTP → Composio
    const replyFriendly = body.expects_reply === true || explicit === "composio";
    const fallbackOrder: Provider[] = replyFriendly
      ? ["composio", "smtp", "resend"]
      : ["resend", "smtp", "composio"];
    const enabledMap = { resend: resendEnabled, smtp: smtpEnabled, composio: composioEnabled };

    let provider: Provider | null = null;
    if (explicit && enabledMap[explicit]) provider = explicit;
    else provider = fallbackOrder.find((p) => enabledMap[p]) ?? null;



    // SIMULATE MODE — no provider configured.
    // Mirrors the Stripe pattern: if no integration is wired up, we still
    // return success so workflows keep flowing. The send is logged with
    // simulated=true so admins can inspect what *would* have gone out.
    if (!provider) {
      await logComm({
        status: "simulated",
        provider: null,
        simulated: true,
        sent_at: new Date().toISOString(),
      });
      return new Response(
        JSON.stringify({
          success: true,
          simulated: true,
          provider: null,
          message: "No email provider configured — send logged as simulated.",
          recipients,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const activeCfg =
      provider === "resend" ? resendEmailCfg :
      provider === "composio" ? composioEmailCfg :
      smtpEmailCfg;
    let fromName: string = activeCfg.fromName || "FlowWink";
    let fromEmail: string =
      activeCfg.fromEmail ||
      Deno.env.get("SMTP_FROM") ||
      "noreply@example.com";
    let replyTo: string | undefined = body.replyTo;

    // Per-user sender override: if sender_user_id is supplied, look up that
    // user's personal email identity and use it as the From line. This is
    // how individual sellers send from their own address while still using
    // the workspace transport (Resend/SMTP/Composio).
    if (body.sender_user_id) {
      const { data: senderProfile } = await supabase
        .from("profiles")
        .select("email_from_address, email_from_name, email_reply_to, full_name, email")
        .eq("id", body.sender_user_id)
        .maybeSingle();
      if (senderProfile?.email_from_address) {
        fromEmail = senderProfile.email_from_address;
        fromName = senderProfile.email_from_name || senderProfile.full_name || fromName;
        replyTo = replyTo || senderProfile.email_reply_to || senderProfile.email_from_address;
      }
    }

    const from = body.fromOverride || `${fromName} <${fromEmail}>`;

    // Signature append — look up by sender_user_id, then by from-address
    if (!body.skip_signature) {
      let sigHtml: string | null = null;
      if (body.sender_user_id) {
        const { data: sig } = await supabase
          .from("email_signatures")
          .select("html")
          .eq("user_id", body.sender_user_id)
          .order("is_default", { ascending: false })
          .limit(1)
          .maybeSingle();
        sigHtml = sig?.html ?? null;
      }
      if (!sigHtml && fromEmail) {
        const { data: sig2 } = await supabase
          .from("email_signatures")
          .select("html")
          .ilike("from_address", fromEmail)
          .maybeSingle();
        sigHtml = sig2?.html ?? null;
      }
      if (sigHtml) {
        body.html = `${body.html}<div class="email-signature" style="margin-top:24px;color:#555;font-size:13px">${sigHtml}</div>`;
        if (body.text) body.text = `${body.text}\n\n--\n${sigHtml.replace(/<[^>]+>/g, "")}`;
      }
    }

    // Branded shell — applied here, after the signature, so the signature ends
    // up inside the frame. Runs LAST because it must see the final fragment.
    //
    // Only fragments get wrapped: a dozen callers (invoice_email, quote_email,
    // order_confirmation, contract-sign, …) already send complete documents
    // with their own header, and wrapping those would duplicate logo + footer.
    // `isFullDocument` makes that a property of the content, not a list of
    // caller names that would drift the moment someone adds a thirteenth.
    if (!body.skip_branding && !isFullDocument(body.html)) {
      try {
        const shell = await loadEmailShell(supabase);
        body.html = wrapInShell(body.html, shell);
      } catch (e) {
        // Branding is decoration; a settings hiccup must never block the send.
        console.error("[email-send] branding shell skipped:", e);
      }
    }

    let result: unknown;
    if (provider === "resend") {
      result = await sendViaResend({
        apiKey: Deno.env.get("RESEND_API_KEY")!,
        from,
        to: recipients,
        subject: body.subject,
        html: body.html,
        text: body.text,
        replyTo,
        tags: body.tags,
      });
    } else if (provider === "composio") {
      // Delegate to composio-proxy → Gmail OAuth send.
      // RFC 8058 headers ride along here too: GMAIL_SEND_EMAIL accepts
      // extra_headers (the proxy already uses it for threading), so cold
      // outreach sent from the company Gmail carries the same one-click
      // unsubscribe as the Resend/SMTP rails.
      // The proxy logs to outbound_communications itself with provider='composio',
      // so we skip our own logComm below to avoid duplicate rows. We MUST pass the
      // entity binding and source through, otherwise the outbound row is orphaned
      // in the CRM timeline and email_threads cannot resolve replies.
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const entityId = composioEmailCfg.entity_id || body.sender_user_id || "default";
      const proxyRes = await fetch(`${supabaseUrl}/functions/v1/composio-proxy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          action: "gmail_send",
          entity_id: entityId,
          related_entity_type: body.related_entity_type ?? null,
          related_entity_id: body.related_entity_id ?? null,
          source: body.source ?? body.tags?.source ?? null,
          tags: body.tags ?? {},
          params: {
            to: recipients.join(", "),
            subject: body.subject,
            extra_headers: recipients.length === 1 ? await unsubscribeHeaders(recipients[0]) : undefined,
            // Gmail send expects an HTML body — pass the html (proxy forwards as `body`).
            body: body.html,
            // This rail only ever sends rendered HTML, so say so rather than
            // leaning on the proxy's detection.
            is_html: true,
          },
        }),
      });
      const proxyJson = await proxyRes.json().catch(() => ({}));
      if (!proxyRes.ok) {
        throw new Error(`Composio Gmail send failed (${proxyRes.status}): ${proxyJson?.error ?? proxyRes.statusText}`);
      }
      result = proxyJson;
      // Skip duplicate log — composio-proxy already inserted the outbound_communications row.
      return new Response(
        JSON.stringify({ success: true, provider, simulated: false, result }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } else {
      const smtpConfig = smtpCfg.config ?? {};
      result = await sendViaSMTP({
        host: smtpHost,
        port: Number(Deno.env.get("SMTP_PORT") ?? smtpConfig.port ?? 587),
        secure:
          (Deno.env.get("SMTP_SECURE") ?? String(smtpConfig.secure ?? false)) === "true",
        user: Deno.env.get("SMTP_USER") ?? smtpConfig.user ?? "",
        pass: Deno.env.get("SMTP_PASS") ?? "",
        from,
        to: recipients,
        subject: body.subject,
        html: body.html,
        text: body.text,
        replyTo,
      });
    }

    await logComm({
      status: "sent",
      provider,
      simulated: false,
      sent_at: new Date().toISOString(),
    });

    return new Response(
      // A partial block still succeeds — some recipients got it — but the
      // caller has to be able to name the ones who did not. Without this, a
      // send to [customer, internal] reports plain success and the customer's
      // silence looks like theirs rather than ours.
      JSON.stringify({
        success: true, provider, simulated: false, result,
        ...(gate.blocked.length ? { withheld_by_allowlist: gate.blocked } : {}),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[email-send] error:", e);
    await logComm({
      status: "failed",
      provider: null,
      simulated: false,
      error_message: e?.message ?? String(e),
    });
    return new Response(
      JSON.stringify({ success: false, error: e?.message ?? String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
