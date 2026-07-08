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
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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
  // logging hints
  source?: string;
  related_entity_type?: string;
  related_entity_id?: string;
  extra_metadata?: Record<string, unknown>;
}

function renderTemplate(input: string, vars: Record<string, string> = {}): string {
  return input.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, k) => vars[k] ?? "");
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
      html: args.html,
      text: args.text,
      reply_to: args.replyTo,
      tags: args.tags
        ? Object.entries(args.tags).map(([name, value]) => ({ name, value }))
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
    await client.send({
      from: args.from,
      to: args.to,
      subject: args.subject,
      content: args.text ?? "Please view this email in an HTML-capable client.",
      html: args.html,
      replyTo: args.replyTo,
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
    recipients = Array.isArray(body.to) ? body.to : [body.to];

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
    const smtpEnabled = smtpCfg.enabled === true && !!Deno.env.get("SMTP_HOST");
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
      // The proxy logs to outbound_communications itself with provider='composio',
      // so we skip our own logComm below to avoid duplicate rows.
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
          params: {
            to: recipients.join(", "),
            subject: body.subject,
            // Gmail send expects an HTML body — pass the html (proxy forwards as `body`).
            body: body.html,
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
        host: Deno.env.get("SMTP_HOST")!,
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
      JSON.stringify({ success: true, provider, simulated: false, result }),
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
