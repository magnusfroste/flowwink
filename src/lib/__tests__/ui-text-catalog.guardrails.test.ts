import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// Delad ESM-hjälpare med scripts/ — testet IMPORTERAR och KÖR den, så
// grinden kan inte överleva sin egen sabotage.
import { extractUiTextKeys } from '../../../scripts/lib/extract-ui-text-keys.mjs';

const ROOT = resolve(__dirname, '../../..');

/**
 * Katalogen är vad adminytan visar. Blir den inaktuell visar editorn nycklar
 * som inte längre finns, och — värre — döljer nya som ingen översatt. En
 * redaktör som ser en komplett lista litar på den.
 */
describe('ui_text-katalogen', () => {
  const committed = JSON.parse(
    readFileSync(resolve(ROOT, 'src/data/ui-text-catalog.json'), 'utf8'),
  ) as { keys: Array<{ key: string; group: string; fallback: string }> };

  it('speglar anropsplatserna i koden', () => {
    const fresh = extractUiTextKeys(ROOT).map(({ key, group, fallback }: Record<string, string>) => ({ key, group, fallback }));
    expect(
      committed.keys,
      'Inaktuell ui_text-katalog. Kör: npm run ui-text:catalog (och committa src/data/ui-text-catalog.json).',
    ).toEqual(fresh);
  });

  it('varje nyckel bär en engelsk fallback', () => {
    const empty = committed.keys.filter((k) => !k.fallback.trim());
    expect(empty.map((k) => k.key), 'En nyckel utan fallback ger tom text när packet saknas.').toEqual([]);
  });

  it('nycklarna är punktade — annars kan de krocka med @<locale>-overlays', () => {
    const bad = committed.keys.filter((k) => k.key.startsWith('@'));
    expect(bad.map((k) => k.key)).toEqual([]);
  });

  it('hittar faktiskt något — en tom katalog vore en tyst regression', () => {
    expect(committed.keys.length).toBeGreaterThan(20);
  });
});
