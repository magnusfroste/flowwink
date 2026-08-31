import { describe, it, expect } from 'vitest';
import {
  kbInVisitorLanguage,
  splitSearchMatchesByLanguage,
  localizedCategoryText,
} from '../kb-language';

/**
 * Vad en frånvaro betyder på KB-ytorna, pinnat.
 *
 * Hittat live på optictunnels.se/en/help (2026-08-31): engelsk chrome runt
 * helsvenska artiklar. Regeln som fixar det är också regeln som är lätt att
 * "förbättra" sönder: en lista visar ALDRIG tyst ett annat språk, sök FÅR
 * falla tillbaka men bara märkt, och rader utan locale (för-rälsen-data,
 * omigrerad instans) visas alltid — att gömma hela kunskapsbasen för att en
 * kolumn inte landat vore en grind, inte en fallback (Law 4).
 */

type Row = { id: string; locale?: string | null; translation_group_id?: string | null };

const row = (id: string, locale?: string | null, group?: string | null): Row => ({
  id,
  locale,
  translation_group_id: group ?? null,
});

describe('kbInVisitorLanguage — listor ljuger inte om språk', () => {
  it('enspråkig sajt: exakt samma referens, ingenting att förklara', () => {
    const rows = [row('a', 'sv'), row('b', 'de')];
    expect(kbInVisitorLanguage(rows, 'sv', 'sv', false)).toBe(rows);
  });

  it('rader utan locale (för-rälsen) visas alltid', () => {
    const rows = [row('a'), row('b', null)];
    expect(kbInVisitorLanguage(rows, 'en', 'sv', true)).toEqual(rows);
  });

  it('en grupp med båda språken svarar med besökarens', () => {
    const rows = [row('sv1', 'sv', 'g1'), row('en1', 'en', 'g1')];
    expect(kbInVisitorLanguage(rows, 'en', 'sv', true).map((r) => r.id)).toEqual(['en1']);
    expect(kbInVisitorLanguage(rows, 'sv', 'sv', true).map((r) => r.id)).toEqual(['sv1']);
  });

  it('en grupp utan version i besökarens språk är ÄRLIGT frånvarande', () => {
    // Det här är hela buggen: den svenska artikeln fick inte tyst bli den
    // engelska hjälpsidans innehåll. Sajtens default är INTE en ersättning.
    const rows = [row('sv1', 'sv', 'g1')];
    expect(kbInVisitorLanguage(rows, 'en', 'sv', true)).toEqual([]);
  });

  it('en ogrupperad artikel är sin egen grupp', () => {
    const rows = [row('solo', 'sv')];
    expect(kbInVisitorLanguage(rows, 'en', 'sv', true)).toEqual([]);
    expect(kbInVisitorLanguage(rows, 'sv-SE', 'sv', true).map((r) => r.id)).toEqual(['solo']);
  });

  it('en yta utan deklarerat språk läses på sajtens eget', () => {
    const rows = [row('sv1', 'sv', 'g1'), row('en1', 'en', 'g1')];
    expect(kbInVisitorLanguage(rows, null, 'sv', true).map((r) => r.id)).toEqual(['sv1']);
  });

  it('ordningen bevaras — publika listor är sort_order-sorterade', () => {
    const rows = [
      row('a', 'en', 'g1'),
      row('pre'),
      row('b', 'en', 'g2'),
      row('b-sv', 'sv', 'g2'),
    ];
    expect(kbInVisitorLanguage(rows, 'en', 'sv', true).map((r) => r.id)).toEqual([
      'a',
      'pre',
      'b',
    ]);
  });
});

describe('splitSearchMatchesByLanguage — sök får falla tillbaka, men märkt', () => {
  const all = [row('sv1', 'sv', 'g1'), row('en1', 'en', 'g1'), row('sv2', 'sv', 'g2')];
  const inLanguage = new Set(
    kbInVisitorLanguage(all, 'en', 'sv', true).map((r) => r.id),
  );

  it('en träff i besökarens språk är primär', () => {
    const { primary, fallback } = splitSearchMatchesByLanguage([all[1]], inLanguage);
    expect(primary.map((r) => r.id)).toEqual(['en1']);
    expect(fallback).toEqual([]);
  });

  it('en träff som bara finns på annat språk hamnar i fallback', () => {
    const { primary, fallback } = splitSearchMatchesByLanguage([all[2]], inLanguage);
    expect(primary).toEqual([]);
    expect(fallback.map((r) => r.id)).toEqual(['sv2']);
  });

  it('en grupp som redan svarat på besökarens språk upprepas inte i fallback', () => {
    // Frågan matchade båda versionerna (t.ex. ett produktnamn) — besökaren
    // hittade artikeln, på sitt språk. Den svenska tvillingen är brus.
    const { primary, fallback } = splitSearchMatchesByLanguage(
      [all[0], all[1]],
      inLanguage,
    );
    expect(primary.map((r) => r.id)).toEqual(['en1']);
    expect(fallback).toEqual([]);
  });

  it('rader utan locale räknas som primära', () => {
    const { primary, fallback } = splitSearchMatchesByLanguage([row('pre')], inLanguage);
    expect(primary.map((r) => r.id)).toEqual(['pre']);
    expect(fallback).toEqual([]);
  });
});

describe('localizedCategoryText — etiketten översätts som chrome', () => {
  const cat = {
    name: 'Fakturering',
    description: 'Allt om fakturor',
    translations: { en: { name: 'Billing', description: 'All about invoices' } },
  };

  it('sajtens eget språk får baskolumnerna, overlay ignoreras', () => {
    expect(localizedCategoryText(cat, 'sv', 'sv').name).toBe('Fakturering');
  });

  it('annat språk får sitt overlay', () => {
    expect(localizedCategoryText(cat, 'en', 'sv')).toEqual({
      name: 'Billing',
      description: 'All about invoices',
    });
  });

  it('overlay-nyckeln väljs via stegen — en-GB når en', () => {
    expect(localizedCategoryText(cat, 'en-GB', 'sv').name).toBe('Billing');
  });

  it('utan overlay faller namnet SYNLIGT tillbaka till basen', () => {
    // Att gömma kategorin hade gömt dess redan översatta artiklar.
    expect(localizedCategoryText(cat, 'de', 'sv').name).toBe('Fakturering');
  });

  it('skräp i translations blir aldrig en etikett', () => {
    expect(
      localizedCategoryText({ name: 'Bas', translations: 'not-an-object' }, 'en', 'sv').name,
    ).toBe('Bas');
    expect(
      localizedCategoryText({ name: 'Bas', translations: { en: { name: '  ' } } }, 'en', 'sv')
        .name,
    ).toBe('Bas');
  });
});
