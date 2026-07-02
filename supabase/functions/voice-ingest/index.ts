/**
 * voice-ingest — provider-agnostisk callback-handler + AI-receptionist-brygga.
 *
 * 1) POST /  ← 46elks/Twilio call-webhook. Returnerar voice-action JSON.
 * 2) WS  /stream?call_id=...  ← 46elks Realtime Voice <-> Gemini Live.
 *    Ingen separat edge function — håller voice-modulen i en fil.
 *
 * AI-receptionisten är default AV. Slås på i /admin/voice → Settings.
 * Falls back to native-audio without tools if Gemini rejects the tools model.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

type DbClient = SupabaseClient<any, "public", any>;

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
   * `native-audio` = best voice, no tool-calling (WS 1007 bug on tools).
   * `half-cascade` = current Live tool-calling model, slightly more robotic voice.
   * Default: native-audio (kept for backward compat with earlier deploys).
   */
  aiReceptionistMode?: "native-audio" | "half-cascade";
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

async function loadVoiceSettings(supabase: DbClient): Promise<VoiceSettings> {
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "voice")
    .maybeSingle();
  return ((data?.value as VoiceSettings | null) ?? {});
}

interface RoutingContext {
  supabase: DbClient;
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
      return { type: "connect", target: String(agent.voice_mobile_number), callerId: call.from, timeoutSeconds: 25 };
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
  supabase: DbClient,
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
      // AI-handled calls always flag for callback so the agent's promise
      // ("we'll call you back") surfaces in the Callbacks tab.
      callback_status: existing?.ai_handled
        ? "pending"
        : finalStatus === "missed" ? "pending" : "none",
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

// Two model families, selected per-call by voice settings (`aiReceptionistMode`):
// - native-audio: best voice quality, but rejects tools with WS 1007. Tools OFF.
// - half-cascade: audio → text tool-loop → TTS. Slightly more robotic voice, tools ON.
// Env vars are optional overrides.
const GEMINI_LIVE_MODEL_NATIVE = Deno.env.get("GEMINI_LIVE_MODEL_NATIVE")
  ?? "models/gemini-2.5-flash-native-audio-latest";
const GEMINI_LIVE_WS = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

function getCascadeModelId() {
  const configured = Deno.env.get("GEMINI_LIVE_MODEL_CASCADE")?.trim();
  // Older preview IDs have disappeared from v1beta and caused calls to fall
  // back to native-audio immediately. Treat them as stale config.
  if (!configured || configured === "models/gemini-2.5-flash-live-preview" || configured === "models/gemini-2.0-flash-live-001") {
    return "models/gemini-3.1-flash-live-preview";
  }
  return configured;
}


async function websocketDataToString(data: unknown): Promise<string> {
  if (typeof data === "string") return data;
  if (data instanceof Blob) return await data.text();
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  return String(data ?? "");
}

async function buildSystemPrompt(
  supabase: DbClient,
  settings: VoiceSettings,
  fromNumber: string,
  effectiveMode?: "native-audio" | "half-cascade",
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

  const toolsEnabled = (effectiveMode ?? settings.aiReceptionistMode ?? "native-audio") === "half-cascade";
  const capabilityBlock = toolsEnabled
    ? `You have tools available: lookup_customer_by_phone, browse_services, check_availability, book_appointment, and escalate_to_human. Use tools when the caller's request maps to one. For bookings: first identify service/date/time, ask for name and email, check availability, then call book_appointment. Only say an appointment is booked after the tool returns a booking_id. If a tool returns an error, missing_customer_email, slot_unavailable, or unavailable, say you captured a booking request and a colleague will call back to confirm — do not present it as a confirmed booking.`
    : `IMPORTANT: You do NOT have access to the booking calendar, CRM, customer records, or any lookup tools right now. If the caller asks whether they are an existing customer, asks you to check their phone number, or wants to book/change/cancel an appointment, do NOT say you can check it live and do NOT present anything as a confirmed booking. Instead: capture the needed details, repeat them back so they are saved in the transcript, and say a colleague will call back to confirm the request.`;

  return [
    `You are the AI receptionist for ${name}. Respond in the same language the caller speaks (Swedish or English).`,
    `Tone: ${tone}.`,
    `Open the conversation with: "${greeting}"`,
    `Keep responses short — this is a phone call. One or two sentences at a time.`,
    `The caller's phone number is ${fromNumber}. Use it internally for callbacks and lookup. Do not read the full phone number aloud unless the caller asks; say "the number you are calling from" or use only the last four digits.`,
    `If the caller asks to speak to a human, acknowledge it and ${toolsEnabled ? "call escalate_to_human." : "say a colleague will call back on the number they are calling from shortly."}`,
    capabilityBlock,
    `Never invent appointment times, prices, or policies. If you don't know something, say you'll have a colleague call back with the answer.`,

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
    description: "List booking availability for the next N days. Use when caller wants to book an appointment but has not picked a date yet.",
    parameters: {
      type: "object",
      properties: {
        service_id: { type: "string", description: "Optional booking_services UUID" },
        days_ahead: { type: "number", description: "Default 7" },
      },
    },
  },
  {
    name: "browse_services",
    description: "List active booking services so the caller can choose what appointment type they need.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "check_availability",
    description: "Check booking availability for a specific date. Use before booking an appointment.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date in YYYY-MM-DD format" },
        service_id: { type: "string", description: "Optional booking_services UUID" },
      },
      required: ["date"],
    },
  },
  {
    name: "book_appointment",
    description: "Create a booking for the caller at a specific date and time. Requires customer email for confirmation.",
    parameters: {
      type: "object",
      properties: {
        service_id: { type: "string" },
        starts_at: { type: "string", description: "ISO timestamp. Alternative to date + time." },
        date: { type: "string", description: "Date in YYYY-MM-DD format" },
        time: { type: "string", description: "Time in HH:MM format" },
        customer_name: { type: "string" },
        customer_email: { type: "string" },
        customer_phone: { type: "string" },
        notes: { type: "string" },
      },
      required: ["customer_name", "customer_email"],
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
  supabase: DbClient,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (name === "escalate_to_human") {
    return { escalated: true, message: "Connecting you to a human agent now." };
  }

  if (name === "lookup_customer_by_phone") {
    const phone = typeof args.phone === "string" ? args.phone.trim() : "";
    const compact = phone.replace(/\D/g, "");
    const suffix = compact.slice(-7);
    if (!suffix) return { found: false, reason: "missing_phone" };

    const { data: bookings } = await supabase
      .from("bookings")
      .select("id, customer_name, customer_email, customer_phone, start_time, status")
      .ilike("customer_phone", `%${suffix}%`)
      .order("start_time", { ascending: false })
      .limit(3);

    if (bookings?.length) {
      const latest = bookings[0] as Record<string, unknown>;
      return {
        found: true,
        source: "bookings",
        customer_name: latest.customer_name,
        customer_email: latest.customer_email,
        recent_booking_count: bookings.length,
        latest_status: latest.status,
      };
    }

    const { data: leads } = await supabase
      .from("leads")
      .select("id, name, email, phone, status")
      .ilike("phone", `%${suffix}%`)
      .limit(3);

    if (leads?.length) {
      const lead = leads[0] as Record<string, unknown>;
      return {
        found: true,
        source: "leads",
        customer_name: lead.name,
        customer_email: lead.email,
        status: lead.status,
      };
    }

    return { found: false };
  }

  if (name === "list_available_slots") {
    const daysAhead = Math.max(1, Math.min(Number(args.days_ahead ?? 7) || 7, 14));
    const serviceId = typeof args.service_id === "string" ? args.service_id : undefined;
    const days: unknown[] = [];
    for (let i = 0; i < daysAhead; i += 1) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const date = d.toISOString().slice(0, 10);
      days.push(await executeSkill(supabase, "check_availability", { date, service_id: serviceId }));
    }
    return { days };
  }

  if (name === "book_appointment") {
    const customerName = typeof args.customer_name === "string" ? args.customer_name.trim() : "";
    const customerEmail = typeof args.customer_email === "string" ? args.customer_email.trim() : "";
    const customerPhone = typeof args.customer_phone === "string" ? args.customer_phone.trim() : undefined;
    const notes = typeof args.notes === "string" ? args.notes.trim() : undefined;

    if (!customerName) return { error: "missing_customer_name", booked: false };
    if (!customerEmail) return { error: "missing_customer_email", booked: false, message: "Ask the caller for an email address before confirming the booking." };

    let startsAt = typeof args.starts_at === "string" ? args.starts_at : "";
    if (!startsAt && typeof args.date === "string" && typeof args.time === "string") {
      startsAt = `${args.date}T${args.time}:00`;
    }
    if (!startsAt) return { error: "missing_start_time", booked: false };

    let serviceId = typeof args.service_id === "string" ? args.service_id : "";
    if (!serviceId) {
      const { data: services } = await supabase
        .from("booking_services")
        .select("id")
        .eq("is_active", true)
        .order("sort_order")
        .limit(1);
      serviceId = (services?.[0] as { id?: string } | undefined)?.id ?? "";
    }
    if (!serviceId) return { error: "no_active_booking_service", booked: false };

    return await executeSkill(supabase, "book_appointment_slot", {
      p_service_id: serviceId,
      p_customer_name: customerName,
      p_customer_email: customerEmail,
      p_start_time: startsAt,
      p_customer_phone: customerPhone,
      p_notes: notes,
    });
  }

  // Dispatch via agent-execute — it knows enabled modules + alias mapping.
  // NB: agent-execute's contract is `skill_name` — sending `skill` silently 400s.
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/agent-execute`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ skill_name: name, arguments: args, agent_type: "voice-ai" }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { error: `Tool failed: ${res.status}`, detail: body?.error ?? null };
    return body;
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
  let didFallbackToNative = false;
  let callerClosed = false;
  const pendingCallerAudio: string[] = [];
  const transcript: Array<{ role: string; text: string; ts: string }> = [];
  let assistantBuffer = "";
  let userBuffer = "";

  const flushTranscript = async (final = false) => {
    if (transcript.length === 0 && !final) return;
    if (!providerCallId || providerCallId === "unknown") return;
    const summary = transcript
      .slice(-8)
      .map((t) => `${t.role}: ${t.text}`)
      .join("\n")
      .slice(-1200);
    await supabase.from("voice_calls").update({
      live_transcript: transcript as unknown as object,
      ...(final ? { ai_summary: summary || assistantBuffer.slice(-500) || null } : {}),
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

  const connectGemini = async (forcedMode?: "native-audio" | "half-cascade") => {
    if (callerClosed) return;
    // Prefer metadata from 46elks `hello`; fall back to a stored call row when
    // the stream URL includes call_id (useful for local tests).
    if (!fromNumber && providerCallId && providerCallId !== "unknown") {
      const { data: callRow } = await supabase
        .from("voice_calls").select("from_number").eq("provider", provider)
        .eq("provider_call_id", providerCallId).maybeSingle();
      fromNumber = (callRow?.from_number as string) ?? "";
    }

    const settings = await loadVoiceSettings(supabase);
    const mode = forcedMode ?? settings.aiReceptionistMode ?? "native-audio";
    const systemPrompt = await buildSystemPrompt(supabase, settings, fromNumber, mode);
    const modelId = mode === "half-cascade" ? getCascadeModelId() : GEMINI_LIVE_MODEL_NATIVE;
    const toolsEnabled = mode === "half-cascade";
    geminiSetupComplete = false;

    console.log("[voice-ai-bridge] connecting Gemini Live", {
      providerCallId, fromNumber, mode, modelId, toolsEnabled,
    });
    const ws = new WebSocket(`${GEMINI_LIVE_WS}?key=${apiKey}`);
    gemini = ws;
    ws.onopen = () => {
      const setup = {
        setup: {
          model: modelId,
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: settings.aiReceptionistVoice ?? "Aoede" },
              },
            },
          },
          systemInstruction: { parts: [{ text: systemPrompt }] },
          ...(toolsEnabled ? { tools: [{ functionDeclarations: AI_TOOLS }] } : {}),
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      };
      ws.send(JSON.stringify(setup));
    };


    ws.onmessage = async (ev) => {
      try {
        const msg = JSON.parse(await websocketDataToString(ev.data));

        if (msg.setupComplete) {
          geminiSetupComplete = true;
          console.log("[voice-ai-bridge] Gemini setup complete", { providerCallId });
          // Gemini does not always speak just because the system prompt contains
          // a greeting. Trigger one short initial turn so the caller immediately
          // hears the receptionist after the bridge is established.
          ws.send(JSON.stringify({
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
          ws.send(JSON.stringify({ toolResponse: { functionResponses: results } }));
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

    ws.onerror = (e) => console.error("[voice-ai-bridge] gemini ws error", e);
    ws.onclose = (e) => {
      console.warn("[voice-ai-bridge] gemini ws closed", { code: e.code, reason: e.reason, mode, modelId });
      if (gemini === ws) gemini = null;
      if (!callerClosed && mode === "half-cascade" && !didFallbackToNative) {
        didFallbackToNative = true;
        console.warn("[voice-ai-bridge] half-cascade closed; falling back to native-audio without tools", {
          providerCallId,
          failedModelId: modelId,
          code: e.code,
          reason: e.reason,
        });
        connectGemini("native-audio").catch((err) => console.error("[voice-ai-bridge] native fallback failed", err));
        return;
      }
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
    callerClosed = true;
    try { gemini?.close(); } catch { /* noop */ }
    await flushTranscript(true);
    if (providerCallId && providerCallId !== "unknown") {
      await supabase.from("voice_calls").update({
        status: "completed",
        ended_at: new Date().toISOString(),
        callback_status: "pending",
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
