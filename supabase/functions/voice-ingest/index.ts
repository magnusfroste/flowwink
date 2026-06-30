/**
 * voice-ingest — provider-agnostisk callback-handler + AI-receptionist-brygga.
 *
 * 1) POST /  ← 46elks/Twilio call-webhook. Returnerar voice-action JSON.
 * 2) WS  /stream?call_id=...  ← 46elks media stream <-> Gemini Live.
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

    // 2. No agent → AI receptionist if enabled and Gemini key present
    if (settings.aiReceptionistEnabled && Deno.env.get("GEMINI_API_KEY")) {
      const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/^https?:\/\//, "wss://");
      const wsUrl = `${base}/functions/v1/voice-ingest/stream?provider=${call.provider}&call_id=${encodeURIComponent(call.providerCallId)}`;
      return { type: "stream", wsUrl };
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
// 46elks Media Streams sends µ-law 8kHz base64 audio frames in JSON envelopes.
// Gemini Live wants 16-bit PCM 16kHz in. We do minimal MVP: pass µ-law through
// after upsampling to 16kHz PCM with a naive linear interpolation. Good enough
// for speech; we can swap to a proper resampler later.

const GEMINI_LIVE_MODEL = "models/gemini-2.0-flash-live-001";
const GEMINI_LIVE_WS = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

// µ-law decode table → PCM16
function mulawToPcm16(byte: number): number {
  byte = ~byte & 0xff;
  const sign = byte & 0x80;
  const exponent = (byte >> 4) & 0x07;
  const mantissa = byte & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  return sign ? -sample : sample;
}

function pcm16ToMulaw(sample: number): number {
  const BIAS = 0x84;
  const CLIP = 32635;
  let sign = (sample >> 8) & 0x80;
  if (sign) sample = -sample;
  if (sample > CLIP) sample = CLIP;
  sample += BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return (~(sign | (exponent << 4) | mantissa)) & 0xff;
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function encodeBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

// µ-law 8kHz bytes → PCM16 16kHz bytes (LE). Naive linear upsample x2.
function mulaw8kToPcm16k(mulaw: Uint8Array): Uint8Array {
  const pcm8 = new Int16Array(mulaw.length);
  for (let i = 0; i < mulaw.length; i++) pcm8[i] = mulawToPcm16(mulaw[i]);
  const pcm16 = new Int16Array(pcm8.length * 2);
  for (let i = 0; i < pcm8.length; i++) {
    const a = pcm8[i];
    const b = i + 1 < pcm8.length ? pcm8[i + 1] : a;
    pcm16[i * 2] = a;
    pcm16[i * 2 + 1] = (a + b) >> 1;
  }
  const out = new Uint8Array(pcm16.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < pcm16.length; i++) view.setInt16(i * 2, pcm16[i], true);
  return out;
}

// PCM16 24kHz LE (Gemini default output) → µ-law 8kHz (decimate by 3).
function pcm16k24ToMulaw8k(pcm: Uint8Array): Uint8Array {
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const sampleCount = Math.floor(pcm.byteLength / 2);
  const outLen = Math.floor(sampleCount / 3);
  const out = new Uint8Array(outLen);
  for (let i = 0; i < outLen; i++) out[i] = pcm16ToMulaw(view.getInt16(i * 3 * 2, true));
  return out;
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
  const providerCallId = url.searchParams.get("call_id") ?? "unknown";

  const { socket: caller, response } = Deno.upgradeWebSocket(req);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let gemini: WebSocket | null = null;
  let fromNumber = "";
  const transcript: Array<{ role: string; text: string; ts: string }> = [];
  let assistantBuffer = "";
  let userBuffer = "";

  const flushTranscript = async (final = false) => {
    if (transcript.length === 0 && !final) return;
    await supabase.from("voice_calls").update({
      live_transcript: transcript as unknown as object,
      ...(final ? { ai_summary: assistantBuffer.slice(-500) || null } : {}),
    }).eq("provider", provider).eq("provider_call_id", providerCallId);
  };

  const connectGemini = async () => {
    // Look up call row for from_number
    const { data: callRow } = await supabase
      .from("voice_calls").select("from_number").eq("provider", provider)
      .eq("provider_call_id", providerCallId).maybeSingle();
    fromNumber = (callRow?.from_number as string) ?? "";

    const settings = await loadVoiceSettings(supabase);
    const systemPrompt = await buildSystemPrompt(supabase, settings, fromNumber);

    gemini = new WebSocket(`${GEMINI_LIVE_WS}?key=${apiKey}`);
    gemini.onopen = () => {
      const setup = {
        setup: {
          model: GEMINI_LIVE_MODEL,
          generation_config: {
            response_modalities: ["AUDIO"],
            speech_config: {
              voice_config: {
                prebuilt_voice_config: { voice_name: settings.aiReceptionistVoice ?? "Aoede" },
              },
            },
          },
          system_instruction: { parts: [{ text: systemPrompt }] },
          tools: [{ function_declarations: AI_TOOLS }],
          input_audio_transcription: {},
          output_audio_transcription: {},
        },
      };
      gemini!.send(JSON.stringify(setup));
    };

    gemini.onmessage = async (ev) => {
      try {
        const msg = JSON.parse(typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer));

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
          gemini!.send(JSON.stringify({ tool_response: { function_responses: results } }));
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
            const pcm = decodeBase64(inlineData.data as string);
            const mulaw = pcm16k24ToMulaw8k(pcm);
            // Send back to caller in 46elks media-stream envelope
            caller.send(JSON.stringify({ audio: encodeBase64(mulaw) }));
          }
        }
      } catch (e) {
        console.error("[voice-ai-bridge] gemini message error", e);
      }
    };

    gemini.onerror = (e) => console.error("[voice-ai-bridge] gemini ws error", e);
    gemini.onclose = () => { try { caller.close(); } catch { /* noop */ } };
  };

  caller.onopen = () => { connectGemini().catch((e) => console.error("[voice-ai-bridge] setup failed", e)); };

  caller.onmessage = (ev) => {
    if (!gemini || gemini.readyState !== WebSocket.OPEN) return;
    try {
      // 46elks sends JSON envelopes: { audio: "<base64 µ-law 8k>" } or control msgs.
      const data = typeof ev.data === "string" ? JSON.parse(ev.data) : null;
      if (!data?.audio) return;
      const mulaw = decodeBase64(data.audio as string);
      const pcm16 = mulaw8kToPcm16k(mulaw);
      gemini.send(JSON.stringify({
        realtime_input: {
          media_chunks: [{ mime_type: "audio/pcm;rate=16000", data: encodeBase64(pcm16) }],
        },
      }));
    } catch (e) {
      console.error("[voice-ai-bridge] caller msg parse error", e);
    }
  };

  caller.onclose = async () => {
    try { gemini?.close(); } catch { /* noop */ }
    await flushTranscript(true);
    await supabase.from("voice_calls").update({
      status: "completed",
      ended_at: new Date().toISOString(),
    }).eq("provider", provider).eq("provider_call_id", providerCallId);
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
