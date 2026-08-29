/**
 * Fri text får levande länkar — en implementation, alla ytor.
 *
 * Magnus loggade en aktivitet som pekade på wikin i stället för att upprepa
 * den: "teamets samlade reflektioner finns i wikin: <url>" (2026-08-29). Det
 * är exakt rätt form för en liggare — posten är kort och pekar på underlaget —
 * men tidslinjen skrev ut adressen som död text. Samtidigt hade River redan
 * löst det, i en lokal funktion ingen annan kunde nå.
 *
 * Två beslut pinnas här, båda värda mer än de ser ut:
 *
 * 1. Intern länk navigerar I appen. En länk till instansens eget /admin/... är
 *    en rutt, inte en destination på internet; target="_blank" startar om hela
 *    SPA:t för att landa tre meter bort.
 * 2. Länkens text ÄR adressen. Aktiviteter skrivs inte bara av oss — inkommande
 *    mejl blir aktiviteter och agenter skriver dem — så en etikett någon annan
 *    valt över ett mål någon annan valt är en liten nätfiskeyta.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
const comp = read('src/components/ui/linkified-text.tsx');
const river = read('src/pages/admin/RiverPage.tsx');
const timeline = read('src/components/admin/crm/UnifiedTimeline.tsx');

describe('intern länk är en rutt, inte en resa ut', () => {
  it('samma origin ger en router-länk — och beslutet är faktiskt inkopplat', () => {
    expect(comp).toMatch(/if \(u\.origin !== window\.location\.origin\) return null/);
    // Att <Link> FINNS i filen räcker inte: första versionen av den här grinden
    // överlevde att `path` hårdkodades till null. Pinna kopplingen, inte
    // närvaron — annars mäter grinden att koden är skriven, inte att den kör.
    expect(comp).toMatch(/const path = internalPath\(url\);/);
    expect(comp).toMatch(/\{path \? \(\s*\n\s*<Link to=\{path\}/);
  });

  it('allt annat öppnas i ny flik utan referrer', () => {
    expect(comp).toMatch(/target="_blank" rel="noreferrer"/);
  });

  it('en trasig URL kraschar inte raden — den förblir text', () => {
    expect(comp).toMatch(/\} catch \{\s*\n\s*return null;/);
  });
});

describe('adressen är sin egen etikett', () => {
  it('länktexten är URL:en, aldrig något annat', () => {
    // Ingen etikettparameter, inget label-prop: komponenten kan inte ljuga om målet.
    expect(comp).not.toMatch(/label\s*[?:]/);
    expect(comp).toMatch(/>\{url\}<\/Link>/);
    expect(comp).toMatch(/>\{url\}<\/a>/);
  });

  it('avslutande skiljetecken hör till meningen, inte till adressen', () => {
    expect(comp).toMatch(/p\.match\(\/\[\.,;:!\?\)\\\]\]\+\$\/\)/);
  });
});

describe('en implementation, inte två', () => {
  it('River använder den delade komponenten och har ingen egen kvar', () => {
    expect(river).toMatch(/import \{ LinkifiedText \}/);
    expect(river).not.toMatch(/function autoLink\(/);
  });

  it('tidslinjen använder samma komponent', () => {
    expect(timeline).toMatch(/import \{ LinkifiedText \}/);
    expect(timeline).toMatch(/<LinkifiedText text=\{event\.description\} \/>/);
  });
});
