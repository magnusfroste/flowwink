import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  resolveAiConfig,
  loadWorkspaceFiles,
  buildWorkspacePrompt,
  loadMemories,
  loadObjectives,
  buildSystemPrompt,
  pruneConversationHistory,
  fetchSkillInstructions,
  loadSkillTools,
  getBuiltInTools,
  executeBuiltInTool,
  isBuiltInTool,
  loadCMSSchema,
  tryAcquireLock,
  releaseLock,
  parseReplyDirectives,
} from "../_shared/agent-reason.ts";

/**
 * FlowPilot Operate — Interactive streaming agent
 * Thin SSE wrapper around the shared agent-reason core + prompt compiler.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_TOOL_ITERATIONS = 6;
const MAX_OPERATE_WALL_CLOCK_MS = 90_000; // 90s wall-clock for interactive operate

function sseEvent(writer: WritableStreamDefaultWriter, encoder: TextEncoder, event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return writer.write(encoder.encode(payload));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, available_skills, conversation_id } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Concurrency guard — one agent run per conversation
    const lane = conversation_id ? `operate:${conversation_id}` : null;
    if (lane) {
      const acquired = await tryAcquireLock(supabase, lane, 'operate', 300);
      if (!acquired) {
        return new Response(
          JSON.stringify({ error: 'Another agent process is running on this conversation' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const { apiKey, apiUrl, model } = await resolveAiConfig(supabase, 'fast');

    // Load context in parallel
    const [{ soul, identity, agents }, memoryContext, objectiveContext, cmsSchemaCtx] = await Promise.all([
      loadWorkspaceFiles(supabase),
      loadMemories(supabase),
      loadObjectives(supabase),
      loadCMSSchema(supabase),
    ]);

    // Use prompt compiler (OpenClaw Layer 1)
    const systemPrompt = buildSystemPrompt({
      mode: 'operate',
      soulPrompt: buildWorkspacePrompt(soul, identity, agents),
      agents,
      memoryContext,
      objectiveContext,
      cmsSchemaContext: cmsSchemaCtx,
    });

    // Build tools — normalize to ensure OpenAI compatibility
    const builtInTools = getBuiltInTools(['memory', 'objectives', 'self-mod', 'reflect', 'soul', 'planning', 'automations-exec', 'workflows', 'a2a', 'skill-packs']);
    const rawTools = [...builtInTools, ...(available_skills || [])];
    
    // OpenAI requires every property to have a 'type' field — fix any that don't
    const allTools = rawTools.map((tool: any) => {
      try {
        const fixProps = (props: any) => {
          if (!props || typeof props !== 'object') return;
          for (const [, val] of Object.entries(props)) {
            const p = val as any;
            if (!p.type && !p.enum && !p.items && !p.oneOf && !p.anyOf) {
              p.type = 'string';
            }
            // OpenAI requires array types to have an 'items' definition
            if (p.type === 'array' && !p.items) {
              p.items = { type: 'string' };
            }
            // Recurse into nested object properties
            if (p.type === 'object' && p.properties) {
              fixProps(p.properties);
            }
          }
        };
        fixProps(tool?.function?.parameters?.properties);
        // Remove empty required arrays (OpenAI doesn't like required: [])
        const params = tool?.function?.parameters;
        if (params?.required && Array.isArray(params.required) && params.required.length === 0) {
          delete params.required;
        }
      } catch { /* safety net */ }
      return tool;
    });

    // Set up SSE stream
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

    (async () => {
      const operateTimeout = setTimeout(async () => {
        console.warn(`[operate] Wall-clock timeout (${MAX_OPERATE_WALL_CLOCK_MS}ms) — closing stream`);
        try {
          await sseEvent(writer, encoder, 'error', { message: 'Operation timed out. Partial results may have been returned.' });
          await sseEvent(writer, encoder, 'done', {});
        } catch { /* writer closed */ }
        try { await writer.close(); } catch { /* already closed */ }
      }, MAX_OPERATE_WALL_CLOCK_MS);

      try {
        // Apply context pruning before starting
        let conversationMessages: any[] = await pruneConversationHistory(
          [{ role: 'system', content: systemPrompt }, ...messages],
          supabase,
        );

        const allSkillResults: any[] = [];
        const loadedInstructions = new Set<string>();

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
            let errorDetail = 'AI provider error';
            try {
              const parsed = JSON.parse(errText);
              errorDetail = parsed?.error?.message || parsed?.message || `AI error ${aiResponse.status}`;
            } catch { errorDetail = `AI error ${aiResponse.status}: ${errText.slice(0, 200)}`; }
            await sseEvent(writer, encoder, 'error', { message: errorDetail });
            break;
          }

          const aiData = await aiResponse.json();
          const choice = aiData.choices?.[0];

          if (!choice) {
            await sseEvent(writer, encoder, 'error', { message: 'No response from AI' });
            break;
          }

          const assistantMessage = choice.message;

          if (!assistantMessage.tool_calls?.length) {
            if (allSkillResults.length > 0) {
              await sseEvent(writer, encoder, 'skill_results', allSkillResults);
            }
            const finalContent = assistantMessage.content || 'Done.';
            const { cleanContent } = parseReplyDirectives(finalContent);
            await streamFinalResponse(apiUrl, apiKey, model, conversationMessages, writer, encoder, cleanContent || finalContent);
            break;
          }

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
                allSkillResults.push({ skill: fnName, status: result?.error ? 'failed' : (result?.status || 'success'), result: result?.result || result });
              }

              return { role: 'tool' as const, tool_call_id: tc.id, content: JSON.stringify(result) };
            })
          );

          conversationMessages.push(...toolResults);

          // Lazy instruction loading
          const calledSkillNames = assistantMessage.tool_calls
            .map((tc: any) => tc.function.name)
            .filter((n: string) => !isBuiltInTool(n));
          if (calledSkillNames.length > 0) {
            const instrContext = await fetchSkillInstructions(supabase, calledSkillNames, loadedInstructions);
            if (instrContext) {
              conversationMessages.push({ role: 'system', content: instrContext });
            }
          }

          await sseEvent(writer, encoder, 'tool_done', { iteration: iteration + 1, tools: toolNames, results_count: toolResults.length });
        }
      } catch (err: any) {
        console.error('agent-operate stream error:', err);
        try { await sseEvent(writer, encoder, 'error', { message: err.message || 'Internal error' }); } catch { /* writer closed */ }
      } finally {
        clearTimeout(operateTimeout);
        if (lane) {
          try { await releaseLock(supabase, lane); } catch { /* best effort */ }
        }
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
