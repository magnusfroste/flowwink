/**
 * AI Configuration Resolution
 * 
 * Resolves which AI provider (OpenAI, Gemini, Anthropic, Local) to use
 * based on site_settings and available environment variables.
 * 
 * This is the SINGLE source of truth for all AI provider resolution.
 * Both System AI and AI Chat should use this layer.
 */

export type AiTier = 'fast' | 'reasoning';

// Server-side model migration — normalize legacy model names
const OPENAI_MODEL_MIGRATION: Record<string, string> = {
  'gpt-4o': 'gpt-4.1', 'gpt-4o-mini': 'gpt-4.1-mini', 'gpt-3.5-turbo': 'gpt-4.1-nano',
  'gpt-4-turbo': 'gpt-4.1', 'gpt-4': 'gpt-4.1',
};
const GEMINI_MODEL_MIGRATION: Record<string, string> = {
  'gemini-1.5-pro': 'gemini-2.5-pro', 'gemini-1.5-flash': 'gemini-2.5-flash',
  'gemini-2.0-flash-exp': 'gemini-2.5-flash', 'gemini-pro': 'gemini-2.5-pro',
};
function migrateOpenaiModel(m?: string): string { return (m && OPENAI_MODEL_MIGRATION[m]) || m || 'gpt-4.1-mini'; }
function migrateGeminiModel(m?: string): string { return (m && GEMINI_MODEL_MIGRATION[m]) || m || 'gemini-2.5-flash'; }
function migrateAnthropicModel(m?: string): string { return m || 'claude-sonnet-4-20250514'; }

export async function resolveAiConfig(supabase: any, tier: AiTier = 'fast'): Promise<{ apiKey: string; apiUrl: string; model: string }> {
  let apiKey = '';
  let apiUrl = 'https://api.openai.com/v1/chat/completions';
  let model = tier === 'reasoning' ? 'gpt-4.1' : 'gpt-4.1-mini';

  // 1. Read system_ai settings for configured provider
  const { data: settings } = await supabase
    .from('site_settings').select('value').eq('key', 'system_ai').maybeSingle();

  // 2. Read integrations settings for local_llm config
  const { data: integrationsRow } = await supabase
    .from('site_settings').select('value').eq('key', 'integrations').maybeSingle();
  const integrations = integrationsRow?.value as Record<string, any> | null;

  if (settings?.value) {
    const cfg = settings.value as Record<string, string>;

    if (cfg.provider === 'local') {
      // Local LLM — read endpoint from integrations config
      const localConfig = integrations?.local_llm?.config || {};
      const endpoint = localConfig.endpoint;
      
      if (endpoint) {
        const localApiKey = Deno.env.get('LOCAL_LLM_API_KEY') || localConfig.apiKey || '';
        apiKey = localApiKey || 'local'; // Local LLMs may not need a key
        const baseEndpoint = endpoint.replace(/\/+$/, '');
        apiUrl = baseEndpoint.endsWith('/v1')
          ? `${baseEndpoint}/chat/completions`
          : `${baseEndpoint}/v1/chat/completions`;
        // Local LLMs use a single model for both tiers
        model = localConfig.model || cfg.localModel || 'llama3';
        return { apiKey, apiUrl, model };
      }
      // If local is configured but no endpoint, fall through to key-based providers
    } else if (cfg.provider === 'anthropic' && Deno.env.get('ANTHROPIC_API_KEY')) {
      apiKey = Deno.env.get('ANTHROPIC_API_KEY')!;
      apiUrl = 'https://api.anthropic.com/v1/messages';
      model = tier === 'reasoning'
        ? migrateAnthropicModel(cfg.anthropicReasoningModel || 'claude-sonnet-4-20250514')
        : migrateAnthropicModel(cfg.anthropicModel || 'claude-sonnet-4-20250514');
      return { apiKey, apiUrl, model };
    } else if (cfg.provider === 'gemini' && Deno.env.get('GEMINI_API_KEY')) {
      apiKey = Deno.env.get('GEMINI_API_KEY')!;
      apiUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
      model = tier === 'reasoning'
        ? migrateGeminiModel(cfg.geminiReasoningModel || 'gemini-2.5-pro')
        : migrateGeminiModel(cfg.geminiModel || cfg.model);
      return { apiKey, apiUrl, model };
    } else if (cfg.provider === 'openai' && Deno.env.get('OPENAI_API_KEY')) {
      apiKey = Deno.env.get('OPENAI_API_KEY')!;
      model = tier === 'reasoning'
        ? migrateOpenaiModel(cfg.openaiReasoningModel || 'gpt-4.1')
        : migrateOpenaiModel(cfg.openaiModel || cfg.model);
      return { apiKey, apiUrl, model };
    }
  }

  // 3. Fallback: auto-detect from available environment keys
  if (Deno.env.get('OPENAI_API_KEY')) {
    apiKey = Deno.env.get('OPENAI_API_KEY')!;
    model = tier === 'reasoning' ? 'gpt-4.1' : 'gpt-4.1-mini';
    return { apiKey, apiUrl, model };
  }

  if (Deno.env.get('ANTHROPIC_API_KEY')) {
    apiKey = Deno.env.get('ANTHROPIC_API_KEY')!;
    apiUrl = 'https://api.anthropic.com/v1/messages';
    model = tier === 'reasoning' ? 'claude-sonnet-4-20250514' : 'claude-sonnet-4-20250514';
    return { apiKey, apiUrl, model };
  }

  if (Deno.env.get('GEMINI_API_KEY')) {
    apiKey = Deno.env.get('GEMINI_API_KEY')!;
    apiUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
    model = tier === 'reasoning' ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
    return { apiKey, apiUrl, model };
  }

  throw new Error('No AI provider configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY, or configure a Local LLM endpoint.');
}

/**
 * Check if the resolved provider is Anthropic (uses different API format)
 */
export function isAnthropicProvider(apiUrl: string): boolean {
  return apiUrl.includes('anthropic.com');
}
