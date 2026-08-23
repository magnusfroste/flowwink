import { describe, expect, it } from 'vitest';

import { chunkMarkdown } from '../../../supabase/functions/_shared/retrieval/chunker.ts';

/**
 * Guardrail: the heading trail in a chunk title must reflect the document's own
 * nesting, not the absolute `#` count.
 *
 * The chunker read the depth straight off the heading level (`depth = level - 1`),
 * which silently assumed every document opens at `#`. Body markdown very often
 * opens at `##` — the H1 lives in the entity title, not in the text — and there
 * every `##` got depth 1, so `trail.slice(0, 1)` kept the PREVIOUS sibling and
 * filed each section under the one before it. A real document with three sibling
 * `##` sections indexed as:
 *
 *     Produkt - X › Servicenivå
 *     Produkt - X › Servicenivå › Vad tjänsten gör
 *     Produkt - X › Servicenivå › Pris
 *
 * `knowledge_chunks.title` is the citation label an agent reads back to a
 * customer, so this made the agent state that "Pris" is a subsection of
 * "Servicenivå" when the document says no such thing. H1-led documents were
 * unaffected (H1 → depth 0 resets the trail), which is why it went unseen.
 *
 * The fix derives the depth from the levels a document actually uses — the trail
 * depth is the size of the open-heading stack, so the shallowest level present is
 * depth 0 whatever it is. This test runs the real chunker over an H1-led document
 * (behaviour must be unchanged), an H2-led one (siblings stay siblings), mixed
 * ##/### nesting (real nesting still nests), and the two malformed shapes that
 * broke the old arithmetic.
 */

const ENTITY = 'Produkt - X';
const titles = (md: string) => chunkMarkdown(ENTITY, md).map((c) => c.title);

describe('chunkMarkdown heading trail', () => {
  it('leaves an H1-led document exactly as it was', () => {
    const md = [
      '# Tjänstebeskrivning',
      'Ingress.',
      '## Servicenivå',
      'Svarstid inom fyra timmar.',
      '### Vad tjänsten gör',
      'Bevakning och åtgärd.',
      '## Pris',
      '1 200 kr per månad.',
    ].join('\n\n');

    expect(titles(md)).toEqual([
      'Produkt - X › Tjänstebeskrivning',
      'Produkt - X › Tjänstebeskrivning › Servicenivå',
      'Produkt - X › Tjänstebeskrivning › Servicenivå › Vad tjänsten gör',
      'Produkt - X › Tjänstebeskrivning › Pris',
    ]);
  });

  it('keeps sibling H2s siblings in a document with no H1', () => {
    const md = [
      '## Servicenivå',
      'Svarstid inom fyra timmar.',
      '## Vad tjänsten gör',
      'Bevakning och åtgärd.',
      '## Pris',
      '1 200 kr per månad.',
    ].join('\n\n');

    // The regression: these came out nested under their predecessor.
    expect(titles(md)).toEqual([
      'Produkt - X › Servicenivå',
      'Produkt - X › Vad tjänsten gör',
      'Produkt - X › Pris',
    ]);
    // No chunk of a flat document may claim a two-level trail.
    for (const t of titles(md)) {
      expect(t.split(' › ')).toHaveLength(2);
    }
  });

  it('still nests real ##/### nesting in an H2-led document', () => {
    const md = [
      '## Servicenivå',
      'Svarstid inom fyra timmar.',
      '### Vad tjänsten gör',
      'Bevakning och åtgärd.',
      '### Undantag',
      'Gäller inte helger.',
      '## Pris',
      '1 200 kr per månad.',
      '### Rabatter',
      'Tio procent vid årsavtal.',
    ].join('\n\n');

    expect(titles(md)).toEqual([
      'Produkt - X › Servicenivå',
      'Produkt - X › Servicenivå › Vad tjänsten gör',
      'Produkt - X › Servicenivå › Undantag',
      'Produkt - X › Pris',
      'Produkt - X › Pris › Rabatter',
    ]);
  });

  it('does not nest a shallower heading that only appears late', () => {
    const md = [
      '## Servicenivå',
      'Svarstid inom fyra timmar.',
      '## Pris',
      '1 200 kr per månad.',
      '# Bilaga',
      'Villkor i sin helhet.',
    ].join('\n\n');

    expect(titles(md)).toEqual([
      'Produkt - X › Servicenivå',
      'Produkt - X › Pris',
      'Produkt - X › Bilaga',
    ]);
  });

  it('keeps siblings siblings across a skipped heading level', () => {
    const md = [
      '# Tjänstebeskrivning',
      'Ingress.',
      '### Servicenivå',
      'Svarstid inom fyra timmar.',
      '### Pris',
      '1 200 kr per månad.',
    ].join('\n\n');

    expect(titles(md)).toEqual([
      'Produkt - X › Tjänstebeskrivning',
      'Produkt - X › Tjänstebeskrivning › Servicenivå',
      'Produkt - X › Tjänstebeskrivning › Pris',
    ]);
  });

  it('carries every section body into a chunk regardless of heading level', () => {
    const md = ['## A', 'body a', '## B', 'body b'].join('\n\n');
    expect(chunkMarkdown(ENTITY, md).map((c) => c.content)).toEqual(['body a', 'body b']);
  });
});
