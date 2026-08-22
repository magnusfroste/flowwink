import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Reasoning-model param guardrail.
 *
 * gpt-5-class models 400 on /chat/completions when function tools are attached
 * without `reasoning_effort: 'none'`. The model name comes from the platform AI
 * map (site_settings.system_ai), so ANY call site that attaches tools to a
 * map-resolved model must handle the reasoning class via isOpenAiReasoningModel.
 *
 * This bit three surfaces in one day (2026-08-19): public chat, FlowWork
 * (workspace-chat), and reconciliation OCR. Each was a raw fetch that predated
 * the class. This test scans every edge-function file that both talks to the
 * OpenAI chat/completions endpoint and sends tools, and requires it to
 * reference reasoning_effort handling — so the next raw call site fails CI
 * instead of failing Svante.
 */

const FUNCTIONS_ROOT = join(__dirname, '../../../supabase/functions');

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (p.endsWith('.ts')) acc.push(p);
  }
  return acc;
}

const rel = (f: string) => f.replace(FUNCTIONS_ROOT, 'supabase/functions');

/** The object literal enclosing `pos`, by matching braces outward. */
function enclosingObjectLiteral(src: string, pos: number): { start: number; end: number; text: string } | null {
  let depth = 0;
  let start = -1;
  for (let i = pos; i >= 0; i--) {
    const c = src[i];
    if (c === '}') depth++;
    else if (c === '{') {
      if (depth === 0) { start = i; break; }
      depth--;
    }
  }
  if (start < 0) return null;
  let d = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === '{') d++;
    else if (c === '}' && --d === 0) return { start, end: i, text: src.slice(start, i + 1) };
  }
  return null;
}

/**
 * Find every OpenAI-shaped chat request body in a file, as {line, text}.
 *
 * Keyed on the body LITERAL (an object with both `model` and `messages`), not on
 * the enclosing `fetch(...)`, because half the risky call sites assemble the body
 * into a variable first (`const body: any = {...}; fetch(url, {body: JSON.stringify(body)})`)
 * — run-autonomy-tests does exactly that, and a fetch-scoped scan sails past it.
 * Shorthand `messages,` counts: _shared/pilot/handlers.ts writes it that way.
 *
 * Per-body rather than per-file so a provider-branching file (extract-pdf-text,
 * extract-receipt, parse-resume — each with a Gemini arm, an Anthropic arm and an
 * OpenAI arm) is judged on its OpenAI arm alone.
 */
function openAiChatBodies(src: string): string[] {
  const bodies: string[] = [];
  const re = /\bmessages\s*[,:]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    // Must be a property in an object literal, not `const messages = ...`
    // (which would otherwise resolve to the enclosing *function* block).
    if (!/[{,]$/.test(src.slice(0, m.index).replace(/\s+$/, ''))) continue;

    const body = enclosingObjectLiteral(src, m.index);
    if (!body || !/\bmodel\s*[,:]/.test(body.text)) continue;

    // Options handed to the central wrappers are safe by construction.
    if (/\bcallAi(Completion)?\s*\(\s*$/.test(src.slice(0, body.start))) continue;

    // Anthropic and native-Gemini are a different wire format: the OpenAI
    // reasoning class does not apply, and Anthropic REQUIRES max_tokens. Their
    // headers/URL sit just above the body literal.
    const window = src.slice(Math.max(0, body.start - 400), body.end + 1);
    if (/anthropic-version|x-api-key/.test(window)) continue;
    if (/generationConfig|generativelanguage\.googleapis\.com/.test(window)) continue;

    bodies.push(body.text);
  }
  return bodies;
}

describe('reasoning-model params (gpt-5-class + tools)', () => {
  it('every OpenAI chat/completions call site that sends tools handles reasoning_effort', () => {
    const offenders: string[] = [];
    for (const file of walk(FUNCTIONS_ROOT)) {
      const src = readFileSync(file, 'utf8');
      const talksToOpenAiChat =
        src.includes('api.openai.com/v1/chat/completions') ||
        (src.includes('chat/completions') && src.includes('OPENAI_API_KEY'));
      if (!talksToOpenAiChat) continue;
      const sendsTools = /\btools:\s/.test(src) || /\btool_choice\b/.test(src);
      if (!sendsTools) continue;
      const handlesReasoning =
        src.includes('reasoning_effort') || src.includes('isOpenAiReasoningModel');
      if (!handlesReasoning) offenders.push(rel(file));
    }
    expect(
      offenders,
      `These files attach tools to an OpenAI chat/completions call without handling ` +
        `reasoning-class models (gpt-5.x 400s without reasoning_effort:'none'). ` +
        `Use isOpenAiReasoningModel from _shared/ai-providers.ts.`,
    ).toEqual([]);
  });

  /**
   * The test above keys on the literal endpoint (`chat/completions` /
   * `OPENAI_API_KEY`) — which is exactly why it slept through the worst call
   * site in the codebase. FlowPilot's ReAct loop (_shared/pilot/reason.ts)
   * POSTs to an `apiUrl` handed back by resolveAiConfig, so neither literal ever
   * appears in the file, and it sent `tools` to a map-resolved model with no
   * reasoning handling at all: one Luna-class model in site_settings.system_ai
   * and every autonomous loop on that instance 400s.
   *
   * So: the real trigger is not the URL, it is the AI MAP. Any file that resolves
   * its model through resolveAiConfig can be pointed at a gpt-5-class model by an
   * operator toggling a setting, and must therefore handle all three rejected
   * params — max_tokens (wants max_completion_tokens), a set temperature, and
   * tools without reasoning_effort:'none'.
   *
   * Scoped per request BODY so provider-branching files are judged on their
   * OpenAI arm only. Calls routed through the two central wrappers — callAi
   * (_shared/ai-call.ts) and callAiCompletion (_shared/ai-usage-logger.ts) —
   * are safe by construction: both normalise the class themselves.
   */
  it('every resolveAiConfig-resolved OpenAI chat call handles the reasoning class', () => {
    const RISKY = /\b(max_tokens|temperature)\s*:|\btools:\s/;
    const offenders: string[] = [];

    for (const file of walk(FUNCTIONS_ROOT)) {
      if (file.endsWith('/ai-call.ts') || file.endsWith('/ai-usage-logger.ts')) continue;
      const src = readFileSync(file, 'utf8');
      // The AI map is the trigger: a hardcoded model can't be re-pointed at a
      // reasoning model by an operator, so it is out of scope here.
      if (!src.includes('resolveAiConfig')) continue;

      const risky = openAiChatBodies(src).filter(body => RISKY.test(body));
      if (risky.length === 0) continue; // wrapper-only file, or no risky params

      const handled =
        src.includes('isOpenAiReasoningModel') ||
        src.includes('reasoning_effort') ||
        src.includes('max_completion_tokens');
      if (!handled) offenders.push(rel(file));
    }

    expect(
      offenders,
      `These files resolve their model through the platform AI map (resolveAiConfig) and ` +
        `send max_tokens / temperature / tools on a raw OpenAI chat fetch, without ` +
        `handling reasoning-class models. If the map resolves to gpt-5.x the call 400s. ` +
        `Fix: gate the params on isOpenAiReasoningModel (_shared/ai-providers.ts) — ` +
        `max_completion_tokens instead of max_tokens, drop temperature, and ` +
        `reasoning_effort:'none' whenever tools are attached. Or route the call through ` +
        `callAi (_shared/ai-call.ts) / callAiCompletion (_shared/ai-usage-logger.ts), ` +
        `which normalise the class centrally.`,
    ).toEqual([]);
  });
});
