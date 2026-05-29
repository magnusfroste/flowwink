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

type Provider = "smtp" | "resend";

interface SendBody {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  fromOverride?: string;     // "Name <addr@example.com>"
  replyTo?: string;
  tags?: Record<string, string>;
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
        source: body?.tags?.source ?? null,
        related_entity_type: body?.tags?.entity_type ?? null,
        related_entity_id: body?.tags?.entity_id ?? null,
        error_message: row.error_message ?? null,
        metadata: { tags: body?.tags ?? {}, from_override: body?.fromOverride ?? null },
        sent_at: row.sent_at ?? null,
      });
    } catch (e) {
      console.error("[email-send] failed to log outbound_communications:", e);
    }
  }

  try {
    body = (await req.json()) as SendBody;
    if (!body?.to || !body?.subject || !body?.html) {
      return new Response(
        JSON.stringify({ error: "to, subject, html are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    recipients = Array.isArray(body.to) ? body.to : [body.to];

    // Load email settings + integration toggles
    const { data: integ } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "integrations")
      .maybeSingle();

    const integrations = (integ?.value as any) ?? {};
    const resendCfg = integrations.resend ?? {};
    const smtpCfg = integrations.smtp ?? {};
    const resendEmailCfg = resendCfg.config?.emailConfig ?? {};
    const smtpEmailCfg = smtpCfg.config ?? {};

    const explicit: Provider | undefined =
      resendEmailCfg.provider || smtpEmailCfg.provider;
    const resendEnabled = resendCfg.enabled !== false && !!Deno.env.get("RESEND_API_KEY");
    const smtpEnabled = smtpCfg.enabled === true && !!Deno.env.get("SMTP_HOST");

    let provider: Provider | null = null;
    if (explicit === "smtp" && smtpEnabled) provider = "smtp";
    else if (explicit === "resend" && resendEnabled) provider = "resend";
    else if (resendEnabled) provider = "resend";
    else if (smtpEnabled) provider = "smtp";

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

    const activeCfg = provider === "resend" ? resendEmailCfg : smtpEmailCfg;
    const fromName = activeCfg.fromName || "FlowWink";
    const fromEmail =
      activeCfg.fromEmail ||
      Deno.env.get("SMTP_FROM") ||
      "noreply@example.com";
    const from = body.fromOverride || `${fromName} <${fromEmail}>`;

    let result: unknown;
    if (provider === "resend") {
      result = await sendViaResend({
        apiKey: Deno.env.get("RESEND_API_KEY")!,
        from,
        to: recipients,
        subject: body.subject,
        html: body.html,
        text: body.text,
        replyTo: body.replyTo,
        tags: body.tags,
      });
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
        replyTo: body.replyTo,
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
