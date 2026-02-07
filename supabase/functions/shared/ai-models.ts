/**
 * AI Model Constants
 * Centralized configuration for AI provider models
 */

export const AI_MODELS = {
  // OpenAI
  openai: {
    default: 'gpt-4o-mini',
    chat: 'gpt-4o-mini',
    fast: 'gpt-4o-mini',
    pro: 'gpt-4o',
  },

  // Google Gemini
  gemini: {
    default: 'gemini-2.5-flash',
    chat: 'gemini-2.5-flash',
    fast: 'gemini-2.5-flash',
    pro: 'gemini-2.5-pro',
  },

  // Local LLM (user-configurable)
  local_llm: {
    default: 'llama3',
  },
} as const;

export type AIProvider = keyof typeof AI_MODELS;

/**
 * Get the default model for a provider
 */
export function getDefaultModel(provider: AIProvider): string {
  return AI_MODELS[provider].default;
}

/**
 * Get a specific model variant for a provider
 */
export function getModel(provider: AIProvider, variant: 'default' | 'chat' | 'fast' | 'pro' = 'default'): string {
  const providerModels = AI_MODELS[provider] as Record<string, string>;
  return providerModels[variant] || providerModels.default;
}
