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
  if (action === "get_webrtc_credentials") return handleGetWebrtcCredentials(req);
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

// A reachable default greeting so callers always hear *something* before
// recording, even if Voice settings (voicemailGreetingUrl) is blank or points
// at a dead URL. Hosted on the main branch (served at /audio on each site too),
// so it survives feature-branch deletion — unlike the per-branch raw URL that
// 404'd after PR #95 merged and left callers with silence.
const DEFAULT_GREETING_URL =
  "https://raw.githubusercontent.com/magnusfroste/flowwink/main/public/audio/voicemail-sv.mp3";

async function loadVoiceSettings(supabase: ReturnType<typeof getServiceClient>) {
  const { data } = await supabase
    .from("site_settings").select("value").eq("key", "voice").maybeSingle();
  const v = (data?.value as any) || {};
  return {
    voicemailGreetingUrl: (v.voicemailGreetingUrl as string) || DEFAULT_GREETING_URL,
    ringTimeoutSeconds: Number(v.ringTimeoutSeconds) > 0 ? Number(v.ringTimeoutSeconds) : 25,
    smsReplyEnabled: v.smsReplyEnabled === true,
    // Callback auto-scheduler (opt-in). When off, missed calls/voicemails stay
    // `pending` for a human to schedule manually — exactly today's behaviour.
    autoScheduleCallbacks: v.autoScheduleCallbacks === true,
    autoScheduleSms: v.autoScheduleSms === true,
    callbackTimezone: (v.callbackTimezone as string) || "Europe/Stockholm",
    callbackWindowStart: (v.callbackWindowStart as string) || "09:00",
    callbackWindowEnd: (v.callbackWindowEnd as string) || "17:00",
    callbackSlotMinutes: Number(v.callbackSlotMinutes) > 0 ? Number(v.callbackSlotMinutes) : 15,
    aiReceptionistEnabled: v.aiReceptionistEnabled === true,
    aiReceptionistWebsocketNumber: (v.aiReceptionistWebsocketNumber as string) || "",
  };
}

type VoiceSettingsResolved = Awaited<ReturnType<typeof loadVoiceSettings>>;

// ── Timezone-aware callback slot finder ──────────────────────────────────────
// Business hours live in the site's wall-clock timezone, but the edge runtime is
// UTC, so we convert through Intl. DST-safe.

function tzOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) map[p.type] = p.value;
  const asUTC = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour, +map.minute, +map.second);
  return asUTC - instant.getTime();
}

// Local wall-clock minutes-since-midnight for a UTC instant, in the given zone.
function localMinutes(instant: Date, timeZone: string): number {
  const local = new Date(instant.getTime() + tzOffsetMs(instant, timeZone));
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

// The UTC instant matching a local wall-clock time (same calendar day as `ref`
// in the zone, optionally +dayOffset days), for `minutesOfDay` past midnight.
function zonedWallTimeToUtc(ref: Date, timeZone: string, minutesOfDay: number, dayOffset = 0): Date {
  const local = new Date(ref.getTime() + tzOffsetMs(ref, timeZone));
  const y = local.getUTCFullYear(), mo = local.getUTCMonth(), d = local.getUTCDate();
  const guess = Date.UTC(y, mo, d + dayOffset, Math.floor(minutesOfDay / 60), minutesOfDay % 60);
  // Correct for the offset at the guessed instant (handles DST boundaries).
  const corrected = guess - tzOffsetMs(new Date(guess), timeZone);
  return new Date(corrected);
}

function parseHHMM(s: string, fallback: number): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s || "").trim());
  if (!m) return fallback;
  const mins = (+m[1]) * 60 + (+m[2]);
  return Number.isFinite(mins) && mins >= 0 && mins < 24 * 60 ? mins : fallback;
}

// Pick the next free callback slot inside business hours that no other scheduled
// callback already occupies. Returns an ISO string, or null if none found within
// a week (degrades to leaving the call `pending`).
async function findNextFreeCallbackSlot(
  supabase: ReturnType<typeof getServiceClient>,
  s: VoiceSettingsResolved,
  now: Date,
): Promise<string | null> {
  const tz = s.callbackTimezone;
  const slotMin = s.callbackSlotMinutes;
  const slotMs = slotMin * 60_000;
  const startMin = parseHHMM(s.callbackWindowStart, 9 * 60);
  const endMin = parseHHMM(s.callbackWindowEnd, 17 * 60);
  const LEAD_MIN = 20; // never propose a time sooner than ~20 min from now

  // Slots already taken by other scheduled callbacks (rounded to the slot grid).
  const { data: scheduled } = await supabase
    .from("voice_calls")
    .select("callback_scheduled_at")
    .eq("callback_status", "scheduled")
    .gte("callback_scheduled_at", new Date(now.getTime() - slotMs).toISOString());
  const taken = new Set<number>();
  for (const r of scheduled ?? []) {
    const t = Date.parse((r as any).callback_scheduled_at);
    if (Number.isFinite(t)) taken.add(Math.round(t / slotMs) * slotMs);
  }

  // Start at the next slot boundary at least LEAD_MIN out.
  let cand = new Date(Math.ceil((now.getTime() + LEAD_MIN * 60_000) / slotMs) * slotMs);
  for (let i = 0; i < 24 * 60 / slotMin * 7; i++) { // up to ~7 days of slots
    const mins = localMinutes(cand, tz);
    if (mins < startMin || mins >= endMin) {
      // Outside hours → jump to the next window start (today if still before it,
      // otherwise tomorrow).
      const dayOffset = mins < startMin ? 0 : 1;
      cand = zonedWallTimeToUtc(cand, tz, startMin, dayOffset);
      continue;
    }
    const key = Math.round(cand.getTime() / slotMs) * slotMs;
    if (!taken.has(key)) return cand.toISOString();
    cand = new Date(cand.getTime() + slotMs);
  }
  return null;
}

// A Swedish mobile number is +46 7x; any other +46 prefix is a landline that
// can't receive SMS. We only ever *block* confirmed Swedish landlines — foreign
// numbers get the benefit of the doubt (likely mobile, and we can't classify
// them cheaply). This is the guard that stops the silent-failure mode where an
// agent texts a voicemail caller who phoned in from a fast telefon.
function isLikelySwedishLandline(num: string): boolean {
  return /^\+46(?!7)/.test(num);
}

// 46elks dial-plan: ANSWER the call, play the greeting, then record a voicemail.
// Per the 46elks docs (/docs/voice-record) the `record` value is the URL the
// recording is POSTed to (delivered as the `wav` param) — NOT "true".
//
// CRITICAL: the `record` action must NOT carry an inner `next`. We previously
// had `next: { record: selfUrl, next: selfUrl }`, which made 46elks CONTINUE
// the dial-plan after each recording — it re-fetched selfUrl, got a fresh
// greeting, and replayed it in a loop. The call actions log proved it:
//   play(ok) → record(failed,tooshort) → play(ok) → record(ok) → play(hangup)
// Without an inner `next`, the call ends after the recording. The recording is
// still captured (it appears in the call's `recordings[]`, fetched via the API
// in the terminal handler) and, if 46elks POSTs a `wav`, handled directly.
//
// Never combine `play` with `hangup: "reject"` — reject means "don't answer",
// so the audio never plays. That was the earlier "nothing played" bug.
function voicemailReply(greetingUrl: string, selfUrl: string) {
  return {
    play: greetingUrl,
    next: { record: selfUrl, silencedetection: "yes" },
    whenhangup: selfUrl,
  };
}

function aiReceptionistReply(voice: VoiceSettingsResolved): Record<string, unknown> | null {
  if (!voice.aiReceptionistEnabled) return null;
  if (!Deno.env.get("GEMINI_API_KEY")) {
    console.warn("[elks46-ingest] AI receptionist enabled but GEMINI_API_KEY is missing — falling back to voicemail");
    return null;
  }
  const wsNumber = normalizePhone(voice.aiReceptionistWebsocketNumber.trim());
  if (!wsNumber) {
    console.warn("[elks46-ingest] AI receptionist enabled but no 46elks websocket-number is configured — falling back to voicemail");
    return null;
  }
  return { connect: wsNumber };
}

function hangupResponse(): Response {
  return new Response(JSON.stringify({ hangup: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Ask 46elks for a call's recordings. 46elks does not reliably POST the audio
// back to our webhook, but the finished call object lists recording ids in
// `recordings[]` (e.g. "c76c…-r0"), retrievable at /a1/Recordings/{id}.wav
// behind Basic auth. Returns the recording ids (newest last).
async function fetchCallRecordings(callid: string): Promise<string[]> {
  try {
    const resp = await fetch(`${ELKS_BASE}/calls/${encodeURIComponent(callid)}`, {
      headers: { Authorization: basicAuthHeader() },
    });
    if (!resp.ok) {
      console.warn("[elks46-ingest] fetchCallRecordings", resp.status);
      return [];
    }
    const data = await resp.json().catch(() => ({}));
    const recs = (data as any)?.recordings;
    return Array.isArray(recs) ? recs.filter((r: unknown): r is string => typeof r === "string") : [];
  } catch (e) {
    console.warn("[elks46-ingest] fetchCallRecordings error", (e as Error)?.message);
    return [];
  }
}

// Fetch the (Basic-auth-protected) recording wav and run it through chat-stt,
// reusing the site's configured STT provider. Returns the transcript or null.
async function transcribeWav(supabase: ReturnType<typeof getServiceClient>, wavUrl: string): Promise<string | null> {
  try {
    const audioResp = await fetch(wavUrl, { headers: { Authorization: basicAuthHeader() } });
    if (!audioResp.ok) {
      console.warn("[elks46-ingest] recording fetch failed", audioResp.status);
      return null;
    }
    const buf = await audioResp.arrayBuffer();
    if (buf.byteLength === 0) return null;

    // Use the same STT provider the chat widget uses (site_settings key 'chat').
    // 'browser' STT only runs client-side, so fall back to OpenAI Whisper here.
    const { data: cs } = await supabase
      .from("site_settings").select("value").eq("key", "chat").maybeSingle();
    const chat = ((cs?.value as any) || {}) as Record<string, unknown>;
    let provider = (chat.sttProvider as string) || "openai";
    if (provider === "browser") provider = "openai";

    const fd = new FormData();
    fd.append("file", new File([buf], "voicemail.wav", { type: "audio/wav" }));
    fd.append("provider", provider);
    if (provider === "local") {
      if (chat.sttLocalEndpoint) fd.append("endpoint", String(chat.sttLocalEndpoint));
      if (chat.sttLocalModel) fd.append("model", String(chat.sttLocalModel));
    }

    const sttResp = await fetch(`${supabaseUrl}/functions/v1/chat-stt`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
      body: fd,
    });
    if (!sttResp.ok) {
      console.warn("[elks46-ingest] chat-stt failed", sttResp.status, await sttResp.text().catch(() => ""));
      return null;
    }
    const out = await sttResp.json().catch(() => ({}));
    const text = typeof (out as any)?.text === "string" ? (out as any).text.trim() : "";
    return text || null;
  } catch (e) {
    console.warn("[elks46-ingest] transcribeWav error", (e as Error)?.message);
    return null;
  }
}

// Store a captured voicemail, transcribe it, and drop the transcript into the
// unified inbox as a text message on the call's voice conversation. Posts
// EXACTLY ONCE per call: voicemail capture runs over two paths (the 46elks
// wav-POST and the terminal hangup callback that pulls the recording from the
// API), and those callbacks can race. We claim the call atomically by flipping
// status → voicemail with a `status != voicemail` guard in the same UPDATE —
// Postgres row-locking means only the first invocation matches and proceeds;
// the loser sees zero rows and bails. (A read-then-write metadata flag wasn't
// enough: both callbacks read the pre-write row before either wrote it.)
async function recordVoicemail(
  supabase: ReturnType<typeof getServiceClient>,
  opts: { callid: string; existing: any; wavUrl: string; durationSeconds: number | null; fromNumber: string },
): Promise<void> {
  const { callid, wavUrl, durationSeconds, fromNumber } = opts;

  const { data: claimed } = await supabase
    .from("voice_calls")
    .update({ status: "voicemail", voicemail: true })
    .eq("provider", "elks46").eq("provider_call_id", callid)
    .neq("status", "voicemail")
    .select("id, conversation_id, metadata");
  if (!claimed || claimed.length === 0) return; // a concurrent callback already claimed it
  const row = claimed[0] as any;
  const prevMeta = (row.metadata && typeof row.metadata === "object") ? row.metadata : {};

  const transcript = await transcribeWav(supabase, wavUrl);

  await supabase.from("voice_calls").update({
    recording_url: wavUrl,
    transcript,
    ended_at: new Date().toISOString(),
    duration_seconds: durationSeconds,
    callback_status: "pending",
    metadata: { ...prevMeta, voicemail_transcribed: true, voicemail: { recording_url: wavUrl } },
  }).eq("provider", "elks46").eq("provider_call_id", callid);

  // Ensure a voice conversation exists, then surface the voicemail as text.
  let conversationId: string | null = row.conversation_id ?? null;
  if (!conversationId) {
    const { data: conv } = await supabase.from("chat_conversations").insert({
      channel: "voice",
      channel_thread_id: fromNumber || callid,
      customer_name: fromNumber || "Unknown caller",
      scope: "visitor",
      conversation_status: "waiting_agent",
      title: `Voice · ${fromNumber || callid}`,
      visitor_profile: { sms_provider: "elks46", elks46_callid: callid, from: fromNumber },
    }).select("id").maybeSingle();
    conversationId = conv?.id ?? null;
    if (conversationId) {
      await supabase.from("voice_calls").update({ conversation_id: conversationId })
        .eq("provider", "elks46").eq("provider_call_id", callid);
    }
  }

  if (conversationId) {
    await supabase.from("chat_messages").insert({
      conversation_id: conversationId,
      role: "user",
      source: "voice",
      content: transcript
        ? `🎙️ Voicemail: ${transcript}`
        : `🎙️ Voicemail received (transcription unavailable).`,
      metadata: { elks46_callid: callid, recording_url: wavUrl, channel: "voice", voicemail: true },
    });
    // Move it into the queue so it shows up as an unhandled inbox item.
    await supabase.from("chat_conversations").update({
      conversation_status: "waiting_agent",
      updated_at: new Date().toISOString(),
    }).eq("id", conversationId);
  }

  await maybeAutoScheduleCallback(supabase, { callid, fromNumber, conversationId });
}

// If the callback auto-scheduler is enabled, pick a non-conflicting slot inside
// business hours, book it on the (still-pending) call, and — when configured —
// SMS the caller their callback time. Fully opt-in: with the toggle off this is
// a no-op and the call stays `pending` for manual handling. Best-effort: any
// failure is logged, never throws into the webhook path.
async function maybeAutoScheduleCallback(
  supabase: ReturnType<typeof getServiceClient>,
  opts: { callid: string; fromNumber: string; conversationId: string | null },
): Promise<void> {
  try {
    const s = await loadVoiceSettings(supabase);
    if (!s.autoScheduleCallbacks) return;

    const slotIso = await findNextFreeCallbackSlot(supabase, s, new Date());
    if (!slotIso) return; // no free slot this week → leave pending for a human

    // Only book if still pending — never override a time a human already set.
    const { data: booked } = await supabase
      .from("voice_calls")
      .update({ callback_status: "scheduled", callback_scheduled_at: slotIso })
      .eq("provider", "elks46").eq("provider_call_id", opts.callid)
      .eq("callback_status", "pending")
      .select("id");
    if (!booked || booked.length === 0) return;

    const when = new Intl.DateTimeFormat("sv-SE", {
      timeZone: s.callbackTimezone, weekday: "short", hour: "2-digit", minute: "2-digit",
    }).format(new Date(slotIso));

    let smsNote = "";
    const dest = normalizePhone(opts.fromNumber || "");
    if (s.autoScheduleSms && dest) {
      if (isLikelySwedishLandline(dest)) {
        smsNote = " · fast nummer, inget SMS";
      } else {
        try {
          const { fromNumber } = await loadElks46Config(supabase);
          await sendSms(dest, fromNumber, `Tack för ditt samtal! Vi ringer upp dig ${when}.`);
          smsNote = ` · SMS skickat till ${dest}`;
        } catch (e) {
          console.warn("[elks46-ingest] auto-schedule SMS failed", (e as Error)?.message);
          smsNote = " · SMS kunde inte skickas";
        }
      }
    }

    if (opts.conversationId) {
      await supabase.from("chat_messages").insert({
        conversation_id: opts.conversationId,
        role: "system",
        content: `🗓️ Återuppringning inbokad ${when}${smsNote}.`,
      });
    }
  } catch (e) {
    console.warn("[elks46-ingest] maybeAutoScheduleCallback error", (e as Error)?.message);
  }
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
  const resp = await fetch(`${ELKS_BASE}/calls`, {
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

function connectTargetForAgent(agent: any): string | null {
  if (!agent) return null;

  const mode = (agent.voice_routing_mode as string) || 'both';
  const sipUri = String(agent.voice_sip_uri ?? "").trim();
  const username = String(agent.voice_sip_username ?? "").trim();
  const mobile = String(agent.voice_mobile_number ?? "").trim();

  const sipTarget = (() => {
    // 46elks WebRTC accounts are registered by JsSIP as
    // `sip:<user>@voip.46elks.com`, but the 46elks call API must ring that
    // browser client as a phone-like target: `+<user>`. Returning the SIP URI
    // as `connect` makes 46elks treat it as an external SIP trunk and reject.
    if (username && /^\d{6,}$/.test(username)) return normalizePhone(username);
    const sipUser = sipUri.match(/^sips?:([^@;]+)(?:@([^;]+))?/i)?.[1];
    if (sipUser && /^\d{6,}$/.test(sipUser)) return normalizePhone(sipUser);
    if (sipUri) return sipUri.startsWith("sip:") || sipUri.startsWith("sips:") ? sipUri : `sip:${sipUri}`;
    return null;
  })();
  const mobileTarget = mobile ? normalizePhone(mobile) : null;

  // Mode controls the *first* leg only. For 'both' the no-answer handler
  // falls through to mobile (see terminal handler / metadata.mobile_attempted).
  if (mode === 'softphone') return sipTarget;
  if (mode === 'mobile') return mobileTarget;
  // 'both': prefer softphone, fall back to mobile if softphone not configured
  return sipTarget ?? mobileTarget;
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
      const wavParam = params.get("wav") ?? params.get("recording_url") ?? params.get("recording");
      const terminalSignal = Boolean(state || params.get("actions") || params.get("start") || params.get("duration"))
        || ["hangup", "failed", "busy", "noanswer", "no_answer", "success", "answered"].includes(result ?? "");

      // Load the call row once — used by the recording, guard, and terminal paths.
      const { data: existingCall } = await supabase
        .from("voice_calls")
        .select("status, started_at, answered_at, conversation_id, metadata")
        .eq("provider", "elks46")
        .eq("provider_call_id", callid)
        .maybeSingle();
      const existingMeta = (existingCall?.metadata && typeof existingCall.metadata === "object")
        ? existingCall.metadata : {};
      const alreadyOffered = (existingMeta as any)?.voicemail_offered === true;

      // (A) 46elks POSTed the recording directly (wav param) → transcribe + post
      // to the inbox, then end the call. (Belt-and-braces: the terminal handler
      // below also pulls recordings from the API in case no wav is delivered.)
      if (wavParam) {
        await recordVoicemail(supabase, {
          callid, existing: existingCall, wavUrl: wavParam, durationSeconds, fromNumber: normalizedFrom || from,
        });
        return hangupResponse();
      }

      // Double-play guard: if we've already played the greeting for this call
      // and this callback carries neither a recording nor a terminal signal,
      // it's a stray continuation — hang up instead of replaying the greeting.
      if (alreadyOffered && !terminalSignal && result !== "newincoming") {
        return hangupResponse();
      }

      if (terminalSignal && result !== "newincoming") {
        const now = new Date().toISOString();
        const answeredAt = existingCall?.answered_at
          ?? params.get("start")
          ?? (["answered", "success"].includes(result ?? "") || state === "success" || actionResult === "success" ? now : null);
        const failureSignal = state === "busy" || state === "failed" || ["busy", "failed", "noanswer", "no_answer"].includes(result ?? "")
          || ["busy", "failed", "noanswer", "no_answer"].includes(actionResult ?? "");
        const previousMetadata = existingMeta;

        // (B) Agent's phone didn't pick up (no-answer/busy/failed) and the call
        // was never answered → play the greeting + record a voicemail instead of
        // just dropping. The original inbound leg is still live here, so 46elks
        // continues it with this dial-plan. Guarded by voicemail_offered so the
        // follow-up hangup callback finalizes instead of looping.
        if (failureSignal && !answeredAt && !alreadyOffered) {
          const selfUrl = `${supabaseUrl}/functions/v1/elks46-ingest`;
          const voice = await loadVoiceSettings(supabase);

          // (B0) Routing mode = 'both' AND first leg was the softphone AND
          // mobile is configured AND we haven't tried mobile yet → ring the
          // agent's mobile before falling back to voicemail.
          const meta = previousMetadata as any;
          const routingMode = meta?.routing_mode as string | undefined;
          const agentMobile = meta?.agent_mobile as string | undefined;
          const firstLeg = meta?.first_leg as string | undefined;
          const mobileAlreadyTried = meta?.mobile_attempted === true;
          const firstLegWasSoftphone = !!firstLeg && !!agentMobile && firstLeg !== normalizePhone(agentMobile);
          if (routingMode === 'both' && agentMobile && firstLegWasSoftphone && !mobileAlreadyTried) {
            const mobileTarget = normalizePhone(agentMobile);
            await supabase.from("voice_calls").update({
              metadata: { ...previousMetadata, mobile_attempted: true, mobile_target: mobileTarget },
            }).eq("provider", "elks46").eq("provider_call_id", callid);
            return new Response(JSON.stringify({
              connect: mobileTarget,
              callerid: normalizedFrom || from,
              timeout: voice.ringTimeoutSeconds,
              busy: voicemailReply(voice.voicemailGreetingUrl, selfUrl),
              next: selfUrl,
              whenhangup: selfUrl,
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // (B) Agent's phone didn't pick up → AI receptionist if configured,
          // otherwise play greeting + record voicemail.
          const aiReply = aiReceptionistReply(voice);
          if (aiReply) {
            await supabase.from("voice_calls").update({
              status: "answered",
              answered_at: new Date().toISOString(),
              callback_status: "none",
              metadata: { ...previousMetadata, ai_receptionist_offered: true, no_answer_event: { result, state } },
            }).eq("provider", "elks46").eq("provider_call_id", callid);
            return new Response(JSON.stringify(aiReply), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          // No AI bridge available → voicemail.
          await supabase.from("voice_calls").update({
            status: "missed",
            callback_status: "pending",
            metadata: { ...previousMetadata, voicemail_offered: true, no_answer_event: { result, state } },
          }).eq("provider", "elks46").eq("provider_call_id", callid);
          return new Response(JSON.stringify(voicemailReply(voice.voicemailGreetingUrl, selfUrl)), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }


        // (C) Voicemail was offered for this call → the recording (if the caller
        // spoke) now exists in the call's recordings[]. Pull it from the API and
        // transcribe into the inbox. If the caller hung up without speaking,
        // there's no recording and we just finalize as missed below.
        if (alreadyOffered) {
          const recordings = await fetchCallRecordings(callid);
          if (recordings.length > 0) {
            const wavUrl = `${ELKS_BASE}/Recordings/${recordings[recordings.length - 1]}.wav`;
            await recordVoicemail(supabase, {
              callid, existing: existingCall, wavUrl, durationSeconds, fromNumber: normalizedFrom || from,
            });
            return hangupResponse();
          }
        }

        const finalStatus = failureSignal
          ? (state === "busy" || result === "busy" || actionResult === "busy" ? "busy" : "missed")
          : (answeredAt ? "completed" : "missed");

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
        // Missed/busy with no voicemail → still a callback owed. Auto-schedule it
        // if enabled (the caller hung up before recording, so there's no inbox
        // thread yet — pass the call's conversation_id if one exists).
        if (finalStatus !== "completed") {
          await maybeAutoScheduleCallback(supabase, {
            callid, fromNumber: normalizedFrom || from, conversationId: existingCall?.conversation_id ?? null,
          });
        }
        return hangupResponse();
      }

      const { data: agents, error: agentErr } = await supabase
        .from("support_agents")
        .select("id, voice_sip_uri, voice_sip_username, voice_mobile_number, voice_enabled, voice_routing_mode, status")
        .eq("voice_enabled", true)
        .in("status", ["online", "away"])
        .limit(10);
      if (agentErr) console.warn("[elks46-ingest] voice agent lookup failed", agentErr.message);
      const agent = (agents ?? []).find((a: any) => {
        const mode = a.voice_routing_mode || 'both';
        if (mode === 'mobile') return !!a.voice_mobile_number;
        if (mode === 'softphone') return !!(a.voice_sip_uri || a.voice_sip_username);
        return a.voice_sip_uri || a.voice_sip_username || a.voice_mobile_number;
      }) as any | undefined;


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

      const target = connectTargetForAgent(agent);
      const selfUrl = `${supabaseUrl}/functions/v1/elks46-ingest`;
      const voice = await loadVoiceSettings(supabase);
      // For 'both' mode: shorten first leg so the no-answer fallback to mobile
      // happens within the caller's patience window. ~15s softphone → mobile.
      const agentMode = (agent?.voice_routing_mode as string) || 'both';
      const firstLegTimeout = (agentMode === 'both' && target && agent?.voice_mobile_number)
        ? Math.min(voice.ringTimeoutSeconds, 15)
        : voice.ringTimeoutSeconds;
      // Agent reachable → ring their phone; on no-answer the connect's `next`
      // callback (below) plays the greeting + records. No agent (phone off /
      // nobody online) → straight to greeting + voicemail.
      const aiReply = target ? null : aiReceptionistReply(voice);
      const status = target ? "ringing" : aiReply ? "answered" : "missed";
      const reply = target
        ? {
            connect: target,
            callerid: normalizedFrom || from,
            timeout: firstLegTimeout,
            // 46elks supports an inline `busy` fallback action (see receive-call
            // docs). Busy → voicemail directly. No-answer/failed is handled by
            // the `next` callback (→ terminal handler → voicemailReply).
            busy: voicemailReply(voice.voicemailGreetingUrl, selfUrl),
            next: selfUrl,
            whenhangup: selfUrl,
          }
        : aiReply ?? voicemailReply(voice.voicemailGreetingUrl, selfUrl);

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
          answered_at: aiReply ? new Date().toISOString() : null,
          callback_status: target || aiReply ? "none" : "pending",
          // No agent → AI receptionist when available, otherwise greeting+record.
          // With an agent, fallback is decided later on no-answer.
          metadata: {
            initial_action: reply,
            raw,
            voicemail_offered: !target && !aiReply,
            ai_receptionist_offered: !!aiReply,
            routing_mode: agentMode,
            agent_mobile: agent?.voice_mobile_number ?? null,
            first_leg: target,
          },
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

    const isVoice = conv.channel === "voice";
    if (conv.channel !== "sms" && !isVoice) return json({ ok: true, skipped: "unsupported channel" });

    const profile = (conv.visitor_profile as any) || {};
    // SMS thread → the thread id is the destination. Voice thread → the caller's
    // number (visitor_profile.from), falling back to the thread id.
    const destinationRaw = isVoice
      ? (profile.from || conv.channel_thread_id || "")
      : (conv.channel_thread_id || "");
    if (!destinationRaw) return json({ error: "missing destination number" }, 400);
    const destination = normalizePhone(String(destinationRaw));

    // Voice replies go out as SMS — gated by a Voice setting and a landline
    // guard so the agent is never misled into thinking an undeliverable reply
    // was sent. Returns a clear reason the inbox surfaces to the agent.
    if (isVoice) {
      const voice = await loadVoiceSettings(supabase);
      if (!voice.smsReplyEnabled) {
        return json({ ok: true, sms_sent: false, reason: "sms_reply_disabled" });
      }
      if (isLikelySwedishLandline(destination)) {
        return json({ ok: true, sms_sent: false, reason: "landline" });
      }
    }

    if (!content && body.message_id) {
      const { data: msg } = await supabase
        .from("chat_messages").select("content").eq("id", body.message_id).maybeSingle();
      content = msg?.content ?? undefined;
    }
    if (!content || !content.trim()) return json({ error: "no content" }, 400);

    const { fromNumber } = await loadElks46Config(supabase);
    const from = fromNumber || profile.to || "";
    const data = await sendSms(destination, from, content);
    return json({ ok: true, sms_sent: true, elks46_message_id: data?.id ?? null });
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
      to?: string; voice_start?: string; mode?: string;
    };
    if (!body.to) return json({ error: "to required" }, 400);

    const { fromNumber, voiceWebhookUrl } = await loadElks46Config(supabase);
    if (body.mode === "webrtc") {
      const { data: agent, error: agentErr } = await supabase
        .from("support_agents")
        .select("id, voice_sip_uri, voice_sip_username, voice_enabled")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if (agentErr) throw agentErr;
      if (!agent?.voice_enabled) return json({ error: "softphone not enabled for this agent" }, 400);

      const sipUsername = String(agent.voice_sip_username ?? "").trim();
      const sipUriUser = String(agent.voice_sip_uri ?? "").match(/^sips?:?([^@;]+)(?:@([^;]+))?/i)?.[1] ?? "";
      const webRtcUser = (sipUsername || sipUriUser).replace(/^\+/, "");
      if (!/^\d{6,}$/.test(webRtcUser)) return json({ error: "missing valid 46elks WebRTC number on agent" }, 400);

      const destination = normalizePhone(body.to);
      const webRtcNumber = normalizePhone(webRtcUser);
      // Fall back to the agent's WebRTC number as caller-ID when no public DID
      // is configured in site_settings.integrations.elks46.config.from_number.
      const callerId = fromNumber || webRtcNumber;
      const voiceStart = body.voice_start || JSON.stringify({
        connect: destination,
        callerid: callerId,
      });
      const data = await startCall(webRtcNumber, callerId, voiceStart);
      const callid = data?.callid ?? data?.id ?? null;

      // Log outbound call so agents see it in /admin/voice even if they forget
      // to mark a callback as done.
      if (callid) {
        const { error: logErr } = await supabase.from("voice_calls").insert({
          provider: "elks46",
          provider_call_id: String(callid),
          direction: "outbound",
          status: "ringing",
          from_number: callerId,
          to_number: destination,
          agent_id: agent.id,
          metadata: { mode: "webrtc", initiated_by: userData.user.id },
        });
        if (logErr) console.error("[elks46-ingest:call] log insert failed", logErr.message);
      }

      return json({
        ok: true,
        mode: "webrtc",
        callid,
        destination,
        webrtc_number: webRtcNumber,
        raw: data,
      });

    }

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

// ───────────────────────────────────────────── Get WebRTC credentials (number + secret) from 46elks
async function handleGetWebrtcCredentials(req: Request): Promise<Response> {
  if (req.method !== "POST" && req.method !== "GET") return json({ error: "method not allowed" }, 405);
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

    const resp = await fetch(`${ELKS_BASE}/Numbers?active=yes`, { headers: { Authorization: auth } });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return json({ error: `46elks ${resp.status}`, details: (data as any)?.message || JSON.stringify(data) }, 502);
    }
    const numbers = Array.isArray((data as any)?.data) ? (data as any).data : [];

    // The /Numbers list endpoint usually omits `secret`. Fetch each number individually.
    const detailed = await Promise.all(
      numbers.map(async (n: any) => {
        if (typeof n?.secret === "string" && n.secret.length > 0) return n;
        try {
          const r = await fetch(`${ELKS_BASE}/Numbers/${n.id}`, { headers: { Authorization: auth } });
          if (!r.ok) return n;
          return await r.json();
        } catch { return n; }
      })
    );

    const sipCapable = detailed
      .filter((n: any) => typeof n?.secret === "string" && n.secret.length > 0)
      .map((n: any) => {
        const num = String(n.number || "").replace(/^\+/, "");
        return {
          id: n.id,
          number: num,
          country: n.country,
          capabilities: n.capabilities,
          sip_username: num,
          sip_password: n.secret,
          sip_uri: `sip:${num}@voip.46elks.com`,
        };
      });

    return json({
      ok: true,
      count: sipCapable.length,
      credentials: sipCapable,
      debug: {
        total_numbers: numbers.length,
        numbers: detailed.map((n: any) => ({
          id: n?.id,
          number: n?.number,
          capabilities: n?.capabilities,
          has_secret: typeof n?.secret === "string" && n.secret.length > 0,
        })),
      },
    });
  } catch (err: any) {
    console.error("[elks46-ingest:get_webrtc_credentials] error", err?.message ?? err);
    return json({ error: err?.message ?? "internal error" }, 500);
  }
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
