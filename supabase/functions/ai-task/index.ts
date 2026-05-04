/**
 * ai-task — Consolidated AI Task Hub
 *
 * Replaces N thin AI-wrapper edge functions with one router. Each "task" is a
 * declarative spec (prompt + tool schema + tier) registered in `tasks.ts`.
 *
 * Why: every Lovable-style edge func that just calls an LLM with a prompt is
 * 80-150 lines of boilerplate (CORS, auth, ai-config, error handling). This
 * hub owns the boilerplate, modules own the prompt.
 *
 * Request:
 *   POST /functions/v1/ai-task
 *   { "task": "score_candidate", "input": { ... } }
 *
 * Discover:
 *   GET /functions/v1/ai-task        → { tasks: [{name, description, tier}] }
 *
 * NOT a routing layer. The CALLER picks the task explicitly. No intent
 * detection, no LLM-driven dispatch (Law 1).
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAiConfig, isAnthropicProvider } from "../_shared/ai-config.ts";
import { TASKS, listTasks } from "./tasks.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Discovery endpoint
  if (req.method === "GET") {
    return jsonResponse({ tasks: listTasks() });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const taskName: string = body?.task;
    const input = body?.input ?? {};

    if (!taskName) return jsonResponse({ error: "task is required", available: Object.keys(TASKS) }, 400);

    const spec = TASKS[taskName];
    if (!spec) return jsonResponse({ error: `Unknown task: ${taskName}`, available: Object.keys(TASKS) }, 404);

    // Validate input
    const parsedInput = spec.inputSchema.safeParse(input);
    if (!parsedInput.success) {
      return jsonResponse({ error: "Invalid input", details: parsedInput.error.flatten() }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Optional load step — hydrate context from DB
    let promptInput: any = parsedInput.data;
    if (spec.load) {
      try {
        const loaded = await spec.load(parsedInput.data, supabase);
        promptInput = { ...parsedInput.data, ...loaded };
      } catch (err: any) {
        return jsonResponse({ error: err?.message || "load step failed" }, 400);
      }
    }

    // Resolve AI provider for the task's tier (handles vision fallback, local LLM, etc.)
    let ai;
    try {
      ai = await resolveAiConfig(supabase, spec.tier);
    } catch (err: any) {
      return jsonResponse({ error: err?.message || "AI not configured" }, 500);
    }

    const userContent = spec.user(promptInput);
    const messages: any[] = [
      { role: "system", content: spec.system(promptInput) },
      { role: "user", content: userContent },
    ];

    const reqBody: any = {
      model: ai.model,
      messages,
      ...(spec.options ?? {}),
    };
    if (spec.tool) {
      reqBody.tools = [{ type: "function", function: spec.tool }];
      reqBody.tool_choice = { type: "function", function: { name: spec.tool.name } };
    }

    // Anthropic path
    if (isAnthropicProvider(ai.apiUrl)) {
      const sysMsg = messages.find((m) => m.role === "system")?.content ?? "";
      const userMsgs = messages.filter((m) => m.role !== "system");
      const anthropicBody: any = {
        model: ai.model,
        max_tokens: spec.options?.max_tokens ?? 2048,
        temperature: spec.options?.temperature,
        system: sysMsg,
        messages: userMsgs.map((m) => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : m.content,
        })),
      };
      if (spec.tool) {
        anthropicBody.tools = [{
          name: spec.tool.name,
          description: spec.tool.description,
          input_schema: spec.tool.parameters,
        }];
        anthropicBody.tool_choice = { type: "tool", name: spec.tool.name };
      }
      const resp = await fetch(ai.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ai.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(anthropicBody),
      });
      if (!resp.ok) {
        const text = await resp.text();
        console.error(`[ai-task:${taskName}] Anthropic ${resp.status}:`, text);
        return jsonResponse({ error: "AI call failed", status: resp.status }, 502);
      }
      const data = await resp.json();
      const toolUse = (data.content || []).find((b: any) => b.type === "tool_use");
      const rawResult = toolUse?.input
        ?? (data.content || []).find((b: any) => b.type === "text")?.text
        ?? null;
      const finalResult = spec.parse ? spec.parse(rawResult) : rawResult;
      let applied: unknown = undefined;
      if (spec.apply && finalResult != null) {
        try { applied = await spec.apply(promptInput, finalResult, supabase); }
        catch (err: any) { return jsonResponse({ error: `apply failed: ${err?.message}`, result: finalResult }, 500); }
      }
      return jsonResponse({
        success: true,
        task: taskName,
        result: finalResult,
        apply: applied,
        provider_used: ai.provider,
        provider_fallback: ai.fallback,
      });
    }

    // OpenAI-compatible path (OpenAI, Gemini via OpenAI-compat, local)
    if (spec.tool) reqBody.response_format = undefined;

    const resp = await fetch(ai.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ai.apiKey}`,
      },
      body: JSON.stringify(reqBody),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error(`[ai-task:${taskName}] AI ${resp.status} (${ai.provider}):`, text);
      if (resp.status === 429) return jsonResponse({ error: "Rate limited" }, 429);
      if (resp.status === 402) return jsonResponse({ error: "AI credits exhausted" }, 402);
      return jsonResponse({ error: "AI call failed", status: resp.status }, 502);
    }

    const data = await resp.json();
    const choice = data.choices?.[0]?.message;
    let result: unknown;
    if (spec.tool) {
      const tc = choice?.tool_calls?.[0];
      if (!tc) {
        return jsonResponse({ error: "AI did not return structured data", raw: choice?.content }, 422);
      }
      try {
        result = JSON.parse(tc.function.arguments);
      } catch {
        return jsonResponse({ error: "Failed to parse AI tool arguments" }, 422);
      }
    } else {
      result = choice?.content ?? null;
    }

    return jsonResponse({
      success: true,
      task: taskName,
      result: spec.parse ? spec.parse(result) : result,
      provider_used: ai.provider,
      provider_fallback: ai.fallback,
    });
  } catch (err: any) {
    console.error("[ai-task] error:", err);
    return jsonResponse({ error: err?.message ?? "Unknown error" }, 500);
  }
});
