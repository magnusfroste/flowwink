import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { classifyAgentError, stampAgentError } from '../../../supabase/functions/_shared/agent-errors';

/** The stamper adds code, retryable and hint to whatever a handler answered. */
const stamp = (result: Record<string, unknown>) => stampAgentError(result);
import { NOT_A_SKILL_FAULT, selfHealCandidates } from '../../../supabase/functions/_shared/skills/skill-visibility';

/**
 * Guardrail: looking for something that is not there is not a broken skill.
 *
 * Optic, 2026-11-20 21:54: an agent writing the week's meeting notes asked the
 * wiki whether the pages for week 46 and week 47 existed before creating one.
 * Both answers — `{ found: false, error: 'No wiki page matches slug "…"' }` —
 * were stored as HANDLER_ERROR, the code self-healing counts. A third probe in
 * the same breath would have quarantined manage_wiki_page, the most used skill
 * on the instance, for every agent until a person switched it back on.
 *
 * The classifier knew ten nouns ("no page", "no order" …); forty handlers say
 * it about other things. Two shapes decide now, not one more noun:
 *
 *  1. a handler that answers `found: false` has said it looked and found
 *     nothing — NOT_FOUND whatever the sentence beside it says;
 *  2. a message that opens "No <thing> with | matching | matches | named |
 *     found for …" is a lookup miss.
 */

const SHARED = resolve(__dirname, '../../../supabase/functions/_shared');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return p.endsWith('.ts') ? [p] : [];
  });
}

/** Every literal message a handler answers or throws that opens with "No ". */
function noMessages(): Array<{ file: string; message: string }> {
  const rx = /(?:throw new Error\(\s*|error:\s*)([`'"])(No [^`'"]{3,200})/g;
  const out: Array<{ file: string; message: string }> = [];
  for (const file of walk(SHARED)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(rx)) {
      out.push({ file: file.replace(`${SHARED}/`, ''), message: m[2].replace(/\$\{[^}]*\}?/g, 'x') });
    }
  }
  return out;
}

describe('a lookup miss is not a skill fault', () => {
  it('the wiki answers exactly as optic got them are NOT_FOUND', () => {
    for (const error of [
      'No wiki page matches slug "ProduktionsmoteV46Veckomote".',
      'No wiki page matches title "Produktionsmöte v47".',
      'No wiki page with slug "ProduktionsmoteV47Veckomote".',
      'No wiki page matches slug "X" (title fallback tried too). Use action=list or search_wiki to find the right slug.',
    ]) {
      expect(classifyAgentError(error).code, error).toBe('NOT_FOUND');
    }
  });

  it('found: false decides, whatever the sentence says', () => {
    const stamped = stamp({ found: false, error: 'Nothing here by that reference.' });
    expect(stamped.code).toBe('NOT_FOUND');
    expect(stamped.retryable).toBe(false);
    expect(typeof stamped.hint).toBe('string');
  });

  it('a handler\'s own code and hint still win over the shape', () => {
    const stamped = stamp({ found: false, error: 'Nothing here.', code: 'INVALID_INPUT', hint: 'own hint' });
    expect(stamped.code).toBe('INVALID_INPUT');
    expect(stamped.hint).toBe('own hint');
  });

  it('a failure that does not say found: false is still judged by its message', () => {
    expect(stamp({ error: 'column "foo" does not parse' }).code).toBe('HANDLER_ERROR');
    expect(stamp({ found: true, error: 'column "foo" does not parse' }).code).toBe('HANDLER_ERROR');
  });

  it('the shape is a lookup, not every sentence that opens with "No"', () => {
    // These are not misses — the shape must leave them to their own rules.
    for (const error of ['No updatable fields provided', 'No AI response', 'No rates parsed from ECB feed']) {
      expect(classifyAgentError(error).code, error).not.toBe('NOT_FOUND');
    }
  });

  it('three probes for pages that do not exist never quarantine the wiki', () => {
    expect(NOT_A_SKILL_FAULT.has('NOT_FOUND')).toBe(true);
    const now = new Date('2026-11-20T21:55:00Z');
    const probe = (s: string) => ({
      skill_name: 'manage_wiki_page',
      status: 'failed',
      code: stamp({ found: false, error: `No wiki page matches slug "${s}".` }).code as string,
      created_at: '2026-11-20T21:54:43Z',
    });
    expect(selfHealCandidates([probe('V45'), probe('V46'), probe('V47')], 3, { now })).toEqual([]);
    // The same three rows as they were stored that evening would have.
    const asStored = [1, 2, 3].map(() => ({ skill_name: 'manage_wiki_page', status: 'failed', code: 'HANDLER_ERROR', created_at: '2026-11-20T21:54:43Z' }));
    expect(selfHealCandidates(asStored, 3, { now })).toEqual([{ name: 'manage_wiki_page', streak: 3 }]);
  });

  it('every "No <thing> with/matching/named …" a handler can answer is a miss (discovered, not listed)', () => {
    const lookups = noMessages().filter(({ message }) => /^No (?:[\w-]+\s+){1,4}?(?:with|matching|matches|named|found (?:for|with))\b/.test(message));
    expect(lookups.length).toBeGreaterThan(20);
    const wrong = lookups.filter(({ message }) => !NOT_A_SKILL_FAULT.has(classifyAgentError(message).code));
    expect(wrong).toEqual([]);
  });

  it('ratchet: "No …" answers still read as a fault in the skill may only shrink', () => {
    // What is left is mostly a caller's or the configuration's too ("No
    // updatable fields provided", "No AI provider configured"). Give one its
    // own code or wording when you touch it; never add to the pile.
    const faults = noMessages().filter(({ message }) => classifyAgentError(message).code === 'HANDLER_ERROR');
    expect(faults.length).toBeLessThanOrEqual(36);
  });
});
