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
  it('transparent är alltid överlägg — och sticky-ratten väljer fixed/absolute, aldrig ignorerad', () => {
    const src = readFileSync(
      join(__dirname, '../../components/public/PublicNavigation.tsx'), 'utf-8');
    expect(src).toMatch(/isOverlay\s*=\s*style === 'transparent'/);
    expect(src).toMatch(/overlayFollows \? "fixed top-0 left-0 right-0" : "absolute top-0 left-0 right-0"/);
  });

  it('preset-matrisen förblir koherent: clean=transparent+ej sticky, sticky=blur+sticky', () => {
    const presets = readFileSync(
      join(__dirname, '../../hooks/useGlobalBlocks.ts'), 'utf-8');
    const clean = presets.match(/clean: \{[\s\S]*?\}/)?.[0] ?? '';
    const sticky = presets.match(/sticky: \{[\s\S]*?\}/)?.[0] ?? '';
    expect(clean).toContain('stickyHeader: false');
    expect(clean).toContain("backgroundStyle: 'transparent'");
    expect(sticky).toContain('stickyHeader: true');
    expect(sticky).toContain("backgroundStyle: 'blur'");
  });
});

describe('formulärets kort äger sin yta', () => {
  /**
   * FormBlock bar en hårdkodad bg-muted/30 på sin innersektion — ett 1104px
   * tonat band bakom 640px-kortet, läst som "bakgrund utanför formuläret"
   * (optic 2026-08-27, verifierad computed-kedja). Kortet (bg-card) är
   * formulärets yta; sektionsbakgrund är sectionBackground-rattens jobb.
   */
  it('FormBlock målar aldrig sina egna sektioner', () => {
    const src = readFileSync(
      join(__dirname, '../../components/public/blocks/FormBlock.tsx'), 'utf-8');
    for (const m of src.matchAll(SECTION_TAG)) {
      expect(m[0], `målad sektion i FormBlock: ${m[0].slice(0, 80)}`).not.toMatch(/className="[^"]*bg-/);
    }
  });
});

describe('skyddsnätet får inte döda stickyn', () => {
  // overflow-x: hidden på html/body gör body till scroll-container och bryter
  // varje position:sticky-ättling — headern scrollade bort på mobil och
  // herotexten red upp över den (Restagård 2026-08-27). `clip` klipper
  // utan scroll-container; skyddsnätet mot horisontellt spill består.
  it('html/body klipper med clip, aldrig hidden', () => {
    const css = readFileSync(join(__dirname, '../../index.css'), 'utf-8');
    const base = css.slice(css.indexOf('html {'), css.indexOf('h1, h2'));
    expect(base).toContain('overflow-x: clip');
    expect(base, 'overflow-x: hidden på html/body dödar position:sticky — använd clip').not.toContain('overflow-x: hidden');
  });
});

describe('heron krockar inte med overlay-headern', () => {
  // Centrerat innehåll i viewport-höjd utan egen kantpadding svämmar över mot
  // y=0 när det är högre än sektionen — och ligger då ovanpå en transparent
  // overlay-header (optic mobil 2026-08-27). Innehållscontainern MÅSTE bära
  // säkerhetspadding (> headerns 4 rem) i centrerat icke-auto-läge.
  it('innehållscontainern bär py-24 i centrerat viewport-läge', () => {
    const src = readFileSync(join(__dirname, '../../components/public/blocks/HeroBlock.tsx'), 'utf-8');
    expect(src).toMatch(/heightMode !== 'auto' && contentAlignment === 'center' && "py-2[4-9]"/);
  });
});

describe('heroens bildfält ljuger inte', () => {
  // Schemat vitlistar backgroundImage OCH imageSrc men renderaren läste bara
  // det förra — imageSrc blev ett spökfält: validerat, lagrat, aldrig visat
  // (Restagård 2026-08-27, alla heroes föll till gradient). Aliaset ska bestå
  // och vara ENDA läsplatsen för data.backgroundImage.
  it('imageSrc-aliaset finns och data.backgroundImage läses bara där', () => {
    const src = readFileSync(join(__dirname, '../../components/public/blocks/HeroBlock.tsx'), 'utf-8');
    expect(src).toContain("data.backgroundImage || (data as { imageSrc?: string }).imageSrc");
    expect((src.match(/data\.backgroundImage/g) ?? []).length,
      'nya nakna data.backgroundImage-läsningar — gå via heroImage-aliaset').toBe(1);
  });
});

describe('overlay-headern annonserar sin höjd — hero-lösa sidor konsumerar den', () => {
  // Overlay tar ingen flödeshöjd: /chat låg under nav-länkarna (autoversio
  // 2026-08-28). Headern sätter --overlay-header-offset (uppmätt, tas bort i
  // icke-overlay); varje PublicNavigation-sida utan hero-garanti bär
  // pt-[var(--overlay-header-offset,0px)] på sin main. Population: ALLA
  // src/pages-filer som importerar PublicNavigation, utom PublicPage som
  // villkorar på förstablockets typ.
  const PAD = 'pt-[var(--overlay-header-offset,0px)]';
  it('headern sätter variabeln i overlay-läge', () => {
    const nav = readFileSync(join(__dirname, '../../components/public/PublicNavigation.tsx'), 'utf-8');
    expect(nav).toContain("setProperty('--overlay-header-offset'");
    expect(nav).toContain("removeProperty('--overlay-header-offset')");
  });
  it('varje PublicNavigation-sida konsumerar offset', () => {
    const dir = join(__dirname, '../../pages');
    const offenders: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.tsx'))) {
      const src = readFileSync(join(dir, f), 'utf-8');
      if (!src.includes('PublicNavigation')) continue;
      if (f === 'PublicPage.tsx') {
        if (!src.includes(PAD)) offenders.push(f + ' (villkorade offseten saknas)');
        continue;
      }
      if (src.includes('<main className="') && !src.includes(PAD)) offenders.push(f);
    }
    expect(offenders, `sidor utan overlay-offset: ${offenders.join(', ')}`).toEqual([]);
  });
});
