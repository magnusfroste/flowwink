import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from '../_shared/supabase-clients.ts';

/**
 * 46elks adapter — SMS + Voice for Swedish/European numbers.
 *
 * Modes (selected by `?action=` query param):
 *  - default: INBOUND webhook (application/x-www-form-urlencoded from 46elks)
 *      - SMS: from/to/message/id
 *      - Voice: from/to/callid/direction (returns JSON dial-plan)
 *  - ?action=send: OUTBOUND SMS from admin UI (requires admin JWT)
 *  - ?action=call: OUTBOUND voice call kick-off (requires admin JWT)
 *  - ?action=test: VERIFY credentials by calling GET /a1/Me (requires admin JWT)
 *
 * Auth: 46elks uses HTTP Basic with username:password.
 *   - ELKS46_API_USERNAME  (looks like  "uXXXXXXXXXXXXXXXXXXXX")
 *   - ELKS46_API_PASSWORD  (looks like  "pXXXXXXXXXXXXXXXXXXXX")
 *
 * NOTE: 46elks has NO Lovable connector yet — we call api.46elks.com directly
 * (server-to-server, EU-hosted, no region blocking).
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const ELKS_BASE = "https://api.46elks.com/a1";
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);
  let action = url.searchParams.get("action");
  if (!action && req.method === "POST") {
    try {
      const ct = req.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const body = await req.clone().json();
        action = body?.action ?? null;
      }
    } catch { /* not JSON */ }
  }
  if (action === "send") return handleSend(req);
  if (action === "call") return handleCall(req);
  if (action === "test") return handleTest(req);
  if (action === "set_voice_start") return handleSetVoiceStart(req);
  return handleIngest(req);
});

function basicAuthHeader(): string {
  const u = Deno.env.get("ELKS46_API_USERNAME");
  const p = Deno.env.get("ELKS46_API_PASSWORD");
  if (!u || !p) throw new Error("46elks not configured (ELKS46_API_USERNAME/ELKS46_API_PASSWORD missing)");
  return "Basic " + btoa(`${u}:${p}`);
}

async function loadElks46Config(supabase: ReturnType<typeof getServiceClient>) {
  const { data: settingRow } = await supabase
    .from("site_settings").select("value").eq("key", "integrations").maybeSingle();
  const cfg = ((settingRow?.value as any)?.elks46?.config) ?? {};
  return {
    fromNumber: (cfg.from_number as string) || "",
    voiceWebhookUrl: (cfg.voice_webhook_url as string) || "",
  };
}

async function sendSms(to: string, from: string, message: string) {
  const auth = basicAuthHeader();
  if (!from) throw new Error("Missing sender (configure from_number in site_settings.elks46.config)");
  const body = new URLSearchParams({ from, to, message });
  const resp = await fetch(`${ELKS_BASE}/SMS`, {
    method: "POST",
    headers: {
      "Authorization": auth,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error("[elks46-ingest] send failed", resp.status, data);
    throw new Error(`46elks ${resp.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function startCall(to: string, from: string, voiceStart: string) {
  const auth = basicAuthHeader();
  if (!from) throw new Error("Missing caller number (configure from_number)");
  if (!voiceStart) throw new Error("Missing voice_start URL");
  const body = new URLSearchParams({ from, to, voice_start: voiceStart });
  const resp = await fetch(`${ELKS_BASE}/Calls`, {
    method: "POST",
    headers: { "Authorization": auth, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`46elks ${resp.status}: ${JSON.stringify(data)}`);
  return data;
}

function normalizePhone(value: string): string {
  if (!value) return "";
  return value.startsWith("+") ? value : `+${value}`;
}

function paramsToRecord(params: URLSearchParams): Record<string, string> {
  const raw: Record<string, string> = {};
  params.forEach((value, key) => { raw[key] = value; });
  return raw;
}

function parseIntParam(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseActionsResult(value: string | null): string | null {
  if (!value) return null;
  try {
    const actions = JSON.parse(value);
    if (!Array.isArray(actions) || actions.length === 0) return null;
    const last = actions[actions.length - 1] as Record<string, unknown>;
    const result = last?.result ?? last?.why;
    return typeof result === "string" ? result : null;
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────── INBOUND (webhook from 46elks)
async function handleIngest(req: Request): Promise<Response> {
  const supabase = getServiceClient();

  try {
    // 46elks posts application/x-www-form-urlencoded
    const ct = req.headers.get("content-type") || "";
    let params: URLSearchParams;
    if (ct.includes("application/json")) {
      const j = await req.json().catch(() => ({}));
      params = new URLSearchParams(Object.entries(j).reduce((acc, [k, v]) => {
        acc[k] = String(v ?? ""); return acc;
      }, {} as Record<string, string>));
    } else {
      const raw = await req.text();
      params = new URLSearchParams(raw);
    }

    const direction = params.get("direction") ?? "incoming";
    const from = params.get("from") ?? "";
    const to = params.get("to") ?? "";
    const message = params.get("message") ?? "";
    const id = params.get("id") ?? "";
    const callid = params.get("callid") || id;

    // ── Voice call inbound: return JSON dial-plan ─────────────────────────
    if (callid && !message) {
      const normalizedFrom = normalizePhone(from);
      const normalizedTo = normalizePhone(to);
      const raw = paramsToRecord(params);
      const result = params.get("result");
      const state = params.get("state");
      const actionResult = parseActionsResult(params.get("actions"));
      const durationSeconds = parseIntParam(params.get("duration"));
      const terminalSignal = Boolean(state || params.get("actions") || params.get("start") || params.get("duration"))
        || ["hangup", "failed", "busy", "noanswer", "no_answer", "success", "answered"].includes(result ?? "");

      if (terminalSignal && result !== "newincoming") {
        const { data: existing } = await supabase
          .from("voice_calls")
          .select("status, started_at, answered_at, metadata")
          .eq("provider", "elks46")
          .eq("provider_call_id", callid)
          .maybeSingle();

        const now = new Date().toISOString();
        const answeredAt = existing?.answered_at
          ?? params.get("start")
          ?? (["answered", "success"].includes(result ?? "") || state === "success" || actionResult === "success" ? now : null);
        const failureSignal = state === "busy" || state === "failed" || ["busy", "failed", "noanswer", "no_answer"].includes(result ?? "")
          || ["busy", "failed", "noanswer", "no_answer"].includes(actionResult ?? "");
        const finalStatus = failureSignal
          ? (state === "busy" || result === "busy" || actionResult === "busy" ? "busy" : "missed")
          : (answeredAt ? "completed" : "missed");

        const previousMetadata = (existing?.metadata && typeof existing.metadata === "object") ? existing.metadata : {};
        const { error: updateErr } = await supabase
          .from("voice_calls")
          .update({
            status: finalStatus,
            answered_at: answeredAt,
            ended_at: now,
            duration_seconds: durationSeconds,
            callback_status: finalStatus === "completed" ? "none" : "pending",
            metadata: { ...previousMetadata, final_event: { raw, result, state, actionResult } },
          })
          .eq("provider", "elks46")
          .eq("provider_call_id", callid);
        if (updateErr) console.warn("[elks46-ingest] voice status update failed", updateErr.message);
        return new Response(JSON.stringify({ hangup: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: agents, error: agentErr } = await supabase
        .from("support_agents")
        .select("id, voice_sip_uri, voice_mobile_number, voice_enabled, status")
        .eq("voice_enabled", true)
        .in("status", ["online", "away"])
        .limit(10);
      if (agentErr) console.warn("[elks46-ingest] voice agent lookup failed", agentErr.message);
      const agent = (agents ?? []).find((a: any) => a.voice_sip_uri || a.voice_mobile_number) as any | undefined;

      // Log incoming call for visibility
      let conversationId: string | null = null;
      try {
        const { data: conversation } = await supabase.from("chat_conversations").insert({
          channel: "voice",
          channel_thread_id: normalizedFrom || callid,
          customer_name: normalizedFrom || "Unknown caller",
          scope: "visitor",
          conversation_status: agent ? "with_agent" : "closed",
          title: `Voice · ${normalizedFrom || callid}`,
          visitor_profile: { sms_provider: "elks46", elks46_callid: callid, from: normalizedFrom, to: normalizedTo },
        }).select("id").maybeSingle();
        conversationId = conversation?.id ?? null;
      } catch (e) { console.warn("[elks46-ingest] voice log skipped", (e as Error)?.message); }

      const target = agent?.voice_sip_uri
        ? (String(agent.voice_sip_uri).startsWith("sip:") ? agent.voice_sip_uri : `sip:${agent.voice_sip_uri}`)
        : agent?.voice_mobile_number;
      const selfUrl = `${supabaseUrl}/functions/v1/elks46-ingest`;
      const status = target ? "ringing" : "missed";
      const reply = target
        ? { connect: target, callerid: normalizedFrom || from, timeout: 25, next: selfUrl, whenhangup: selfUrl }
        : { play: "https://api.46elks.com/static/sounds/welcome-sv.mp3", next: { hangup: "reject" }, whenhangup: selfUrl };

      const { error: callErr } = await supabase.from("voice_calls").upsert(
        {
          provider: "elks46",
          provider_call_id: callid,
          direction: "inbound",
          status,
          from_number: normalizedFrom || from || "unknown",
          to_number: normalizedTo || to || "unknown",
          agent_id: agent?.id ?? null,
          conversation_id: conversationId,
          started_at: new Date().toISOString(),
          callback_status: target ? "none" : "pending",
          metadata: { initial_action: reply, raw },
        },
        { onConflict: "provider,provider_call_id" },
      );
      if (callErr) console.warn("[elks46-ingest] voice call upsert failed", callErr.message);
      return new Response(JSON.stringify(reply), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── SMS inbound ────────────────────────────────────────────────────────
    if (!from || !message) return json({ ok: true, note: "empty payload" });

    const normalizedFrom = from.startsWith("+") ? from : `+${from}`;
    const threadId = normalizedFrom;
    const fromName = normalizedFrom;

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
          visitor_profile: { sms_provider: "elks46", elks46_message_id: id, from: normalizedFrom, to, direction },
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
      conversation_id: conversationId, role: "user", source: "sms", content: message,
      metadata: { elks46_message_id: id, from: normalizedFrom, to },
    });

    if (assignedAgent && (status === "with_agent" || status === "waiting_agent")) {
      return json({ ok: true, note: "human agent assigned" });
    }

    // Hand off to FlowPilot for AI reply
    const aiResp = await fetch(`${supabaseUrl}/functions/v1/chat-completion`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
        "apikey": serviceKey,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: message }],
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
            ?? obj?.choices?.[0]?.message?.content ?? "";
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
        conversation_id: conversationId, role: "assistant", source: "ai", content: reply,
      });
    }

    if (reply) {
      try {
        const { fromNumber } = await loadElks46Config(supabase);
        await sendSms(normalizedFrom, fromNumber || to, reply);
      } catch (e: any) {
        console.error("[elks46-ingest] sendSms failed", e?.message ?? e);
      }
    }

    return json({ ok: true });
  } catch (err: any) {
    console.error("[elks46-ingest] error:", err?.message ?? err);
    return json({ error: err?.message ?? "internal error" }, 500);
  }
}

// ───────────────────────────────────────────── OUTBOUND SMS (admin → 46elks)
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
      .select("id, channel, channel_thread_id, visitor_profile")
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

    const { fromNumber } = await loadElks46Config(supabase);
    const profile = (conv.visitor_profile as any) || {};
    const from = fromNumber || profile.to || "";
    const data = await sendSms(conv.channel_thread_id, from, content);
    return json({ ok: true, elks46_message_id: data?.id ?? null });
  } catch (err: any) {
    console.error("[elks46-ingest:send] error", err?.message ?? err);
    return json({ error: err?.message ?? "internal error" }, 500);
  }
}

// ───────────────────────────────────────────── OUTBOUND voice call
async function handleCall(req: Request): Promise<Response> {
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
      to?: string; voice_start?: string;
    };
    if (!body.to) return json({ error: "to required" }, 400);

    const { fromNumber, voiceWebhookUrl } = await loadElks46Config(supabase);
    const voiceStart = body.voice_start || voiceWebhookUrl
      || `${supabaseUrl}/functions/v1/elks46-ingest`;
    const data = await startCall(body.to, fromNumber, voiceStart);
    return json({ ok: true, callid: data?.callid ?? null, raw: data });
  } catch (err: any) {
    console.error("[elks46-ingest:call] error", err?.message ?? err);
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

    let auth: string;
    try { auth = basicAuthHeader(); }
    catch (e: any) { return json({ error: e?.message ?? "not configured" }, 400); }

    // GET /a1/Me returns account metadata
    const meResp = await fetch(`${ELKS_BASE}/Me`, { headers: { Authorization: auth } });
    const meData = await meResp.json().catch(() => ({}));
    if (!meResp.ok) {
      return json({
        error: `46elks returned ${meResp.status}`,
        details: (meData as any)?.message || JSON.stringify(meData),
      }, 502);
    }

    // Also count numbers for nicer UX
    const numResp = await fetch(`${ELKS_BASE}/Numbers?active=yes`, { headers: { Authorization: auth } });
    const numData = await numResp.json().catch(() => ({}));
    const numbers = Array.isArray((numData as any)?.data) ? (numData as any).data : [];

    return json({
      ok: true,
      connected: true,
      account_id: (meData as any)?.id ?? null,
      currency: (meData as any)?.currency ?? null,
      balance: (meData as any)?.balance ?? null,
      numbers_found: numbers.length,
      numbers: numbers.slice(0, 20).map((n: any) => ({
        id: n.id,
        number: n.number,
        country: n.country,
        capabilities: n.capabilities,
        sms_url: n.sms_url ?? null,
        voice_start: n.voice_start ?? null,
      })),
    });
  } catch (err: any) {
    console.error("[elks46-ingest:test] error", err?.message ?? err);
    return json({ error: err?.message ?? "internal error" }, 500);
  }
}

// ───────────────────────────────────────────── Set voice_start (and optionally sms_url) on a number
async function handleSetVoiceStart(req: Request): Promise<Response> {
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
      number_id?: string;
      voice_start?: string;
      sms_url?: string;
      also_sms?: boolean;
    };
    if (!body.number_id) return json({ error: "number_id required" }, 400);

    const ingestUrl = `${supabaseUrl}/functions/v1/elks46-ingest`;
    const voiceStart = body.voice_start || ingestUrl;
    const smsUrl = body.sms_url || (body.also_sms ? ingestUrl : undefined);

    let auth: string;
    try { auth = basicAuthHeader(); }
    catch (e: any) { return json({ error: e?.message ?? "not configured" }, 400); }

    const form = new URLSearchParams({ voice_start: voiceStart });
    if (smsUrl) form.set("sms_url", smsUrl);

    const resp = await fetch(`${ELKS_BASE}/Numbers/${encodeURIComponent(body.number_id)}`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return json({ error: `46elks ${resp.status}`, details: (data as any)?.message || JSON.stringify(data) }, 502);
    }
    return json({
      ok: true,
      number: (data as any)?.number,
      voice_start: (data as any)?.voice_start,
      sms_url: (data as any)?.sms_url,
    });
  } catch (err: any) {
    console.error("[elks46-ingest:set_voice_start] error", err?.message ?? err);
    return json({ error: err?.message ?? "internal error" }, 500);
  }
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
