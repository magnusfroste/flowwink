import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  loadWorkspaceFiles,
  buildWorkspacePrompt,
  buildSystemPrompt,
  loadSkillTools,
} from "../_shared/agent-reason.ts";

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

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
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
};

// ─── Content extraction helpers ───────────────────────────────────────────────

function extractTextFromTiptap(content: any): string {
  if (!content) return '';
  if (typeof content === 'string') return content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (typeof content === 'object') {
    const texts: string[] = [];
    if (content.text) texts.push(content.text);
    if (content.content && Array.isArray(content.content)) {
      for (const node of content.content) {
        const t = extractTextFromTiptap(node);
        if (t) texts.push(t);
      }
    }
    return texts.join(' ').replace(/\s+/g, ' ').trim();
  }
  return '';
}

function extractTextFromBlock(block: any): string {
  if (!block) return '';
  const texts: string[] = [];
  const type = block.type;
  const data = block.data || block;

  switch (type) {
    case 'text': if (data.content) texts.push(extractTextFromTiptap(data.content)); break;
    case 'hero':
      if (data.title) texts.push(data.title);
      if (data.subtitle) texts.push(data.subtitle);
      break;
    case 'cta':
      if (data.title) texts.push(data.title);
      if (data.subtitle) texts.push(data.subtitle);
      break;
    case 'accordion':
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          if (item.question) texts.push(item.question);
          if (item.answer) texts.push(extractTextFromTiptap(item.answer));
        });
      }
      break;
    case 'contact':
      if (data.phone) texts.push(`Phone: ${data.phone}`);
      if (data.email) texts.push(`Email: ${data.email}`);
      if (data.address) texts.push(`Address: ${data.address}`);
      break;
    case 'quote':
      if (data.quote) texts.push(data.quote);
      if (data.author) texts.push(`- ${data.author}`);
      break;
    case 'info-box': case 'infoBox':
      if (data.title) texts.push(data.title);
      if (data.content) texts.push(extractTextFromTiptap(data.content));
      break;
    case 'two-column': case 'twoColumn':
      if (data.leftContent) texts.push(extractTextFromTiptap(data.leftContent));
      if (data.rightContent) texts.push(extractTextFromTiptap(data.rightContent));
      break;
    case 'stats':
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => { if (item.value && item.label) texts.push(`${item.value} ${item.label}`); });
      }
      break;
    case 'article-grid': case 'articleGrid':
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => { if (item.title) texts.push(item.title); if (item.excerpt) texts.push(item.excerpt); });
      }
      break;
    case 'link-grid': case 'linkGrid':
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => { if (item.title) texts.push(item.title); if (item.description) texts.push(item.description); });
      }
      break;
  }
  return texts.join(' ');
}

// ─── Knowledge base builder ──────────────────────────────────────────────────

async function buildKnowledgeBase(
  supabase: any, maxTokens: number, includedSlugs: string[], includeKbArticles: boolean,
): Promise<string> {
  const sections: string[] = [];
  let estimatedTokens = 0;

  // Pages
  let query = supabase.from('pages').select('title, slug, content_json').eq('status', 'published');
  if (includedSlugs.length > 0) query = query.in('slug', includedSlugs);
  const { data: pages } = await query;

  if (pages) {
    for (const page of pages) {
      const pageTexts: string[] = [];
      if (page.content_json && Array.isArray(page.content_json)) {
        for (const block of page.content_json) {
          const text = extractTextFromBlock(block);
          if (text) pageTexts.push(text);
        }
      }
      if (pageTexts.length > 0) {
        const pageContent = `### ${page.title} (/${page.slug})\n${pageTexts.join('\n')}`;
        const contentTokens = Math.ceil(pageContent.length / 4);
        if (estimatedTokens + contentTokens > maxTokens) break;
        sections.push(pageContent);
        estimatedTokens += contentTokens;
      }
    }
  }

  // KB Articles
  if (includeKbArticles) {
    const { data: kbArticles } = await supabase
      .from('kb_articles')
      .select('title, question, answer_json, answer_text')
      .eq('include_in_chat', true).eq('is_published', true);

    if (kbArticles?.length) {
      const faqSection: string[] = [];
      for (const article of kbArticles) {
        let answerText = article.answer_text || '';
        if (!answerText && article.answer_json) answerText = extractTextFromTiptap(article.answer_json);
        if (answerText) {
          const entry = `Q: ${article.question}\nA: ${answerText}`;
          const entryTokens = Math.ceil(entry.length / 4);
          if (estimatedTokens + entryTokens > maxTokens) break;
          faqSection.push(entry);
          estimatedTokens += entryTokens;
        }
      }
      if (faqSection.length > 0) sections.push(`\n## FAQ\n${faqSection.join('\n\n')}`);
    }
  }

  if (sections.length === 0) return '';
  return `\n\n## Website Content (Knowledge Base)\n${sections.join('\n\n')}`;
}

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

// ─── Provider resolution ─────────────────────────────────────────────────────

const OPENAI_MIGRATE: Record<string, string> = {
  'gpt-4o': 'gpt-4.1', 'gpt-4o-mini': 'gpt-4.1-mini', 'gpt-3.5-turbo': 'gpt-4.1-nano',
  'gpt-4-turbo': 'gpt-4.1', 'gpt-4': 'gpt-4.1',
};
const GEMINI_MIGRATE: Record<string, string> = {
  'gemini-1.5-pro': 'gemini-2.5-pro', 'gemini-1.5-flash': 'gemini-2.5-flash',
  'gemini-2.0-flash-exp': 'gemini-2.5-flash', 'gemini-pro': 'gemini-2.5-pro',
};

interface ProviderConfig {
  apiKey: string;
  apiUrl: string;
  model: string;
  supportsToolCalling: boolean;
  isN8n: boolean;
  n8nConfig?: { webhookUrl: string; webhookType: string; apiKey?: string };
}

function resolveProvider(settings: ChatSettings | undefined, integrations: any): ProviderConfig {
  const provider = settings?.aiProvider || 'openai';

  if (provider === 'n8n') {
    const n8nConfig = integrations?.n8n?.config || {};
    const webhookUrl = settings?.n8nWebhookUrl || n8nConfig?.webhookUrl;
    if (!webhookUrl) throw new Error('N8N webhook URL is not configured.');
    const n8nApiKey = Deno.env.get('N8N_API_KEY') || n8nConfig?.apiKey;
    return {
      apiKey: '', apiUrl: '', model: '',
      supportsToolCalling: false, isN8n: true,
      n8nConfig: { webhookUrl, webhookType: settings?.n8nWebhookType || n8nConfig?.webhookType || 'chat', apiKey: n8nApiKey },
    };
  }

  if (provider === 'gemini') {
    const apiKey = settings?.geminiApiKey || Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) throw new Error('Gemini API key is not configured');
    const rawModel = settings?.geminiModel || 'gemini-2.5-flash';
    return {
      apiKey,
      apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      model: GEMINI_MIGRATE[rawModel] || rawModel,
      supportsToolCalling: true, isN8n: false,
    };
  }

  if (provider === 'local') {
    const localConfig = integrations?.local_llm?.config || {};
    const chatEndpoint = settings?.localEndpoint;
    const isPlaceholder = !chatEndpoint || chatEndpoint.includes('your-local-llm') || chatEndpoint.includes('placeholder');
    const endpoint = isPlaceholder ? localConfig?.endpoint : chatEndpoint;
    if (!endpoint) throw new Error('Local endpoint is not configured.');

    const localApiKey = Deno.env.get('LOCAL_LLM_API_KEY') || localConfig?.apiKey || settings?.localApiKey;
    const baseEndpoint = endpoint.replace(/\/+$/, '');
    const apiPath = baseEndpoint.endsWith('/v1') ? '/chat/completions' : '/v1/chat/completions';
    const model = settings?.localModel || localConfig?.model || 'llama3';

    return {
      apiKey: localApiKey || '',
      apiUrl: `${baseEndpoint}${apiPath}`,
      model,
      supportsToolCalling: settings?.localSupportsToolCalling || false,
      isN8n: false,
    };
  }

  // OpenAI (default)
  const apiKey = settings?.openaiApiKey || Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OpenAI API key is not configured');
  const baseUrl = settings?.openaiBaseUrl || 'https://api.openai.com/v1';
  const rawModel = settings?.openaiModel || 'gpt-4.1-mini';
  return {
    apiKey,
    apiUrl: `${baseUrl}/chat/completions`,
    model: OPENAI_MIGRATE[rawModel] || rawModel,
    supportsToolCalling: true, isN8n: false,
  };
}

// ─── N8N webhook handler ─────────────────────────────────────────────────────

async function handleN8nWebhook(
  settings: ChatSettings | undefined, n8nConfig: NonNullable<ProviderConfig['n8nConfig']>,
  fullMessages: ChatMessage[], conversationId?: string, sessionId?: string, systemPrompt?: string,
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (n8nConfig.apiKey) {
    headers['Authorization'] = n8nConfig.apiKey.startsWith('Bearer ') ? n8nConfig.apiKey : `Bearer ${n8nConfig.apiKey}`;
  }

  const lastUserMessage = fullMessages.filter(m => m.role === 'user').pop();
  const payload = n8nConfig.webhookType === 'chat'
    ? { chatInput: lastUserMessage?.content || '', sessionId: sessionId || conversationId, systemPrompt }
    : { messages: fullMessages, model: 'gpt-4', conversationId, sessionId };

  const resp = await fetch(n8nConfig.webhookUrl, {
    method: 'POST', headers, body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    console.error('N8N webhook error:', resp.status, errorText);
    throw new Error('N8N webhook failed');
  }

  const data = await resp.json();
  let responseContent = 'I could not process your request.';
  if (Array.isArray(data) && data.length > 0) {
    responseContent = data[0].output || data[0].message || data[0].response || responseContent;
  } else if (typeof data === 'object' && data !== null) {
    responseContent = data.output || data.message || data.response || responseContent;
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const sseData = JSON.stringify({ choices: [{ delta: { content: responseContent }, finish_reason: 'stop' }] });
      controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(stream, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
}

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
    const supabase = createClient(supabaseUrl, serviceKey);

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

    // Check provider enabled
    const aiProvider = settings?.aiProvider || 'openai';
    if (aiProvider === 'openai' && !(integrations?.openai?.enabled ?? false)) {
      return new Response(JSON.stringify({ error: 'OpenAI integration is disabled.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (aiProvider === 'gemini' && !(integrations?.gemini?.enabled ?? false)) {
      return new Response(JSON.stringify({ error: 'Gemini integration is disabled.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Resolve provider
    const provider = resolveProvider(settings, integrations);

    // Load context in parallel: workspace files (soul/identity) + knowledge base + skills
    const shouldLoadKB = settings?.includeContentAsContext || settings?.includeKbArticles;
    const shouldLoadSkills = settings?.toolCallingEnabled && provider.supportsToolCalling;

    const [{ soul, identity, agents }, knowledgeBase, skillTools] = await Promise.all([
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

    // Sentiment detection
    if (settings?.sentimentDetectionEnabled && settings?.humanHandoffEnabled) {
      chatPrompt += buildSentimentPrompt(settings?.sentimentThreshold || 7);
    }

    // Use prompt compiler — injects soul/identity personality + grounding
    const systemPrompt = buildSystemPrompt({
      mode: 'chat',
      soulPrompt: buildWorkspacePrompt(soul, identity, agents),
      agents,
      memoryContext: '',
      objectiveContext: '',
      chatSystemPrompt: chatPrompt,
    });

    // Build tools array
    const tools: any[] = [];
    const chatToolNames = new Set<string>();

    if (shouldLoadSkills) {
      if (settings?.firecrawlSearchEnabled && integrations?.firecrawl?.enabled) {
        tools.push(CHAT_TOOLS.firecrawl_search);
        chatToolNames.add('firecrawl_search');
      }
      if (settings?.humanHandoffEnabled) {
        tools.push(CHAT_TOOLS.handoff_to_human);
        tools.push(CHAT_TOOLS.create_escalation);
        chatToolNames.add('handoff_to_human');
        chatToolNames.add('create_escalation');
      }
      // External skills from DB registry
      tools.push(...skillTools);
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
      return handleN8nWebhook(settings, provider.n8nConfig!, fullMsgs, conversationId, sessionId, finalSystemPrompt);
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

    // Multi-iteration tool loop (non-streaming until final response)
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const requestBody: any = {
        model: provider.model,
        messages: conversationMessages,
      };

      // Only include tools on first iteration or when we have tools
      if (tools.length > 0) {
        requestBody.tools = tools;
        requestBody.tool_choice = 'auto';
      }

      // Last chance: if no tools or last iteration, stream directly
      if (tools.length === 0 || iteration === MAX_TOOL_ITERATIONS - 1) {
        requestBody.stream = true;
        const streamResp = await fetch(provider.apiUrl, {
          method: 'POST', headers, body: JSON.stringify(requestBody),
        });

        if (!streamResp.ok) {
          return handleAiError(streamResp);
        }

        return new Response(streamResp.body, {
          headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
        });
      }

      // Non-streaming call to detect tool calls
      const aiResp = await fetch(provider.apiUrl, {
        method: 'POST', headers, body: JSON.stringify(requestBody),
      });

      if (!aiResp.ok) {
        return handleAiError(aiResp);
      }

      const aiData = await aiResp.json();
      const choice = aiData.choices?.[0];
      if (!choice) throw new Error('No response from AI');

      const msg = choice.message;

      // No tool calls → stream the final response
      if (!msg.tool_calls?.length) {
        // Re-do the call with streaming for smooth output
        requestBody.stream = true;
        delete requestBody.tools;
        delete requestBody.tool_choice;
        const streamResp = await fetch(provider.apiUrl, {
          method: 'POST', headers, body: JSON.stringify(requestBody),
        });

        if (!streamResp.ok) {
          // Fallback: return the non-streamed content
          const encoder = new TextEncoder();
          const fallbackStream = new ReadableStream({
            start(controller) {
              const data = JSON.stringify({ choices: [{ delta: { content: msg.content || 'Done.' }, finish_reason: 'stop' }] });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            },
          });
          return new Response(fallbackStream, {
            headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
          });
        }

        return new Response(streamResp.body, {
          headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
        });
      }

      // Tool calls detected — execute them
      console.log(`[chat] Tool iteration ${iteration + 1}:`, msg.tool_calls.map((tc: any) => tc.function.name));

      conversationMessages.push(msg);

      for (const tc of msg.tool_calls) {
        let fnArgs: any;
        try { fnArgs = JSON.parse(tc.function.arguments || '{}'); } catch { fnArgs = {}; }

        const result = await executeChatTool(
          supabase, supabaseUrl, serviceKey,
          tc.function.name, fnArgs,
          conversationId, customerEmail, customerName,
        );

        conversationMessages.push({
          role: 'tool', tool_call_id: tc.id, content: result,
        });
      }

      // Continue loop for next iteration...
    }

    // Should not reach here, but safety fallback
    throw new Error('Tool loop exhausted');

  } catch (err: any) {
    console.error('Chat completion error:', err);
    return new Response(JSON.stringify({ error: err.message || 'An unexpected error occurred.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ─── Error handling ──────────────────────────────────────────────────────────

async function handleAiError(response: Response): Promise<Response> {
  if (response.status === 429) {
    return new Response(JSON.stringify({ error: 'Too many requests. Please wait and try again.' }), {
      status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (response.status === 402) {
    return new Response(JSON.stringify({ error: 'Credits exhausted. Contact administrator.' }), {
      status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const errorText = await response.text();
  console.error('AI provider error:', response.status, errorText);
  return new Response(JSON.stringify({ error: 'AI service error.' }), {
    status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
