import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient } from '../_shared/supabase-clients.ts';
import {
  loadWorkspaceFiles,
  buildWorkspacePrompt,
  buildSystemPrompt,
  loadSkillTools,
} from "../_shared/agent-reason.ts";
import { scheduleAiUsageLog } from "../_shared/ai-usage-logger.ts";
import {
  type ProviderConfig,
  tryResolveProvider,
  resolveProviderWithFallback,
  handleN8nWebhook,
  handleAiError,
} from "../_shared/ai-providers.ts";
import {
  extractTextFromTiptap,
  extractTextFromBlock,
  buildKnowledgeBase,
  loadVisitorContext,
} from "../_shared/chat-context.ts";

/**
 * Chat Completion — Visitor-facing AI chat
 *
 * Now unified with agent-reason core:
 * - Soul/Identity personality injected via buildSystemPrompt(mode='chat')
 * - External skills loaded from DB registry via loadSkillTools
 * - Multi-iteration tool loop (up to 4 rounds)
 * - All OpenAI-compatible providers (OpenAI, Gemini compat, Local) use same code path
 * - N8N remains a special webhook passthrough
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const MAX_TOOL_ITERATIONS = 4;

// ─── Types ────────────────────────────────────────────────────────────────────

type ChatContent = string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: ChatContent;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface ChatSettings {
  aiProvider: 'openai' | 'gemini' | 'local' | 'n8n';
  openaiApiKey?: string;
  openaiModel?: string;
  openaiBaseUrl?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  localEndpoint?: string;
  localModel?: string;
  localApiKey?: string;
  localSupportsToolCalling?: boolean;
  n8nWebhookUrl?: string;
  n8nWebhookType?: 'chat' | 'generic';
  systemPrompt?: string;
  includeContentAsContext?: boolean;
  contentContextMaxTokens?: number;
  includedPageSlugs?: string[];
  includeKbArticles?: boolean;
  toolCallingEnabled?: boolean;
  /** Optional allow-list of skill names. Empty/undefined = all external skills. */
  allowedSkillNames?: string[];
  firecrawlSearchEnabled?: boolean;
  humanHandoffEnabled?: boolean;
  sentimentDetectionEnabled?: boolean;
  sentimentThreshold?: number;
  allowGeneralKnowledge?: boolean;
}

interface ChatRequest {
  messages: ChatMessage[];
  conversationId?: string;
  sessionId?: string;
  settings?: ChatSettings;
  customerEmail?: string;
  customerName?: string;
  mode?: string;
  checkinId?: string;
}

// ─── Chat-specific tool definitions ───────────────────────────────────────────

const CHAT_TOOLS: Record<string, any> = {
  firecrawl_search: {
    type: "function",
    function: {
      name: "firecrawl_search",
      description: "Search the web for current information when the user asks about topics not in your knowledge base.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "The search query" } },
        required: ["query"],
      },
    },
  },
  handoff_to_human: {
    type: "function",
    function: {
      name: "handoff_to_human",
      description: "Transfer the conversation to a human support agent when the user is frustrated, explicitly requests a human, or when you cannot help.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Why handoff is needed" },
          urgency: { type: "string", enum: ["low", "normal", "high", "urgent"] },
        },
        required: ["reason", "urgency"],
      },
    },
  },
  create_escalation: {
    type: "function",
    function: {
      name: "create_escalation",
      description: "Create a support ticket when no human agents are available.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Brief summary of the issue" },
          priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
        },
        required: ["summary", "priority"],
      },
    },
  },
  save_visitor_profile: {
    type: "function",
    function: {
      name: "save_visitor_profile",
      description: "Save visitor preferences, interests, or other context to remember them in future conversations. Call when you learn something useful about the visitor.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Visitor's name if provided" },
          preferences: { type: "string", description: "Preferences learned during conversation" },
          interests: { type: "string", description: "Topics or products the visitor is interested in" },
          notes: { type: "string", description: "Any other useful context to remember" },
        },
      },
    },
  },
};

// extractTextFromTiptap, extractTextFromBlock, buildKnowledgeBase,
// loadVisitorContext are imported from ../_shared/chat-context.ts

// ─── Chat tool execution ─────────────────────────────────────────────────────

async function executeChatTool(
  supabase: any, supabaseUrl: string, serviceKey: string,
  toolName: string, args: any,
  conversationId?: string, customerEmail?: string, customerName?: string,
): Promise<string> {
  switch (toolName) {
    case 'firecrawl_search': {
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/firecrawl-search`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: args.query, limit: 3 }),
        });
        const data = await resp.json();
        if (!data.success) return `Search failed: ${data.error}`;
        return (data.results || []).map((r: any) =>
          `**${r.title}** (${r.url})\n${r.description || r.content?.substring(0, 300) || ''}`
        ).join('\n\n') || 'No results found.';
      } catch (err: any) {
        return `Search error: ${err.message}`;
      }
    }

    case 'handoff_to_human':
    case 'create_escalation': {
      if (!conversationId) return 'Cannot create handoff without a conversation ID.';
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/support-router`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId,
            sentiment: {
              frustrationLevel: toolName === 'handoff_to_human' ? 8 : 5,
              urgency: args.urgency || args.priority || 'normal',
              humanNeeded: true,
              trigger: args.reason || args.summary || 'User requested',
            },
            customerEmail, customerName,
          }),
        });
        const data = await resp.json();
        if (data.action === 'handoff_to_agent') return `HANDOFF_SUCCESS: ${data.message}`;
        if (data.action === 'create_escalation') return `ESCALATION_CREATED: ${data.message}`;
        return data.message || 'Handoff processed.';
      } catch (err: any) {
        return `Handoff error: ${err.message}`;
      }
    }

    default: {
      // Check for visitor profile save
      if (toolName === 'save_visitor_profile') {
        if (!conversationId) return 'Cannot save profile without a conversation.';
        try {
          // Merge with existing profile
          const { data: conv } = await supabase
            .from('chat_conversations')
            .select('visitor_profile')
            .eq('id', conversationId).single();

          const existing = conv?.visitor_profile || {};
          const merged = { ...existing };
          if (args.name) merged.name = args.name;
          if (args.preferences) merged.preferences = args.preferences;
          if (args.interests) merged.interests = args.interests;
          if (args.notes) merged.notes = [existing.notes, args.notes].filter(Boolean).join('; ');

          await supabase
            .from('chat_conversations')
            .update({ visitor_profile: merged })
            .eq('id', conversationId);

          return 'Visitor profile saved. I\'ll remember this for future conversations.';
        } catch (err: any) {
          return `Could not save profile: ${err.message}`;
        }
      }

      // Agent skill — delegate to agent-execute
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            skill_name: toolName,
            arguments: args,
            agent_type: 'chat',
            conversation_id: conversationId,
          }),
        });
        const data = await resp.json();
        if (data.status === 'pending_approval') return 'This action requires admin approval. Your request has been submitted.';
        if (data.error) return `Could not complete: ${data.error}`;
        return JSON.stringify(data.result || data, null, 2);
      } catch (err: any) {
        return `Action failed: ${err.message}`;
      }
    }
  }
}

// Provider resolution + N8N webhook moved to ../_shared/ai-providers.ts:
//   - ProviderConfig (type)
//   - tryResolveProvider, resolveProviderWithFallback
//   - handleN8nWebhook (now requires corsHeaders param)

// ─── Sentiment prompt builder ────────────────────────────────────────────────

function buildSentimentPrompt(threshold: number): string {
  return `\n\n## Sentiment Analysis
Analyze each user message for emotional state. If frustration level exceeds ${threshold}/10 OR user explicitly requests human help, call the handoff_to_human tool with appropriate reason and urgency.
Be empathetic and acknowledge frustration before attempting handoff.`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, conversationId, sessionId, settings, customerEmail, customerName, mode, checkinId } = await req.json() as ChatRequest;

    // Redirect check-in mode to dedicated function
    if (mode === 'checkin' && checkinId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const resp = await fetch(`${supabaseUrl}/functions/v1/consultant-checkin`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, checkinId }),
      });
      return new Response(resp.body, {
        status: resp.status,
        headers: { ...corsHeaders, 'Content-Type': resp.headers.get('Content-Type') || 'text/event-stream' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = getServiceClient();

    // Check if conversation is handled by a live agent
    if (conversationId) {
      const { data: conversation } = await supabase
        .from('chat_conversations')
        .select('conversation_status, assigned_agent_id')
        .eq('id', conversationId).single();

      if (conversation?.assigned_agent_id &&
        (conversation.conversation_status === 'with_agent' || conversation.conversation_status === 'waiting_agent')) {
        return new Response(
          JSON.stringify({ skipped: true, reason: 'Conversation is being handled by a live support agent.' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // Load integrations config
    const { data: integrationSettings } = await supabase
      .from('site_settings').select('value').eq('key', 'integrations').maybeSingle();
    const integrations = integrationSettings?.value as any;

    // Resolve provider with automatic fallback (no hard "enabled" gates)
    const provider = resolveProviderWithFallback(settings, integrations);

    // Load context in parallel: workspace files, knowledge base, skills, visitor history
    const shouldLoadKB = settings?.includeContentAsContext || settings?.includeKbArticles;
    // Master switch for FlowPilot action skills (CRM, booking, etc.)
    const shouldLoadSkills = settings?.toolCallingEnabled && provider.supportsToolCalling;
    // Infrastructure tools — independent of FlowPilot/tool-calling master switch.
    // They are simple "sensor" tools that don't require agent reasoning to be useful.
    const firecrawlActive =
      settings?.firecrawlSearchEnabled && integrations?.firecrawl?.enabled && provider.supportsToolCalling;
    const handoffActive = settings?.humanHandoffEnabled && provider.supportsToolCalling;
    const profileSaveActive = !!conversationId && provider.supportsToolCalling;
    const visitorIdentifier = customerEmail || sessionId;

    const [{ soul, identity, agents }, knowledgeBase, skillTools, visitorContext] = await Promise.all([
      loadWorkspaceFiles(supabase),
      shouldLoadKB
        ? buildKnowledgeBase(
            supabase,
            settings?.contentContextMaxTokens || 50000,
            settings?.includeContentAsContext ? (settings?.includedPageSlugs || []) : [],
            settings?.includeKbArticles || false,
          )
        : Promise.resolve(''),
      shouldLoadSkills ? loadSkillTools(supabase, 'external') : Promise.resolve([]),
      visitorIdentifier ? loadVisitorContext(supabase, visitorIdentifier, conversationId) : Promise.resolve(''),
    ]);

    // Build system prompt with knowledge base context
    let chatPrompt = settings?.systemPrompt || 'You are a helpful AI assistant.';

    // Knowledge base restrictions
    if (settings?.allowGeneralKnowledge) {
      chatPrompt += '\n\nYou have access to general knowledge and can answer questions on any topic. When the user asks about the website or its services, prioritize the website content provided below.';
    } else if (shouldLoadKB) {
      chatPrompt += '\n\nIMPORTANT: Only answer questions based on the website content provided below. If the answer is not in the content, politely say you can only help with questions about this website.';
    }

    if (knowledgeBase) chatPrompt += knowledgeBase;
    if (visitorContext) chatPrompt += visitorContext;

    // Sentiment detection
    if (settings?.sentimentDetectionEnabled && settings?.humanHandoffEnabled) {
      chatPrompt += buildSentimentPrompt(settings?.sentimentThreshold || 7);
    }

    // Use prompt compiler — injects soul/identity personality + grounding
    const systemPrompt = buildSystemPrompt({
      mode: 'chat',
      soulPrompt: buildWorkspacePrompt(soul, identity, agents, null, null),
      agents,
      memoryContext: '',
      objectiveContext: '',
      chatSystemPrompt: chatPrompt,
    });

    // Build tools array
    const tools: any[] = [];
    const chatToolNames = new Set<string>();

    // Infrastructure tools — always available when their own flag is on (no FlowPilot dependency)
    if (firecrawlActive) {
      tools.push(CHAT_TOOLS.firecrawl_search);
      chatToolNames.add('firecrawl_search');
    }
    if (handoffActive) {
      tools.push(CHAT_TOOLS.handoff_to_human);
      tools.push(CHAT_TOOLS.create_escalation);
      chatToolNames.add('handoff_to_human');
      chatToolNames.add('create_escalation');
    }
    if (profileSaveActive) {
      tools.push(CHAT_TOOLS.save_visitor_profile);
      chatToolNames.add('save_visitor_profile');
    }

    // FlowPilot action skills — gated on master switch + optional allow-list
    if (shouldLoadSkills) {
      const allow = settings?.allowedSkillNames ?? [];
      const filteredSkillTools = allow.length > 0
        ? (skillTools as any[]).filter((t) => allow.includes(t?.function?.name))
        : (skillTools as any[]);
      tools.push(...filteredSkillTools);
    }

    // Add tool instructions to system prompt
    let finalSystemPrompt = systemPrompt;
    if (tools.length > 0) {
      const toolNames = tools.map((t: any) => t.function?.name).filter(Boolean);
      let toolInstructions = `\n\nYou have access to the following tools: ${toolNames.join(', ')}.`;
      if (settings?.firecrawlSearchEnabled) {
        toolInstructions += `\nWhen the user asks for current/live information, you MUST use the firecrawl_search tool.`;
      }
      if (skillTools.length > 0) {
        toolInstructions += `\nYou can also perform actions like booking appointments, checking orders, and adding contact information. Use the appropriate tool when requested.`;
      }
      toolInstructions += `\nAlways use tools when they can help answer the user's question.`;
      finalSystemPrompt += toolInstructions;
    }

    // Keyword-based handoff fallback for non-tool-calling providers
    if (settings?.humanHandoffEnabled && !provider.supportsToolCalling) {
      const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content?.toLowerCase() || '';
      const handoffKeywords = [
        'talk to a person', 'speak to a human', 'real person', 'human agent',
        'talk to human', 'speak to person', 'customer service', 'support agent',
        'prata med människa', 'riktig person', 'mänsklig support',
      ];
      if (handoffKeywords.some(kw => lastUserMessage.includes(kw)) && conversationId) {
        const result = await executeChatTool(
          supabase, supabaseUrl, serviceKey,
          'handoff_to_human', { reason: 'User explicitly requested human support', urgency: 'high' },
          conversationId, customerEmail, customerName,
        );
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            const data = JSON.stringify({ choices: [{ delta: { content: result }, finish_reason: 'stop' }] });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          },
        });
        return new Response(stream, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
      }
    }

    // N8N: webhook passthrough (no tool loop)
    if (provider.isN8n) {
      const fullMsgs: ChatMessage[] = [{ role: 'system', content: finalSystemPrompt }, ...messages];
      return handleN8nWebhook(provider.n8nConfig!, fullMsgs, conversationId, sessionId, finalSystemPrompt, corsHeaders);
    }

    // ─── Unified OpenAI-compatible tool loop ─────────────────────────────────

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (provider.apiKey) headers['Authorization'] = `Bearer ${provider.apiKey}`;

    let conversationMessages: any[] = [
      { role: 'system', content: finalSystemPrompt },
      ...messages,
    ];


    // ─── Streaming-first tool loop ───────────────────────────────────────────
    // Always streams immediately. Tool calls are detected from the stream,
    // executed transparently, and the final answer is piped to the same
    // output stream — so the client never waits for a full non-streaming round-trip.

    const sseHeaders = { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' };
    const enc = new TextEncoder();

    async function streamIteration(msgs: any[], iteration: number): Promise<Response> {
      const reqBody: any = {
        model: provider.model,
        messages: msgs,
        stream: true,
        stream_options: { include_usage: true },
      };

      if (tools.length > 0 && iteration < MAX_TOOL_ITERATIONS - 1) {
        reqBody.tools = tools;
        reqBody.tool_choice = 'auto';
      }

      const tIter = Date.now();
      const upstream = await fetch(provider.apiUrl, { method: 'POST', headers, body: JSON.stringify(reqBody) });
      if (!upstream.ok) {
        scheduleAiUsageLog({
          supabase, source: 'chat-completion', provider: provider.resolvedProvider, model: provider.model,
          promptTokens: 0, completionTokens: 0, totalTokens: 0,
          latencyMs: Date.now() - tIter,
          status: upstream.status === 429 ? 'rate_limited' : 'error',
          conversationId: conversationId || null,
          metadata: { iteration, http_status: upstream.status, has_tools: tools.length > 0 },
        });
        return handleAiError(upstream, corsHeaders);
      }

      // Wrap upstream stream so we can sniff the final usage chunk without changing client behaviour.
      // Parse SSE line-by-line and update token counters whenever we see a `usage` object —
      // robust to chunk boundaries and the buffer-trim bug that previously zeroed every log row.
      const sniffStream = (src: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> => {
        const decoder = new TextDecoder();
        let lineBuf = '';
        let pTok = 0, cTok = 0, tTok = 0;
        const ingestLine = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) return;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === '[DONE]') return;
          try {
            const obj = JSON.parse(payload);
            const u = obj?.usage;
            if (u && typeof u === 'object') {
              const p = Number(u.prompt_tokens ?? u.input_tokens ?? 0);
              const c = Number(u.completion_tokens ?? u.output_tokens ?? 0);
              const t = Number(u.total_tokens ?? p + c);
              if (p || c || t) { pTok = p; cTok = c; tTok = t; }
            }
          } catch { /* non-JSON keep-alive or partial — ignore */ }
        };
        return new ReadableStream({
          async start(controller) {
            const reader = src.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                controller.enqueue(value);
                lineBuf += decoder.decode(value, { stream: true });
                let nl: number;
                while ((nl = lineBuf.indexOf('\n')) !== -1) {
                  ingestLine(lineBuf.slice(0, nl));
                  lineBuf = lineBuf.slice(nl + 1);
                }
              }
              if (lineBuf) ingestLine(lineBuf);
            } catch (e) {
              console.error('[chat-completion] stream sniff error:', e);
            } finally {
              controller.close();
              scheduleAiUsageLog({
                supabase, source: 'chat-completion',
                provider: provider.resolvedProvider,
                model: provider.model,
                promptTokens: pTok, completionTokens: cTok, totalTokens: tTok,
                latencyMs: Date.now() - tIter, status: 'success',
                conversationId: conversationId || null,
                metadata: { iteration, has_tools: tools.length > 0 },
              });
            }
          },
        });
      };

      // No tools or last iteration — pipe directly with sniffer
      if (tools.length === 0 || iteration >= MAX_TOOL_ITERATIONS - 1) {
        return new Response(sniffStream(upstream.body!), { headers: sseHeaders });
      }

      // Open an output pipe — client starts receiving immediately
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
      const writer = writable.getWriter();

      // Process stream in background without blocking the Response
      (async () => {
        const reader = upstream.body!.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let responseType: 'content' | 'tool_calls' | null = null;
        const tcMap: Record<number, { id: string; name: string; args: string }> = {};

        try {
          outer: while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });

            let nl: number;
            while ((nl = buf.indexOf('\n')) !== -1) {
              let line = buf.slice(0, nl);
              buf = buf.slice(nl + 1);
              if (line.endsWith('\r')) line = line.slice(0, -1);
              if (!line.startsWith('data: ')) continue;

              const data = line.slice(6).trim();
              if (data === '[DONE]') {
                if (responseType !== 'tool_calls') {
                  await writer.write(enc.encode('data: [DONE]\n\n'));
                }
                await writer.close();
                break outer;
              }

              let parsed: any;
              try { parsed = JSON.parse(data); } catch { continue; }

              const delta = parsed.choices?.[0]?.delta;
              const finishReason = parsed.choices?.[0]?.finish_reason;

              // Detect response type on first meaningful delta
              if (responseType === null) {
                responseType = delta?.tool_calls ? 'tool_calls' : 'content';
              }

              if (responseType === 'content') {
                // Pipe through immediately — real streaming
                await writer.write(enc.encode(`${line}\n\n`));
              } else {
                // Accumulate tool call deltas
                for (const tc of (delta?.tool_calls ?? [])) {
                  const idx: number = tc.index ?? 0;
                  if (!tcMap[idx]) tcMap[idx] = { id: '', name: '', args: '' };
                  if (tc.id) tcMap[idx].id = tc.id;
                  if (tc.function?.name) tcMap[idx].name += tc.function.name;
                  if (tc.function?.arguments) tcMap[idx].args += tc.function.arguments;
                }

                if (finishReason === 'tool_calls') {
                  console.log(`[chat] Tool iteration ${iteration + 1}:`, Object.values(tcMap).map(t => t.name));

                  msgs.push({
                    role: 'assistant', content: null,
                    tool_calls: Object.values(tcMap).map(tc => ({
                      id: tc.id, type: 'function',
                      function: { name: tc.name, arguments: tc.args },
                    })),
                  });

                  for (const tc of Object.values(tcMap)) {
                    let fnArgs: any;
                    try { fnArgs = JSON.parse(tc.args || '{}'); } catch { fnArgs = {}; }
                    const result = await executeChatTool(
                      supabase, supabaseUrl, serviceKey,
                      tc.name, fnArgs,
                      conversationId, customerEmail, customerName,
                    );
                    msgs.push({ role: 'tool', tool_call_id: tc.id, content: result });
                  }

                  // Recurse: pipe next iteration into same output stream
                  const nextResp = await streamIteration(msgs, iteration + 1);
                  const nextReader = nextResp.body!.getReader();
                  while (true) {
                    const { done: d, value: v } = await nextReader.read();
                    if (d) break;
                    await writer.write(v);
                  }
                  await writer.close();
                }
              }
            }
          }
        } catch (e) {
          console.error('[chat] Stream error:', e);
          try { await writer.abort(e); } catch { /* ignore */ }
        }
      })();

      return new Response(readable, { headers: sseHeaders });
    }

    return streamIteration(conversationMessages, 0);

  } catch (err: any) {
    console.error('Chat completion error:', err);
    return new Response(JSON.stringify({ error: err.message || 'An unexpected error occurred.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// handleAiError moved to ../_shared/ai-providers.ts (now takes corsHeaders param)
