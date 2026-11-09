// Public AI chat over the docs (Retrieval Engine consumer — see
// docs/architecture/retrieval-engine.md). No JWT required (visitors are
// anonymous). Grounding runs through retrieveVendorDocs — the one NAMED
// exception to caller's-eyes retrieval: docs_pages chunks are classed
// 'internal' (so no customer-facing anon surface can request them, #214),
// which starved this surface when it searched with anon eyes — from
// 2026-08-12 it grounded on nothing and answered "not in the documentation"
// fleet-wide (#95). The exception's scope is pinned inside vendor-docs.ts
// (sources = docs_pages only, not a parameter); this request body carries
// only `messages`, so no caller input can widen it.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { publicAiLimit } from '../_shared/rate-limit.ts';
import { renderContext } from '../_shared/retrieval/index.ts';
import { retrieveVendorDocs } from '../_shared/retrieval/vendor-docs.ts';
import { embedQuery } from '../_shared/retrieval/embedder.ts';
import { resolveAiConfig } from '../_shared/ai-config.ts';
import { callAi } from '../_shared/ai-call.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Msg { role: "user" | "assistant" | "system"; content: string }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // A paid model call for anyone with the publishable key: counted per visitor
  // and per instance (_shared/rate-limit.ts). The platform's own calls are not.
  const limited = await publicAiLimit(req, getServiceClient(), 'docs-chat', corsHeaders);
  if (limited) return limited;

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
    const queryEmbedding = await embedQuery(getServiceClient(), lastUser);

    // This surface answers from the vendor docs only — the source pin lives
    // inside retrieveVendorDocs, not here (see the header comment).
    const chunks = await retrieveVendorDocs(getServiceClient(), {
      query: lastUser,
      k: 8,
      tokenBudget: 4000,
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

    // The instance's OWN configured AI provider (System AI settings) via the
    // platform adapter — this function was hardwired to Lovable's gateway
    // (LOVABLE_API_KEY + ai.gateway.lovable.dev), which only exists on the
    // Lovable-managed dev instance: every self-hosted/fork install answered
    // "AI gateway not configured" no matter what the admin configured
    // (www.flowwink.com/docs, found live 2026-08-14). Law 3: no parallel
    // AI pipelines — the adapter is the one door.
    let ai;
    try {
      ai = await resolveAiConfig(getServiceClient(), 'fast');
    } catch (cfgErr) {
      return new Response(JSON.stringify({
        error: "No AI provider configured — set one under Settings → System AI.",
        details: cfgErr instanceof Error ? cfgErr.message : String(cfgErr),
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiRes = await callAi({
      apiKey: ai.apiKey,
      apiUrl: ai.apiUrl,
      model: ai.model,
      stream: true,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
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
