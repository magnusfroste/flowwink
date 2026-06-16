import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from "../_shared/supabase-clients.ts";

/**
 * telegram-send — outbound channel adapter. Called from the Live Support UI after a
 * human agent inserts a chat_messages row in a telegram-channel conversation, so the
 * agent's reply actually arrives in the visitor's Telegram chat.
 *
 * Auth: caller must be an authenticated admin. We use the user's JWT to verify role,
 * then use the service-role client to read the bot token from site_settings.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SendPayload {
  conversation_id?: string;
  message_id?: string;
  content?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "missing bearer token" }, 401);

    const supabase = getServiceClient();

    // Verify caller is an admin
    const { data: userData, error: userErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const { data: hasAdmin } = await supabase.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!hasAdmin) return json({ error: "forbidden" }, 403);

    const body = (await req.json().catch(() => ({}))) as SendPayload;
    const conversationId = body.conversation_id;
    let content = body.content;
    if (!conversationId) return json({ error: "conversation_id required" }, 400);

    // Look up conversation channel info
    const { data: conv, error: convErr } = await supabase
      .from("chat_conversations")
      .select("id, channel, channel_thread_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (convErr || !conv) return json({ error: "conversation not found" }, 404);
    if (conv.channel !== "telegram") return json({ ok: true, skipped: "not telegram" });
    if (!conv.channel_thread_id) return json({ error: "missing channel_thread_id" }, 400);

    // If content not provided, pull the latest agent message
    if (!content && body.message_id) {
      const { data: msg } = await supabase
        .from("chat_messages")
        .select("content")
        .eq("id", body.message_id)
        .maybeSingle();
      content = msg?.content ?? undefined;
    }
    if (!content || !content.trim()) return json({ error: "no content" }, 400);

    // Load bot token from site_settings.integrations
    const { data: settingRow } = await supabase
      .from("site_settings").select("value").eq("key", "integrations").maybeSingle();
    const tgConfig = ((settingRow?.value as any)?.telegram?.config) ?? {};
    const botToken: string = tgConfig.bot_token || Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
    if (!botToken) return json({ error: "telegram bot token not configured" }, 500);

    const tgResp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: conv.channel_thread_id, text: content }),
    });
    const tgData = await tgResp.json().catch(() => ({}));
    if (!tgResp.ok || tgData?.ok === false) {
      console.error("[telegram-send] failed", tgResp.status, tgData);
      return json({ error: "telegram api failed", status: tgResp.status, telegram: tgData }, 502);
    }

    return json({ ok: true, telegram_message_id: tgData?.result?.message_id ?? null });
  } catch (err: any) {
    console.error("[telegram-send] error", err?.message ?? err);
    return json({ error: err?.message ?? "internal error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
