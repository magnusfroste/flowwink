/**
 * A step says what it sends (2026-11-24).
 *
 * The fleet's heartbeats stop at their token budget, and the only record was a
 * prompt-token count per step: nordbrygg's last step was twice the others on
 * every run, with nothing to say why. Each step measures its prompt by part,
 * and the run writes one `prompt_sizes` trace event.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { measurePrompt } from '../../../supabase/functions/_shared/pilot/prompt-sizes';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('a step says what it sends', () => {
  it('measures each part and names the tool behind the largest answers', () => {
    const size = measurePrompt(
      [
        { role: 'system', content: 's'.repeat(1000) },
        { role: 'user', content: 'u'.repeat(100) },
        { role: 'assistant', content: null, tool_calls: [
          { id: 'a', function: { name: 'evaluate_outcomes', arguments: '{}' } },
          { id: 'b', function: { name: 'memory_read', arguments: '{"key":"x"}' } },
        ] },
        { role: 'tool', tool_call_id: 'a', content: 'e'.repeat(5000) },
        { role: 'tool', tool_call_id: 'b', content: 'm'.repeat(300) },
        { role: 'assistant', content: null, tool_calls: [{ id: 'c', function: { name: 'evaluate_outcomes', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 'c', content: 'e'.repeat(2000) },
      ],
      [{ type: 'function', function: { name: 't', description: 'd'.repeat(50) } }],
    );
    expect(size.system).toBe(1000);
    expect(size.user).toBe(100);
    expect(size.tool_answers).toBe(7300);
    expect(size.tools).toBe(1);
    expect(size.tool_schemas).toBeGreaterThan(50);
    expect(size.largest_answers[0]).toEqual({ tool: 'evaluate_outcomes', chars: 7000 });
    expect(size.largest_answers[1]).toEqual({ tool: 'memory_read', chars: 300 });
  });

  it('an answer whose call is unknown is still counted', () => {
    const size = measurePrompt([{ role: 'tool', tool_call_id: 'zz', content: 'x'.repeat(40) }]);
    expect(size.largest_answers).toEqual([{ tool: 'unknown', chars: 40 }]);
  });

  it('the loop measures every step before it is sent and writes one event', () => {
    const r = read('supabase/functions/_shared/pilot/reason.ts');
    const measure = r.indexOf('stepSizes.push({ iteration: i, ...measurePrompt(');
    const call = r.indexOf('const aiResponse = await callAiWithRetry(', measure);
    expect(measure).toBeGreaterThan(0);
    expect(call - measure).toBeLessThan(200);
    // After the fold: what is measured is what is sent.
    expect(r.lastIndexOf('foldReadToolResults(', measure)).toBeGreaterThan(0);
    expect(r).toMatch(/why\.add\('prompt_sizes'/);
    expect(r.indexOf("why.add('prompt_sizes'")).toBeLessThan(r.indexOf('await why.flush();'));
  });
});
