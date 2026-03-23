/**
 * Token Tracking — Budget enforcement for autonomous runs.
 */

import type { TokenUsage } from './types.ts';

export function extractTokenUsage(aiData: any): TokenUsage {
  const usage = aiData.usage || {};
  return {
    prompt_tokens: usage.prompt_tokens || 0,
    completion_tokens: usage.completion_tokens || 0,
    total_tokens: (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
  };
}

export function accumulateTokens(current: TokenUsage, incoming: TokenUsage): TokenUsage {
  return {
    prompt_tokens: current.prompt_tokens + incoming.prompt_tokens,
    completion_tokens: current.completion_tokens + incoming.completion_tokens,
    total_tokens: current.total_tokens + incoming.total_tokens,
  };
}

export function isOverBudget(usage: TokenUsage, budget: number): boolean {
  return usage.total_tokens >= budget;
}
