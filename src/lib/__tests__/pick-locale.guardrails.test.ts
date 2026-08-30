import { describe, it, expect } from 'vitest';
import { pickLocale, baseSubtag } from '../pick-locale';

/**
 * Stegen för språkval, pinnad.
 *
 * SAMMA fall står i migreringen 20260903090000, där public.pick_locale bevisar
 * sig själv vid varje applicering. Två implementationer av en regel är
 * oundvikligt när halva systemet svarar i webbläsaren och halva i databasen —
 * men två BETEENDEN är det inte. Ändras den ena ska den andra ändras, och de
 * här fallen är kontraktet mellan dem.
 */
describe('pickLocale — samma stege som public.pick_locale', () => {
  const LADDER: Array<[string, string[], string | null, string | null, string | null]> = [
    ['exakt tagg',            ['sv', 'en'],     'sv',    'en', 'sv'],
    ['samma språk',           ['sv', 'en'],     'sv-SE', 'en', 'sv'],
    ['en-GB svarar på en',    ['en', 'sv'],     'en-GB', 'sv', 'en'],
    ['minst specifik vinner', ['en-GB', 'en'],  'en',    null, 'en'],
    ['faller till standard',  ['sv', 'en'],     'de',    'en', 'en'],
    ['ingen träff är null',   ['sv'],           'de',    'fr', null],
    ['tom lista är null',     [],               'sv',    'en', null],
  ];

  for (const [name, available, wanted, fallback, expected] of LADDER) {
    it(name, () => {
      expect(pickLocale({ available, wanted, fallback })).toBe(expected);
    });
  }

  it('returnerar taggen som den STAVAS i listan, inte som den efterfrågades', () => {
    expect(pickLocale({ available: ['sv-SE'], wanted: 'SV-se' })).toBe('sv-SE');
  });

  it('en frånvaro rapporteras — den gissas aldrig till ett annat språk', () => {
    // Det här är hela skälet att steget finns: en sida utan version i det
    // önskade språket får inte tyst bli ett annat språk.
    expect(pickLocale({ available: ['sv', 'de'], wanted: 'fr' })).toBeNull();
  });

  it('skräp i listan ignoreras i stället för att bli ett språk', () => {
    expect(pickLocale({ available: ['', '  ', 'sv'], wanted: 'sv' })).toBe('sv');
    expect(pickLocale({ available: ['', '  '], wanted: 'sv', fallback: 'en' })).toBeNull();
  });

  it('baseSubtag', () => {
    expect(baseSubtag('sv-SE')).toBe('sv');
    expect(baseSubtag('EN')).toBe('en');
    expect(baseSubtag('')).toBe('');
  });
});
