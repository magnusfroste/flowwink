// A tool answer the model has read is folded, not carried whole (2026-11-21).
//
// Every step of a run sends the whole conversation again, and a tool's answer
// stayed in it at full size until the run ended. Measured on the fleet's
// heartbeats: the first call is ~10 000 prompt tokens, one large answer early
// adds 5 000–10 000 to EVERY later step (www grew to 54 000 in four steps), and
// LiteIT hit its token budget before finishing on two mornings out of four —
// "Stopped at the token budget: 128 169 tokens in 7 iterations".
//
// The rule: the answers of the last KEEP_TURNS tool turns stay whole (the model
// is still working with them); an older answer over FOLD_OVER characters is
// replaced by its beginning and a note that the tool can be called again. What
// the model was told to FOLLOW (a skill's instructions) is never folded, and
// neither is a short answer — an error, a refusal, an id.
//
// Pure: it returns a new array and never touches a message it does not fold.

export interface LoopMessage {
  role: string;
  content?: unknown;
  tool_call_id?: string;
  tool_calls?: Array<{ id?: string; function?: { name?: string } }>;
  [key: string]: unknown;
}

/** Tool turns (an assistant message with tool calls + its answers) kept whole. */
export const KEEP_TURNS = 2;
/** An answer at or under this many characters is never folded. */
export const FOLD_OVER = 1500;
/** What is kept of a folded answer. */
export const FOLD_PREVIEW = 500;

/** Answers the model follows rather than reads once: never folded. */
export const NEVER_FOLD: ReadonlySet<string> = new Set(['skill_read', 'read_skill', 'soul_read', 'objective_read']);

const FOLD_MARK = '"_folded":true';

export function foldReadToolResults<T extends LoopMessage>(
  messages: readonly T[],
  opts: { keepTurns?: number; foldOver?: number; preview?: number } = {},
): { messages: T[]; folded: number; savedChars: number } {
  const keepTurns = opts.keepTurns ?? KEEP_TURNS;
  const foldOver = opts.foldOver ?? FOLD_OVER;
  const preview = opts.preview ?? FOLD_PREVIEW;

  // Where the kept turns begin: the index of the keepTurns-th assistant
  // message with tool calls, counted from the end.
  let seen = 0;
  let keepFrom = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      seen += 1;
      if (seen === keepTurns) { keepFrom = i; break; }
    }
  }
  if (seen < keepTurns) return { messages: [...messages], folded: 0, savedChars: 0 };

  const nameOfCall = new Map<string, string>();
  for (const m of messages) {
    for (const tc of m.tool_calls ?? []) {
      if (tc?.id) nameOfCall.set(tc.id, String(tc.function?.name ?? ''));
    }
  }

  let folded = 0;
  let savedChars = 0;
  const out = messages.map((m, i) => {
    if (i >= keepFrom || m.role !== 'tool' || typeof m.content !== 'string') return m;
    const text = m.content;
    if (text.length <= foldOver || text.includes(FOLD_MARK)) return m;
    const tool = nameOfCall.get(String(m.tool_call_id ?? '')) ?? '';
    if (NEVER_FOLD.has(tool)) return m;
    const replacement = JSON.stringify({
      _folded: true,
      note: `You already read this answer${tool ? ` from ${tool}` : ''}; it was shortened to save context (${text.length} characters). Call the tool again if you need the rest.`,
      beginning: text.slice(0, preview),
    });
    folded += 1;
    savedChars += text.length - replacement.length;
    return { ...m, content: replacement };
  });
  return { messages: out, folded, savedChars };
}
