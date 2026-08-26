/**
 * En indragen färgpanel bär systemets panelradie.
 *
 * cta är inte full-bleed: BlockRenderer lägger den i innehållscontainern, så
 * dess primärfärgade yta är en PANEL — samma form som Newsletter,
 * PricingCalculator och AiFaq, vilka alla bär rounded-[var(--radius-block)].
 * CTA:n (Lovable-ursprung) ritade panelen med raka hörn — det enda blocket i
 * systemet som avvek, upptäckt av Magnus på optic 2026-08-25 som "ovanligt
 * kantiga hörn mot övriga designelement".
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CTA = readFileSync(
  join(__dirname, '../../components/public/blocks/CTABlock.tsx'),
  'utf-8',
);
const RENDERER = readFileSync(
  join(__dirname, '../../components/public/BlockRenderer.tsx'),
  'utf-8',
);

describe('cta följer panelradien', () => {
  it('alla tre indragna varianter (split, with-image, default) bär --radius-block', () => {
    const hits = CTA.match(/rounded-\[var\(--radius-block/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(3);
  });

  it('bakgrundsbilder klipps till hörnen — radie utan overflow-hidden är en radie som inte syns', () => {
    const sections = CTA.match(/rounded-\[var\(--radius-block[^"']*/g) ?? [];
    for (const cls of sections) {
      expect(cls, `radie utan clip: ${cls}`).toContain('overflow-hidden');
    }
  });

  it('pinnen vilar på att cta förblir icke-full-bleed — flyttas den, ompröva radien', () => {
    const fullBleed = RENDERER.match(/FULL_BLEED_TYPES = new Set\(\[[\s\S]*?\]\)/)?.[0] ?? '';
    expect(fullBleed).not.toContain("'cta'");
  });
});

describe('panelradien följer branding-ratten', () => {
  /**
   * 2026-08-25, Magnus beslut: --radius-block var statisk (1rem) medan
   * branding styrde --radius — en kund som valde skarpa hörn fick rundade
   * paneler ändå. Halva sidan lydde ratten. Nu sätter BrandingProvider båda
   * skalorna från samma val, och nollställningen släpper båda.
   */
  const PROVIDER = readFileSync(
    join(__dirname, '../../providers/BrandingProvider.tsx'),
    'utf-8',
  );

  it('borderRadius-valet sätter BÅDA skalorna', () => {
    expect(PROVIDER).toMatch(/setProperty\('--radius',/);
    expect(PROVIDER).toMatch(/setProperty\('--radius-block',/);
  });

  it("'none' betyder none överallt — skarpt är ett designval, inte bara för knappar", () => {
    const block = PROVIDER.match(/blockRadiusMap[\s\S]{0,200}?\}/)?.[0] ?? '';
    expect(block).toMatch(/none:\s*'0'/);
  });

  it('admin-nollställningen släpper båda — annars läcker en sajts panelradie in i adminytan', () => {
    expect(PROVIDER).toMatch(/removeProperty\('--radius-block'\)/);
  });
});

describe('inga hårdkodade panelradier i publika block', () => {
  /**
   * Revisionen 2026-08-25 fann 13 rounded-2xl i 9 block — paneler som inte
   * lydde branding-ratten som --radius-block just kopplats till. Alla
   * konverterade. Den här pinnen håller populationen på noll: en ny
   * rounded-2xl/3xl i ett publikt block är en panel som ignorerar kundens
   * rundhetsval. Legitima undantag (overlay-text över foton, fristående
   * dokument som TermsBlock) rör inte radier och träffas inte.
   */
  it('rounded-2xl/3xl förekommer inte i publika blockrenderare', () => {
    const dir = join(__dirname, '../../components/public/blocks');
    const offenders: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith('Block.tsx'))) {
      const src = readFileSync(join(dir, f), 'utf-8');
      const hits = src.match(/rounded-(?:2xl|3xl)/g) ?? [];
      if (hits.length > 0) offenders.push(`${f}: ${hits.length}`);
    }
    expect(offenders, offenders.join(', ')).toEqual([]);
  });
});

describe('statusfärger bär tokens, inte palett', () => {
  /**
   * Revisionen 2026-08-25 trodde att success/warning-tokens saknades — de
   * fanns (index.css ljus+mörk, tailwind-mappning, brett använda i admin).
   * Det som saknades var ADOPTION i fyra publika block. Migrerade; pinnen
   * håller populationen på noll. Vitt/svart över foton berörs inte (ankrat i
   * bilden), och grays är layouttoner, inte status — bara statuspaletten fälls.
   */
  it('green/amber/yellow/emerald/lime-klasser förekommer inte i publika block', () => {
    const dir = join(__dirname, '../../components/public/blocks');
    const raw = /\b(?:bg|text|border|fill|stroke|from|to|via)-(?:green|amber|yellow|emerald|lime)-\d{2,3}\b/g;
    const offenders: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith('Block.tsx'))) {
      const hits = readFileSync(join(dir, f), 'utf-8').match(raw) ?? [];
      if (hits.length > 0) offenders.push(`${f}: ${[...new Set(hits)].join(' ')}`);
    }
    expect(offenders, offenders.join('; ')).toEqual([]);
  });
});

describe('ikonplattornas fallback följer accentkanon', () => {
  /**
   * 14 block kör accent-plattan (bg-accent/50 + text-accent-foreground) för
   * fristående ikoner; bentos primary-fallback var avvikaren teamet såg som
   * "olika ikonfärger mellan landing och /product" (2026-08-26). Per-cell-
   * accentColor är innehållsval och pinnas inte — bara FALLBACKEN.
   */
  it('BentoGrid-fallbacken är accentfamiljen, inte primary', () => {
    const src = readFileSync(join(__dirname, '../../components/public/blocks/BentoGridBlock.tsx'), 'utf-8');
    expect(src).toContain("'hsl(var(--accent) / 0.5)'");
    expect(src).toContain("'hsl(var(--accent-foreground))'");
    expect(src).not.toContain("'hsl(var(--primary) / 0.1)'");
  });
});
