import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scanHardcodedVisitorText } from '../../../scripts/lib/scan-hardcoded-visitor-text.mjs';

const ROOT = resolve(__dirname, '../../..');
const BASELINE: Record<string, number> = JSON.parse(
  readFileSync(resolve(ROOT, 'src/lib/__tests__/fixtures/hardcoded-visitor-text-baseline.json'), 'utf-8'),
);

/**
 * Hårdkodad besökartext krymper — aldrig växer.
 *
 * Vi hittade strängarna en och en, för hand, på en live-sajt: "Blogg" i en
 * engelsk meny, en svensk cookie-ruta på en engelsk sida, "All rights reserved"
 * under varje svensk sida. Var och en var billig att rätta och omöjlig att
 * upptäcka systematiskt — så nästa dök upp veckan därpå.
 *
 * Det här gör mängden till ett tal. En ny sträng i en publik komponent fäller
 * grinden med filnamnet i meddelandet; att flytta en till packet får talet att
 * sjunka. Produktens EGET gränssnitt (admin/) räknas aldrig — det ska förbli
 * engelskt.
 *
 * Heuristiken underskattar med flit. En grind som underskattar ratchetar ändå;
 * en som överskattar får folk att lägga till undantag tills talet slutar betyda
 * något.
 */
describe('inga nya hårdkodade besökarsträngar', () => {
  const current = scanHardcodedVisitorText(ROOT) as Record<string, number>;

  it('ingen fil har fler än sin baslinje', () => {
    const grown = Object.entries(current)
      .filter(([file, n]) => n > (BASELINE[file] ?? 0))
      .map(([file, n]) => `${file}: ${n} strängar, baslinjen tillåter ${BASELINE[file] ?? 0}`);
    expect(
      grown,
      'Ny hårdkodad besökartext. Lägg den i ui_text via t(\'nyckel\', \'English\') — '
      + 'annars kan den aldrig följa besökarens språk.\n'
      + 'Har du i stället FÄRRE: kör `node scripts/regen-visitor-text-baseline.mjs`.',
    ).toEqual([]);
  });

  it('baslinjen speglar verkligheten — inga rader för filer som är rena', () => {
    // En baslinje med spöken tillåter en sträng att smyga tillbaka in i en fil
    // som redan städats.
    const ghosts = Object.keys(BASELINE).filter((f) => !(f in current));
    expect(
      ghosts,
      'Baslinjen tillåter strängar i filer som inte längre har några — kör regen-skriptet.',
    ).toEqual([]);
  });

  it('skannern rör aldrig produktens eget gränssnitt', () => {
    expect(Object.keys(current).some((f) => f.includes('/admin'))).toBe(false);
  });
});
