// Public AI chat scoped to docs_pages content (CAG: load relevant pages → answer with citations).
// No JWT required (visitors are anonymous). Reads docs_pages via service role.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Msg { role: "user" | "assistant" | "system"; content: string }

function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9åäö]+/gi) ?? []).filter((t) => t.length > 2);
}

function score(text: string, queryTokens: string[]): number {
  const lc = text.toLowerCase();
  let s = 0;
  for (const t of queryTokens) {
    const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g");
    const matches = lc.match(re);
    if (matches) s += matches.length;
  }
  return s;
}

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
    const queryTokens = tokenize(lastUser);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: pages } = await supabase
      .from("docs_pages")
      .select("category, slug, title, content, frontmatter")
      .limit(500);

    const ranked = (pages ?? [])
      .map((p) => ({
        ...p,
        _score: score(p.title, queryTokens) * 5 + score(p.content.slice(0, 4000), queryTokens),
      }))
      .filter((p) => p._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);

    const context = ranked
      .map(
        (p, i) =>
          `[Doc ${i + 1}] ${p.title} (/docs/${p.category}/${p.slug})\n${p.content.slice(0, 2500)}`,
      )
      .join("\n\n---\n\n");

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
