import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { scanFrozenBlockEditors } from '../../../scripts/lib/scan-frozen-block-editors.mjs';

const ROOT = resolve(__dirname, '../../..');

/**
 * Frusna blockeditorer — noll, och det ska förbli noll.
 *
 * useBlockEditor löste klassen 2026-08-18, men ingenting tvingade editorerna
 * att använda den. Tre gjorde det inte, och en människa hittade två av dem för
 * hand genom att växla språk i sidredigeraren. Grinden gör rälsen obligatorisk
 * i stället för tillgänglig.
 */
describe('inga frusna blockeditorer', () => {
  it('ingen editor kopierar sina props till engångs-state', () => {
    const offenders = scanFrozenBlockEditors(ROOT);
    expect(
      offenders,
      'useState(data) fryser första renderingen. Använd useBlockEditor — den synkar om när '
      + 'föräldern lämnar över nytt innehåll och vaktar mot att editorns egna ändringar studsar tillbaka.',
    ).toEqual([]);
  });

  it('skannern hittar mönstret när det finns — annars vore nollan värdelös', () => {
    // Negativtest mot skannerns egna regexar, inte mot en fil på disk: en grind
    // som bara kan rapportera noll bevisar ingenting.
    const patterns = [
      'const [d, setD] = useState<Foo>(data);',
      'const [d, setD] = useState(data);',
      'const [d, setD] = useState<Foo>({ ...data });',
    ];
    for (const line of patterns) {
      expect(
        [/useState\s*<[^>]*>\s*\(\s*data\s*\)/, /useState\s*\(\s*data\s*\)/,
         /useState\s*<[^>]*>\s*\(\s*\{\s*\.\.\.data\s*\}\s*\)/].some((re) => re.test(line)),
        `skannern missar: ${line}`,
      ).toBe(true);
    }
  });
});
