/**
 * AI provider resolution + transports shared by chat-completion and any
 * other surface that needs to talk to OpenAI-compatible providers, Gemini,
 * a local OpenAI-compatible LLM, or an n8n webhook.
 *
 * Keeps the chat-completion entry-point focused on orchestration (tool loop,
 * KB injection, streaming) instead of provider plumbing.
 */

export interface ChatSettingsLike {
  aiProvider?: 'openai' | 'gemini' | 'local' | 'n8n';
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
}

export interface ChatMessageLike {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: any;
  tool_call_id?: string;
  tool_calls?: any[];
}

export interface ProviderConfig {
  apiKey: string;
  apiUrl: string;
  model: string;
  supportsToolCalling: boolean;
  isN8n: boolean;
  n8nConfig?: { webhookUrl: string; webhookType: string; apiKey?: string };
  resolvedProvider: string;
}

const OPENAI_MIGRATE: Record<string, string> = {
  'gpt-4o': 'gpt-4.1', 'gpt-4o-mini': 'gpt-4.1-mini', 'gpt-3.5-turbo': 'gpt-4.1-nano',
  'gpt-4-turbo': 'gpt-4.1', 'gpt-4': 'gpt-4.1',
};
const GEMINI_MIGRATE: Record<string, string> = {
  'gemini-1.5-pro': 'gemini-2.5-pro', 'gemini-1.5-flash': 'gemini-2.5-flash',
  'gemini-2.0-flash-exp': 'gemini-2.5-flash', 'gemini-pro': 'gemini-2.5-pro',
};

/** Try to resolve a specific provider. Returns null if not available (no API key). */
export function tryResolveProvider(
  provider: string,
  settings: ChatSettingsLike | undefined,
  integrations: any,
): ProviderConfig | null {
  if (provider === 'n8n') {
    const n8nConfig = integrations?.n8n?.config || {};
    const webhookUrl = settings?.n8nWebhookUrl || n8nConfig?.webhookUrl;
    if (!webhookUrl) return null;
    const n8nApiKey = Deno.env.get('N8N_API_KEY') || n8nConfig?.apiKey;
    return {
      apiKey: '', apiUrl: '', model: '',
      supportsToolCalling: false, isN8n: true, resolvedProvider: 'n8n',
      n8nConfig: { webhookUrl, webhookType: settings?.n8nWebhookType || n8nConfig?.webhookType || 'chat', apiKey: n8nApiKey },
    };
  }

  if (provider === 'openai') {
    const apiKey = settings?.openaiApiKey || Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) return null;
    const baseUrl = settings?.openaiBaseUrl || 'https://api.openai.com/v1';
    const rawModel = settings?.openaiModel || 'gpt-4.1-mini';
    return {
      apiKey,
      apiUrl: `${baseUrl}/chat/completions`,
      model: OPENAI_MIGRATE[rawModel] || rawModel,
      supportsToolCalling: true, isN8n: false, resolvedProvider: 'openai',
    };
  }

  if (provider === 'gemini') {
    const apiKey = settings?.geminiApiKey || Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) return null;
    const rawModel = settings?.geminiModel || 'gemini-2.5-flash';
    return {
      apiKey,
      apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      model: GEMINI_MIGRATE[rawModel] || rawModel,
      supportsToolCalling: true, isN8n: false, resolvedProvider: 'gemini',
    };
  }

  if (provider === 'local') {
    const localConfig = integrations?.local_llm?.config || {};
    const integrationEndpoint = localConfig?.endpoint;
    const chatEndpoint = settings?.localEndpoint;
    const isPlaceholder = !chatEndpoint || chatEndpoint.includes('your-local-llm') || chatEndpoint.includes('placeholder');
    const endpoint = integrationEndpoint || (isPlaceholder ? undefined : chatEndpoint);
    if (!endpoint) return null;

    const localApiKey = Deno.env.get('LOCAL_LLM_API_KEY') || localConfig?.apiKey || settings?.localApiKey;
    const baseEndpoint = endpoint.replace(/\/+$/, '');
    const apiPath = baseEndpoint.endsWith('/v1') ? '/chat/completions' : '/v1/chat/completions';
    const model = localConfig?.model || settings?.localModel;
    if (!model) {
      console.error('[ai-providers] Local LLM model not configured. Set it in Integrations → Local LLM or Chat settings.');
      return null;
    }

    return {
      apiKey: localApiKey || '',
      apiUrl: `${baseEndpoint}${apiPath}`,
      model,
      supportsToolCalling: settings?.localSupportsToolCalling || false,
      isN8n: false, resolvedProvider: 'local',
    };
  }

  return null;
}

/**
 * Resolve provider with automatic fallback chain.
 *  1. Try the preferred provider (from settings)
 *  2. If unavailable, fall back: OpenAI → Gemini → Local → N8N
 *  3. Throw only if NO provider is configured at all
 */
export function resolveProviderWithFallback(
  settings: ChatSettingsLike | undefined,
  integrations: any,
): ProviderConfig {
  const preferred = settings?.aiProvider || 'openai';

  const preferredResult = tryResolveProvider(preferred, settings, integrations);
  if (preferredResult) return preferredResult;

  console.log(`[ai-providers] Preferred provider '${preferred}' not available, trying fallback chain...`);

  const fallbackOrder = ['openai', 'gemini', 'local', 'n8n'].filter(p => p !== preferred);
  for (const fallback of fallbackOrder) {
    const result = tryResolveProvider(fallback, settings, integrations);
    if (result) {
      console.log(`[ai-providers] Fallback resolved to '${fallback}'`);
      return result;
    }
  }

  throw new Error(
    'No AI provider available. Please configure at least one AI provider (OpenAI, Gemini, or Local LLM) in Settings → System AI, or set API keys via the CLI (npm run cli → /set-keys).'
  );
}

/**
 * N8N webhook passthrough. Returns an SSE Response that mimics the
 * OpenAI streaming-completion format so client code is provider-agnostic.
 */
export async function handleN8nWebhook(
  n8nConfig: NonNullable<ProviderConfig['n8nConfig']>,
  fullMessages: ChatMessageLike[],
  conversationId: string | undefined,
  sessionId: string | undefined,
  systemPrompt: string | undefined,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (n8nConfig.apiKey) {
    headers['Authorization'] = n8nConfig.apiKey.startsWith('Bearer ')
      ? n8nConfig.apiKey
      : `Bearer ${n8nConfig.apiKey}`;
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
    console.error('[ai-providers] N8N webhook error:', resp.status, errorText);
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

/** Map upstream AI provider errors to clean client-facing JSON responses. */
export async function handleAiError(
  response: Response,
  corsHeaders: Record<string, string>,
): Promise<Response> {
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
  console.error('[ai-providers] AI provider error:', response.status, errorText);
  return new Response(JSON.stringify({ error: 'AI service error.' }), {
    status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
