import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from '../_shared/supabase-clients.ts';

/**
 * Twilio SMS channel adapter — inbound webhook + outbound send + test.
 *
 * Modes (selected by `?action=` query param):
 *  - default (no query): INBOUND Twilio Messaging webhook (application/x-www-form-urlencoded).
 *  - ?action=send: OUTBOUND from the Live Support UI after an admin posts a
 *    chat_messages row. Requires an admin JWT.
 *  - ?action=test: VERIFY credentials by calling Twilio API. Requires admin JWT.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-twilio-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);
  let action = url.searchParams.get("action");
  // Fallback: read action from JSON body for supabase.functions.invoke compatibility
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


async function loadTwilioConfig(supabase: ReturnType<typeof getServiceClient>) {
  const { data: settingRow } = await supabase
    .from("site_settings").select("value").eq("key", "integrations").maybeSingle();
  const cfg = ((settingRow?.value as any)?.twilio?.config) ?? {};
  return {
    fromNumber: (cfg.from_number as string) || Deno.env.get("TWILIO_FROM_NUMBER") || "",
  };
}

async function sendSms(to: string, from: string, body: string) {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const twilioKey = Deno.env.get("TWILIO_API_KEY");
  if (!lovableKey || !twilioKey) {
    throw new Error("Twilio not configured (LOVABLE_API_KEY/TWILIO_API_KEY missing)");
  }
  const resp = await fetch(`${GATEWAY_URL}/Messages.json`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": twilioKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error("[twilio-ingest] send failed", resp.status, data);
    throw new Error(`Twilio API ${resp.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

// ───────────────────────────────────────────── INBOUND (Twilio webhook)
async function handleIngest(req: Request): Promise<Response> {
  const supabase = getServiceClient();
  const { fromNumber } = await loadTwilioConfig(supabase);

  try {
    // Twilio posts application/x-www-form-urlencoded
    const form = await req.formData();
    const text = (form.get("Body") as string | null)?.toString() ?? "";
    const from = (form.get("From") as string | null)?.toString() ?? ""; // visitor's phone
    const to = (form.get("To") as string | null)?.toString() ?? "";     // your Twilio number
    const messageSid = (form.get("MessageSid") as string | null)?.toString() ?? "";

    if (!from || !text) {
      return twiml(""); // ack empty
    }

    const threadId = from; // E.164 visitor number is the thread key
    const fromName = from;

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
          visitor_profile: { sms_provider: "twilio", twilio_message_sid: messageSid, from, to },
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
      conversation_id: conversationId, role: "user", source: "sms", content: text,
      metadata: { twilio_message_sid: messageSid, from, to },
    });

    if (assignedAgent && (status === "with_agent" || status === "waiting_agent")) {
      return twiml(""); // human owns it — no AI reply
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
      const sendFrom = fromNumber || to; // prefer configured, fall back to recipient
      if (!sendFrom) {
        console.error("[twilio-ingest] no from_number configured and no To header");
      } else {
        try {
          await sendSms(from, sendFrom, reply);
        } catch (e: any) {
          console.error("[twilio-ingest] sendSms failed", e?.message ?? e);
        }
      }
    }

    return twiml(""); // ack — we send via REST, not TwiML, to keep parity with telegram-ingest
  } catch (err: any) {
    console.error("[twilio-ingest] error:", err?.message ?? err);
    return twiml("");
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
      .select("id, channel, channel_thread_id")
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

    const { fromNumber } = await loadTwilioConfig(supabase);
    if (!fromNumber) return json({ error: "twilio from_number not configured" }, 500);

    const data = await sendSms(conv.channel_thread_id, fromNumber, content);
    return json({ ok: true, twilio_message_sid: data?.sid ?? null });
  } catch (err: any) {
    console.error("[twilio-ingest:send] error", err?.message ?? err);
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
    const twilioKey = Deno.env.get("TWILIO_API_KEY");
    if (!lovableKey || !twilioKey) {
      return json({ error: "Twilio not configured (LOVABLE_API_KEY/TWILIO_API_KEY missing)" }, 400);
    }

    // Lightweight credential check: list incoming phone numbers (max 1)
    const resp = await fetch(`${GATEWAY_URL}/IncomingPhoneNumbers.json?PageSize=1`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": twilioKey,
      },
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("[twilio-ingest:test] Twilio API error", resp.status, data);
      return json({
        error: `Twilio API returned ${resp.status}`,
        details: data?.message || data?.error || JSON.stringify(data),
      }, 502);
    }

    const numbers = data?.incoming_phone_numbers ?? [];
    return json({
      ok: true,
      connected: true,
      numbers_found: numbers.length,
      first_number: numbers[0]?.phone_number ?? null,
    });
  } catch (err: any) {
    console.error("[twilio-ingest:test] error", err?.message ?? err);
    return json({ error: err?.message ?? "internal error" }, 500);
  }
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function twiml(xml: string) {
  // Empty <Response/> tells Twilio we handled it without an auto-reply.
  const body = `<?xml version="1.0" encoding="UTF-8"?><Response>${xml}</Response>`;
  return new Response(body, {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "text/xml" },
  });
}
