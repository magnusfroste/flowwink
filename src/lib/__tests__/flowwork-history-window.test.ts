/**
 * FlowWork history window — the negative test the feature was built around.
 *
 * FlowWork sessions send the full history every turn; unwindowed, the prompt
 * grows until the model window overflows with a hard provider error. The
 * Model Context Window Guard (supabase/functions/_shared/context-window.ts)
 * must guarantee, on a synthetic long session, that:
 *   (a) the planned prompt NEVER exceeds window − response reserve
 *       (i.e. no provider context overflow is possible),
 *   (b) the rolling distillate actually triggers, and
 *   (c) the header indicator reaches amber BEFORE red — the user is warned
 *       while the session is still comfortably alive.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveContextWindow,
  planHistoryWindow,
  enforceHardCap,
  promptStatus,
  estimateMessagesTokens,
  estimateTokens,
  CONSERVATIVE_WINDOW_TOKENS,
  RESPONSE_RESERVE_TOKENS,
  KEEP_RAW_MESSAGES,
  type ChatMsg,
} from '../../../supabase/functions/_shared/context-window';

/* ------------------------------------------------------------------ */
/* Window map                                                          */
/* ------------------------------------------------------------------ */
describe('resolveContextWindow', () => {
  it('knows the mainstream OpenAI/Gemini models', () => {
    expect(resolveContextWindow('openai', 'gpt-4.1-mini')).toEqual({ tokens: 1_000_000, known: true });
    expect(resolveContextWindow('openai', 'gpt-4o')).toEqual({ tokens: 128_000, known: true });
    expect(resolveContextWindow('gemini', 'gemini-2.5-flash')).toEqual({ tokens: 1_000_000, known: true });
  });

  it('guesses stingy, never generous, for unknown models (local/n8n)', () => {
    const r = resolveContextWindow('local', 'qwen2.5-coder-32b');
    expect(r.known).toBe(false);
    expect(r.tokens).toBe(CONSERVATIVE_WINDOW_TOKENS);
  });

  it('honors per-instance overrides from system_ai (model beats provider)', () => {
    const overrides = { local: 16_000, 'qwen2.5-coder-32b': 24_000 };
    expect(resolveContextWindow('local', 'qwen2.5-coder-32b', overrides)).toEqual({ tokens: 24_000, known: true });
    expect(resolveContextWindow('local', 'some-other-model', overrides)).toEqual({ tokens: 16_000, known: true });
  });

  it('ignores nonsense overrides', () => {
    expect(resolveContextWindow('local', 'x', { x: 12 }).known).toBe(false);
    expect(resolveContextWindow('local', 'x', { x: 'big' as unknown as number }).known).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* The synthetic long session                                          */
/* ------------------------------------------------------------------ */

const WINDOW = CONSERVATIVE_WINDOW_TOKENS; // a local model — smallest window
const SYSTEM_TOKENS = 6_000; // soul + identity + retrieval context
const CAP = WINDOW - RESPONSE_RESERVE_TOKENS;

function turn(i: number, role: 'user' | 'assistant'): ChatMsg {
  // ~800 tokens per message — a realistic verbose turn.
  return { role, content: `[turn ${i}] ${'workspace fakta och siffror '.repeat(110)}` };
}

/**
 * Simulate exactly what workspace-chat does per request, with a pluggable
 * distiller (the real one is an AI call; here it is deterministic).
 */
function runRequest(history: ChatMsg[], distiller: ((toDistill: ChatMsg[]) => string | null)) {
  let windowed = history;
  let distilled = false;
  const plan = planHistoryWindow({ history, systemTokens: SYSTEM_TOKENS, windowTokens: WINDOW });
  if (plan.needsDistillation) {
    const summary = distiller(plan.toDistill);
    if (summary) {
      windowed = [{ role: 'system', content: `SESSION SUMMARY:\n${summary}` }, ...plan.keepRaw];
      distilled = true;
    }
  }
  const capped = enforceHardCap({
    history: windowed, systemTokens: SYSTEM_TOKENS, windowTokens: WINDOW,
    protectedHead: distilled ? 1 : 0,
  });
  const promptTokensEst = SYSTEM_TOKENS + estimateMessagesTokens(capped.history);
  return {
    promptTokensEst,
    status: promptStatus(promptTokensEst, WINDOW),
    distillTriggered: plan.needsDistillation,
    distilled,
    dropped: capped.droppedCount,
    history: capped.history,
  };
}

describe('synthetic long session (negative test)', () => {
  const okDistiller = () => 'Beslut: X. Kund: Acme (id 123). Öppet: fakturafrågan.'.repeat(10);
  const brokenDistiller = () => null; // provider hiccup on the summarizer call

  for (const [label, distiller] of [
    ['distiller working', okDistiller],
    ['distiller failing (fail forward)', brokenDistiller],
  ] as const) {
    it(`never plans a prompt over window − reserve — ${label}`, () => {
      const history: ChatMsg[] = [];
      let anyDistillTrigger = false;
      const statuses: string[] = [];

      for (let i = 0; i < 120; i++) {
        history.push(turn(i, i % 2 === 0 ? 'user' : 'assistant'));
        const res = runRequest(history, distiller);

        // (a) the invariant: NEVER over the cap → no provider error possible.
        expect(res.promptTokensEst).toBeLessThanOrEqual(CAP);
        if (res.distillTriggered) anyDistillTrigger = true;
        statuses.push(res.status);

        // The user's just-sent message always survives the window.
        const last = res.history[res.history.length - 1];
        expect(last.content).toContain(`[turn ${i}]`);
      }

      // (b) the session got long enough that the distillate actually fired.
      expect(anyDistillTrigger).toBe(true);

      // (c) amber shows before red — the warning precedes the critical state.
      const firstAmber = statuses.indexOf('amber');
      const firstRed = statuses.indexOf('red');
      expect(firstAmber).toBeGreaterThan(-1);
      if (firstRed !== -1) expect(firstAmber).toBeLessThan(firstRed);
    });
  }

  it('a working distillate keeps the summary protected and drops nothing raw', () => {
    const history: ChatMsg[] = [];
    for (let i = 0; i < 60; i++) history.push(turn(i, i % 2 === 0 ? 'user' : 'assistant'));
    const res = runRequest(history, okDistiller);
    expect(res.distilled).toBe(true);
    expect(res.history[0].content).toContain('SESSION SUMMARY');
    expect(res.history.length).toBe(1 + KEEP_RAW_MESSAGES);
    expect(res.dropped).toBe(0);
  });

  it('hard cap tames even a single oversized message (pasted attachment)', () => {
    const huge: ChatMsg[] = [{ role: 'user', content: 'x'.repeat(400_000) }]; // ~100k tokens in a 32k window
    const capped = enforceHardCap({ history: huge, systemTokens: SYSTEM_TOKENS, windowTokens: WINDOW });
    expect(capped.truncated).toBe(true);
    expect(SYSTEM_TOKENS + estimateMessagesTokens(capped.history)).toBeLessThanOrEqual(CAP);
    expect(capped.history[0].content).toContain('[trimmed to fit the model context window]');
  });

  it('short sessions are untouched: no distillation, nothing dropped, green', () => {
    const history: ChatMsg[] = [turn(0, 'user'), turn(1, 'assistant'), turn(2, 'user')];
    const res = runRequest(history, okDistiller);
    expect(res.distillTriggered).toBe(false);
    expect(res.dropped).toBe(0);
    expect(res.status).toBe('green');
    expect(res.history).toHaveLength(3);
  });

  it('estimateTokens matches the ~chars/4 contract', () => {
    expect(estimateTokens('abcd'.repeat(100))).toBe(100);
  });
});
