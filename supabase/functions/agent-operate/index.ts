import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  resolveAiConfig,
  loadSoulIdentity,
  buildSoulPrompt,
  loadMemories,
  loadObjectives,
  fetchSkillInstructions,
  loadSkillTools,
  getBuiltInTools,
  executeBuiltInTool,
  isBuiltInTool,
} from "../agent-reason/index.ts";

/**
 * FlowPilot Operate — Interactive streaming agent
 *
 * Thin SSE wrapper around the shared agent-reason core.
 * Handles: streaming responses, tool iteration status events,
 * skill result metadata, and final token-by-token output.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_TOOL_ITERATIONS = 6;

// ─── SSE helpers ──────────────────────────────────────────────────────────────

function sseEvent(writer: WritableStreamDefaultWriter, encoder: TextEncoder, event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return writer.write(encoder.encode(payload));
}

// ─── Main handler (streaming) ─────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, available_skills } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Resolve AI config via shared module
    const { apiKey, apiUrl, model } = await resolveAiConfig(supabase);

    // Load context in parallel via shared module
    const [{ soul, identity }, memoryContext, objectiveContext] = await Promise.all([
      loadSoulIdentity(supabase),
      loadMemories(supabase),
      loadObjectives(supabase),
    ]);

    const soulPrompt = buildSoulPrompt(soul, identity);

    const systemPrompt = `You are FlowPilot — an autonomous, self-improving AI agent that operates a CMS platform.
${soulPrompt}

You can use MULTIPLE tools in a single turn and CHAIN tool calls across iterations.
When a task requires multiple steps, execute them sequentially — don't just describe a plan.

TOOLS & SKILLS:
- CMS skills: blog posts, leads, analytics, bookings, newsletters, etc.
- PERSISTENT MEMORY (memory_write / memory_read)
- OBJECTIVES (objective_update_progress / objective_complete)
- SELF-MODIFICATION: You can create, update, disable, and list your own skills and automations.
- SELF-EVOLUTION: Use 'soul_update' to evolve your personality/values, 'skill_instruct' to add knowledge to skills.
- REFLECTION: Use 'reflect' to analyze your performance — findings are auto-persisted as learnings.

SELF-IMPROVEMENT GUIDELINES:
- If a user asks you to do something you can't, consider creating a new skill for it.
- When you notice repetitive manual tasks, suggest creating an automation.
- Use 'reflect' periodically (or when asked) to review your own performance.
- Use 'skill_instruct' to enrich skills with context, examples, and edge cases.
- Use 'soul_update' when you learn something fundamental about your role.
- When creating skills, set requires_approval=true for anything destructive.
- New automations are disabled by default — tell the user to enable them when ready.
- Handler types: module:name (DB ops), edge:function (edge functions), db:table (queries), webhook:url (external)

MEMORY GUIDELINES:
- Save user preferences, facts, and context with memory_write
- Check memory before answering questions about the site
${memoryContext}

OBJECTIVES:
- After executing skills that contribute to an objective, update progress.
- When all success_criteria are met, mark as complete.
${objectiveContext}
${skillInstructions}

RULES:
- When the user asks you to do something, USE the appropriate tools immediately.
- You can call MULTIPLE tools in parallel when they're independent.
- After tool results come back, you may call MORE tools if the task isn't done.
- After all actions complete, summarize what you did concisely.
- Use markdown formatting for clear, readable responses.
- Be concise but thorough. Use emoji sparingly.`;

    // Build tools via shared module
    const builtInTools = getBuiltInTools(['memory', 'objectives', 'self-mod', 'reflect', 'soul']);
    const allTools = [...builtInTools, ...(available_skills || [])];

    // ─── Set up SSE stream ────────────────────────────────────────────
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    const response = new Response(readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

    // Run the agent loop in background
    (async () => {
      try {
        let conversationMessages: any[] = [
          { role: 'system', content: systemPrompt },
          ...messages,
        ];

        const allSkillResults: any[] = [];

        for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
          const aiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              messages: conversationMessages,
              tools: allTools.length > 0 ? allTools : undefined,
              tool_choice: allTools.length > 0 ? 'auto' : undefined,
            }),
          });

          if (!aiResponse.ok) {
            const errText = await aiResponse.text();
            console.error('AI error:', aiResponse.status, errText);
            await sseEvent(writer, encoder, 'error', { message: 'AI provider error' });
            break;
          }

          const aiData = await aiResponse.json();
          const choice = aiData.choices?.[0];

          if (!choice) {
            await sseEvent(writer, encoder, 'error', { message: 'No response from AI' });
            break;
          }

          const assistantMessage = choice.message;

          // No tool calls — stream the final text response
          if (!assistantMessage.tool_calls?.length) {
            if (allSkillResults.length > 0) {
              await sseEvent(writer, encoder, 'skill_results', allSkillResults);
            }
            const finalContent = assistantMessage.content || 'Done.';
            await streamFinalResponse(apiUrl, apiKey, model, conversationMessages, writer, encoder, finalContent);
            break;
          }

          // Tool calls — execute via shared module
          conversationMessages.push(assistantMessage);

          const toolNames = assistantMessage.tool_calls.map((tc: any) => tc.function.name);
          await sseEvent(writer, encoder, 'tool_start', { iteration: iteration + 1, tools: toolNames });

          const toolResults = await Promise.all(
            assistantMessage.tool_calls.map(async (tc: any) => {
              const fnName = tc.function.name;
              let fnArgs: any;
              try { fnArgs = JSON.parse(tc.function.arguments || '{}'); } catch { fnArgs = {}; }

              let result: any;
              try {
                result = await executeBuiltInTool(supabase, supabaseUrl, serviceKey, fnName, fnArgs);
              } catch (err: any) {
                result = { error: err.message };
              }

              if (!isBuiltInTool(fnName)) {
                allSkillResults.push({ skill: fnName, status: result?.status || 'success', result: result?.result || result });
              }

              return { role: 'tool' as const, tool_call_id: tc.id, content: JSON.stringify(result) };
            })
          );

          conversationMessages.push(...toolResults);
          await sseEvent(writer, encoder, 'tool_done', { iteration: iteration + 1, tools: toolNames, results_count: toolResults.length });
        }
      } catch (err: any) {
        console.error('agent-operate stream error:', err);
        try { await sseEvent(writer, encoder, 'error', { message: err.message || 'Internal error' }); } catch { /* writer closed */ }
      } finally {
        try { await writer.close(); } catch { /* already closed */ }
      }
    })();

    return response;

  } catch (err: any) {
    console.error('agent-operate error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ─── Stream final AI response token-by-token ─────────────────────────────────

async function streamFinalResponse(
  apiUrl: string,
  apiKey: string,
  model: string,
  conversationMessages: any[],
  writer: WritableStreamDefaultWriter,
  encoder: TextEncoder,
  fallbackContent: string,
) {
  try {
    const streamResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: conversationMessages, stream: true }),
    });

    if (!streamResponse.ok || !streamResponse.body) {
      await sseEvent(writer, encoder, 'delta', { content: fallbackContent });
      await sseEvent(writer, encoder, 'done', {});
      return;
    }

    const reader = streamResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (!line.startsWith('data: ')) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') {
          await sseEvent(writer, encoder, 'done', {});
          return;
        }

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            await sseEvent(writer, encoder, 'delta', { content });
          }
        } catch {
          buffer = line + '\n' + buffer;
          break;
        }
      }
    }

    // Flush remaining
    if (buffer.trim()) {
      for (let raw of buffer.split('\n')) {
        if (!raw) continue;
        if (raw.endsWith('\r')) raw = raw.slice(0, -1);
        if (!raw.startsWith('data: ')) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === '[DONE]') continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) await sseEvent(writer, encoder, 'delta', { content });
        } catch { /* ignore */ }
      }
    }

    await sseEvent(writer, encoder, 'done', {});
  } catch (err) {
    console.error('Stream error, falling back:', err);
    await sseEvent(writer, encoder, 'delta', { content: fallbackContent });
    await sseEvent(writer, encoder, 'done', {});
  }
}
