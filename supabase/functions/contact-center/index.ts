import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { resolveAiConfig } from '../_shared/ai-config.ts';
import { callAiCompletion } from '../_shared/ai-usage-logger.ts';

/**
 * Contact Center — multi-skill router (Contact Center, Fas 1).
 *
 * Called by agent-execute as an `edge:contact-center` handler, which POSTs
 * { ...args, _skill: <skill name> }. Dispatches:
 *   - manage_channel       — verify / configure a channel (Telegram getMe + setWebhook), or list channels
 *   - send_channel_message — send an outbound message on a channel (agent reply → Telegram)
 *   - handle_voicemail     — FlowPilot analysis of a voicemail transcript (intent/sentiment/summary)
 *
 * Inbound Telegram messages arrive at the separate telegram-ingest webhook, not here.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VM_TOOL = {
  type: "function",
  function: {
    name: "analyze_voicemail",
    description: "Extract structured fields from a voicemail transcript.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "One- or two-sentence summary of what the caller wants." },
        intent: { type: "string", description: "Short label, e.g. callback_request, complaint, sales_inquiry, support." },
        sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
        callback_requested: { type: "boolean" },
      },
      required: ["summary", "intent", "sentiment", "callback_requested"],
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = getServiceClient();
  try {
    const body = await req.json();
    const skill: string = body._skill || body.skill || "";

    switch (skill) {
      case "manage_channel":   return json(await manageChannel(supabase, body), 200);
      case "send_channel_message": return json(await sendChannelMessage(supabase, body), 200);
      case "handle_voicemail": return json(await handleVoicemail(supabase, body), 200);
      default:
        return json({ error: `Unknown contact-center skill: ${skill || "(none)"}` }, 400);
    }
  } catch (err: any) {
    console.error("[contact-center] error:", err?.message ?? err);
    return json({ error: err?.message ?? "Internal error" }, 500);
  }
});

// ── manage_channel ────────────────────────────────────────────────────────────
async function manageChannel(supabase: any, args: any) {
  const action: string = args.action || "test";
  const channel: string = args.channel || "telegram";
  if (channel !== "telegram") return { error: `Channel '${channel}' not supported yet (telegram only).` };

  const { data: row } = await supabase
    .from("site_settings").select("value").eq("key", "integrations").maybeSingle();
  const integrations = (row?.value as any) ?? {};
  const stored = integrations.telegram?.config ?? {};
  const botToken: string = args.bot_token || stored.bot_token || Deno.env.get("TELEGRAM_BOT_TOKEN") || "";

  if (!botToken) return { success: false, error: "No bot_token provided or stored." };

  if (action === "list") {
    return { success: true, channels: Object.keys(integrations).filter((k) => integrations[k]?.config) };
  }

  // Verify the token against Telegram.
  const me = await fetch(`https://api.telegram.org/bot${botToken}/getMe`).then((r) => r.json()).catch(() => null);
  if (!me?.ok) return { success: false, error: "Telegram rejected the bot token (getMe failed)." };

  if (action === "test") {
    return { success: true, bot: { username: me.result?.username, id: me.result?.id } };
  }

  if (action === "configure") {
    const webhookUrl: string = args.webhook_url || stored.webhook_url || "";
    if (!webhookUrl) return { success: false, error: "webhook_url is required to configure." };
    const secret = stored.webhook_secret || crypto.randomUUID().replace(/-/g, "");

    const set = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl, secret_token: secret }),
    }).then((r) => r.json()).catch(() => null);
    if (!set?.ok) return { success: false, error: `setWebhook failed: ${set?.description ?? "unknown"}` };

    integrations.telegram = {
      ...(integrations.telegram ?? {}),
      config: { ...stored, bot_token: botToken, webhook_url: webhookUrl, webhook_secret: secret },
    };
    await supabase.from("site_settings")
      .upsert({ key: "integrations", value: integrations }, { onConflict: "key" });
    return { success: true, bot: { username: me.result?.username }, webhook_set: true };
  }

  return { error: `Unknown manage_channel action '${action}' (use test | configure | list).` };
}

// ── send_channel_message ────────────────────────────────────────────────────────
async function sendChannelMessage(supabase: any, args: any) {
  const text: string = args.text || args.content || "";
  if (!text) return { error: "text is required" };

  let threadId: string | undefined = args.channel_thread_id;
  let channel: string = args.channel || "telegram";
  if (!threadId && args.conversation_id) {
    const { data: conv } = await supabase.from("chat_conversations")
      .select("channel, channel_thread_id").eq("id", args.conversation_id).maybeSingle();
    threadId = conv?.channel_thread_id; channel = conv?.channel || channel;
  }
  if (channel !== "telegram") return { error: `Channel '${channel}' outbound not supported yet.` };
  if (!threadId) return { error: "No channel_thread_id (or conversation_id resolving to one)." };

  const { data: row } = await supabase
    .from("site_settings").select("value").eq("key", "integrations").maybeSingle();
  const botToken: string = (row?.value as any)?.telegram?.config?.bot_token || Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
  if (!botToken) return { error: "Telegram bot token not configured." };

  const sent = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: threadId, text }),
  }).then((r) => r.json()).catch(() => null);
  if (!sent?.ok) return { error: `Telegram sendMessage failed: ${sent?.description ?? "unknown"}` };
  return { success: true, message_id: sent.result?.message_id };
}

// ── handle_voicemail ───────────────────────────────────────────────────────────
async function handleVoicemail(supabase: any, args: any) {
  const action: string = args.action || "summarize";
  const voicemailId: string = args.voicemail_id;
  if (!voicemailId) return { error: "voicemail_id is required" };
  if (action !== "summarize") return { error: `Unknown handle_voicemail action '${action}'.` };

  const { data: vm } = await supabase
    .from("voicemail_messages").select("id, transcript_text").eq("id", voicemailId).maybeSingle();
  if (!vm) return { error: "voicemail not found" };
  if (!vm.transcript_text) {
    return { error: "voicemail has no transcript yet (transcription lands with the voice channel)." };
  }

  const ai = await resolveAiConfig(supabase, "fast");
  const result = await callAiCompletion({
    supabase, source: "voicemail-analysis",
    provider: ai.provider, model: ai.model, apiUrl: ai.apiUrl, apiKey: ai.apiKey,
    metadata: { voicemail_id: voicemailId },
    body: {
      messages: [
        { role: "system", content: "You analyze customer voicemail transcripts for a contact center. Be concise and factual." },
        { role: "user", content: `Analyze this voicemail transcript:\n\n${vm.transcript_text}` },
      ],
      tools: [VM_TOOL],
      tool_choice: { type: "function", function: { name: "analyze_voicemail" } },
      temperature: 0.1,
    },
  });

  const toolCall = result?.choices?.[0]?.message?.tool_calls?.[0];
  let parsed: any = {};
  try { parsed = JSON.parse(toolCall?.function?.arguments ?? "{}"); } catch { /* keep {} */ }

  await supabase.from("voicemail_messages").update({
    summary: parsed.summary ?? null,
    intent: parsed.intent ?? null,
    sentiment: parsed.sentiment ?? null,
    callback_requested: parsed.callback_requested ?? false,
    transcript_status: "success",
    ai_model_used: ai.model,
    analyzed_at: new Date().toISOString(),
  }).eq("id", voicemailId);

  return { success: true, ...parsed };
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
