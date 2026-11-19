import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveUiText, PLATFORM_UI_TEXT } from '../../../supabase/functions/_shared/locale/ui-text';
import { UI_TEXT_SV } from '../../../supabase/functions/_shared/locale/ui-text-pack-sv';

/**
 * Guardrail: the language set in settings governs what a visitor reads, the
 * day a text ships (2026-11-19).
 *
 * A visitor text was English until someone ran an AI translation on that
 * instance; a Swedish site had 193 of 612 in Swedish, and every text a later
 * deploy added stayed English. The platform ships Swedish for all of them now,
 * and a new text cannot be added without its Swedish.
 */
const catalogue = JSON.parse(readFileSync(join(process.cwd(), 'src/data/ui-text-catalog.json'), 'utf-8')) as {
  keys: Array<{ key: string; fallback: string }>;
};
// `t('key', 'fallback')` in a doc comment is read as a text by the scanner.
const real = catalogue.keys.filter((k) => k.key !== 'key');
const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');

describe('the platform speaks Swedish', () => {
  it('every visitor text has a Swedish line, and none is left over', () => {
    const missing = real.filter((k) => !UI_TEXT_SV[k.key]).map((k) => k.key);
    expect(missing, 'add the Swedish to supabase/functions/_shared/locale/ui-text-pack-sv.ts').toEqual([]);
    const known = new Set(real.map((k) => k.key));
    expect(Object.keys(UI_TEXT_SV).filter((k) => !known.has(k)), 'a line for a text that no longer exists').toEqual([]);
  });

  it('every Swedish line carries the placeholders of its English', () => {
    const off = real.filter((k) => placeholders(k.fallback) !== placeholders(UI_TEXT_SV[k.key] ?? '')).map((k) => k.key);
    expect(off).toEqual([]);
  });

  it('a Swedish reader gets Swedish with no instance translation at all', () => {
    const onSwedishSite = resolveUiText({}, 'sv', 'sv');
    expect(onSwedishSite('checkout.pay', 'Pay')).toBe('Betala');
    const swedishPageOnEnglishSite = resolveUiText({}, 'sv-SE', 'en');
    expect(swedishPageOnEnglishSite('invoice.howToPay', 'How to pay')).toBe('Så betalar du');
  });

  it('an instance\'s own wording wins over the platform\'s', () => {
    expect(resolveUiText({ '@sv': { 'checkout.pay': 'Slutför köp' } }, 'sv', 'en')('checkout.pay', 'Pay')).toBe('Slutför köp');
    expect(resolveUiText({ 'checkout.pay': 'Betala nu' }, 'sv', 'sv')('checkout.pay', 'Pay')).toBe('Betala nu');
  });

  it('an English reader still gets the English at the call site', () => {
    expect(resolveUiText({}, 'en', 'en')('checkout.pay', 'Pay')).toBe('Pay');
    expect(resolveUiText({}, 'en', 'sv')('checkout.pay', 'Pay')).toBe('Pay');
    expect(PLATFORM_UI_TEXT.en).toBeUndefined();
  });

  it('a language the platform does not ship falls to English, never to Swedish', () => {
    expect(resolveUiText({}, 'de', 'sv')('checkout.pay', 'Pay')).toBe('Pay');
  });
});
