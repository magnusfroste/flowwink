import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from '../_shared/supabase-clients.ts';

/**
 * Telegram channel adapter — consolidated inbound + outbound.
 *
 * Two modes (selected by `?action=send` query param):
 *  - default (no query): INBOUND webhook from Telegram Bot API. Verifies the
 *    X-Telegram-Bot-Api-Secret-Token header, normalizes the update into the
 *    chat_conversations/chat_messages inbox (channel='telegram'), and if no
 *    human agent owns the thread, lets FlowPilot reply via chat-completion.
 *  - ?action=send: OUTBOUND from the Live Support UI after an admin posts a
 *    chat_messages row. Requires an admin JWT; relays the message back to the
 *    visitor's Telegram chat via sendMessage.
 *
 * Deploy with --no-verify-jwt (Telegram cannot present a Supabase JWT; the send
 * branch validates the bearer token itself).
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  if (action === "send") return handleSend(req);
  if (action === "offline") return handleAgentOffline(req);
  return handleIngest(req);
});

// ───────────────────────────────────────────── AGENT OFFLINE (multi-channel handoff)
async function handleAgentOffline(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "missing bearer token" }, 401);

    const supabase = getServiceClient();
    const { data: userData, error: userErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const userId = userData.user.id;

    // chat_conversations.assigned_agent_id stores support_agents.id (PK), NOT auth user_id.
    const { data: agentRow } = await supabase
      .from("support_agents").select("id").eq("user_id", userId).maybeSingle();
    if (!agentRow?.id) {
      return json({ ok: true, released_count: 0, note: "no support_agents row" });
    }

    const { data: released, error: rpcErr } = await supabase
      .rpc("release_agent_conversations", { p_agent_id: agentRow.id });
    if (rpcErr) {
      console.error("[telegram-ingest:offline] rpc failed", rpcErr);
      return json({ error: rpcErr.message }, 500);
    }

    const conversations = (released ?? []) as Array<{
      conversation_id: string;
      channel: string | null;
      channel_thread_id: string | null;
      customer_name: string | null;
    }>;

    const { data: settingRow } = await supabase
      .from("site_settings").select("value").eq("key", "integrations").maybeSingle();
    const tgConfig = ((settingRow?.value as any)?.telegram?.config) ?? {};
    const botToken: string = tgConfig.bot_token || Deno.env.get("TELEGRAM_BOT_TOKEN") || "";

    const handoffText =
      "Our support agent just stepped away — you're back in the queue. " +
      "I'll keep an eye on this and the next available agent will jump in. " +
      "If you'd prefer a callback at a specific time, just let me know.";

    const dispatched: Array<{ id: string; channel: string | null; ok: boolean; note?: string }> = [];

    for (const c of conversations) {
      await supabase.from("chat_messages").insert({
        conversation_id: c.conversation_id,
        role: "assistant",
        source: "system",
        content: handoffText,
        metadata: { event: "agent_offline_handoff", channel: c.channel },
      });

      if (c.channel === "telegram" && c.channel_thread_id && botToken) {
        try {
          await sendTelegram(botToken, c.channel_thread_id, handoffText);
          dispatched.push({ id: c.conversation_id, channel: c.channel, ok: true });
        } catch (e: any) {
          dispatched.push({ id: c.conversation_id, channel: c.channel, ok: false, note: e?.message });
        }
      } else if (c.channel === "voice") {
        // TODO: booking integration — offer a callback slot via booking module.
        dispatched.push({ id: c.conversation_id, channel: c.channel, ok: true, note: "voice: callback TBD (booking)" });
      } else {
        dispatched.push({ id: c.conversation_id, channel: c.channel, ok: true, note: "web: surfaced via realtime" });
      }
    }

    return json({ ok: true, released_count: conversations.length, dispatched });
  } catch (err: any) {
    console.error("[telegram-ingest:offline] error", err?.message ?? err);
    return json({ error: err?.message ?? "internal error" }, 500);
  }
}


// ───────────────────────────────────────────── INBOUND (Telegram webhook)
async function handleIngest(req: Request): Promise<Response> {
  const supabase = getServiceClient();

  const { data: settingRow } = await supabase
    .from("site_settings").select("value").eq("key", "integrations").maybeSingle();
  const tgConfig = ((settingRow?.value as any)?.telegram?.config) ?? {};
  const botToken: string = tgConfig.bot_token || Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
  const webhookSecret: string = tgConfig.webhook_secret || Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "";

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
      return json({ ok: true, skipped: "no text message" }, 200);
    }

    const threadId = String(chatId);
    const fromName = [msg?.from?.first_name, msg?.from?.last_name].filter(Boolean).join(" ")
      || msg?.from?.username || "Telegram user";

    const { data: existing } = await supabase
      .from("chat_conversations")
      .select("id, conversation_status, assigned_agent_id")
      .eq("channel", "telegram").eq("channel_thread_id", threadId)
      .neq("conversation_status", "closed")
      .order("created_at", { ascending: false })
      .limit(1).maybeSingle();

    let conversationId = existing?.id as string | undefined;
    let status = existing?.conversation_status as string | undefined;
    const assignedAgent = existing?.assigned_agent_id as string | undefined;

    if (!conversationId) {
      const { data: created, error: insErr } = await supabase
        .from("chat_conversations")
        .insert({
          channel: "telegram", channel_thread_id: threadId,
          customer_name: fromName, scope: "visitor", conversation_status: "waiting_agent",
          title: `Telegram · ${fromName}`,
        })
        .select("id").single();
      if (insErr) throw insErr;
      conversationId = created.id;
      status = "waiting_agent";
    } else if (status === "active") {
      const { error: updateErr } = await supabase
        .from("chat_conversations")
        .update({ conversation_status: "waiting_agent", updated_at: new Date().toISOString() })
        .eq("id", conversationId);
      if (updateErr) throw updateErr;
      status = "waiting_agent";
    }

    await supabase.from("chat_messages").insert({
      conversation_id: conversationId, role: "user", source: "telegram", content: text,
      metadata: { telegram_message_id: msg?.message_id, from: msg?.from },
    });

    if (assignedAgent && (status === "with_agent" || status === "waiting_agent")) {
      return json({ ok: true, queued_for_agent: true }, 200);
    }

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
    let reply: string | undefined = aiData?.message || aiData?.content || aiData?.reply;

    // If chat-completion skipped (routing_mode=human_*), surface the handoff note over Telegram
    if (!reply && aiData?.skipped) {
      reply = aiData?.agents_online
        ? 'Thanks — an agent will respond here shortly.'
        : 'Thanks for your message. Our team is currently offline; we\'ll get back to you as soon as we\'re back.';
    }

    if (reply && botToken) {
      await sendTelegram(botToken, chatId, reply);
    }
    return json({ ok: true, replied: !!reply, skipped: !!aiData?.skipped }, 200);
  } catch (err: any) {
    console.error("[telegram-ingest] error:", err?.message ?? err);
    return json({ ok: false, error: err?.message ?? "error" }, 200);
  }
}

// ───────────────────────────────────────────── OUTBOUND (admin → Telegram)
async function handleSend(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "missing bearer token" }, 401);

    const supabase = getServiceClient();

    const { data: userData, error: userErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const { data: hasAdmin } = await supabase.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!hasAdmin) return json({ error: "forbidden" }, 403);

    const body = (await req.json().catch(() => ({}))) as {
      conversation_id?: string; message_id?: string; content?: string;
    };
    const conversationId = body.conversation_id;
    let content = body.content;
    if (!conversationId) return json({ error: "conversation_id required" }, 400);

    const { data: conv, error: convErr } = await supabase
      .from("chat_conversations")
      .select("id, channel, channel_thread_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (convErr || !conv) return json({ error: "conversation not found" }, 404);
    if (conv.channel !== "telegram") return json({ ok: true, skipped: "not telegram" });
    if (!conv.channel_thread_id) return json({ error: "missing channel_thread_id" }, 400);

    if (!content && body.message_id) {
      const { data: msg } = await supabase
        .from("chat_messages")
        .select("content")
        .eq("id", body.message_id)
        .maybeSingle();
      content = msg?.content ?? undefined;
    }
    if (!content || !content.trim()) return json({ error: "no content" }, 400);

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
      console.error("[telegram-ingest:send] failed", tgResp.status, tgData);
      return json({ error: "telegram api failed", status: tgResp.status, telegram: tgData }, 502);
    }

    return json({ ok: true, telegram_message_id: tgData?.result?.message_id ?? null });
  } catch (err: any) {
    console.error("[telegram-ingest:send] error", err?.message ?? err);
    return json({ error: err?.message ?? "internal error" }, 500);
  }
}

async function sendTelegram(botToken: string, chatId: number | string, text: string) {
  const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!resp.ok) console.error("[telegram-ingest] sendMessage failed:", resp.status, await resp.text());
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
