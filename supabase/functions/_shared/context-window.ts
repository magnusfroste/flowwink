/**
 * Model Context Window Guard — platform primitive (NOT FlowPilot-specific).
 *
 * The source-context half of the prompt is already budgeted
 * (TOTAL_TOKEN_BUDGET + fair-share in workspace-chat). This module budgets the
 * OTHER half: the conversation history, which otherwise grows unwindowed until
 * the model's context window overflows with a hard provider error.
 *
 * Three jobs, all pure so vitest can exercise them without Deno:
 *   1. resolveContextWindow — known models → window size; unknown → a
 *      CONSERVATIVE default. Always guess stingy, never generous: an
 *      underestimated window costs an early distillation, an overestimated one
 *      costs a hard provider error mid-conversation.
 *   2. planHistoryWindow — decide when the rolling distillate kicks in
 *      (~85% of the window) and which turns it covers (older turns compress,
 *      the last N stay raw).
 *   3. enforceHardCap — the invariant that must NEVER break: what we send is
 *      at most window minus response reserve. Oldest raw turns are dropped
 *      first; the system prompt (soul/identity/retrieval) is never trimmed
 *      here — it is the caller's protected half.
 */

export interface ChatMsg {
  role: string;
  content: string;
}

export interface ContextWindowResolution {
  /** Usable context window in tokens (input + output). */
  tokens: number;
  /** False when we fell back to the conservative default — UI shows "~". */
  known: boolean;
}

/** Same char→token heuristic as the source-context budget (~4 chars/token). */
export const CHAR_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHAR_PER_TOKEN);
}

export function estimateMessagesTokens(messages: ChatMsg[]): number {
  // Per-message overhead (role framing, separators) — small but real; ~4
  // tokens per message keeps the estimate on the stingy side.
  return messages.reduce((sum, m) => sum + estimateTokens(m.content ?? '') + 4, 0);
}

/**
 * Known model → context window map. Prefix-matched, longest prefix wins.
 * Values are deliberately the LOW end of published numbers (e.g. gpt-5's
 * 272k input cap rather than its 400k total window).
 */
const KNOWN_WINDOWS: Array<{ prefix: string; tokens: number }> = [
  // OpenAI
  { prefix: 'gpt-4.1', tokens: 1_000_000 },
  { prefix: 'gpt-4o', tokens: 128_000 },
  { prefix: 'gpt-5', tokens: 272_000 },
  { prefix: 'o3', tokens: 200_000 },
  { prefix: 'o4', tokens: 200_000 },
  // Gemini
  { prefix: 'gemini-2.5', tokens: 1_000_000 },
  { prefix: 'gemini-2.0', tokens: 1_000_000 },
  // Anthropic (workspace-chat rejects this provider today, but the map is
  // shared platform infrastructure and other callers do not).
  { prefix: 'claude-', tokens: 200_000 },
];

/**
 * Conservative default for anything we cannot identify: local/n8n endpoints,
 * renamed models, future providers. 32k is small enough that a self-hosted
 * 8k-context model still fails loudly in testing rather than silently in a
 * customer's long session — and the per-instance override exists precisely
 * for operators who know better.
 */
export const CONSERVATIVE_WINDOW_TOKENS = 32_000;

/**
 * Tokens reserved for the model's answer plus mid-turn tool results. The hard
 * cap is window − reserve; the estimate the indicator shows is prompt-side
 * only, so the reserve is what keeps a 99%-full prompt from starving the
 * completion.
 */
export const RESPONSE_RESERVE_TOKENS = 4_000;

/** Indicator + distillation thresholds (fractions of the full window). */
export const AMBER_THRESHOLD = 0.7;
export const RED_THRESHOLD = 0.85;
/** The rolling distillate fires at the same point the indicator turns red. */
export const DISTILL_THRESHOLD = RED_THRESHOLD;

/** How many trailing messages stay raw when older history is distilled. */
export const KEEP_RAW_MESSAGES = 8;

/**
 * Per-instance overrides live in the `system_ai` site-setting:
 *   { ..., contextWindows: { "<model-or-provider>": tokens } }
 * Lookup order: exact model id, then provider id. An override always counts
 * as "known" — the operator asserted it.
 */
export function resolveContextWindow(
  provider: string,
  model: string,
  overrides?: Record<string, unknown> | null,
): ContextWindowResolution {
  const ov = overrides ?? {};
  const fromOverride = (key: string): number | null => {
    const v = (ov as Record<string, unknown>)[key];
    return typeof v === 'number' && Number.isFinite(v) && v >= 1_000 ? Math.floor(v) : null;
  };
  const byModel = fromOverride(model);
  if (byModel !== null) return { tokens: byModel, known: true };
  const byProvider = fromOverride(provider);
  if (byProvider !== null) return { tokens: byProvider, known: true };

  const m = String(model || '').toLowerCase();
  let best: { prefix: string; tokens: number } | null = null;
  for (const entry of KNOWN_WINDOWS) {
    if (m.startsWith(entry.prefix) && (!best || entry.prefix.length > best.prefix.length)) {
      best = entry;
    }
  }
  if (best) return { tokens: best.tokens, known: true };
  return { tokens: CONSERVATIVE_WINDOW_TOKENS, known: false };
}

export type PromptStatus = 'green' | 'amber' | 'red';

export function promptStatus(promptTokens: number, windowTokens: number): PromptStatus {
  const ratio = promptTokens / Math.max(1, windowTokens);
  if (ratio >= RED_THRESHOLD) return 'red';
  if (ratio >= AMBER_THRESHOLD) return 'amber';
  return 'green';
}

export interface HistoryPlan {
  /** True when older turns should be compressed into a session distillate. */
  needsDistillation: boolean;
  /** Older messages to summarize (empty when nothing to distill). */
  toDistill: ChatMsg[];
  /** Trailing messages that stay raw. */
  keepRaw: ChatMsg[];
}

/**
 * Decide whether the rolling distillate fires. It fires when the estimated
 * total prompt (system half + history) crosses DISTILL_THRESHOLD of the
 * window AND there is older history beyond the raw tail to compress.
 */
export function planHistoryWindow(opts: {
  history: ChatMsg[];
  systemTokens: number;
  windowTokens: number;
  keepRawMessages?: number;
}): HistoryPlan {
  const keepN = opts.keepRawMessages ?? KEEP_RAW_MESSAGES;
  const total = opts.systemTokens + estimateMessagesTokens(opts.history) + RESPONSE_RESERVE_TOKENS;
  const over = total >= DISTILL_THRESHOLD * opts.windowTokens;
  if (!over || opts.history.length <= keepN) {
    return { needsDistillation: false, toDistill: [], keepRaw: opts.history };
  }
  return {
    needsDistillation: true,
    toDistill: opts.history.slice(0, opts.history.length - keepN),
    keepRaw: opts.history.slice(opts.history.length - keepN),
  };
}

export interface HardCapResult {
  history: ChatMsg[];
  /** Raw messages dropped (oldest first) to fit the cap. */
  droppedCount: number;
  /** True when even the final message had to be shortened. */
  truncated: boolean;
}

/**
 * The invariant: systemTokens + history ≤ window − reserve, ALWAYS. Trims
 * oldest raw messages first; never touches the system half (soul/context) and
 * never drops the `protectedHead` leading messages (the session distillate).
 * As a last resort the remaining messages' bodies are shortened — a clipped
 * question still beats a hard provider error.
 */
export function enforceHardCap(opts: {
  history: ChatMsg[];
  systemTokens: number;
  windowTokens: number;
  protectedHead?: number;
}): HardCapResult {
  const cap = opts.windowTokens - RESPONSE_RESERVE_TOKENS;
  const budget = cap - opts.systemTokens;
  const protectedHead = opts.protectedHead ?? 0;
  const history = [...opts.history];
  let droppedCount = 0;
  let truncated = false;

  const fits = () => estimateMessagesTokens(history) <= budget;

  // Drop oldest raw (non-protected) messages, but always keep the final one —
  // the turn the user just sent.
  while (!fits() && history.length - protectedHead > 1) {
    history.splice(protectedHead, 1);
    droppedCount++;
  }

  // Still over: shorten bodies, newest-last kept as intact as possible —
  // clip from the head of the list down.
  if (!fits()) {
    for (let i = 0; i < history.length && !fits(); i++) {
      const othersTokens = estimateMessagesTokens(history.filter((_, j) => j !== i));
      const allowedTokens = Math.max(64, budget - othersTokens - 4);
      // Leave headroom for the trim-notice suffix and rounding — the whole
      // point of this branch is to land UNDER the cap, not one token over it.
      const allowedChars = allowedTokens * CHAR_PER_TOKEN - 200;
      if ((history[i].content ?? '').length > allowedChars) {
        history[i] = {
          ...history[i],
          content: history[i].content.slice(0, allowedChars) + '\n…[trimmed to fit the model context window]',
        };
        truncated = true;
      }
    }
  }

  return { history, droppedCount, truncated };
}
