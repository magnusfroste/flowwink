import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolveAiConfig } from '../../../supabase/functions/_shared/ai-config';

/**
 * "Private system, public chat": the AI map's provider is the default for
 * every surface; a surface may pin a PROVIDER (never a model) for itself.
 * The public chat is the surface that does. These pin down the contract so
 * the split cannot silently invert:
 *  - no option → the map's provider (here: a private endpoint);
 *  - pinned provider → that provider, with the MAP's model for it;
 *  - a pin without a credential → the ladder answers, flagged `fallback`.
 */
const ENV: Record<string, string> = { OPENAI_API_KEY: 'sk-test', GEMINI_API_KEY: 'g-test' };

function fakeSupabase(systemAi: Record<string, unknown>, integrations: Record<string, unknown>) {
  const rows: Record<string, unknown> = { system_ai: systemAi, integrations };
  return {
    from: () => ({
      select: () => ({
        eq: (_col: string, key: string) => ({
          maybeSingle: async () => ({ data: { value: rows[key] } }),
        }),
      }),
    }),
  };
}

const privateSystem = {
  provider: 'local',
  openaiModel: 'gpt-4.1-mini',
  openaiReasoningModel: 'gpt-4.1',
  geminiModel: 'gemini-2.5-flash',
};
const localLlm = { local_llm: { config: { endpoint: 'http://llm.internal:8000/v1', model: 'llama-3.3-70b' } } };

describe('resolveAiConfig — a surface pins a provider, never a model', () => {
  beforeAll(() => { (globalThis as any).Deno = { env: { get: (k: string) => ENV[k] } }; });
  afterAll(() => { delete (globalThis as any).Deno; });

  it('follows the map when no surface pin is given — the private endpoint', async () => {
    const ai = await resolveAiConfig(fakeSupabase(privateSystem, localLlm), 'fast');
    expect(ai.provider).toBe('local');
    expect(ai.model).toBe('llama-3.3-70b');
    expect(ai.fallback).toBe(false);
  });

  it('a pinned cloud provider answers with the MAP’s model for that provider', async () => {
    const ai = await resolveAiConfig(fakeSupabase(privateSystem, localLlm), 'fast', { provider: 'openai' });
    expect(ai.provider).toBe('openai');
    expect(ai.model).toBe('gpt-4.1-mini');
    expect(ai.fallback).toBe(false);
    const reasoning = await resolveAiConfig(fakeSupabase(privateSystem, localLlm), 'reasoning', { provider: 'openai' });
    expect(reasoning.model).toBe('gpt-4.1');
  });

  it('a pin without a credential does not silently pass as the pin — the ladder answers and says so', async () => {
    const ai = await resolveAiConfig(fakeSupabase(privateSystem, localLlm), 'fast', { provider: 'anthropic' });
    expect(ai.provider).not.toBe('anthropic');
    expect(ai.fallback).toBe(true);
  });
});
