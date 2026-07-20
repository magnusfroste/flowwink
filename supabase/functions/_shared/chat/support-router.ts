// support-router — chat-kernel helper (edge-surface B1b).
//
// Moved from the standalone support-router edge function; its only caller was
// chat-completion's handoff_to_human / create_escalation tools, over an
// internal HTTP hop. Thin wrapper over the route_conversation_to_agent RPC —
// the single routing primitive for every channel (Law 1). Response objects
// unchanged: { action: 'handoff_to_agent' | 'create_escalation' | 'error', ... }.

import { getServiceClient } from '../supabase-clients.ts';

export async function routeConversationToAgent(body: {
  conversationId?: string;
  sentiment?: { urgency?: string; trigger?: string; [k: string]: unknown };
  reason?: string;
}): Promise<Record<string, unknown>> {
  try {
    const conversationId = body.conversationId;
    if (!conversationId) {
      return { action: "error", message: "conversationId is required" };
    }

    const sentiment = body.sentiment ?? {};
    const reason: string | null = (sentiment.trigger as string) ?? body.reason ?? null;
    const urgency: string = (sentiment.urgency as string) ?? "normal";

    const supabase = getServiceClient();
    const { data, error } = await supabase.rpc("route_conversation_to_agent", {
      p_conversation_id: conversationId,
      p_reason: reason,
      p_urgency: urgency,
    });

    if (error) {
      console.error("[support-router] rpc error:", error.message);
      return { action: "error", message: error.message };
    }

    return data as Record<string, unknown>;
  } catch (err: any) {
    console.error("[support-router] error:", err?.message ?? err);
    return { action: "error", message: err?.message ?? "Internal error" };
  }
}
