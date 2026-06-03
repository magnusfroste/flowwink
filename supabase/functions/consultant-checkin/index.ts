import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from "../_shared/supabase-clients.ts";
import { resolveAiConfig, isAnthropicProvider } from "../_shared/ai-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ChatMessage { role: "user" | "assistant" | "system"; content: string }
interface Req { messages: ChatMessage[]; checkinId: string }

const UPDATE_TOOL = {
  type: "function" as const,
  function: {
    name: "update_consultant_profile",
    description:
      "Update the consultant's profile fields based on what they shared. Only include fields you have concrete information for. Skills are merged (added); other fields overwrite.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Short 2-3 sentence professional summary" },
        bio: { type: "string", description: "Longer biography paragraph" },
        title: { type: "string", description: "Current professional title" },
        skills_to_add: { type: "array", items: { type: "string" }, description: "New skills/technologies to merge into existing skills list" },
        availability: { type: "string", enum: ["available", "partially_available", "unavailable"] },
        experience_years: { type: "integer", minimum: 0 },
        latest_project: {
          type: "object",
          description: "Append this as a new entry in experience_json",
          properties: {
            company: { type: "string" },
            role: { type: "string" },
            period: { type: "string" },
            description: { type: "string" },
          },
        },
      },
    },
  },
};

function sseChunk(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, checkinId } = (await req.json()) as Req;
    if (!checkinId || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "checkinId and messages required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = getServiceClient();

    const { data: profile, error: profileErr } = await supabase
      .from("consultant_profiles")
      .select("*")
      .eq("id", checkinId)
      .maybeSingle();

    if (profileErr || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let ai;
    try {
      ai = await resolveAiConfig(supabase, "fast");
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: err.message || "AI not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const systemPrompt = `You are FlowPilot helping ${profile.name} update their consultant profile through a friendly check-in conversation.

CURRENT PROFILE:
- Name: ${profile.name}
- Title: ${profile.title ?? "(not set)"}
- Summary: ${profile.summary ?? "(not set)"}
- Skills: ${(profile.skills ?? []).join(", ") || "(none yet)"}
- Experience: ${profile.experience_years ?? 0} years
- Availability: ${profile.availability ?? "available"}

YOUR JOB:
1. Have a warm, conversational chat — ask one focused question at a time.
2. Listen for: recent projects, new skills/tech learned, availability changes, role/title updates.
3. When the user shares concrete updatable info, call the update_consultant_profile tool.
4. After updating, briefly confirm what you saved and ask the next natural question.
5. Keep replies short (2-4 sentences). Use Swedish if the user writes Swedish.`;

    const fullMessages = [{ role: "system" as const, content: systemPrompt }, ...messages];

    // Anthropic — no streaming, simple text response
    if (isAnthropicProvider(ai.apiUrl)) {
      const r = await fetch(ai.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ai.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: ai.model,
          max_tokens: 1024,
          system: systemPrompt,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await r.json();
      const text = data.content?.[0]?.text || "(no response)";
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode(sseChunk(text) + "data: [DONE]\n\n"));
          c.close();
        },
      });
      return new Response(stream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // OpenAI-compatible (OpenAI, Gemini-compat, Local) — stream + tool calls
    const r = await fetch(ai.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ai.apiKey}`,
      },
      body: JSON.stringify({
        model: ai.model,
        messages: fullMessages,
        tools: [UPDATE_TOOL],
        tool_choice: "auto",
        stream: true,
      }),
    });

    if (!r.ok || !r.body) {
      const errText = await r.text();
      console.error("consultant-checkin AI error:", errText);
      return new Response(
        JSON.stringify({ error: "AI request failed", details: errText.slice(0, 500) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Pipe through, but intercept tool calls so we can apply them server-side
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const out = new ReadableStream({
      async start(controller) {
        const reader = r.body!.getReader();
        let buffer = "";
        let toolName = "";
        let toolArgs = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let nl: number;
            while ((nl = buffer.indexOf("\n")) !== -1) {
              const line = buffer.slice(0, nl).trim();
              buffer = buffer.slice(nl + 1);
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6).trim();
              if (payload === "[DONE]") continue;
              try {
                const j = JSON.parse(payload);
                const delta = j.choices?.[0]?.delta;
                if (!delta) continue;

                // Forward text content
                if (delta.content) {
                  controller.enqueue(encoder.encode(sseChunk(delta.content)));
                }
                // Accumulate tool call
                const tc = delta.tool_calls?.[0];
                if (tc?.function?.name) toolName = tc.function.name;
                if (tc?.function?.arguments) toolArgs += tc.function.arguments;
              } catch {
                // ignore parse errors
              }
            }
          }

          // Apply tool call if any
          if (toolName === "update_consultant_profile" && toolArgs) {
            try {
              const args = JSON.parse(toolArgs);
              const patch: Record<string, any> = {};
              if (typeof args.summary === "string") patch.summary = args.summary;
              if (typeof args.bio === "string") patch.bio = args.bio;
              if (typeof args.title === "string") patch.title = args.title;
              if (typeof args.experience_years === "number") patch.experience_years = args.experience_years;
              if (typeof args.availability === "string") patch.availability = args.availability;
              if (Array.isArray(args.skills_to_add) && args.skills_to_add.length) {
                const existing = new Set<string>(profile.skills ?? []);
                for (const s of args.skills_to_add) if (typeof s === "string") existing.add(s.trim());
                patch.skills = Array.from(existing).filter(Boolean);
              }
              if (args.latest_project && typeof args.latest_project === "object") {
                const exp = Array.isArray(profile.experience_json) ? [...profile.experience_json] : [];
                exp.unshift(args.latest_project);
                patch.experience_json = exp.slice(0, 20);
              }

              if (Object.keys(patch).length) {
                patch.updated_at = new Date().toISOString();
                const { error: upErr } = await supabase
                  .from("consultant_profiles")
                  .update(patch)
                  .eq("id", checkinId);
                if (upErr) {
                  console.error("Profile update failed:", upErr);
                  controller.enqueue(encoder.encode(sseChunk(`\n\n_(Could not save: ${upErr.message})_`)));
                } else {
                  const savedFields = Object.fromEntries(
                    Object.entries(patch).filter(([k]) => k !== "updated_at"),
                  );
                  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content ?? null;
                  await supabase.from("consultant_checkin_log").insert({
                    profile_id: checkinId,
                    fields_updated: savedFields,
                    last_user_message: lastUserMsg,
                    source: "chat",
                  });
                  const fields = Object.keys(savedFields).join(", ");
                  controller.enqueue(encoder.encode(sseChunk(`\n\n✅ Saved: ${fields}`)));
                }
              }
            } catch (e) {
              console.error("Tool args parse failed:", e, toolArgs);
            }
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (e) {
          console.error("Stream error:", e);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(out, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err: any) {
    console.error("consultant-checkin error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
