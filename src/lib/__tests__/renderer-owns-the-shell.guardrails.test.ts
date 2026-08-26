/**
 * Renderaren äger skalet — blocket äger innehållet.
 *
 * Uppmätt 2026-08-26 (kollegors iPhone 13 på optic): textblock kändes "lite
 * annorlunda paddade". Aritmetiken: wrapperns px-4 + blockets eget px-6 =
 * 40 px sidopadding mot konforma grannars 16, och py-8 + py-16 = tredubbel
 * vertikal rytm på mobil. CLAUDE.md:s konvention är att BlockRenderer ger
 * icke-full-bleed-block section + container + padding — blockets eget skal
 * är dubbelskal.
 *
 * Populationen är 29 block (Lovable-arv). Det här testet pinnar TextBlock
 * (det rapporterade och nu normaliserade) och håller en LISTA över kända
 * kvarvarande syndare — svepet som tömmer listan är ett eget, fleet-synligt
 * designbeslut. Ett NYTT block med eget skal, eller en regression i ett
 * normaliserat, fälls direkt.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(__dirname, '../../components/public/blocks');

const FULL_BLEED = new Set([
  'HeroBlock', 'ParallaxSectionBlock', 'AnnouncementBarBlock', 'MapBlock',
  'MarqueeBlock', 'HeaderBlock', 'FooterBlock', 'PopupBlock',
  'NotificationToastBlock', 'FloatingCtaBlock', 'ChatLauncherBlock',
  'SectionDividerBlock', 'FeaturedCarouselBlock',
]);

/** Målade sektioner = PANELER: egen padding är INVÄNDIG och legitim, men då
 * MÅSTE sektionen bära färg + systemets panelradie (cta-doktrinen #278).
 * Svepet 2026-08-26 tömde dubbelskalslistan: 26 lagerskal strippade (endast
 * padding, struktur orörd), Contact omklassad till panel, CTA var redan panel. */
const PANEL_SECTIONS = new Set(['CTABlock', 'ContactBlock']);

// Multiline-medveten: #287-svepets skanner läste bara enradiga
// <section className="…"> — TwoColumn (attribut på egen rad) och ChatBlock
// slank igenom, upptäckta av Magnus på /why (mobil) 2026-08-26. Vakten
// läser nu HELA öppningstaggen, radbrytningar inräknade.
const SECTION_TAG = /<section\b[^>]*?>/gs;
const ownShell = (src: string): boolean =>
  [...src.matchAll(SECTION_TAG)].some((m) => /className="[^"]*\bp[xy]-/.test(m[0]));

describe('renderaren äger skalet', () => {
  it('TextBlock bär inget eget sektionsskal — det rapporterade blocket är normaliserat', () => {
    const src = readFileSync(join(DIR, 'TextBlock.tsx'), 'utf-8');
    expect(ownShell(src)).toBe(false);
    expect(src).not.toContain('container mx-auto');
  });

  it('populationen är NOLL — inget icke-panel-block bär eget sektionsskal', () => {
    const offenders: string[] = [];
    for (const f of readdirSync(DIR).filter((x) => x.endsWith('Block.tsx'))) {
      const name = f.replace('.tsx', '');
      if (FULL_BLEED.has(name) || PANEL_SECTIONS.has(name)) continue;
      if (ownShell(readFileSync(join(DIR, f), 'utf-8'))) offenders.push(name);
    }
    expect(offenders, `dubbelskal: ${offenders.join(', ')}`).toEqual([]);
  });

  it('en panel med egen padding MÅSTE bära färg och panelradie — annars är den ett lagerskal', () => {
    for (const name of PANEL_SECTIONS) {
      const src = readFileSync(join(DIR, `${name}.tsx`), 'utf-8');
      const sections = src.match(/<section[\s\S]{0,400}?className="[^"]*\bp[xy]-[^"]*"/g) ?? [];
      expect(sections.length, `${name}: panelstatus utan padded sektion`).toBeGreaterThan(0);
      for (const sec of sections) {
        // Panelens strukturella kontrakt är RADIEN. Färgen kan komma från en
        // bg-klass ELLER en absolut bild (cta with-image) — den pinnas inte
        // textuellt; en padded sektion utan radie är däremot alltid ett
        // lagerskal i förklädnad.
        expect(sec, `${name}: padded sektion utan panelradie`).toContain('rounded-[var(--radius-block');
      }
    }
  });
});

describe('transparent header är ett överlägg', () => {
  /**
   * bg-transparent i dokumentflödet tar bort färgen men inte PLATSEN —
   * headern blev ett band ovanför heron (optic 2026-08-26). Kontraktet:
   * transparent = absolut över innehållet, scrollar bort med sidan;
   * följ-med-vid-scroll är blur/solid + sticky.
   */
  it('transparent positionerar absolut och ärver aldrig sticky-flödet', () => {
    const src = readFileSync(
      join(__dirname, '../../components/public/PublicNavigation.tsx'), 'utf-8');
    expect(src).toMatch(/isOverlay\s*=\s*style === 'transparent'/);
    expect(src).toMatch(/isOverlay[\s\S]{0,80}absolute top-0 left-0 right-0/);
  });
});
