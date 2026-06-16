import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from '../_shared/supabase-clients.ts';

/**
 * GatewayAPI SMS channel adapter — inbound webhook + outbound send + test.
 *
 * Modes (selected by `?action=` query param):
 *  - default (no query): INBOUND GatewayAPI webhook (application/json).
 *  - ?action=send: OUTBOUND from the Live Support UI after an admin posts a
 *    chat_messages row. Requires an admin JWT.
 *  - ?action=test: VERIFY credentials by calling GatewayAPI API. Requires admin JWT.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/gatewayapi";
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);
  let action = url.searchParams.get("action");
  if (!action && req.method === "POST") {
    try {
      const body = await req.clone().json();
      action = body?.action ?? null;
    } catch { /* not JSON or no action field */ }
  }
  if (action === "send") return handleSend(req);
  if (action === "test") return handleTest(req);
  return handleIngest(req);
});

async function loadGatewayapiConfig(supabase: ReturnType<typeof getServiceClient>) {
  const { data: settingRow } = await supabase
    .from("site_settings").select("value").eq("key", "integrations").maybeSingle();
  const cfg = ((settingRow?.value as any)?.gatewayapi?.config) ?? {};
  return {
    senderId: (cfg.sender_id as string) || "Flowwink",
    keyword: (cfg.keyword as string) || "",
  };
}

async function sendSms(to: string, senderId: string, body: string) {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const gatewayKey = Deno.env.get("GATEWAYAPI_API_KEY");
  if (!lovableKey || !gatewayKey) {
    throw new Error("GatewayAPI not configured (LOVABLE_API_KEY/GATEWAYAPI_API_KEY missing)");
  }

  // Normalize recipient: GatewayAPI expects MSISDN as integer without leading +
  const recipient = to.replace(/^\+/, "").replace(/\D/g, "");
  if (!recipient) {
    throw new Error("Invalid recipient number");
  }

  const resp = await fetch(`${GATEWAY_URL}/mobile/single`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": gatewayKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: senderId,
      recipient: parseInt(recipient, 10),
      message: body,
    }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error("[gatewayapi-ingest] send failed", resp.status, data);
    throw new Error(`GatewayAPI ${resp.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

// ───────────────────────────────────────────── INBOUND (GatewayAPI webhook)
async function handleIngest(req: Request): Promise<Response> {
  const supabase = getServiceClient();
  const { senderId, keyword } = await loadGatewayapiConfig(supabase);

  try {
    const payload = await req.json().catch(() => ({} as any));
    const text = (payload?.message as string) ?? "";
    const from = (payload?.sender as string) ?? "";
    const to = (payload?.receiver as string) ?? "";
    const msgId = (payload?.id as string) ?? "";
    const msgKeyword = (payload?.keyword as string) ?? "";

    if (!from || !text) {
      return json({ ok: true, note: "empty message" });
    }

    // Normalize phone number to E.164 for consistency
    const normalizedFrom = from.startsWith("+") ? from : `+${from}`;
    const threadId = normalizedFrom;
    const fromName = normalizedFrom;

    // Strip keyword from message if present
    let cleanText = text;
    if (msgKeyword || keyword) {
      const kw = msgKeyword || keyword;
      const regex = new RegExp(`^\\s*${kw}\\s+`, "i");
      cleanText = text.replace(regex, "").trim();
    }

    const { data: existing } = await supabase
      .from("chat_conversations")
      .select("id, conversation_status, assigned_agent_id")
      .eq("channel", "sms").eq("channel_thread_id", threadId)
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
          channel: "sms", channel_thread_id: threadId,
          customer_name: fromName, scope: "visitor", conversation_status: "waiting_agent",
          title: `SMS · ${fromName}`,
          visitor_profile: { sms_provider: "gatewayapi", gatewayapi_message_id: msgId, from: normalizedFrom, to, keyword: msgKeyword },
        })
        .select("id").single();
      if (insErr) throw insErr;
      conversationId = created.id;
      status = "waiting_agent";
    } else if (status === "active") {
      await supabase
        .from("chat_conversations")
        .update({ conversation_status: "waiting_agent", updated_at: new Date().toISOString() })
        .eq("id", conversationId);
      status = "waiting_agent";
    }

    await supabase.from("chat_messages").insert({
      conversation_id: conversationId, role: "user", source: "sms", content: cleanText,
      metadata: { gatewayapi_message_id: msgId, from: normalizedFrom, to, keyword: msgKeyword },
    });

    if (assignedAgent && (status === "with_agent" || status === "waiting_agent")) {
      return json({ ok: true, note: "human agent assigned" });
    }

    const aiResp = await fetch(`${supabaseUrl}/functions/v1/chat-completion`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
        "apikey": serviceKey,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: cleanText }],
        conversationId, sessionId: `sms:${threadId}`,
      }),
    });

    const contentType = aiResp.headers.get("content-type") || "";
    let reply: string | undefined;
    let aiData: any = {};

    if (contentType.includes("text/event-stream")) {
      const raw = await aiResp.text();
      let acc = "";
      for (const line of raw.split("\n")) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const obj = JSON.parse(payload);
          const delta = obj?.choices?.[0]?.delta?.content
            ?? obj?.choices?.[0]?.message?.content
            ?? "";
          if (typeof delta === "string") acc += delta;
        } catch { /* ignore */ }
      }
      reply = acc.trim() || undefined;
    } else {
      aiData = await aiResp.json().catch(() => ({}));
      reply = aiData?.message || aiData?.content || aiData?.reply;
    }

    if (!reply && aiData?.skipped) {
      reply = aiData?.agents_online
        ? "Thanks — an agent will respond here shortly."
        : "Thanks for your message. Our team is currently offline; we'll get back to you as soon as we're back.";
    }

    if (reply && conversationId && !aiData?.skipped) {
      await supabase.from("chat_messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        source: "ai",
        content: reply,
      });
    }

    if (reply) {
      try {
        await sendSms(normalizedFrom, senderId, reply);
      } catch (e: any) {
        console.error("[gatewayapi-ingest] sendSms failed", e?.message ?? e);
      }
    }

    return json({ ok: true });
  } catch (err: any) {
    console.error("[gatewayapi-ingest] error:", err?.message ?? err);
    return json({ error: err?.message ?? "internal error" }, 500);
  }
}

// ───────────────────────────────────────────── OUTBOUND (admin → SMS)
async function handleSend(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "missing bearer token" }, 401);

    const supabase = getServiceClient();
    const { data: userData, error: userErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const { data: hasAdmin } = await supabase.rpc("has_role", {
      _user_id: userData.user.id, _role: "admin",
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
      .select("id, channel, channel_thread_id, metadata")
      .eq("id", conversationId).maybeSingle();
    if (convErr || !conv) return json({ error: "conversation not found" }, 404);
    if (conv.channel !== "sms") return json({ ok: true, skipped: "not sms" });
    if (!conv.channel_thread_id) return json({ error: "missing channel_thread_id" }, 400);

    if (!content && body.message_id) {
      const { data: msg } = await supabase
        .from("chat_messages").select("content").eq("id", body.message_id).maybeSingle();
      content = msg?.content ?? undefined;
    }
    if (!content || !content.trim()) return json({ error: "no content" }, 400);

    const { senderId } = await loadGatewayapiConfig(supabase);
    const data = await sendSms(conv.channel_thread_id, senderId, content);
    return json({ ok: true, gatewayapi_message_id: data?.ids?.[0] ?? null });
  } catch (err: any) {
    console.error("[gatewayapi-ingest:send] error", err?.message ?? err);
    return json({ error: err?.message ?? "internal error" }, 500);
  }
}

// ───────────────────────────────────────────── TEST (verify credentials)
async function handleTest(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "missing bearer token" }, 401);

    const supabase = getServiceClient();
    const { data: userData, error: userErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const { data: hasAdmin } = await supabase.rpc("has_role", {
      _user_id: userData.user.id, _role: "admin",
    });
    if (!hasAdmin) return json({ error: "forbidden" }, 403);

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const gatewayKey = Deno.env.get("GATEWAYAPI_API_KEY");
    if (!lovableKey || !gatewayKey) {
      return json({ error: "GatewayAPI not configured (LOVABLE_API_KEY/GATEWAYAPI_API_KEY missing)" }, 400);
    }

    // Lightweight credential check: GET account info (via gateway)
    const resp = await fetch(`${GATEWAY_URL}/account`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": gatewayKey,
      },
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("[gatewayapi-ingest:test] GatewayAPI error", resp.status, data);
      return json({
        error: `GatewayAPI returned ${resp.status}`,
        details: data?.message || data?.error || JSON.stringify(data),
      }, 502);
    }

    return json({
      ok: true,
      connected: true,
      account_id: data?.id ?? null,
      credit: data?.credit ?? null,
    });
  } catch (err: any) {
    console.error("[gatewayapi-ingest:test] error", err?.message ?? err);
    return json({ error: err?.message ?? "internal error" }, 500);
  }
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
