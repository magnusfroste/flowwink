/**
 * A tool answer the model has read is folded (2026-11-21).
 *
 * Every step resends the whole conversation, and a tool's answer stayed in it
 * whole. On the fleet's heartbeats one large answer early cost 5 000–10 000
 * tokens on every later step; LiteIT stopped at its token budget before
 * finishing on two mornings out of four.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FOLD_OVER, foldReadToolResults, type LoopMessage } from '../../../supabase/functions/_shared/pilot/fold-tool-results';

const big = (label: string) => JSON.stringify({ label, rows: 'x'.repeat(8000) });
const turn = (n: number, tool: string, content: string): LoopMessage[] => [
  { role: 'assistant', content: null, tool_calls: [{ id: `c${n}`, function: { name: tool } }] },
  { role: 'tool', tool_call_id: `c${n}`, content },
];

describe('folding read tool answers', () => {
  it('the last two turns stay whole; an older large answer is folded', () => {
    const msgs = [{ role: 'user', content: 'go' }, ...turn(1, 'audit_blog', big('one')), ...turn(2, 'check_operations', big('two')), ...turn(3, 'manage_blog_posts', big('three'))];
    const r = foldReadToolResults(msgs);
    expect(r.folded).toBe(1);
    expect(String(r.messages[2].content)).toContain('"_folded":true');
    expect(String(r.messages[2].content)).toContain('from audit_blog');
    expect(String(r.messages[2].content).length).toBeLessThan(1000);
    expect(r.messages[4].content).toBe(msgs[4].content);
    expect(r.messages[6].content).toBe(msgs[6].content);
    expect(r.savedChars).toBeGreaterThan(7000);
  });

  it('a short answer, an error or a refusal is never folded', () => {
    const small = JSON.stringify({ status: 'refused', code: 'CADENCE_SATISFIED', hint: 'x'.repeat(200) });
    expect(small.length).toBeLessThan(FOLD_OVER);
    const msgs = [...turn(1, 'write_blog_post', small), ...turn(2, 'a', big('a')), ...turn(3, 'b', big('b'))];
    expect(foldReadToolResults(msgs).folded).toBe(0);
  });

  it("a skill's instructions are followed, not read once: never folded", () => {
    const msgs = [...turn(1, 'skill_read', big('playbook')), ...turn(2, 'a', big('a')), ...turn(3, 'b', big('b'))];
    expect(foldReadToolResults(msgs).folded).toBe(0);
  });

  it('folding twice changes nothing more, and the input is not mutated', () => {
    const msgs = [...turn(1, 'x', big('x')), ...turn(2, 'a', big('a')), ...turn(3, 'b', big('b'))];
    const before = String(msgs[1].content);
    const once = foldReadToolResults(msgs);
    expect(msgs[1].content).toBe(before);
    expect(foldReadToolResults(once.messages).folded).toBe(0);
  });

  it('a run of one or two turns is left alone', () => {
    expect(foldReadToolResults([...turn(1, 'x', big('x')), ...turn(2, 'y', big('y'))]).folded).toBe(0);
  });

  it('the loop folds before every model call, and a run can opt out', () => {
    const reason = readFileSync(join(__dirname, '../../../supabase/functions/_shared/pilot/reason.ts'), 'utf-8');
    expect(reason).toMatch(/config\.foldToolResults !== false[\s\S]{0,200}foldReadToolResults\(conversationMessages/);
    expect(reason.indexOf('foldReadToolResults(conversationMessages')).toBeLessThan(reason.indexOf('const aiResponse = await callAiWithRetry({'));
  });
});
