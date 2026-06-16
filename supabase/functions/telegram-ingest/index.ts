import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from '../_shared/supabase-clients.ts';

/**
 * Telegram Ingest — inbound channel adapter (Contact Center, Fas 1).
 *
 * Telegram's Bot API delivers updates to this webhook. It normalizes the message into the
 * EXISTING conversation hub (chat_conversations + chat_messages) — channel='telegram',
 * channel_thread_id=<telegram chat id> — so a Telegram chat is just another thread in the
 * same inbox. If a human agent has taken the conversation, we store the inbound message and
 * stop (the agent answers from the inbox); otherwise FlowPilot (chat-completion) replies and
 * we send that reply back via the Telegram sendMessage API.
 *
 * Deploy with --no-verify-jwt: Telegram cannot present a Supabase JWT. Authenticity is
 * verified via the X-Telegram-Bot-Api-Secret-Token header (set when the webhook is registered
 * by manage_channel), compared against site_settings.integrations.telegram.config.webhook_secret.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = getServiceClient();

  // Telegram config (bot token + webhook secret) lives in site_settings.integrations.
  const { data: settingRow } = await supabase
    .from("site_settings").select("value").eq("key", "integrations").maybeSingle();
  const tgConfig = ((settingRow?.value as any)?.telegram?.config) ?? {};
  const botToken: string = tgConfig.bot_token || Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
  const webhookSecret: string = tgConfig.webhook_secret || Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "";

  // Verify the webhook secret Telegram echoes back (set at registration time).
  if (webhookSecret) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== webhookSecret) {
      console.error("[telegram-ingest] secret mismatch");
      return json({ ok: false, error: "unauthorized" }, 401);
    }
  }

  try {
    const update = await req.json();
    const msg = update?.message ?? update?.edited_message;
    const text: string | undefined = msg?.text;
    const chatId = msg?.chat?.id;
    if (!chatId || !text) {
      // Non-text update (sticker, join, etc.) — ack so Telegram stops retrying.
      return json({ ok: true, skipped: "no text message" }, 200);
    }

    const threadId = String(chatId);
    const fromName = [msg?.from?.first_name, msg?.from?.last_name].filter(Boolean).join(" ")
      || msg?.from?.username || "Telegram user";

    // Find an open conversation for this Telegram thread, else create one.
    const { data: existing } = await supabase
      .from("chat_conversations")
      .select("id, conversation_status, assigned_agent_id")
      .eq("channel", "telegram").eq("channel_thread_id", threadId)
      .neq("conversation_status", "closed")
      .order("created_at", { ascending: false })
      .limit(1).maybeSingle();

    let conversationId = existing?.id as string | undefined;
    let status = existing?.conversation_status as string | undefined;
    let assignedAgent = existing?.assigned_agent_id as string | undefined;

    if (!conversationId) {
      const { data: created, error: insErr } = await supabase
        .from("chat_conversations")
        .insert({
          channel: "telegram", channel_thread_id: threadId,
          customer_name: fromName, scope: "visitor", conversation_status: "active",
          title: `Telegram · ${fromName}`,
        })
        .select("id").single();
      if (insErr) throw insErr;
      conversationId = created.id;
    }

    // Persist the inbound message.
    await supabase.from("chat_messages").insert({
      conversation_id: conversationId, role: "user", source: "telegram", content: text,
      metadata: { telegram_message_id: msg?.message_id, from: msg?.from },
    });

    // If a human agent owns the conversation, don't let FlowPilot answer — the agent replies
    // from the inbox. (Agent→Telegram outbound is wired via send_channel_message; see notes.)
    if (assignedAgent && (status === "with_agent" || status === "waiting_agent")) {
      return json({ ok: true, queued_for_agent: true }, 200);
    }

    // FlowPilot answers via the same endpoint the web widget uses.
    const aiResp = await fetch(`${supabaseUrl}/functions/v1/chat-completion`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
        "apikey": serviceKey,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: text }],
        conversationId, sessionId: `telegram:${threadId}`,
      }),
    });
    const aiData = await aiResp.json().catch(() => ({}));
    const reply: string | undefined = aiData?.message || aiData?.content || aiData?.reply;

    if (reply && botToken) {
      await sendTelegram(botToken, chatId, reply);
    }
    return json({ ok: true, replied: !!reply }, 200);
  } catch (err: any) {
    console.error("[telegram-ingest] error:", err?.message ?? err);
    // Always 200 to Telegram to avoid a retry storm; surface the error in the body.
    return json({ ok: false, error: err?.message ?? "error" }, 200);
  }
});

async function sendTelegram(botToken: string, chatId: number | string, text: string) {
  const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!resp.ok) console.error("[telegram-ingest] sendMessage failed:", resp.status, await resp.text());
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
