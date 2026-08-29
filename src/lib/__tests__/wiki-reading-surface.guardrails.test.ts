/**
 * Wikin är en läsyta — bredden är läsarens, och skapandet är tyst.
 *
 * Två fynd samma dag (Magnus 2026-08-29), båda om samma sak: sidan ska bära
 * innehåll, inte gränssnitt.
 *
 * 1. Trädet tog en fast tredjedel. På en mindre desktop äter det läsytan, och
 *    wikin är på väg att bli navet — ett Enterprise Context System. Bredden
 *    dras nu av läsaren och minns per ENHET (localStorage), till skillnad från
 *    ägarlinsen som följer människan mellan enheter (profiles.preferences). En
 *    kolumnbredd hör till skärmen man sitter vid.
 * 2. "New page" var en fylld helbreddsknapp — det tyngsta ett gränssnitt kan
 *    innehålla, riktat mot den ovanligaste handlingen på sidan. De flesta besök
 *    läser, några redigerar, få skapar. Sökrutan behåller vikten.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(process.cwd(), 'src/pages/admin/WikiPage.tsx'), 'utf-8');

describe('bredden är läsarens', () => {
  it('kolumnen är dragbar och klamrad', () => {
    expect(page).toMatch(/cursor-col-resize/);
    expect(page).toMatch(/Math\.min\(SIDEBAR_MAX, Math\.max\(SIDEBAR_MIN/);
  });

  it('och nåbar utan mus', () => {
    expect(page).toMatch(/role="separator"/);
    expect(page).toMatch(/e\.key === 'ArrowLeft'/);
    expect(page).toMatch(/e\.key === 'ArrowRight'/);
  });

  it('minns per enhet, och klarar att lagringen är blockerad', () => {
    expect(page).toMatch(/localStorage\.getItem\(SIDEBAR_KEY\)/);
    expect(page).toMatch(/} catch \{/);
  });

  it('handtaget erbjuds aldrig när det inte finns något att dra', () => {
    // Trädet är dolt i redigeringsläge och staplat på mobil.
    expect(page).toMatch(/\{!\(editing && page\) && \(/);
    expect(page).toMatch(/hidden lg:flex w-1\.5/);
  });
});

describe('skapandet är tyst, sökandet har vikten', () => {
  it('ingen fylld helbreddsknapp för New page', () => {
    expect(page).not.toMatch(/<Button onClick=\{handleNew\} size="sm" className="w-full">/);
  });

  it('utan en diskret ikonknapp — som ändå går att nå med skärmläsare', () => {
    expect(page).toMatch(/onClick=\{handleNew\}[\s\S]{0,200}variant="ghost"/);
    expect(page).toMatch(/aria-label="New page"/);
  });

  it('sökrutan är kvar som ytans tyngsta element', () => {
    expect(page).toMatch(/placeholder="Search pages & content…"/);
    expect(page).toMatch(/⌘K/);
  });
});
