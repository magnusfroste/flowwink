/**
 * voice-ingest — provider-agnostisk callback-handler för voice.
 *
 * Tar emot inkommande callbacks från valfri voice-provider (46elks, Twilio, ...)
 * normaliserar payloaden, beslutar routing (connect/voicemail/IVR) baserat på
 * agentstatus, persisterar samtalet i voice_calls och returnerar provider-specifik
 * action.
 *
 * En enda edge function för hela voice-modulen — adapterval sker i kod, inte
 * via separata functions per provider.
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
  | { type: "hangup" };

// ── Provider adapters (duplicate of src/lib/voice-providers, inlined for edge runtime) ──

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
    body.forEach((v, k) => {
      raw[k] = v.toString();
    });
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
    case "hangup":
      payload = { hangup: "true" };
      break;
  }
  return { body: JSON.stringify(payload), contentType: "application/json" };
}

// ── Provider dispatcher ──

function parseIncoming(provider: ProviderId, body: FormData | Record<string, unknown>): NormalizedCall | null {
  if (provider === "elks46") return parseElks46(body);
  // Twilio: not yet implemented in edge — falls back to noop.
  return null;
}

function serializeAction(provider: ProviderId, action: VoiceAction) {
  if (provider === "elks46") return serializeElks46(action);
  // Twilio TwiML stub
  return { body: `<?xml version="1.0"?><Response><Hangup/></Response>`, contentType: "application/xml" };
}

// ── Routing decision ──

interface RoutingContext {
  supabase: ReturnType<typeof createClient>;
  call: NormalizedCall;
}

async function decideAction(ctx: RoutingContext): Promise<VoiceAction> {
  const { supabase, call } = ctx;

  // Inbound start: find online agent and bridge via SIP, else voicemail
  if (call.event === "start") {
    const { data: agents } = await supabase
      .from("support_agents")
      .select("id, voice_sip_uri, voice_mobile_number, voice_enabled, status")
      .eq("voice_enabled", true)
      .in("status", ["online", "away"])
      .limit(1);

    const agent = agents?.[0];
    if (agent?.voice_sip_uri) {
      return {
        type: "sip",
        target: `sip:${agent.voice_sip_uri}`,
        callerId: call.from,
        timeoutSeconds: 25,
      };
    }
    if (agent?.voice_mobile_number) {
      return { type: "connect", target: agent.voice_mobile_number, callerId: call.from, timeoutSeconds: 25 };
    }
    // No agent → voicemail
    return {
      type: "play",
      url: "https://flowwink.lovable.app/audio/voicemail-greeting.mp3",
      next: buildSelfUrl(`?stage=record&provider=${call.provider}`),
    };
  }

  if (call.event === "no_answer" || call.event === "hangup") {
    return { type: "hangup" };
  }

  return { type: "hangup" };
}

function buildSelfUrl(qs: string): string {
  const base = Deno.env.get("SUPABASE_URL");
  return `${base}/functions/v1/voice-ingest${qs}`;
}

// ── Persistence ──

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
        metadata: { initial_action: action, raw: call.raw },
      },
      { onConflict: "provider,provider_call_id" },
    );
    return;
  }

  if (call.event === "answered") {
    await supabase
      .from("voice_calls")
      .update({ status: "answered", answered_at: now })
      .eq("provider", call.provider)
      .eq("provider_call_id", call.providerCallId);
    return;
  }

  if (call.event === "hangup" || call.event === "no_answer") {
    const { data: existing } = await supabase
      .from("voice_calls")
      .select("status, started_at, answered_at")
      .eq("provider", call.provider)
      .eq("provider_call_id", call.providerCallId)
      .maybeSingle();

    const wasAnswered = !!existing?.answered_at;
    const finalStatus = wasAnswered
      ? "completed"
      : call.event === "no_answer"
        ? "missed"
        : existing?.status === "voicemail"
          ? "voicemail"
          : "missed";

    await supabase
      .from("voice_calls")
      .update({
        status: finalStatus,
        ended_at: now,
        duration_seconds: call.recordingDurationSeconds,
        callback_status: finalStatus === "missed" ? "pending" : "none",
      })
      .eq("provider", call.provider)
      .eq("provider_call_id", call.providerCallId);
    return;
  }

  if (call.event === "recording_ready") {
    await supabase
      .from("voice_calls")
      .update({
        status: "voicemail",
        voicemail: true,
        recording_url: call.recordingUrl,
        recording_duration_seconds: call.recordingDurationSeconds,
        callback_status: "pending",
      })
      .eq("provider", call.provider)
      .eq("provider_call_id", call.providerCallId);
  }
}

// ── HTTP entrypoint ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const url = new URL(req.url);
    const providerHint = (url.searchParams.get("provider") as ProviderId | null) ?? "elks46";

    // Body kan vara form-data (46elks/Twilio) eller JSON (testbänk)
    const ct = req.headers.get("content-type") ?? "";
    let body: FormData | Record<string, unknown>;
    if (ct.includes("application/json")) {
      body = await req.json();
    } else {
      body = await req.formData();
    }

    const call = parseIncoming(providerHint, body);
    if (!call) {
      return new Response(JSON.stringify({ error: "unrecognized voice payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const action = await decideAction({ supabase, call });
    await persistCall(supabase, call, action);

    const serialized = serializeAction(providerHint, action);
    return new Response(serialized.body, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": serialized.contentType },
    });
  } catch (err) {
    console.error("[voice-ingest] error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
