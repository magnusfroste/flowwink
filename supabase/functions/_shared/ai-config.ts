/**
 * AI Configuration Resolution
 * 
 * Resolves which AI provider (OpenAI, Gemini, Anthropic, Local) to use
 * based on site_settings and available environment variables.
 * 
 * This is the SINGLE source of truth for all AI provider resolution.
 * Both System AI and AI Chat should use this layer.
 */

export type AiTier = 'fast' | 'reasoning' | 'multimodal';

// Providers that support vision (image + PDF input).
// Local LLMs are excluded by default — most self-hosted models are text-only.
const VISION_CAPABLE_PROVIDERS = new Set(['openai', 'gemini', 'anthropic']);

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

export interface ResolvedAiConfig {
  apiKey: string;
  apiUrl: string;
  model: string;
  /** Provider id used for this resolution ('openai' | 'gemini' | 'anthropic' | 'local'). */
  provider: 'openai' | 'gemini' | 'anthropic' | 'local';
  /** True if the configured primary provider had to be substituted (e.g. local → gemini for multimodal). */
  fallback: boolean;
}

export async function resolveAiConfig(
  supabase: any,
  tier: AiTier = 'fast',
): Promise<ResolvedAiConfig> {
  // 1. Read system_ai settings for configured provider
  const { data: settings } = await supabase
    .from('site_settings').select('value').eq('key', 'system_ai').maybeSingle();

  // 2. Read integrations settings for local_llm config
  const { data: integrationsRow } = await supabase
    .from('site_settings').select('value').eq('key', 'integrations').maybeSingle();
  const integrations = integrationsRow?.value as Record<string, any> | null;

  const cfg = (settings?.value || {}) as Record<string, string>;
  const primary = cfg.provider as ResolvedAiConfig['provider'] | undefined;

  // For multimodal: if the primary provider can't do vision, transparently
  // fall back to the first vision-capable provider with an env key.
  if (tier === 'multimodal' && primary && !VISION_CAPABLE_PROVIDERS.has(primary)) {
    const vision = pickVisionFallback();
    if (vision) {
      return { ...vision, fallback: true };
    }
    throw new Error(
      `Multimodal request, but configured provider "${primary}" has no vision support and no vision-capable fallback (GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY) is set.`,
    );
  }

  // Local LLM (only for non-multimodal tiers)
  if (primary === 'local') {
    const localConfig = integrations?.local_llm?.config || {};
    const endpoint = localConfig.endpoint;
    if (endpoint) {
      const localApiKey = Deno.env.get('LOCAL_LLM_API_KEY') || localConfig.apiKey || '';
      const baseEndpoint = endpoint.replace(/\/+$/, '');
      const apiUrl = baseEndpoint.endsWith('/v1')
        ? `${baseEndpoint}/chat/completions`
        : `${baseEndpoint}/v1/chat/completions`;
      return {
        apiKey: localApiKey || 'local',
        apiUrl,
        model: localConfig.model || cfg.localModel || 'llama3',
        provider: 'local',
        fallback: false,
      };
    }
    // local configured but endpoint missing — fall through to env auto-detect
  }

  if (primary === 'anthropic' && Deno.env.get('ANTHROPIC_API_KEY')) {
    return {
      apiKey: Deno.env.get('ANTHROPIC_API_KEY')!,
      apiUrl: 'https://api.anthropic.com/v1/messages',
      model: tier === 'reasoning'
        ? migrateAnthropicModel(cfg.anthropicReasoningModel || 'claude-sonnet-4-20250514')
        : migrateAnthropicModel(cfg.anthropicModel || 'claude-sonnet-4-20250514'),
      provider: 'anthropic',
      fallback: false,
    };
  }

  if (primary === 'gemini' && Deno.env.get('GEMINI_API_KEY')) {
    return {
      apiKey: Deno.env.get('GEMINI_API_KEY')!,
      apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      model: tier === 'reasoning'
        ? migrateGeminiModel(cfg.geminiReasoningModel || 'gemini-2.5-pro')
        : migrateGeminiModel(cfg.geminiModel || (cfg as any).model),
      provider: 'gemini',
      fallback: false,
    };
  }

  if (primary === 'openai' && Deno.env.get('OPENAI_API_KEY')) {
    return {
      apiKey: Deno.env.get('OPENAI_API_KEY')!,
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      model: tier === 'reasoning'
        ? migrateOpenaiModel(cfg.openaiReasoningModel || 'gpt-4.1')
        : migrateOpenaiModel(cfg.openaiModel || (cfg as any).model),
      provider: 'openai',
      fallback: false,
    };
  }

  // 3. Fallback: auto-detect from available environment keys.
  // For multimodal we only consider vision-capable providers.
  if (tier === 'multimodal') {
    const vision = pickVisionFallback();
    if (vision) return { ...vision, fallback: !!primary };
    throw new Error('No vision-capable AI provider configured. Set GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.');
  }

  if (Deno.env.get('OPENAI_API_KEY')) {
    return {
      apiKey: Deno.env.get('OPENAI_API_KEY')!,
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      model: tier === 'reasoning' ? 'gpt-4.1' : 'gpt-4.1-mini',
      provider: 'openai',
      fallback: !!primary,
    };
  }

  if (Deno.env.get('ANTHROPIC_API_KEY')) {
    return {
      apiKey: Deno.env.get('ANTHROPIC_API_KEY')!,
      apiUrl: 'https://api.anthropic.com/v1/messages',
      model: 'claude-sonnet-4-20250514',
      provider: 'anthropic',
      fallback: !!primary,
    };
  }

  if (Deno.env.get('GEMINI_API_KEY')) {
    return {
      apiKey: Deno.env.get('GEMINI_API_KEY')!,
      apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      model: tier === 'reasoning' ? 'gemini-2.5-pro' : 'gemini-2.5-flash',
      provider: 'gemini',
      fallback: !!primary,
    };
  }

  throw new Error('No AI provider configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY, or configure a Local LLM endpoint.');
}

/**
 * Pick the first vision-capable provider that has an API key in env.
 * Order: Gemini (best price/perf for vision) → OpenAI → Anthropic.
 */
function pickVisionFallback():
  | Omit<ResolvedAiConfig, 'fallback'>
  | null {
  if (Deno.env.get('GEMINI_API_KEY')) {
    return {
      apiKey: Deno.env.get('GEMINI_API_KEY')!,
      apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      model: 'gemini-2.5-flash',
      provider: 'gemini',
    };
  }
  if (Deno.env.get('OPENAI_API_KEY')) {
    return {
      apiKey: Deno.env.get('OPENAI_API_KEY')!,
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4.1-mini',
      provider: 'openai',
    };
  }
  if (Deno.env.get('ANTHROPIC_API_KEY')) {
    return {
      apiKey: Deno.env.get('ANTHROPIC_API_KEY')!,
      apiUrl: 'https://api.anthropic.com/v1/messages',
      model: 'claude-sonnet-4-20250514',
      provider: 'anthropic',
    };
  }
  return null;
}

/**
 * Check if the resolved provider is Anthropic (uses different API format)
 */
export function isAnthropicProvider(apiUrl: string): boolean {
  return apiUrl.includes('anthropic.com');
}
