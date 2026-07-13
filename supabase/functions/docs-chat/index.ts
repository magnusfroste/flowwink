// Public AI chat over the docs (Retrieval Engine consumer — see
// docs/architecture/retrieval-engine.md). No JWT required (visitors are
// anonymous). Retrieval runs with the CALLER's eyes: the anon client + RLS
// on knowledge_chunks means this surface can only ever ground on 'public'
// chunks — never internal wiki/documents content.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAnonClient, getServiceClient } from '../_shared/supabase-clients.ts';
import { retrieve, renderContext } from '../_shared/retrieval/index.ts';
import { embedQuery } from '../_shared/retrieval/embedder.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Msg { role: "user" | "assistant" | "system"; content: string }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { messages = [] } = (await req.json()) as { messages: Msg[] };
    if (!messages.length) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

    // Hybrid: the query embedding is computed with provider CONFIG (service
    // client — site_settings holds the API keys; null → text-only, Law 4).
    // The chunk SEARCH still runs with the caller's eyes (anon client + RLS).
    const queryEmbedding = await embedQuery(getServiceClient(), lastUser);

    // This surface answers from the docs site only (sources filter runs in SQL).
    const chunks = await retrieve(getAnonClient(), {
      query: lastUser,
      k: 8,
      tokenBudget: 4000,
      sources: ["docs_pages"],
      queryEmbedding,
    });

    const context = renderContext(chunks);

    const systemPrompt = `You are the Flowwink docs assistant. You help evaluators understand what Flowwink is, how it works, and what modules/processes exist.

RULES:
- Answer ONLY from the provided documentation context below. If the answer is not in the docs, say so honestly and suggest what to read.
- Always cite sources inline using markdown links to /docs/{category}/{slug} (these paths work on this site).
- Be concise. Prefer bullet points. Lead with the answer, then context.
- Tone: confident, friendly, technical when needed. Flowwink is a self-hosted Business Operating System powered by autonomous agents (FlowPilot).

DOCUMENTATION CONTEXT:
${context || "(no relevant docs found for this query)"}`;

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI gateway not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        stream: true,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiRes.text();
      return new Response(JSON.stringify({ error: "AI gateway error", details: t }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(aiRes.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
