// What a step sends, by part (2026-11-24).
//
// The fleet's heartbeats stop at their token budget, and ai_usage_logs says
// only how many prompt tokens each step cost: on nordbrygg 9 700 → 19 000 →
// 22 000 → 15 500 → 14 000 → 15 500 → 40 000, the last step twice the others on
// every run compared. What made it grow was not on record, so every fix was a
// guess. Each step now measures its own prompt — the system text, the user
// text, the model's own turns, the tool schemas, and the tool answers by tool —
// and the run writes one `prompt_sizes` trace event with every step in it.
//
// Pure, and characters, not tokens: a provider's tokenizer is not available
// here, and the ratio (about four characters a token) is the same for every
// part, so the shares are what matter.

export interface SizedMessage {
  role: string;
  content?: unknown;
  tool_call_id?: string;
  tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: unknown } }>;
}

export interface StepSize {
  /** The system messages (soul, objectives, rules, injected notes). */
  system: number;
  /** The user messages (the trigger, the directive). */
  user: number;
  /** The model's own turns: its text and the arguments of its tool calls. */
  assistant: number;
  /** All tool answers. */
  tool_answers: number;
  /** The tool schemas sent beside the messages. */
  tool_schemas: number;
  /** How many tools were offered. */
  tools: number;
  /** The largest tool answers, by tool, largest first (at most five). */
  largest_answers: Array<{ tool: string; chars: number }>;
}

const textLength = (content: unknown): number => {
  if (content == null) return 0;
  if (typeof content === 'string') return content.length;
  try { return JSON.stringify(content).length; } catch { return 0; }
};

export function measurePrompt(messages: readonly SizedMessage[], tools: readonly unknown[] = []): StepSize {
  const size: StepSize = { system: 0, user: 0, assistant: 0, tool_answers: 0, tool_schemas: 0, tools: tools.length, largest_answers: [] };
  const toolOfCall = new Map<string, string>();
  const byTool = new Map<string, number>();

  for (const m of messages) {
    const len = textLength(m.content);
    if (m.role === 'system') size.system += len;
    else if (m.role === 'user') size.user += len;
    else if (m.role === 'assistant') {
      size.assistant += len;
      for (const tc of m.tool_calls || []) {
        if (tc.id && tc.function?.name) toolOfCall.set(tc.id, tc.function.name);
        size.assistant += textLength(tc.function?.arguments);
      }
    } else if (m.role === 'tool') {
      size.tool_answers += len;
      const tool = (m.tool_call_id && toolOfCall.get(m.tool_call_id)) || 'unknown';
      byTool.set(tool, (byTool.get(tool) || 0) + len);
    }
  }
  for (const t of tools) size.tool_schemas += textLength(t);

  size.largest_answers = [...byTool.entries()]
    .map(([tool, chars]) => ({ tool, chars }))
    .sort((a, b) => b.chars - a.chars)
    .slice(0, 5);
  return size;
}
