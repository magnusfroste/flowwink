/**
 * voice-ingest — provider-agnostisk callback-handler + AI-receptionist-brygga.
 *
 * 1) POST /  ← 46elks/Twilio call-webhook. Returnerar voice-action JSON.
 * 2) WS  /stream?call_id=...  ← 46elks Realtime Voice <-> Gemini Live.
 *    Ingen separat edge function — håller voice-modulen i en fil.
 *
 * AI-receptionisten är default AV. Slås på i /admin/voice → Settings.
 * Faller alltid tillbaka till voicemail om Gemini misslyckas eller om
 * modulen är av.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type ProviderId = "elks46" | "twilio";

interface NormalizedCall {
  provider: ProviderId;
  providerCallId: string;
  from: string;
  to: string;
  event: "start" | "answered" | "hangup" | "recording_ready" | "dtmf" | "no_answer";
  recordingUrl?: string;
  recordingDurationSeconds?: number;
  dtmf?: string;
  raw: Record<string, unknown>;
}

type VoiceAction =
  | { type: "connect"; target: string; callerId?: string; timeoutSeconds?: number }
  | { type: "sip"; target: string; callerId?: string; timeoutSeconds?: number }
  | { type: "play"; url: string; next?: string }
  | { type: "record"; next?: string; maxLengthSeconds?: number }
  | { type: "stream"; wsUrl: string }
  | { type: "hangup" };

interface VoiceSettings {
  provider?: ProviderId | null;
  voicemailGreetingUrl?: string;
  aiReceptionistEnabled?: boolean;
  aiReceptionistGreeting?: string;
  aiReceptionistSystemPromptExtra?: string;
  aiReceptionistUseFlowpilotContext?: boolean;
  aiReceptionistVoice?: string;
  /**
   * 46elks WebSocket-number (E.164). Måste vara ett separat nummer som är
   * konfigurerat i 46elks dashboard med `voice_start=wss://<project>.functions.supabase.co/voice-ingest/stream`.
   * Det publika DID:t bryggar in samtalet hit via `{connect: <wsNum>}`.
   */
  aiReceptionistWebsocketNumber?: string;
}

// ── Provider adapters ────────────────────────────────────────────────────────

function parseElks46(body: FormData | Record<string, unknown>): NormalizedCall | null {
  const get = (k: string): string | undefined => {
    if (body instanceof FormData) return body.get(k)?.toString();
    const v = (body as Record<string, unknown>)[k];
    return typeof v === "string" ? v : undefined;
  };
  const callid = get("callid");
  const from = get("from");
  const to = get("to");
  if (!callid || !from || !to) return null;

  let event: NormalizedCall["event"] = "start";
  const result = get("result");
  const recordingUrl = get("recording_url") ?? get("recording");
  if (recordingUrl) event = "recording_ready";
  else if (result === "hangup" || result === "failed") event = "hangup";
  else if (result === "noanswer" || result === "busy") event = "no_answer";
  else if (result === "answered") event = "answered";
  else if (get("dtmf") || get("digits")) event = "dtmf";

  const raw: Record<string, unknown> = {};
  if (body instanceof FormData) {
    body.forEach((v, k) => { raw[k] = v.toString(); });
  } else Object.assign(raw, body);

  return {
    provider: "elks46",
    providerCallId: callid,
    from,
    to,
    event,
    recordingUrl,
    recordingDurationSeconds: get("duration") ? parseInt(get("duration")!, 10) : undefined,
    dtmf: get("dtmf") ?? get("digits"),
    raw,
  };
}

function serializeElks46(action: VoiceAction): { body: string; contentType: string } {
  let payload: Record<string, unknown>;
  switch (action.type) {
    case "connect":
      payload = {
        connect: action.target,
        ...(action.callerId ? { callerid: action.callerId } : {}),
        ...(action.timeoutSeconds ? { timeout: action.timeoutSeconds } : {}),
      };
      break;
    case "sip":
      payload = {
        connect: action.target.startsWith("sip:") ? action.target : `sip:${action.target}`,
        ...(action.callerId ? { callerid: action.callerId } : {}),
      };
      break;
    case "play":
      payload = { play: action.url, ...(action.next ? { next: action.next } : {}) };
      break;
    case "record":
      payload = {
        record: "true",
        ...(action.maxLengthSeconds ? { maxlength: action.maxLengthSeconds } : {}),
        ...(action.next ? { next: action.next } : {}),
      };
      break;
    case "stream":
      // 46elks Realtime Voice API: a `stream` action does NOT exist as JSON.
      // We must bridge the public DID to a 46elks **websocket-number** which
      // has its own `voice_start=wss://...` configured in the 46elks dashboard.
      // The bridging itself is just a normal connect to that DID.
      payload = { connect: action.wsUrl };
      break;
    case "hangup":
      payload = { hangup: "true" };
      break;
  }
  return { body: JSON.stringify(payload), contentType: "application/json" };
}

function parseIncoming(provider: ProviderId, body: FormData | Record<string, unknown>): NormalizedCall | null {
  if (provider === "elks46") return parseElks46(body);
  return null;
}

function serializeAction(provider: ProviderId, action: VoiceAction) {
  if (provider === "elks46") return serializeElks46(action);
  return { body: `<?xml version="1.0"?><Response><Hangup/></Response>`, contentType: "application/xml" };
}

// ── Routing decision ─────────────────────────────────────────────────────────

async function loadVoiceSettings(supabase: ReturnType<typeof createClient>): Promise<VoiceSettings> {
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "voice")
    .maybeSingle();
  return ((data?.value as VoiceSettings | null) ?? {});
}

interface RoutingContext {
  supabase: ReturnType<typeof createClient>;
  call: NormalizedCall;
  settings: VoiceSettings;
}

async function decideAction(ctx: RoutingContext): Promise<VoiceAction> {
  const { supabase, call, settings } = ctx;

  if (call.event === "start") {
    // 1. Try human agent
    const { data: agents } = await supabase
      .from("support_agents")
      .select("id, voice_sip_uri, voice_mobile_number, voice_enabled, status")
      .eq("voice_enabled", true)
      .in("status", ["online", "away"])
      .limit(1);

    const agent = agents?.[0];
    if (agent?.voice_sip_uri) {
      return { type: "sip", target: `sip:${agent.voice_sip_uri}`, callerId: call.from, timeoutSeconds: 25 };
    }
    if (agent?.voice_mobile_number) {
      return { type: "connect", target: agent.voice_mobile_number, callerId: call.from, timeoutSeconds: 25 };
    }

    // 2. No agent → AI receptionist if enabled and Gemini key + WS-number present
    if (settings.aiReceptionistEnabled && Deno.env.get("GEMINI_API_KEY")) {
      const wsNum = (settings.aiReceptionistWebsocketNumber ?? "").trim();
      if (wsNum) {
        // Bridge the public DID into the 46elks websocket-number. That number
        // must have voice_start=wss://<project>.functions.supabase.co/voice-ingest/stream
        // configured in the 46elks dashboard (one-time setup).
        return { type: "stream", wsUrl: wsNum };
      }
      console.warn("[voice-ingest] AI receptionist enabled but no websocket-number configured — falling back to voicemail");
    }

    // 3. Fallback voicemail
    return {
      type: "play",
      url: settings.voicemailGreetingUrl ?? "https://flowwink.lovable.app/audio/voicemail-greeting.mp3",
      next: buildSelfUrl(`?stage=record&provider=${call.provider}`),
    };
  }

  if (call.event === "no_answer" || call.event === "hangup") return { type: "hangup" };
  return { type: "hangup" };
}

function buildSelfUrl(qs: string): string {
  const base = Deno.env.get("SUPABASE_URL");
  return `${base}/functions/v1/voice-ingest${qs}`;
}

// ── Persistence ──────────────────────────────────────────────────────────────

async function persistCall(
  supabase: ReturnType<typeof createClient>,
  call: NormalizedCall,
  action: VoiceAction,
) {
  const now = new Date().toISOString();

  if (call.event === "start") {
    await supabase.from("voice_calls").upsert(
      {
        provider: call.provider,
        provider_call_id: call.providerCallId,
        direction: "inbound",
        status: "ringing",
        from_number: call.from,
        to_number: call.to,
        started_at: now,
        ai_handled: action.type === "stream",
        metadata: { initial_action: action, raw: call.raw },
      },
      { onConflict: "provider,provider_call_id" },
    );
    return;
  }

  if (call.event === "answered") {
    await supabase.from("voice_calls").update({ status: "answered", answered_at: now })
      .eq("provider", call.provider).eq("provider_call_id", call.providerCallId);
    return;
  }

  if (call.event === "hangup" || call.event === "no_answer") {
    const { data: existing } = await supabase
      .from("voice_calls")
      .select("status, started_at, answered_at, ai_handled")
      .eq("provider", call.provider).eq("provider_call_id", call.providerCallId)
      .maybeSingle();

    const wasAnswered = !!existing?.answered_at || existing?.ai_handled;
    const finalStatus = wasAnswered ? "completed"
      : call.event === "no_answer" ? "missed"
      : existing?.status === "voicemail" ? "voicemail" : "missed";

    await supabase.from("voice_calls").update({
      status: finalStatus,
      ended_at: now,
      duration_seconds: call.recordingDurationSeconds,
      callback_status: finalStatus === "missed" ? "pending" : "none",
    }).eq("provider", call.provider).eq("provider_call_id", call.providerCallId);
    return;
  }

  if (call.event === "recording_ready") {
    await supabase.from("voice_calls").update({
      status: "voicemail",
      voicemail: true,
      recording_url: call.recordingUrl,
      recording_duration_seconds: call.recordingDurationSeconds,
      callback_status: "pending",
    }).eq("provider", call.provider).eq("provider_call_id", call.providerCallId);
  }
}

// ── AI Receptionist: Gemini Live bridge ──────────────────────────────────────
// 46elks Realtime Voice starts with a `hello` message and requires us to
// negotiate both directions before any audio is exchanged. We ask 46elks for
// caller audio as raw PCM16 16 kHz (exactly what Gemini Live wants) and tell
// 46elks that we will send Gemini's native PCM16 24 kHz audio back.

// Half-cascade live model — supports audio in/out + function calling reliably.
// The `native-audio` preview models reject audio when tools are declared
// (WS closes with code 1007 "CONTENT_TYPE_AUDIO not supported").
const GEMINI_LIVE_MODEL = Deno.env.get("GEMINI_LIVE_MODEL") ?? "models/gemini-2.0-flash-live-001";
const GEMINI_LIVE_WS = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

async function websocketDataToString(data: unknown): Promise<string> {
  if (typeof data === "string") return data;
  if (data instanceof Blob) return await data.text();
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  return String(data ?? "");
}

async function buildSystemPrompt(
  supabase: ReturnType<typeof createClient>,
  settings: VoiceSettings,
  fromNumber: string,
): Promise<string> {
  // Business identity (works whether FlowPilot is on or off).
  const { data: bi } = await supabase
    .from("site_settings").select("value").eq("key", "business_identity").maybeSingle();
  const identity = (bi?.value ?? {}) as Record<string, unknown>;
  const name = (identity.company_name as string) ?? (identity.name as string) ?? "this business";
  const tone = (identity.tone as string) ?? "friendly, concise, professional";

  // Optional FlowPilot context (only if module is enabled).
  let pilotContext = "";
  if (settings.aiReceptionistUseFlowpilotContext) {
    const { data: site } = await supabase
      .from("site_settings").select("value").eq("key", "modules").maybeSingle();
    const modules = (site?.value ?? {}) as Record<string, boolean>;
    if (modules.flowpilot) {
      const { data: objs } = await supabase
        .from("agent_objectives").select("title, description").eq("status", "active").limit(5);
      if (objs?.length) {
        pilotContext = "\n\nActive business objectives (use only as soft guidance):\n" +
          objs.map((o) => `- ${o.title}: ${o.description ?? ""}`).join("\n");
      }
    }
  }

  const greeting = settings.aiReceptionistGreeting
    ?? `Hej, du har ringt ${name}. Alla våra medarbetare är upptagna just nu — hur kan jag hjälpa dig?`;

  return [
    `You are the AI receptionist for ${name}. Respond in the same language the caller speaks (Swedish or English).`,
    `Tone: ${tone}.`,
    `Open the conversation with: "${greeting}"`,
    `Keep responses short — this is a phone call. One or two sentences at a time.`,
    `The caller's phone number is ${fromNumber}. You may reference it if useful (e.g. for callbacks).`,
    `If the caller asks to speak to a human, call the escalate_to_human tool.`,
    `If the caller wants to book, change or cancel an appointment, use the booking tools.`,
    `Never invent appointment times, prices, or policies. Use tools or say you'll have someone call back.`,
    settings.aiReceptionistSystemPromptExtra ? `\nAdditional instructions:\n${settings.aiReceptionistSystemPromptExtra}` : "",
    pilotContext,
  ].filter(Boolean).join("\n");
}

// Minimal tool set for MVP — uses skill names that exist in agent_skills.
// Gemini Live calls them; we dispatch to agent-execute.
const AI_TOOLS = [
  {
    name: "escalate_to_human",
    description: "Connect the caller to a live human agent immediately. Use when caller asks for a person, is frustrated, or the request is outside what you can handle.",
    parameters: { type: "object", properties: { reason: { type: "string" } } },
  },
  {
    name: "list_available_slots",
    description: "List free booking slots for the next N days. Use when caller wants to book an appointment.",
    parameters: {
      type: "object",
      properties: {
        service_id: { type: "string", description: "Optional booking_services UUID" },
        days_ahead: { type: "number", description: "Default 7" },
      },
    },
  },
  {
    name: "book_appointment",
    description: "Create a booking for the caller at a specific time slot.",
    parameters: {
      type: "object",
      properties: {
        service_id: { type: "string" },
        starts_at: { type: "string", description: "ISO timestamp" },
        customer_name: { type: "string" },
        customer_phone: { type: "string" },
        notes: { type: "string" },
      },
      required: ["starts_at"],
    },
  },
  {
    name: "lookup_customer_by_phone",
    description: "Find an existing customer/lead by phone number. Call this early to personalize the conversation.",
    parameters: {
      type: "object",
      properties: { phone: { type: "string" } },
      required: ["phone"],
    },
  },
];

async function executeSkill(
  supabase: ReturnType<typeof createClient>,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (name === "escalate_to_human") {
    return { escalated: true, message: "Connecting you to a human agent now." };
  }
  // Dispatch via agent-execute — it knows enabled modules + alias mapping.
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/agent-execute`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ skill: name, arguments: args, source: "voice-ai" }),
    });
    if (!res.ok) return { error: `Tool failed: ${res.status}` };
    return await res.json();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function handleStreamSession(req: Request): Promise<Response> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return new Response("GEMINI_API_KEY missing", { status: 503 });

  const url = new URL(req.url);
  const provider = (url.searchParams.get("provider") ?? "elks46") as ProviderId;
  let providerCallId = url.searchParams.get("call_id") ?? "unknown";

  const { socket: caller, response } = Deno.upgradeWebSocket(req);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let gemini: WebSocket | null = null;
  let fromNumber = "";
  let toNumber = "";
  let geminiSetupComplete = false;
  const pendingCallerAudio: string[] = [];
  const transcript: Array<{ role: string; text: string; ts: string }> = [];
  let assistantBuffer = "";
  let userBuffer = "";

  const flushTranscript = async (final = false) => {
    if (transcript.length === 0 && !final) return;
    if (!providerCallId || providerCallId === "unknown") return;
    await supabase.from("voice_calls").update({
      live_transcript: transcript as unknown as object,
      ...(final ? { ai_summary: assistantBuffer.slice(-500) || null } : {}),
    }).eq("provider", provider).eq("provider_call_id", providerCallId);
  };

  const sendGeminiAudio = (pcm16kBase64: string) => {
    if (!gemini || gemini.readyState !== WebSocket.OPEN || !geminiSetupComplete) {
      pendingCallerAudio.push(pcm16kBase64);
      // Do not let a caller speaking during setup create unbounded memory growth.
      if (pendingCallerAudio.length > 200) pendingCallerAudio.shift();
      return;
    }
    gemini.send(JSON.stringify({
      realtimeInput: {
        audio: { data: pcm16kBase64, mimeType: "audio/pcm;rate=16000" },
      },
    }));
  };

  const flushPendingCallerAudio = () => {
    while (pendingCallerAudio.length) sendGeminiAudio(pendingCallerAudio.shift()!);
  };

  const upsertRealtimeCall = async () => {
    if (!providerCallId || providerCallId === "unknown") return;
    await supabase.from("voice_calls").upsert(
      {
        provider,
        provider_call_id: providerCallId,
        direction: "inbound",
        status: "answered",
        from_number: fromNumber || "unknown",
        to_number: toNumber || "unknown",
        answered_at: new Date().toISOString(),
        ai_handled: true,
        metadata: {
          realtime_bridge: "46elks-gemini-live",
          negotiated_input_format: "pcm_16000",
          negotiated_output_format: "pcm_24000",
        },
      },
      { onConflict: "provider,provider_call_id" },
    );
  };

  const connectGemini = async () => {
    // Prefer metadata from 46elks `hello`; fall back to a stored call row when
    // the stream URL includes call_id (useful for local tests).
    if (!fromNumber && providerCallId && providerCallId !== "unknown") {
      const { data: callRow } = await supabase
        .from("voice_calls").select("from_number").eq("provider", provider)
        .eq("provider_call_id", providerCallId).maybeSingle();
      fromNumber = (callRow?.from_number as string) ?? "";
    }

    const settings = await loadVoiceSettings(supabase);
    const systemPrompt = await buildSystemPrompt(supabase, settings, fromNumber);

    console.log("[voice-ai-bridge] connecting Gemini Live", { providerCallId, fromNumber });
    gemini = new WebSocket(`${GEMINI_LIVE_WS}?key=${apiKey}`);
    gemini.onopen = () => {
      const setup = {
        setup: {
          model: GEMINI_LIVE_MODEL,
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: settings.aiReceptionistVoice ?? "Aoede" },
              },
            },
          },
          systemInstruction: { parts: [{ text: systemPrompt }] },
          tools: [{ functionDeclarations: AI_TOOLS }],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      };
      gemini!.send(JSON.stringify(setup));
    };

    gemini.onmessage = async (ev) => {
      try {
        const msg = JSON.parse(await websocketDataToString(ev.data));

        if (msg.setupComplete) {
          geminiSetupComplete = true;
          console.log("[voice-ai-bridge] Gemini setup complete", { providerCallId });
          // Gemini does not always speak just because the system prompt contains
          // a greeting. Trigger one short initial turn so the caller immediately
          // hears the receptionist after the bridge is established.
          gemini!.send(JSON.stringify({
            realtimeInput: {
              text: "The phone call is now connected. Greet the caller once and ask how you can help.",
            },
          }));
          flushPendingCallerAudio();
          return;
        }

        // Tool call from model
        if (msg.toolCall?.functionCalls) {
          const results = [];
          for (const fc of msg.toolCall.functionCalls) {
            const result = await executeSkill(supabase, fc.name, fc.args ?? {});
            results.push({ id: fc.id, name: fc.name, response: { result } });

            if (fc.name === "escalate_to_human") {
              // Tell caller side to hang up the AI WS so 46elks can complete the call;
              // future: send a re-route signal. MVP: just close after responding.
              setTimeout(() => { try { caller.close(); } catch { /* noop */ } }, 1500);
            }
          }
          gemini!.send(JSON.stringify({ toolResponse: { functionResponses: results } }));
          return;
        }

        // Transcripts
        const inT = msg.serverContent?.inputTranscription?.text;
        if (inT) userBuffer += inT;
        const outT = msg.serverContent?.outputTranscription?.text;
        if (outT) assistantBuffer += outT;

        const turnComplete = msg.serverContent?.turnComplete;
        if (turnComplete) {
          const now = new Date().toISOString();
          if (userBuffer.trim()) {
            transcript.push({ role: "user", text: userBuffer.trim(), ts: now });
            userBuffer = "";
          }
          if (assistantBuffer.trim()) {
            transcript.push({ role: "assistant", text: assistantBuffer.trim(), ts: now });
            assistantBuffer = "";
          }
          await flushTranscript();
        }

        // Audio output → re-encode and forward to 46elks
        const parts = msg.serverContent?.modelTurn?.parts ?? [];
        for (const p of parts) {
          const inlineData = p.inlineData ?? p.inline_data;
          if (inlineData?.data && (inlineData.mimeType ?? inlineData.mime_type ?? "").includes("audio")) {
            // Gemini Live audio output is raw PCM16 24 kHz by default. We
            // negotiated `sending: pcm_24000` with 46elks, so forward as-is.
            caller.send(JSON.stringify({ t: "audio", data: inlineData.data }));
          }
        }
      } catch (e) {
        console.error("[voice-ai-bridge] gemini message error", e);
      }
    };

    gemini.onerror = (e) => console.error("[voice-ai-bridge] gemini ws error", e);
    gemini.onclose = (e) => {
      console.warn("[voice-ai-bridge] gemini ws closed", { code: e.code, reason: e.reason });
      try { caller.close(); } catch { /* noop */ }
    };
  };

  caller.onopen = () => {
    console.log("[voice-ai-bridge] 46elks websocket connected");
  };

  caller.onmessage = async (ev) => {
    try {
      const data = typeof ev.data === "string" ? JSON.parse(ev.data) : null;
      if (!data?.t) return;

      if (data.t === "hello") {
        providerCallId = typeof data.callid === "string" ? data.callid : providerCallId;
        fromNumber = typeof data.from === "string" ? data.from : fromNumber;
        toNumber = typeof data.to === "string" ? data.to : toNumber;
        console.log("[voice-ai-bridge] 46elks hello", { providerCallId, fromNumber, toNumber });

        caller.send(JSON.stringify({ t: "listening", format: "pcm_16000" }));
        caller.send(JSON.stringify({ t: "sending", format: "pcm_24000" }));

        await upsertRealtimeCall();
        connectGemini().catch((e) => console.error("[voice-ai-bridge] setup failed", e));
        return;
      }

      if (data.t === "audio" && typeof data.data === "string") {
        // Because we negotiated `listening: pcm_16000`, this is already raw
        // PCM16 16 kHz base64 and can be sent directly to Gemini Live.
        sendGeminiAudio(data.data);
        return;
      }

      if (data.t === "bye") {
        console.log("[voice-ai-bridge] 46elks bye", { providerCallId, reason: data.reason, message: data.message });
        try { gemini?.close(); } catch { /* noop */ }
        return;
      }
    } catch (e) {
      console.error("[voice-ai-bridge] caller msg parse error", e);
    }
  };

  caller.onclose = async () => {
    try { gemini?.close(); } catch { /* noop */ }
    await flushTranscript(true);
    if (providerCallId && providerCallId !== "unknown") {
      await supabase.from("voice_calls").update({
        status: "completed",
        ended_at: new Date().toISOString(),
      }).eq("provider", provider).eq("provider_call_id", providerCallId);
    }
  };

  caller.onerror = (e) => console.error("[voice-ai-bridge] caller ws error", e);

  return response;
}

// ── HTTP entrypoint ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);

  // WebSocket upgrade for AI bridge
  if (url.pathname.endsWith("/stream") && req.headers.get("upgrade")?.toLowerCase() === "websocket") {
    return await handleStreamSession(req);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const providerHint = (url.searchParams.get("provider") as ProviderId | null) ?? "elks46";

    const ct = req.headers.get("content-type") ?? "";
    let body: FormData | Record<string, unknown>;
    if (ct.includes("application/json")) body = await req.json();
    else body = await req.formData();

    const call = parseIncoming(providerHint, body);
    if (!call) {
      return new Response(JSON.stringify({ error: "unrecognized voice payload" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const settings = await loadVoiceSettings(supabase);
    const action = await decideAction({ supabase, call, settings });
    await persistCall(supabase, call, action);

    const serialized = serializeAction(providerHint, action);
    return new Response(serialized.body, {
      status: 200, headers: { ...corsHeaders, "Content-Type": serialized.contentType },
    });
  } catch (err) {
    console.error("[voice-ingest] error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
