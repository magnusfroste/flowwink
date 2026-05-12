/**
 * AI Usage Logger
 *
 * Central wrapper around the chat/completions HTTP call.
 * Logs every AI request to `ai_usage_logs` for the /admin/ai-usage dashboard.
 *
 * Usage:
 *   const data = await callAiCompletion({
 *     supabase,                  // service-role client (logs bypass RLS)
 *     source: 'chat-completion', // logical source name
 *     apiUrl, apiKey, model, provider,
 *     body: { messages, tools, ... },
 *     userId, conversationId,
 *   });
 *
 * Returns the parsed JSON body from the AI provider.
 * Logging is fire-and-forget — failures never block the response.
 */

export interface AiUsageLogContext {
  supabase: any;
  source: string;
  provider?: string;
  model?: string;
  userId?: string | null;
  conversationId?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CallAiCompletionArgs extends AiUsageLogContext {
  apiUrl: string;
  apiKey: string;
  body: Record<string, unknown>;
  /** Optional extra headers (e.g. for Anthropic). Authorization is set automatically. */
  headers?: Record<string, string>;
  /** AbortSignal forwarded to fetch */
  signal?: AbortSignal;
}

export async function callAiCompletion(args: CallAiCompletionArgs): Promise<any> {
  const start = Date.now();
  let status = 'success';
  let errorMessage: string | undefined;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let httpStatus = 0;
  let parsed: any = null;

  try {
    const resp = await fetch(args.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.apiKey}`,
        ...(args.headers || {}),
      },
      body: JSON.stringify({ ...args.body, model: args.body.model ?? args.model }),
      signal: args.signal,
    });
    httpStatus = resp.status;

    const text = await resp.text();
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text };
    }

    if (!resp.ok) {
      status = resp.status === 429 ? 'rate_limited' : resp.status === 402 ? 'payment_required' : 'error';
      errorMessage = parsed?.error?.message || parsed?.error || text?.slice(0, 500) || `HTTP ${resp.status}`;
      // Re-throw so caller can handle as before
      const err = new Error(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
      (err as any).status = resp.status;
      (err as any).body = parsed;
      throw err;
    }

    const usage = parsed?.usage || {};
    promptTokens = Number(usage.prompt_tokens || usage.input_tokens || 0);
    completionTokens = Number(usage.completion_tokens || usage.output_tokens || 0);
    totalTokens = Number(usage.total_tokens || promptTokens + completionTokens);

    return parsed;
  } catch (err: any) {
    if (status === 'success') {
      status = 'error';
      errorMessage = err?.message || String(err);
    }
    throw err;
  } finally {
    const latencyMs = Date.now() - start;
    // Fire and forget — never block the request
    void logAiUsage({
      supabase: args.supabase,
      source: args.source,
      provider: args.provider,
      model: args.model || (args.body.model as string),
      promptTokens,
      completionTokens,
      totalTokens,
      latencyMs,
      status,
      error: errorMessage,
      userId: args.userId,
      conversationId: args.conversationId,
      requestId: args.requestId,
      metadata: {
        ...(args.metadata || {}),
        http_status: httpStatus || undefined,
      },
    });
  }
}

interface LogParams {
  supabase: any;
  source: string;
  provider?: string;
  model?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  status: string;
  error?: string;
  userId?: string | null;
  conversationId?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logAiUsage(p: LogParams): Promise<void> {
  // Primary path: SECURITY DEFINER RPC — works with anon key, no service_role needed.
  try {
    const { error } = await p.supabase.rpc('log_ai_usage', {
      p_source: p.source,
      p_provider: p.provider || null,
      p_model: p.model || null,
      p_prompt_tokens: p.promptTokens || 0,
      p_completion_tokens: p.completionTokens || 0,
      p_total_tokens: p.totalTokens || 0,
      p_latency_ms: p.latencyMs ?? null,
      p_status: p.status || 'success',
      p_error: p.error ? String(p.error).slice(0, 1000) : null,
      p_user_id: p.userId || null,
      p_conversation_id: p.conversationId || null,
      p_request_id: p.requestId || null,
      p_metadata: p.metadata || {},
    });
    if (!error) return;
    console.error('[ai-usage-logger] RPC log_ai_usage failed:', error.message, error.code || '', '— falling back to direct insert. If this repeats on a fresh instance the migration 20260510215228_*.sql (SECURITY DEFINER log_ai_usage) is not applied. Run /admin/platform-tests → ai_usage_logging to confirm.');
    // Fallback to direct insert (works if caller is service_role)
    const { error: insertError } = await p.supabase.from('ai_usage_logs').insert({
      source: p.source,
      provider: p.provider || null,
      model: p.model || null,
      prompt_tokens: p.promptTokens || 0,
      completion_tokens: p.completionTokens || 0,
      total_tokens: p.totalTokens || 0,
      latency_ms: p.latencyMs ?? null,
      status: p.status || 'success',
      error: p.error ? String(p.error).slice(0, 1000) : null,
      user_id: p.userId || null,
      conversation_id: p.conversationId || null,
      request_id: p.requestId || null,
      metadata: p.metadata || {},
    });
    if (insertError) {
      console.error('[ai-usage-logger] Direct insert also failed:', insertError.message, insertError.code || '');
    }
  } catch (e) {
    console.error('[ai-usage-logger] log threw:', (e as any)?.message || e);
  }
}
