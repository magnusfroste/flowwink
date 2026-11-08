import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { markdownToTiptap } from '../../../supabase/functions/_shared/markdown-to-tiptap';

/**
 * Agents write Markdown. It is what a language model naturally produces and
 * what every other content skill in the platform accepts — so a KB handler
 * that splits on blank lines and calls the result a document is not a
 * converter, it is a silent downgrade.
 *
 * That is exactly what happened: 30 articles were created through the gateway,
 * the skill answered `created`, and every list arrived as one paragraph whose
 * literal text carried the dashes and asterisks. Honest status, wrong data —
 * the same shape as the alias bug and the envelope lie, one layer further in.
 */

const handler = readFileSync(
  resolve(__dirname, '../../../supabase/functions/_shared/execute/core.ts'), 'utf-8',
);

describe('KB answers keep the structure the author wrote', () => {
  const normalize = handler.slice(
    handler.indexOf('function normalizeKbAnswer'),
    handler.indexOf('async function executeKbAction'),
  );

  it('routes Markdown through the real converter', () => {
    expect(normalize).toContain('markdownToTiptap(raw)');
  });

  it('does not re-introduce the blank-line split', () => {
    expect(
      /split\(\/\\n\{2,\}\//.test(normalize),
      'splitting on blank lines turns every list and heading into a paragraph of literal punctuation',
    ).toBe(false);
  });

  it('stores plain text for search and retrieval, not raw Markdown', () => {
    // answer_text feeds the chat's grounding context; asterisks are noise to a
    // model reading for meaning, and they leak into snippets.
    expect(normalize).toContain('extractText');
  });
});

describe('the converter itself handles what agents actually write', () => {
  it('turns a dash list into a bulletList, not a paragraph', () => {
    const doc = markdownToTiptap('Intro:\n- **Förbjuden AI**: social poängsättning\n- Högrisk-AI: rekrytering');
    const kinds = doc.content.map((n: any) => n.type);
    expect(kinds).toContain('bulletList');
    expect(JSON.stringify(doc)).not.toContain('**');
  });

  it('keeps bold as a mark rather than as characters', () => {
    const doc = markdownToTiptap('Den reglerar **användning** av AI.');
    expect(JSON.stringify(doc)).toContain('"bold"');
    expect(JSON.stringify(doc)).not.toContain('**');
  });

  it('leaves prose without Markdown untouched', () => {
    const doc = markdownToTiptap('Ett vanligt stycke utan formatering.');
    expect(doc.content).toHaveLength(1);
    expect(doc.content[0].type).toBe('paragraph');
  });

  it('never returns an empty document', () => {
    expect(markdownToTiptap('').content.length).toBeGreaterThan(0);
  });
});
