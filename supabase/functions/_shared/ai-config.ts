/**
 * AI Configuration Resolution
 * 
 * Resolves which AI provider (OpenAI, Gemini, Lovable, Local) to use
 * based on site_settings and available environment variables.
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

export async function resolveAiConfig(supabase: any, tier: AiTier = 'fast'): Promise<{ apiKey: string; apiUrl: string; model: string }> {
  let apiKey = '';
  let apiUrl = 'https://api.openai.com/v1/chat/completions';
  let model = tier === 'reasoning' ? 'gpt-4.1' : 'gpt-4.1-mini';

  const { data: settings } = await supabase
    .from('site_settings').select('value').eq('key', 'system_ai').maybeSingle();

  if (settings?.value) {
    const cfg = settings.value as Record<string, string>;
    if (cfg.provider === 'gemini' && Deno.env.get('GEMINI_API_KEY')) {
      apiKey = Deno.env.get('GEMINI_API_KEY')!;
      apiUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
      model = tier === 'reasoning'
        ? migrateGeminiModel(cfg.geminiReasoningModel || 'gemini-2.5-pro')
        : migrateGeminiModel(cfg.geminiModel || cfg.model);
    } else if (cfg.provider === 'openai' && Deno.env.get('OPENAI_API_KEY')) {
      apiKey = Deno.env.get('OPENAI_API_KEY')!;
      model = tier === 'reasoning'
        ? migrateOpenaiModel(cfg.openaiReasoningModel || 'gpt-4.1')
        : migrateOpenaiModel(cfg.openaiModel || cfg.model);
    }
  }

  if (!apiKey) {
    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    if (lovableKey) {
      apiKey = lovableKey;
      apiUrl = 'https://ai.gateway.lovable.dev/v1/chat/completions';
      model = tier === 'reasoning' ? 'google/gemini-2.5-pro' : 'google/gemini-2.5-flash';
    }
  }

  if (!apiKey) {
    throw new Error('No AI provider configured. Set OPENAI_API_KEY, GEMINI_API_KEY, or LOVABLE_API_KEY.');
  }

  return { apiKey, apiUrl, model };
}
