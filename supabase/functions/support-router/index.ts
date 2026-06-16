import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from '../_shared/supabase-clients.ts';

/**
 * Support Router
 *
 * The target the chat handoff has POSTed to all along (chat-completion's
 * `handoff_to_human` / `create_escalation` tools) — it previously 404'd because
 * the function was never created. It is now a thin wrapper over the
 * `route_conversation_to_agent` RPC: presence-aware assignment → queue → escalation.
 *
 * The SAME RPC is the single routing primitive for every channel (web chat today,
 * Telegram/SMS/voice adapters later) — no channel-specific routing here (Law 1).
 *
 * Request  (from chat-completion, service-role auth):
 *   { conversationId, sentiment: { urgency, trigger, ... }, customerEmail?, customerName? }
 * Response (consumed by chat-completion):
 *   { action: 'handoff_to_agent' | 'create_escalation' | 'error', message, agent_id?, status? }
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const conversationId: string | undefined = body.conversationId;
    if (!conversationId) {
      return json({ action: "error", message: "conversationId is required" }, 400);
    }

    const sentiment = body.sentiment ?? {};
    const reason: string | null = sentiment.trigger ?? body.reason ?? null;
    const urgency: string = sentiment.urgency ?? "normal";

    const supabase = getServiceClient();
    const { data, error } = await supabase.rpc("route_conversation_to_agent", {
      p_conversation_id: conversationId,
      p_reason: reason,
      p_urgency: urgency,
    });

    if (error) {
      console.error("[support-router] rpc error:", error.message);
      return json({ action: "error", message: error.message }, 500);
    }

    return json(data, 200);
  } catch (err: any) {
    console.error("[support-router] error:", err?.message ?? err);
    return json({ action: "error", message: err?.message ?? "Internal error" }, 500);
  }
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
